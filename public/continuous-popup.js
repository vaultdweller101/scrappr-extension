(function () {
  if (window.__docsTypingPopupInjected) return;
  window.__docsTypingPopupInjected = true;

  var STORAGE_KEY = 'cached_firestore_notes';
  var MESSAGE_ID = 'DOCS_TYPING_EVENT_TRIGGER';
  var POPUP_ID = 'docs-typing-manager-popup';
  var HIDE_DELAY_MS = 5000; // Increased slightly so users can read
  var popupTimeout = null;

  // Recommendation algorithm ported to vanilla JS
  function tokenize(text) {
    if (!text) return [];
    var stopWords = new Set(['i','a','an','the','is','am','are','was','were','be','been','being','have','has','had','do','does','did','by','for','from','in','of','on','to','with','and','but','or','so','if','about','at','it','my','me','you','your']);
    return text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(function(w) { return w.length > 1 && !stopWords.has(w); });
  }

  function getBestMatch(queryText, notes) {
    if (!queryText || !notes || notes.length === 0) return null;

    var searchTokens = tokenize(queryText);
    if (searchTokens.length === 0) return null;

    // 1. Compute IDF
    var df = {};
    var N = notes.length;
    notes.forEach(function(note) {
      var tokens = tokenize(note.content || note.text);
      // Unique tokens in this document
      var unique = new Set(tokens);
      unique.forEach(function(t) {
        df[t] = (df[t] || 0) + 1;
      });
    });

    var idf = {};
    Object.keys(df).forEach(function(t) {
      idf[t] = Math.log((N + 1) / (df[t] + 1)) + 1;
    });

    // 2. Query Vector
    var queryVec = {};
    var queryNorm = 0;
    searchTokens.forEach(function(t) {
      var w = idf[t] || 0;
      queryVec[t] = w;
      queryNorm += w * w;
    });
    queryNorm = Math.sqrt(queryNorm);

    // 3. Score Notes
    var bestNote = null;
    var maxScore = -1;

    notes.forEach(function(note) {
      var content = note.content || note.text || "";
      var tokens = tokenize(content);
      // TF Vector
      var tf = {};
      tokens.forEach(function(t) { tf[t] = (tf[t] || 0) + 1; });

      var noteNorm = 0;
      var dot = 0;

      Object.keys(tf).forEach(function(t) {
         var w = tf[t] * (idf[t] || 0);
         noteNorm += w * w;
         if (queryVec[t]) {
           dot += queryVec[t] * w;
         }
      });
      noteNorm = Math.sqrt(noteNorm);

      var score = (queryNorm && noteNorm) ? (dot / (queryNorm * noteNorm)) : 0;

      // Boosts
      if (content.toLowerCase().includes(queryText.toLowerCase())) score += 2.0;

      if (score > maxScore) {
        maxScore = score;
        bestNote = note;
      }
    });

    return (maxScore > 0) ? bestNote : null;
  }

  if (window === window.top) {
    var extensionApi = (typeof browser !== 'undefined') ? browser : chrome;

    function getOrCreatePopup() {
        var popup = document.getElementById(POPUP_ID);
        if (popup) return popup;

        popup = document.createElement('div');
        popup.id = POPUP_ID;
        // ... (Styles remain the same as your original file) ...
        popup.style.cssText = 'position: fixed; top: 70px; right: 20px; width: 300px; max-height: 80vh; overflow-y: auto; padding: 15px; background-color: #ffffff; color: #333; border-left: 5px solid #3b82f6; box-shadow: 0 4px 15px rgba(0,0,0,0.2); z-index: 2147483647; font-family: sans-serif; font-size: 13px; line-height: 1.4; pointer-events: auto; opacity: 0; transition: opacity 0.25s ease-in-out; border-radius: 4px; word-wrap: break-word; overflow-wrap: break-word;';

        popup.innerHTML = `
            <div id="docs-popup-header" style="font-weight: bold; color: #3b82f6; margin-bottom: 5px;">
                Latest Note:
            </div>
            <div id="docs-popup-content" style="font-style: italic; white-space: pre-wrap;">
                Loading...
            </div>
        `;
        document.body.appendChild(popup);
        return popup;
    }

    function updatePopupContent(popupElement) {
      // Safety check: if the API object is missing, stop immediately
      if (!extensionApi || !extensionApi.storage) return;

      try {
          // Wrap the call in a try-catch to handle "Context Invalidated" errors
          extensionApi.storage.local.get([STORAGE_KEY], function(result) {
              // 1. Check if the extension runtime reported an error inside the callback
              if (extensionApi.runtime && extensionApi.runtime.lastError) {
                  console.warn("Scrappr: Runtime error", extensionApi.runtime.lastError);
                  showRefreshMessage(popupElement);
                  return;
              }

              var contentDiv = popupElement.querySelector('#docs-popup-content');
              var headerDiv = popupElement.querySelector('#docs-popup-header');
              var notes = result ? result[STORAGE_KEY] : [];

              if (!notes || notes.length === 0) {
                  contentDiv.textContent = "No notes found in cache. Open extension to sync!";
                  return;
              }

              // 2. Try to get clipboard text
              navigator.clipboard.readText()
                .then(function(text) {
                    var query = text ? text.trim() : "";
                    var recommended = null;

                    if (query.length > 2) {
                       recommended = getBestMatch(query, notes);
                    }

                    if (recommended) {
                        headerDiv.textContent = "Suggested Idea (matches clipboard):";
                        headerDiv.style.color = "#2563eb";
                        var displayText = recommended.content || recommended.text;
                        contentDiv.textContent = '"' + displayText + '"';
                    } else {
                        headerDiv.textContent = "Latest Note:";
                        headerDiv.style.color = "#64748b";
                        var latest = notes[notes.length - 1];
                        var displayText = latest.content || latest.text;
                        contentDiv.textContent = '"' + displayText + '"';
                    }
                })
                .catch(function() {
                    // Fallback if clipboard read fails
                    var latest = notes[notes.length - 1];
                    var displayText = latest.content || latest.text;
                    contentDiv.textContent = '"' + displayText + '"';
                });
          });
      } catch (error) {
          // 3. This block catches the "Extension context invalidated" error specifically
          console.warn("Scrappr: Context invalidated. User needs to refresh.");
          showRefreshMessage(popupElement);
      }
    }

    // Helper to show a friendly message in the popup
    function showRefreshMessage(popupElement) {
        var contentDiv = popupElement.querySelector('#docs-popup-content');
        var headerDiv = popupElement.querySelector('#docs-popup-header');
        if (headerDiv) headerDiv.textContent = "Extension Updated";
        if (contentDiv) {
            contentDiv.textContent = "Please refresh this page to reconnect Scrappr.";
            contentDiv.style.color = "#ef4444"; // Red warning color
        }
    }

    function showPopup() {
      var popup = getOrCreatePopup();
      updatePopupContent(popup);
      popup.style.opacity = '1';
      if (popupTimeout) clearTimeout(popupTimeout);
      popupTimeout = setTimeout(function() {
        popup.style.opacity = '0';
        popupTimeout = null;
      }, HIDE_DELAY_MS);
    }

    window.addEventListener('message', function(event) {
      if (event.data === MESSAGE_ID) showPopup();
    });
  }

  function notifyManager() {
    window.top.postMessage(MESSAGE_ID, '*');
  }

  function handleInput(e) {
    if (e.key && (e.key.length > 1 && e.key !== 'Backspace' && e.key !== 'Enter')) return;
    notifyManager();
  }

  window.addEventListener('keydown', handleInput, true);
  window.addEventListener('input', handleInput, true);
  
  if (window === window.top) {
      var observer = new MutationObserver(function(mutations) {
          var statusText = document.querySelector('.docs-save-indicator-text');
          if (statusText && statusText.textContent.includes('Saving')) notifyManager();
      });
      var header = document.getElementById('docs-header');
      if (header) observer.observe(header, { subtree: true, characterData: true, childList: true });
  }
})();