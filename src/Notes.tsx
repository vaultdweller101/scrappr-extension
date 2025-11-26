import React, { useEffect, useState } from 'react';
import browser from 'webextension-polyfill';
import { collection, onSnapshot, orderBy, query, addDoc, getDocs, serverTimestamp, deleteDoc, updateDoc, doc, DocumentData } from 'firebase/firestore';
import { db, useAuth } from './firebase';
import { SavedNote, findSuggestions } from './utils/algorithm';

interface PendingVoiceNote {
  id: number;
  createdAt: number;
  text: string;
}

// 1. Update renderNote to accept an onEdit callback
function renderNote(note: SavedNote, onEdit: (note: SavedNote) => void, deleteNote?: (id: string) => void) {
  return (
    <div 
      key={note.id} 
      className="saved-note clickable" 
      onClick={() => onEdit(note)} // Click to edit
    >
      <div className="note-content">
        {note.content}
      </div>
      <div className="note-actions">
        <div className="note-date">
          {new Date(note.timestamp).toLocaleDateString()}
        </div>
        {deleteNote && (
          <button 
            onClick={(e) => {
              e.stopPropagation(); // Prevent opening edit modal when deleting
              deleteNote(note.id);
            }}
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
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null); // 2. Track editing ID

  const [currentView, setCurrentView] = useState<'suggestions' | 'notes'>('suggestions');
  const [statusMessage, setStatusMessage] = useState('Loading notes...');
  const [dataLoading, setDataLoading] = useState(true);
  const [pendingVoiceNotes, setPendingVoiceNotes] = useState<PendingVoiceNote[]>([]);

  useEffect(() => {
    if (!user) {
      setSavedNotes([]);
      setDataLoading(false);
      browser.storage.local.remove('cached_firestore_notes'); 
      return;
    }

    const notesCollectionRef = collection(db, 'users', user.uid, 'notes');
    const q = query(notesCollectionRef, orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notesList = snapshot.docs.map(doc => ({
        id: doc.id,
        content: doc.data().content,
        timestamp: doc.data().timestamp || Date.now(),
      })) as SavedNote[];
      
      setSavedNotes(notesList);
      setDataLoading(false);

      const storageData = { 'cached_firestore_notes': notesList };
      if (typeof browser !== 'undefined') {
          browser.storage.local.set(storageData).catch(console.error);
      } else {
          chrome.storage.local.set(storageData, () => {
             if (chrome.runtime.lastError) console.error(chrome.runtime.lastError);
          });
      }

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
  }, [user]);

  useEffect(() => {
    browser.storage.local.get('scrapprVoiceNotesPending')
      .then((result) => {
        const raw = (result as any).scrapprVoiceNotesPending;
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
    setEditingNoteId(null); // Ensure we are in create mode
    setIsModalOpen(true);
  };

  // 3. Add handler to open modal in edit mode
  const handleEditNote = (note: SavedNote) => {
    setNewNoteContent(note.content);
    setEditingNoteId(note.id);
    setIsModalOpen(true);
  };

  const closeNewNoteModal = () => {
    setIsModalOpen(false);
    setEditingNoteId(null); // Reset on close
  };

  const handleUseLatestVoiceNote = async () => {
    if (pendingVoiceNotes.length === 0) return;

    const latest = [...pendingVoiceNotes].sort((a, b) => b.createdAt - a.createdAt)[0];
    setNewNoteContent(latest.text);
    setEditingNoteId(null); // Treating imported voice note as a new note
    setIsModalOpen(true);

    const remaining = pendingVoiceNotes.filter((note) => note.id !== latest.id);
    setPendingVoiceNotes(remaining);

    try {
      await browser.storage.local.set({ scrapprVoiceNotesPending: remaining });
    } catch (err) {
      console.warn('Scrappr popup: failed to update pending voice notes:', err);
    }
  };

  // 4. Update save handler to handle both Create and Update
  const handleSaveNote = async () => {
    if (!newNoteContent.trim() || !user) return; 

    try {
        if (editingNoteId) {
          // --- UPDATE ---
          const noteRef = doc(db, 'users', user.uid, 'notes', editingNoteId);
          await updateDoc(noteRef, {
            content: newNoteContent,
            timestamp: Date.now(), // Update timestamp to move it to top/bottom depending on sort
          });
        } else {
          // --- CREATE ---
          await addDoc(collection(db, 'users', user.uid, 'notes'), { 
              content: newNoteContent,
              timestamp: Date.now(),
              createdAt: serverTimestamp(),
          });
        }

        // Sync to browser local storage (Optimistic UI handles the rest via onSnapshot, but this keeps cache fresh)
        const notesQuery = query(
            collection(db, 'users', user.uid, 'notes'),
            orderBy('timestamp', 'asc')
        );
        
        const snapshot = await getDocs(notesQuery);
        const updatedNotes = snapshot.docs.map(doc => ({ 
            id: doc.id, 
            ...doc.data() 
        }));

        const storageData = { 'cached_firestore_notes': updatedNotes };

        if (typeof browser !== 'undefined') {
            browser.storage.local.set(storageData).catch((err) => console.error('Storage sync failed:', err));
        } else {
            chrome.storage.local.set(storageData, () => {
                if (chrome.runtime.lastError) console.error(chrome.runtime.lastError);
            });
        }

        setNewNoteContent('');
        closeNewNoteModal();

    } catch (error) {
        console.error("Error saving document: ", error);
        alert('Failed to save note to cloud.');
    }
  };

  const deleteNote = async (noteId: string) => {
    if (!window.confirm('Are you sure you want to delete this note?')) {
      return;
    }
    if (!user) return;

    try {
      await deleteDoc(doc(db, 'users', user.uid, 'notes', noteId));
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
              {/* 5. Pass handleEditNote to renderNote */}
              {notesToDisplay.map(note => renderNote(
                note,
                handleEditNote,
                deleteNote
              ))}
            </div>
        )}
      </div>

      {isModalOpen && (
        <div className="modal-overlay" onClick={closeNewNoteModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>{editingNoteId ? "Edit Note" : "New Note"}</h3>
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
                {editingNoteId ? "Update" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}