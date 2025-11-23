// src/continuous-popup.ts
import browser from 'webextension-polyfill';
import { findSuggestions, SavedNote } from './utils/algorithm';

(function () {
  if ((window as any).__docsTypingPopupInjected) return;
  (window as any).__docsTypingPopupInjected = true;

  const STORAGE_KEY = 'cached_firestore_notes';
  const MESSAGE_ID = 'DOCS_TYPING_EVENT_TRIGGER';
  const POPUP_ID = 'docs-typing-manager-popup';
  const HIDE_DELAY_MS = 5000;
  let popupTimeout: any = null;

  if (window === window.top) {
    function getOrCreatePopup() {
        let popup = document.getElementById(POPUP_ID);
        if (popup) return popup;

        popup = document.createElement('div');
        popup.id = POPUP_ID;
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

    function updatePopupContent(popupElement: HTMLElement) {
      try {
          browser.storage.local.get([STORAGE_KEY]).then((result) => {
              const contentDiv = popupElement.querySelector('#docs-popup-content');
              const headerDiv = popupElement.querySelector('#docs-popup-header');
              
              // Cast the result to our expected type
              const notes = result[STORAGE_KEY] as SavedNote[];

              if (!notes || notes.length === 0) {
                  if (contentDiv) contentDiv.textContent = "No notes found in cache. Open extension to sync!";
                  return;
              }

              navigator.clipboard.readText()
                .then(text => {
                    const query = text ? text.trim() : "";
                    let recommended: SavedNote | null = null;

                    if (query.length > 2) {
                       // USE THE SHARED ALGORITHM HERE
                       const suggestions = findSuggestions(query, notes);
                       if (suggestions.length > 0) {
                           recommended = suggestions[0];
                       }
                    }

                    if (recommended && contentDiv && headerDiv) {
                        headerDiv.textContent = "Suggested Idea (matches clipboard):";
                        (headerDiv as HTMLElement).style.color = "#2563eb";
                        contentDiv.textContent = '"' + recommended.content + '"';
                    } else if (contentDiv && headerDiv) {
                        headerDiv.textContent = "Latest Note:";
                        (headerDiv as HTMLElement).style.color = "#64748b";
                        const latest = notes[notes.length - 1];
                        contentDiv.textContent = '"' + latest.content + '"';
                    }
                })
                .catch(() => {
                    if (contentDiv) {
                        const latest = notes[notes.length - 1];
                        contentDiv.textContent = '"' + latest.content + '"';
                    }
                });
          }).catch((err) => {
             console.warn("Scrappr: Storage read failed", err);
          });
      } catch (error) {
          console.warn("Scrappr: Context invalidated.");
      }
    }

    function showPopup() {
      const popup = getOrCreatePopup();
      updatePopupContent(popup);
      popup.style.opacity = '1';
      if (popupTimeout) clearTimeout(popupTimeout);
      popupTimeout = setTimeout(() => {
        popup.style.opacity = '0';
        popupTimeout = null;
      }, HIDE_DELAY_MS);
    }

    window.addEventListener('message', (event) => {
      if (event.data === MESSAGE_ID) showPopup();
    });
  }

  function notifyManager() {
    window.top?.postMessage(MESSAGE_ID, '*');
  }

  function handleInput(e: KeyboardEvent) {
    if (e.key && (e.key.length > 1 && e.key !== 'Backspace' && e.key !== 'Enter')) return;
    notifyManager();
  }

  window.addEventListener('keydown', handleInput as any, true);
  window.addEventListener('input', handleInput as any, true);

  if (window === window.top) {
      const observer = new MutationObserver(() => {
          const statusText = document.querySelector('.docs-save-indicator-text');
          if (statusText && statusText.textContent?.includes('Saving')) notifyManager();
      });
      const header = document.getElementById('docs-header');
      if (header) observer.observe(header, { subtree: true, characterData: true, childList: true });
  }
})();