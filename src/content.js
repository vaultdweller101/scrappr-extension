let savedNotes = [];
let suggestionsModal = null;
let activeSuggestionRange = null;

// --- 1. Logic copied from Editor.tsx ---

function tokenizeAndNormalize(text) {
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

function findSuggestions(word, sentence, currentSavedNotes) {
  const searchTokens = tokenizeAndNormalize(sentence);
  const wordToken = word.toLowerCase();
  if (searchTokens.size === 0) {
    return [];
  }
  const scoredNotes = currentSavedNotes.map(note => {
    const noteContentLower = note.content.toLowerCase();
    const noteTokens = tokenizeAndNormalize(noteContentLower);
    let score = 0;
    for (const token of searchTokens) {
      if (noteTokens.has(token)) {
        score += 1;
      }
    }
    if (noteTokens.has(wordToken)) {
      score += 3;
    }
    if (noteContentLower.includes(sentence)) {
      score += 10;
    } else if (noteContentLower.includes(word)) {
      score += 5;
    }
    return { note, score };
  })
  .filter(item => item.score > 0)
  .sort((a, b) => b.score - a.score);
  
  return scoredNotes.slice(0, 5).map(item => item.note);
}

// --- 2. UI Functions (Vanilla JS) ---

function createSuggestionsModal() {
  suggestionsModal = document.createElement('div');
  suggestionsModal.className = 'suggestions-modal'; // Use this for styling
  suggestionsModal.style.position = 'absolute';
  suggestionsModal.style.zIndex = '9999';
  suggestionsModal.style.display = 'none';
  document.body.appendChild(suggestionsModal);
}

function updateSuggestionsModal(suggestions, position) {
  if (!suggestionsModal || suggestions.length === 0 || !position) {
    if (suggestionsModal) suggestionsModal.style.display = 'none';
    return;
  }

  // Escape content for safety, though it's your own data
  const escapeHTML = (str) => str.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  suggestionsModal.innerHTML = `
    <h3>Related Notes</h3>
    <div class="suggestions-list">
      ${suggestions.map(note => `
        <div class="suggestion" data-note-content="${escapeHTML(note.content)}">
          ${escapeHTML(note.content.slice(0, 100))}${note.content.length > 100 ? '...' : ''}
        </div>
      `).join('')}
    </div>
  `;
  
  suggestionsModal.style.left = `${position.x}px`;
  suggestionsModal.style.top = `${position.y}px`;
  suggestionsModal.style.display = 'block';

  // Add click listeners to new suggestions
  suggestionsModal.querySelectorAll('.suggestion').forEach(el => {
    el.addEventListener('click', () => {
      // Read the raw content back from the attribute
      const noteContent = el.getAttribute('data-note-content');
      handleSuggestionClick(noteContent);
    });
  });
}

// --- 3. Event Handlers (Adapted from Editor.tsx) ---

function handleSuggestionClick(noteContent) {
  if (!activeSuggestionRange) return;
  const { node, start, end } = activeSuggestionRange;
  
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  
  document.execCommand('insertText', false, noteContent + ' ');

  updateSuggestionsModal([], null);
  activeSuggestionRange = null;
}

function checkSuggestionAtCursor() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    updateSuggestionsModal([], null);
    return;
  }

  if (!selection.isCollapsed) {
    updateSuggestionsModal([], null);
    return;
  }
  
  const range = selection.getRangeAt(0);
  const node = range.startContainer;
  const offset = range.startOffset;

  if (node.nodeType !== Node.TEXT_NODE) {
    updateSuggestionsModal([], null);
    return;
  }
  
  const textContent = node.textContent || '';
  let start = offset;
  let end = offset;
  
  while (start > 0 && textContent[start - 1].match(/\S/)) {
    start--;
  }
  while (end < textContent.length && textContent[end].match(/\S/)) {
    end++;
  }
  
  const currentWord = textContent.substring(start, end).trim();
  const currentSentence = (node.textContent || '').trim();

  if (currentSentence.length > 2) {
    const suggestions = findSuggestions(currentWord, currentSentence, savedNotes);
    
    const rect = range.getBoundingClientRect();
    const position = {
      x: rect.left + window.scrollX,
      y: rect.bottom + window.scrollY + 8,
    };
    
    activeSuggestionRange = { node, start, end };
    updateSuggestionsModal(suggestions, position);
  } else {
    updateSuggestionsModal([], null);
    activeSuggestionRange = null;
  }
}

// --- 4. Initialization ---

function init() {
  createSuggestionsModal();
  
  // Find the correct editable area in Google Docs
  const editor = document.querySelector('.docs-explore-content-iframe, .docs-texteventtarget-iframe');
  const targetDoc = editor ? editor.contentDocument : document;

  if (targetDoc && targetDoc.body) {
     targetDoc.body.addEventListener('keyup', () => setTimeout(checkSuggestionAtCursor, 0));
     targetDoc.body.addEventListener('click', () => setTimeout(checkSuggestionAtCursor, 0));
  } else {
    console.warn("Scrappr: Could not find Google Docs editor to attach to.");
  }

  // Load initial notes and listen for changes
  browser.storage.local.get('scrapprSavedNotes').then((result) => {
    if (result.scrapprSavedNotes) {
      savedNotes = result.scrapprSavedNotes;
    }
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.scrapprSavedNotes) {
      savedNotes = changes.scrapprSavedNotes.newValue || [];
    }
  });
}

init();