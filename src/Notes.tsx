import React, { useEffect, useState } from 'react';
import browser from 'webextension-polyfill';
import { collection, onSnapshot, orderBy, query, addDoc, getDocs, serverTimestamp, deleteDoc, updateDoc, doc, DocumentData , setDoc, arrayUnion, getDoc, writeBatch, arrayRemove, where} from 'firebase/firestore';
import { db, useAuth } from './firebase';
import { SavedNote, findSuggestions } from './utils/algorithm';

interface PendingVoiceNote {
  id: number;
  createdAt: number;
  text: string;
}

// Utility function to convert URLs in text to clickable links
function renderTextWithLinks(text: string): React.ReactNode {
  // Regex to match URLs (http://, https://, www., and plain domains)
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}[^\s]*)/g;
  const parts: (string | React.ReactElement)[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = urlRegex.exec(text)) !== null) {
    // Add text before the URL
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    // Process the URL
    let url = match[0];
    let href = url;

    // Add protocol if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      href = url.startsWith('www.') ? `https://${url}` : `https://${url}`;
    }

    // Create clickable link
    parts.push(
      <a
        key={key++}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()} // Prevent triggering edit modal
        className="note-link"
      >
        {url}
      </a>
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  // If no URLs found, return original text
  return parts.length > 0 ? parts : text;
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
        {renderTextWithLinks(note.content)}
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

  // all tag-related things
  const [tags, setTags] = useState<string[]>([]);
  const [allUserTags, setAllUserTags] = useState<string[]>([]);
  const [currentTagInput, setCurrentTagInput] = useState("");
  const [filterTags, setFilterTags] = useState<string[]>([]);

  const [currentView, setCurrentView] = useState<'suggestions' | 'notes'>('suggestions');
  const [statusMessage, setStatusMessage] = useState('Loading notes...');
  const [dataLoading, setDataLoading] = useState(true);
  const [pendingVoiceNotes, setPendingVoiceNotes] = useState<PendingVoiceNote[]>([]);

  const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && currentTagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(currentTagInput.trim())) {
        setTags([...tags, currentTagInput.trim()]);
      }
      setCurrentTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const deleteGlobalTag = async (tagToDelete: string) => {
    if (!user) return;

    if (!confirm(`Are you sure you want to delete #${tagToDelete} from ALL notes?`)) return;

    try {
      const batch = writeBatch(db);

      // delete from master list
      const masterRef = doc(db, "users", user.uid, "metadata", "tags");
      batch.update(masterRef, {
        list: arrayRemove(tagToDelete)
      });

      // delete from all notes
      const notesRef = collection(db, "users", user.uid, "notes");
      const q = query(
        notesRef,
        where("tagList", "array-contains", tagToDelete)
      );

      const snapshot = await getDocs(q);

      snapshot.docs.forEach((noteDoc) => {
        batch.update(noteDoc.ref, {
          tagList: arrayRemove(tagToDelete)
        });
      });

      // update everything at once
      await batch.commit();
      
    } catch (error) {
      console.error("Error deleting global tag:", error);
    }
  };

  const toggleFilterTag = (tag: string) => {
    setFilterTags(prevTags => {
      if (prevTags && prevTags.includes(tag)) {
        // If tag is already selected, remove it
        return prevTags.filter(t => t !== tag);
      } else if (prevTags) {
        // If tag is not selected, add it
        return [...prevTags, tag];
      } else {
        return [...tag];
      }
    });
  };
  
  useEffect(() => {
    if (!user) {
      setSavedNotes([]);
      setDataLoading(false);
      browser.storage.local.remove('cached_firestore_notes'); 
      return;
    }

    const notesCollectionRef = collection(db, 'users', user.uid, 'notes');
    const q = query(notesCollectionRef, orderBy('timestamp', 'desc'));

    const tagsRef = doc(db, "users", user.uid, "metadata", "tags");
    const unsubscribeTags = onSnapshot(tagsRef, (docSnap) => {
      if (docSnap.exists()) {
        const rawList = docSnap.data().list || [];
        const sortedList = rawList.sort((a: string, b: string) => a.localeCompare(b));
        setAllUserTags(sortedList);
      } else {
        setAllUserTags([]);
      }
    });

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notesList = snapshot.docs.map(doc => ({
        id: doc.id,
        content: doc.data().content,
        timestamp: doc.data().timestamp || Date.now(),
        tags: doc.data().tagList
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

    return () => {
      unsubscribe();
      unsubscribeTags();
    };
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

  // If an external edit was requested (from the content script), open the modal with that note
  useEffect(() => {
    browser.storage.local.get('scrappr_edit_note')
      .then((result) => {
        const payload = (result as any).scrappr_edit_note;
        if (payload && payload.id) {
          setNewNoteContent(payload.content || '');
          setEditingNoteId(payload.id);
          setTags(payload.tagList);
          setIsModalOpen(true);
          // clear the pending edit so it doesn't reopen again
          try { browser.storage.local.remove('scrappr_edit_note'); } catch (e) { /* ignore */ }
        }
      })
      .catch((err) => {
        // ignore
      });
  }, []);

  const openNewNoteModal = () => {
    setNewNoteContent('');
    setTags([]);
    setEditingNoteId(null); // Ensure we are in create mode
    setIsModalOpen(true);
  };

  // 3. Add handler to open modal in edit mode
  const handleEditNote = (note: SavedNote) => {
    setNewNoteContent(note.content);
    setTags(note.tags || []);
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
            tagList: tags,
          });
        } else {
          // --- CREATE ---
          await addDoc(collection(db, 'users', user.uid, 'notes'), { 
              content: newNoteContent,
              timestamp: Date.now(),
              createdAt: serverTimestamp(),
              tagList: tags,
          });
        }

        if (tags.length > 0) {
          const masterTagsRef = doc(db, "users", user.uid, "metadata", "tags");
      
          await setDoc(masterTagsRef, {
            list: arrayUnion(...tags)
          }, { merge: true });
        }

        setNewNoteContent('');
        setTags([]);
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

  const notesToDisplay = (currentView === 'suggestions' ? suggestions : savedNotes).filter(note => {
  // if no tags are selected, show everything
    if (!filterTags || filterTags.length === 0) return true;

  // if filter is active, ignore notes without tags
    if (!note.tags || !Array.isArray(note.tags)) return false;

  // notes that contain at least one of the tags selected
    return note.tags.some(noteTag => filterTags.includes(noteTag));
  });

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

      <div className="filter-popup-menu">
        <h4>Filter by Tag</h4>
          <div className="filter-tags-list">
            <div className="tag-row" style={{
              backgroundColor: filterTags.length === 0 ? '#007bff' : '#f5f5f5', 
              borderColor: filterTags.length === 0 ? '#0056b3' : '#e0e0e0'
            }}>
              <button 
                onClick={() => setFilterTags([])}
                style={{ 
                  fontWeight: filterTags.length === 0  ? 'bold' : 'normal',
                  color: filterTags.length === 0 ? '#ffffff' : '#333333'
                }}
              >
                All Notes
              </button>
            </div>

            {allUserTags.map(tag => {
              const isActive = filterTags.includes(tag);

              return (
                <div key={tag} className="tag-row" style={{
                  backgroundColor: isActive ? '#007bff' : '#f5f5f5',
                  borderColor: isActive ? '#0056b3' : '#e0e0e0'
                }}>
                  <button 
                    onClick={() => toggleFilterTag(tag)} // Use the toggle function
                    style={{ 
                      fontWeight: isActive ? 'bold' : 'normal',
                      color: isActive ? '#ffffff' : '#333333',
                      marginRight: '5px'
                    }}
                  >
                    #{tag}
                  </button>
                  
                  <button 
                    className="delete-tag-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteGlobalTag(tag);
                    }}
                    style={{
                      color: isActive ? '#ffffff' : '#888888',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      opacity: isActive ? 1 : 0.6
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
      </div>
      
      <div className="saved-notes">
      <h3 className="status-message">
        {showLoading
          ? 'Loading notes...'
          : currentView === 'notes'
            ? (filterTags && filterTags.length > 0)
              ? `Tagged Notes (${notesToDisplay.length})`
              : `All Notes (${savedNotes.length})`
            
            : suggestions.length > 0
              ? (filterTags && filterTags.length > 0)
                ? `Filtered Suggestions (${notesToDisplay.length})`
                : statusMessage
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
            <div className="tag-input-section" style={{marginBottom: '15px'}}>
              
              <div className="tags-list" style={{display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '8px'}}>
                {tags.map(tag => (
                  <span key={tag} className="tag-chip" style={{background: '#eee', padding: '2px 8px', borderRadius: '12px', fontSize: '12px'}}>
                    #{tag} 
                    <button onClick={() => removeTag(tag)} style={{border:'none', background:'none', marginLeft:'4px', cursor:'pointer'}}>×</button>
                  </span>
                ))}
              </div>

              <input 
                type="text"
                placeholder="Add tag (press Enter to save)"
                value={currentTagInput}
                onChange={(e) => setCurrentTagInput(e.target.value)}
                onKeyDown={handleTagInputKeyDown}
                className="tag-input-field"
              />
            </div>
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