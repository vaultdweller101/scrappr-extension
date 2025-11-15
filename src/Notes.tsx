import React, { useEffect, useState } from 'react';
import browser from 'webextension-polyfill';

// --- Suggestion Logic (unchanged) ---

function tokenizeAndNormalize(text: string): Set<string> {
  if (!text) return new Set();
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .split(/\s+/); // Split by spaces
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
  id: string;
  content: string;
  timestamp: number;
}

interface NotesProps {
  onNotesChange: (notes: SavedNote[]) => void;
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

export default function Notes({ onNotesChange }: NotesProps) {
  const [savedNotes, setSavedNotes] = useState<SavedNote[]>([]);
  const [suggestions, setSuggestions] = useState<SavedNote[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [currentView, setCurrentView] = useState<'suggestions' | 'notes'>('suggestions');
  const [statusMessage, setStatusMessage] = useState('Loading notes...');

  useEffect(() => {
    // 1. Load all saved notes from storage
    browser.storage.local.get('scrapprSavedNotes').then((result: { scrapprSavedNotes?: SavedNote[] }) => {
      const allNotes = result.scrapprSavedNotes || [];
      setSavedNotes(allNotes);

      // 2. Try to read text from the user's clipboard
      navigator.clipboard.readText()
        .then((clipboardText) => {
          const sentence = clipboardText ? clipboardText.trim() : "";

          if (sentence.length > 0) {
            const foundSuggestions = findSuggestions(sentence, allNotes);
            setSuggestions(foundSuggestions);
            if (foundSuggestions.length > 0) {
              setStatusMessage(`Top suggestions for: "${sentence.slice(0, 50)}..."`);
            } else {
              setStatusMessage(`No suggestions found for: "${sentence.slice(0, 50)}..."`);
            }
          } else {
            // Clipboard is empty or user hasn't copied
            setStatusMessage('No text in clipboard. Showing all notes.');
            setCurrentView('notes');
          }
        })
        .catch(err => {
          // This might happen if permission wasn't granted or clipboard is locked
          console.warn("Could not read from clipboard:", err.message);
          setStatusMessage("Could not read clipboard. Showing all notes.");
          setCurrentView('notes');
        });
    });
  }, []); // Runs only once when popup opens

  // --- Note Management (unchanged) ---
  const openNewNoteModal = () => {
    setNewNoteContent('');
    setIsModalOpen(true);
  };

  const closeNewNoteModal = () => {
    setIsModalOpen(false);
  };

  const handleSaveNote = () => {
    if (!newNoteContent || !newNoteContent.trim()) {
      return;
    }
    const newNote: SavedNote = {
      id: Date.now().toString(),
      content: newNoteContent,
      timestamp: Date.now()
    };
    const updatedNotes = [newNote, ...savedNotes];
    setSavedNotes(updatedNotes);
    browser.storage.local.set({ scrapprSavedNotes: updatedNotes }).then(() => {
      onNotesChange(updatedNotes);
      closeNewNoteModal();
    });
  };

  const deleteNote = (noteId: string) => {
    if (!window.confirm('Are you sure you want to delete this note?')) {
      return;
    }
    const updatedNotes = savedNotes.filter(note => note.id !== noteId);
    setSavedNotes(updatedNotes);
    browser.storage.local.set({ scrapprSavedNotes: updatedNotes }).then(() => {
      onNotesChange(updatedNotes);
    });
  };

  const notesToDisplay = currentView === 'suggestions' ? suggestions : savedNotes;

  return (
    <div className="notes-container">
      <div className="notes-toolbar">
        <button onClick={openNewNoteModal} className="save-note">
          Save New Note
        </button>
        <button 
          onClick={() => setCurrentView(currentView === 'notes' ? 'suggestions' : 'notes')}
          className="view-toggle-button"
        >
          {currentView === 'notes' ? 'Show Suggestions' : 'Show All Notes'}
        </button>
      </div>
      
      <div className="saved-notes">
        <h3 className="status-message">{
          currentView === 'notes' ? `All Notes (${savedNotes.length})` : statusMessage
        }</h3>
        
        <div className="saved-notes-grid">
          {notesToDisplay.length === 0 && currentView === 'suggestions' && (
            <p className="no-notes-message">No suggestions found.</p>
          )}
          {notesToDisplay.length === 0 && currentView === 'notes' && (
            <p className="no-notes-message">No notes saved yet. Click "Save New Note" to add one!</p>
          )}
          {notesToDisplay.map(note => renderNote(
            note,
            currentView === 'notes' ? deleteNote : undefined
          ))}
        </div>
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