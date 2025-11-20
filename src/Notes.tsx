import React, { useEffect, useState } from 'react';
import browser from 'webextension-polyfill';
import { collection, onSnapshot, orderBy, query, addDoc, serverTimestamp, deleteDoc, doc, DocumentData } from 'firebase/firestore';
import { db, useAuth } from './firebase';

function tokenizeAndNormalize(text: string): Set<string> {
  if (!text) return new Set();
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, '') 
    .split(/\s+/); 
  const stopWords = new Set([
    'i', 'a', 'an', 'the', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'by', 'for', 'from', 'in', 'of',
    'on', 'to', 'with', 'and', 'but', 'or', 'so', 'if', 'about', 'at', 'it',
    'my', 'me', 'you', 'your'
  ]);
  return new Set(words.filter(word => word.length > 1 && !stopWords.has(word)));
}

function findSuggestions(
  sentence: string,
  savedNotes: SavedNote[]
): SavedNote[] {
  const searchTokens = tokenizeAndNormalize(sentence);
  if (searchTokens.size === 0) {
    return [];
  }
  const scoredNotes = savedNotes.map(note => {
    const noteContentLower = note.content.toLowerCase();
    const noteTokens = tokenizeAndNormalize(noteContentLower);
    let score = 0;
    for (const token of searchTokens) {
      if (noteTokens.has(token)) {
        score += 1;
      }
    }
    if (noteContentLower.includes(sentence.toLowerCase())) {
      score += 10;
    }
    return { note, score };
  })
  .filter(item => item.score > 0)
  .sort((a, b) => b.score - a.score);
  return scoredNotes.slice(0, 50).map(item => item.note);
}

// --- React Component ---

export interface SavedNote {
  id: string; // Document ID from Firestore
  content: string;
  timestamp: number; // For sorting and display
}

function renderNote(note: SavedNote, deleteNote?: (id: string) => void) {
  return (
    <div key={note.id} className="saved-note">
      <div className="note-content">
        {note.content}
      </div>
      <div className="note-actions">
        <div className="note-date">
          {new Date(note.timestamp).toLocaleDateString()}
        </div>
        {deleteNote && (
          <button 
            onClick={() => deleteNote(note.id)}
            className="delete-note"
            title="Delete this note"
            aria-label="Delete note"
          >
            X
          </button>
        )}
      </div>
    </div>
  );
}

