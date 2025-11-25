import React, { useEffect, useState } from 'react';
import browser from 'webextension-polyfill';
import { collection, onSnapshot, orderBy, query, addDoc, getDocs, serverTimestamp, deleteDoc, doc, DocumentData } from 'firebase/firestore';
import { db, useAuth } from './firebase';
import { SavedNote, findSuggestions } from './utils/algorithm';

interface PendingVoiceNote {
  id: number;
  createdAt: number;
  text: string;
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
  const [pendingVoiceNotes, setPendingVoiceNotes] = useState<PendingVoiceNote[]>([]);

  useEffect(() => {
    // Stop listening or clear notes if no user is logged in
    if (!user) {
      setSavedNotes([]);
      setDataLoading(false);
      browser.storage.local.remove('cached_firestore_notes'); // Clean up on logout
      return;
    }

    // Query the current user's notes, ordered by createdAt
    const notesCollectionRef = collection(db, 'users', user.uid, 'notes');
    const q = query(notesCollectionRef, orderBy('timestamp', 'asc'));

    // Listen for real-time updates from Firestore
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notesList = snapshot.docs.map(doc => ({
        id: doc.id,
        content: doc.data().content,
        timestamp: doc.data().timestamp || Date.now(), // Fallback
      })) as SavedNote[];
      
      setSavedNotes(notesList);
      setDataLoading(false);

      // Sync to Storage immediately whenever data changes
      const storageData = { 'cached_firestore_notes': notesList };
      if (typeof browser !== 'undefined') {
          browser.storage.local.set(storageData).catch(console.error);
      } else {
          chrome.storage.local.set(storageData, () => {
             if (chrome.runtime.lastError) console.error(chrome.runtime.lastError);
          });
      }

      // Recalculate suggestions every time notes update
      navigator.clipboard.readText()
        .then((clipboardText) => {
          const sentence = clipboardText ? clipboardText.trim() : "";
          if (sentence.length > 0) {
            const foundSuggestions = findSuggestions(sentence, notesList);
            setSuggestions(foundSuggestions);
            if (foundSuggestions.length > 0) {
              setStatusMessage(`Top suggestions for: "${sentence.slice(0, 50)}..."`);
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

  useEffect(() => {
    browser.storage.local.get('scrapprVoiceNotesPending')
      .then((result) => {
        const raw = (result as any).scrapprVoiceNotesPending;
        console.log('Scrappr popup: loaded pending voice notes from storage', raw);
        if (Array.isArray(raw)) {
          setPendingVoiceNotes(raw as PendingVoiceNote[]);
        }
      })
      .catch((err) => {
        console.warn('Scrappr popup: could not load pending voice notes:', err);
      });
  }, []);

  const openNewNoteModal = () => {
    setNewNoteContent('');
    setIsModalOpen(true);
  };

  const closeNewNoteModal = () => {
    setIsModalOpen(false);
  };

  const handleUseLatestVoiceNote = async () => {
    if (pendingVoiceNotes.length === 0) {
      console.log('Scrappr popup: handleUseLatestVoiceNote called with no pending notes');
      return;
    }

    const latest = [...pendingVoiceNotes].sort((a, b) => b.createdAt - a.createdAt)[0];
    console.log('Scrappr popup: importing latest voice note', latest);
    setNewNoteContent(latest.text);
    setIsModalOpen(true);

    const remaining = pendingVoiceNotes.filter((note) => note.id !== latest.id);
    setPendingVoiceNotes(remaining);

    try {
      await browser.storage.local.set({ scrapprVoiceNotesPending: remaining });
      console.log('Scrappr popup: updated pending voice notes after import, remaining count', remaining.length);
    } catch (err) {
      console.warn('Scrappr popup: failed to update pending voice notes:', err);
    }
  };

  // Save note to Firestore
  const handleSaveNote = async () => {
    if (!newNoteContent.trim() || !user) return; 

    try {
        // Save to Firestore
        await addDoc(collection(db, 'users', user.uid, 'notes'), { 
            content: newNoteContent,
            timestamp: Date.now(),
            createdAt: serverTimestamp(),
        });

        // Sync to browser local storage

        const notesQuery = query(
            collection(db, 'users', user.uid, 'notes'),
            orderBy('timestamp', 'asc') // Ensure order matches your UI
        );
        
        const snapshot = await getDocs(notesQuery);
        const updatedNotes = snapshot.docs.map(doc => ({ 
            id: doc.id, 
            ...doc.data() 
        }));

        // A. Define the data object
        const storageData = { 'cached_firestore_notes': updatedNotes };

        // B. Check which API is available and use the correct syntax
        if (typeof browser !== 'undefined') {
            // SCENARIO 1: Firefox / Standard WebExtension (Uses Promises, 1 Argument)
            browser.storage.local.set(storageData)
                .then(() => console.log('Success: Synced to local storage (Promise mode)'))
                .catch((err) => console.error('Storage sync failed:', err));
        } else {
            // SCENARIO 2: Chrome / Edge / Brave (Uses Callbacks, 2 Arguments)
            chrome.storage.local.set(storageData, () => {
                // Check for runtime errors in Chrome
                if (chrome.runtime.lastError) {
                    console.error('Storage sync failed:', chrome.runtime.lastError);
                } else {
                    console.log('Success: Synced to local storage (Callback mode)');
                }
            });
        }
        // ---------------------------------------------------------

        setNewNoteContent('');
        closeNewNoteModal();

        // Optional: If you have a local state for the list, update it here too
        // setNotes(updatedNotes); 

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

      {pendingVoiceNotes.length > 0 && (
        <div className="pending-voice-banner">
          <span className="pending-voice-text">
            You have {pendingVoiceNotes.length} voice note{pendingVoiceNotes.length > 1 ? 's' : ''} ready to import.
          </span>
          <button
            onClick={handleUseLatestVoiceNote}
            className="view-toggle-button"
          >
            Use latest
          </button>
        </div>
      )}

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
      <h3 className="status-message">
        {showLoading
          ? 'Loading notes...'
          : currentView === 'notes'
            ? `All Notes (${savedNotes.length})`
            : suggestions.length > 0
              ? statusMessage
              : 'No suggestions found.'
        }
      </h3>
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
                deleteNote
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