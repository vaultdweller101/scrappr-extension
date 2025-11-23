(function () {
  if (window.__docsTypingPopupInjected) return;
  window.__docsTypingPopupInjected = true;

  // WE READ THE KEY YOU SET IN NOTES.TSX
  var STORAGE_KEY = 'cached_firestore_notes'; 
  
  var MESSAGE_ID = 'DOCS_TYPING_EVENT_TRIGGER';
  var POPUP_ID = 'docs-typing-manager-popup';
  var HIDE_DELAY_MS = 4000;
  var popupTimeout = null;

  // ==================================================
  // PART 1: THE MANAGER
  // ==================================================
  if (window === window.top) {
    console.log('Docs Popup: Manager initialized. Reading cache:', STORAGE_KEY);

    // Auto-detect API
    var extensionApi = (typeof browser !== 'undefined') ? browser : chrome;

    function getOrCreatePopup() {
        var popup = document.getElementById(POPUP_ID);
        if (popup) return popup;

        popup = document.createElement('div');
        popup.id = POPUP_ID;
        popup.style.cssText = [
            'position: fixed;',
            'top: 70px;',
            'right: 20px;',
            'width: 300px;',
            // 1. Allow height to grow, but cap it at 80% of the screen height
            'max-height: 80vh;', 
            // 2. Add a vertical scrollbar if content exceeds max-height
            'overflow-y: auto;', 
            'padding: 15px;',
            'background-color: #ffffff;',
            'color: #333;',
            'border-left: 5px solid #4CAF50;', 
            'box-shadow: 0 4px 15px rgba(0,0,0,0.2);',
            'z-index: 2147483647;',
            'font-family: sans-serif;',
            'font-size: 13px;',
            'line-height: 1.4;',
            // 3. CRITICAL: Change to 'auto' so user can scroll the popup with mouse
            'pointer-events: auto;', 
            'opacity: 0;',
            'transition: opacity 0.25s ease-in-out;',
            'border-radius: 4px;',
            // 4. Ensure long words break to the next line
            'word-wrap: break-word;', 
            'overflow-wrap: break-word;' 
        ].join(' ');

        popup.innerHTML = `
            <div style="font-weight: bold; color: #4CAF50; margin-bottom: 5px;">
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
      if (!extensionApi || !extensionApi.storage) return;

      // Simple Read from Local Storage
      extensionApi.storage.local.get([STORAGE_KEY], function(result) {
          var contentDiv = popupElement.querySelector('#docs-popup-content');
          var notes = result[STORAGE_KEY];

          if (notes && notes.length > 0) {
              // Assuming the last note is the newest. 
              // If your Firestore sorts differently, change this index (e.g., notes[0])
              var latest = notes[notes.length - 1];
              
              // Extract the text field (adjust 'text' to match your Firestore field name)
              var text = latest.text || latest.content || latest.body || JSON.stringify(latest);
              
              // if (text.length > 150) text = text.substring(0, 150) + '...';
              contentDiv.textContent = '"' + text + '"';
          } else {
              contentDiv.textContent = "No notes found in cache. Open your extension popup to sync!";
          }
      });
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

  // ==================================================
  // PART 2: THE WORKER (Input Sensor)
  // ==================================================
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