export default function Notes() {
  const { user, loading: authLoading, signIn, logout } = useAuth();
  const [savedNotes, setSavedNotes] = useState<SavedNote[]>([]);
  const [suggestions, setSuggestions] = useState<SavedNote[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [currentView, setCurrentView] = useState<'suggestions' | 'notes'>('suggestions');
  const [statusMessage, setStatusMessage] = useState('Loading notes...');
  const [dataLoading, setDataLoading] = useState(true); // Separate loading state for notes

  useEffect(() => {
    // Stop listening or clear notes if no user is logged in
    if (!user) {
      setSavedNotes([]);
      setDataLoading(false);
      // Remove old browser.storage.local notes as they are now cloud-synced
      browser.storage.local.remove('scrapprSavedNotes');
      return;
    }

    // Query the current user's notes, ordered by createdAt
    const notesCollectionRef = collection(db, 'users', user.uid, 'notes');
    const q = query(notesCollectionRef, orderBy('createdAt', 'desc'));

    // Listen for real-time updates from Firestore
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notesList = snapshot.docs.map(doc => ({
        id: doc.id,
        content: doc.data().content,
        timestamp: doc.data().timestamp || Date.now(), // Fallback
      })) as SavedNote[];
      
      setSavedNotes(notesList);
      setDataLoading(false);

      // Recalculate suggestions every time notes update
      navigator.clipboard.readText()
        .then((clipboardText) => {
          const sentence = clipboardText ? clipboardText.trim() : "";
          if (sentence.length > 0) {
            const foundSuggestions = findSuggestions(sentence, notesList);
            setSuggestions(foundSuggestions);
            if (foundSuggestions.length > 0) {
              setStatusMessage(`Top suggestions for: "${sentence.slice(0, 50)}..."`);
            } else {
              setStatusMessage(`No suggestions found for: "${sentence.slice(0, 50)}..."`);
            }
          } else {
            setCurrentView('notes');
            setStatusMessage('No text in clipboard. Showing all notes.');
          }
        })
        .catch(err => {
          console.warn("Could not read from clipboard:", err.message);
          setCurrentView('notes');
          setStatusMessage("Could not read clipboard. Showing all notes.");
        });
    }, 
    (error) => {
      console.error("Firestore snapshot error:", error);
      setDataLoading(false);
      setStatusMessage("Failed to load notes from cloud.");
    });

    return () => unsubscribe();
  }, [user]); // Depend on user state

  const openNewNoteModal = () => {
    setNewNoteContent('');
    setIsModalOpen(true);
  };

  const closeNewNoteModal = () => {
    setIsModalOpen(false);
  };

  // Save note to Firestore
  const handleSaveNote = async () => {
    if (!newNoteContent.trim() || !user) return; 

    try {
        // Save to: users -> [USER_ID] -> notes -> [NOTE_ID]
        await addDoc(collection(db, 'users', user.uid, 'notes'), { 
            content: newNoteContent,
            timestamp: Date.now(),
            createdAt: serverTimestamp(),
        });

        setNewNoteContent('');
        closeNewNoteModal();
    } catch (error) {
        console.error("Error adding document: ", error);
        alert('Failed to save note to cloud.');
    }
  };

  // Delete note from Firestore
  const deleteNote = async (noteId: string) => {
    if (!window.confirm('Are you sure you want to delete this note?')) {
      return;
    }
    if (!user) return;

    try {
      await deleteDoc(doc(db, 'users', user.uid, 'notes', noteId));
      // The onSnapshot listener will handle state update automatically
    } catch (error) {
      console.error("Error deleting document: ", error);
      alert('Failed to delete note from cloud.');
    }
  };

  const notesToDisplay = currentView === 'suggestions' ? suggestions : savedNotes;
  const showLoading = authLoading || (user && dataLoading);
  
  if (authLoading) {
    return <div className="notes-container" style={{ textAlign: 'center', padding: '20px' }}>Authenticating...</div>;
  }

  // Login Screen when unauthenticated
  if (!user) {
    return (
      <div className="notes-container" style={{ textAlign: 'center', padding: '20px' }}>
        <p className="status-message">Please sign in with Google to sync your ideas.</p>
        <button onClick={signIn} className="modal-button save-note">
          Sign in with Google
        </button>
      </div>
    );
  }

  // Logged in view
  return (
    <div className="notes-container">
      <p className="instruction-text">
        Highlight and copy the text, then open this extension, to see ideas suggestion.
      </p>

      <div className="notes-toolbar">
        <button onClick={openNewNoteModal} className="save-note">
          New Idea
        </button>
        <button 
          onClick={() => setCurrentView(currentView === 'notes' ? 'suggestions' : 'notes')}
          className="view-toggle-button"
        >
          {currentView === 'notes' ? 'Show Suggestions' : 'Show All Ideas'}
        </button>
        <button onClick={logout} className="view-toggle-button" style={{ marginLeft: 'auto' }}>
          Logout
        </button>
      </div>
      
      <div className="saved-notes">
        <h3 className="status-message">{
          showLoading ? 'Loading...' : (currentView === 'notes' ? `All Notes (${savedNotes.length})` : statusMessage)
        }</h3>
        
        {showLoading ? (
            <div className="no-notes-message">Loading notes from the cloud...</div>
        ) : (
            <div className="saved-notes-grid">
              {notesToDisplay.length === 0 && currentView === 'suggestions' && (
                <p className="no-notes-message">No suggestions found. Check "Show All Ideas" to verify your sync.</p>
              )}
              {notesToDisplay.length === 0 && currentView === 'notes' && (
                <p className="no-notes-message">No notes saved yet. Click "New Idea" to add one!</p>
              )}
              {notesToDisplay.map(note => renderNote(
                note,
                currentView === 'notes' ? deleteNote : undefined
              ))}
            </div>
        )}
      </div>

      {isModalOpen && (
        <div className="modal-overlay" onClick={closeNewNoteModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>New Note</h3>
            <textarea
              className="modal-textarea"
              value={newNoteContent}
              onChange={(e) => setNewNoteContent(e.target.value)}
              placeholder="Start writing your note..."
              autoFocus
            />
            <div className="modal-actions">
              <button onClick={closeNewNoteModal} className="modal-button cancel-note">
                Cancel
              </button>
              <button onClick={handleSaveNote} className="modal-button save-note">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}