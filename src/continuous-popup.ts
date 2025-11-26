// src/continuous-popup.ts
import browser from 'webextension-polyfill';
import { findSuggestions, SavedNote } from './utils/algorithm';

(function () {
  if ((window as any).__docsTypingPopupInjected) return;
  (window as any).__docsTypingPopupInjected = true;

  const STORAGE_KEY = 'cached_firestore_notes';
  const MESSAGE_ID = 'DOCS_TYPING_EVENT_TRIGGER';
  const POPUP_ID = 'docs-typing-manager-popup';
  // When set to 0, popup will remain visible until the user closes it.
  const HIDE_DELAY_MS = 0;
  let popupTimeout: any = null;
  const TOGGLE_ID = 'docs-popup-toggle';
  const POPUP_ENABLED_KEY = 'scrappr_popup_enabled';
  let isPopupEnabled = true; // default on

  // Utility function to convert URLs in text to clickable links 
  function convertUrlsToLinks(text: string): string {
    const escapeHtml = (str: string) => {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    };

    // Regex to match URLs (http://, https://, www., and plain domains)
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}[^\s]*)/g;
    const parts: string[] = [];
    let lastIndex = 0;
    let match;

    while ((match = urlRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(escapeHtml(text.substring(lastIndex, match.index)));
      }

      const url = match[0];
      let href = url;

      // Add protocol if missing
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        href = `https://${url}`;
      }

      // Create clickable link
      const escapedUrl = escapeHtml(url);
      parts.push(`<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="color: #3b82f6; text-decoration: underline; word-break: break-all;">${escapedUrl}</a>`);

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(escapeHtml(text.substring(lastIndex)));
    }

    // If no URLs found, return escaped original text
    return parts.length > 0 ? parts.join('') : escapeHtml(text);
  }

  if (window === window.top) {
    function getOrCreatePopup() {
        let popup = document.getElementById(POPUP_ID);
        if (popup) return popup;

        popup = document.createElement('div');
        popup.id = POPUP_ID;
        // Increased height/max-height slightly to accommodate multiple notes
        popup.style.cssText = 'position: fixed; top: 70px; right: 20px; width: 320px; max-height: 85vh; overflow-y: auto; padding: 15px; background-color: #ffffff; color: #333; border-left: 5px solid #3b82f6; box-shadow: 0 4px 15px rgba(0,0,0,0.2); z-index: 2147483647; font-family: sans-serif; font-size: 13px; line-height: 1.4; pointer-events: auto; opacity: 0; transition: opacity 0.25s ease-in-out; border-radius: 4px; word-wrap: break-word; overflow-wrap: break-word;';

        popup.innerHTML = `
          <div id="docs-popup-header" style="display:flex; align-items:center; justify-content:space-between; gap:8px; font-weight: bold; color: #3b82f6; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #eee;">
            <div id="docs-popup-title" style="flex:1">Latest Notes:</div>
            <div style="flex-shrink:0; display:flex; gap:8px; align-items:center;">
              <button id="docs-popup-close" aria-label="Close suggestions" title="Close" style="border:0; background:transparent; cursor:pointer; font-size:16px; line-height:1; color:#94a3b8;">×</button>
            </div>
          </div>
          <div id="docs-popup-content">
            Loading...
          </div>
        `;
        document.body.appendChild(popup);
        return popup;
    }

    // Create a persistent floating toggle button to enable/disable the popup
    function getOrCreateToggle() {
      let btn = document.getElementById(TOGGLE_ID) as HTMLButtonElement | null;
      if (btn) return btn;

      btn = document.createElement('button');
      btn.id = TOGGLE_ID;
      btn.setAttribute('aria-pressed', 'true');
      btn.title = 'Toggle Relevant notes';
      // reuse the same class as the voice button so visuals match
      btn.className = 'scrappr-voice-button';
      btn.style.fontSize = '12px';
      btn.style.fontWeight = '600';
      btn.style.display = 'inline-flex';
      btn.style.alignItems = 'center';
      btn.style.justifyContent = 'center';
      btn.textContent = 'Hide';

      btn.onclick = async () => {
        isPopupEnabled = !isPopupEnabled;
        // update visual
        setToggleVisual(btn, isPopupEnabled);
        btn.setAttribute('aria-pressed', isPopupEnabled ? 'true' : 'false');
        try {
          await browser.storage.local.set({ [POPUP_ENABLED_KEY]: isPopupEnabled });
        } catch (err) {
          console.warn('Scrappr: could not persist popup toggle', err);
        }
        if (!isPopupEnabled) {
          const popup = document.getElementById(POPUP_ID);
          if (popup) (popup as HTMLElement).style.opacity = '0';
        } else {
          // show immediately when turning on
          const popup = document.getElementById(POPUP_ID) || getOrCreatePopup();
          updatePopupContent(popup as HTMLElement);
          (popup as HTMLElement).style.opacity = '1';
        }
      };

      // If the voice widget exists, insert next to its button for inline placement
      const voiceRoot = document.getElementById('scrappr-voice-widget-root');
      if (voiceRoot) {
        const voiceBtn = voiceRoot.querySelector('.scrappr-voice-button');
        if (voiceBtn && voiceBtn.parentElement) {
          // place immediately after the voice button (side-by-side)
          btn.style.marginLeft = '8px';
          btn.style.padding = '6px 10px';
          voiceBtn.insertAdjacentElement('afterend', btn);
        } else {
          document.body.appendChild(btn);
        }
      } else {
        document.body.appendChild(btn);
      }
      return btn;
    }

    function setToggleVisual(btn: HTMLElement, enabled: boolean) {
      if (enabled) {
        btn.classList.add('scrappr-voice-button-active');
        btn.textContent = 'Hide Notes';
      } else {
        btn.classList.remove('scrappr-voice-button-active');
        btn.textContent = 'Show Notes';
      }
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
                    let results: SavedNote[] = [];
                    let isSuggestion = false;

                    if (query.length > 2) {
                       // USE THE SHARED ALGORITHM HERE
                       const suggestions = findSuggestions(query, notes);
                       if (suggestions.length > 0) {
                           // Take top 3 suggestions
                           results = suggestions.slice(0, 3);
                           isSuggestion = true;
                       }
                    }

                    // Fallback to latest 3 notes if no suggestions found
                    if (results.length === 0) {
                        // Reverse to get newest first, then take top 3
                        results = [...notes].reverse().slice(0, 3);
                        isSuggestion = false;
                    }

                    // Update Header
                    if (headerDiv) {
                        if (isSuggestion) {
                            headerDiv.textContent = "Top 3 Suggestions:";
                            (headerDiv as HTMLElement).style.color = "#2563eb"; // Blue for suggestions
                        } else {
                            headerDiv.textContent = "Latest 3 Notes:";
                            (headerDiv as HTMLElement).style.color = "#64748b"; // Gray for latest
                        }
                    }

                    // Update Content Loop
                    if (contentDiv) {
                        contentDiv.innerHTML = ''; // Clear previous content
                        
                        results.forEach((note, index) => {
                            const noteEl = document.createElement('div');
                            noteEl.style.cssText = `
                                margin-bottom: 8px; 
                                padding-bottom: 8px; 
                                ${index < results.length - 1 ? 'border-bottom: 1px dashed #e2e8f0;' : ''}
                            `;
                            
                            const textEl = document.createElement('div');
                            textEl.innerHTML = '"' + convertUrlsToLinks(note.content) + '"';
                            textEl.style.fontStyle = 'italic';
                            noteEl.appendChild(textEl);

                            // Optional: Add date
                            const dateEl = document.createElement('div');
                            dateEl.textContent = new Date(note.timestamp).toLocaleDateString();
                            dateEl.style.cssText = 'font-size: 10px; color: #94a3b8; margin-top: 2px; text-align: right;';
                            noteEl.appendChild(dateEl);

                            contentDiv.appendChild(noteEl);
                        });
                    }
                })
                .catch(() => {
                    // Fallback if clipboard read fails (e.g. permissions)
                    if (contentDiv && headerDiv) {
                        headerDiv.textContent = "Latest 3 Notes:";
                        (headerDiv as HTMLElement).style.color = "#64748b";
                        
                        contentDiv.innerHTML = '';
                        const latest3 = [...notes].reverse().slice(0, 3);
                        
                        latest3.forEach((note, index) => {
                            const noteEl = document.createElement('div');
                            noteEl.style.cssText = `
                                margin-bottom: 8px; 
                                padding-bottom: 8px; 
                                ${index < latest3.length - 1 ? 'border-bottom: 1px dashed #e2e8f0;' : ''}
                            `;
                            
                            // Add content with clickable links
                            const textEl = document.createElement('div');
                            textEl.innerHTML = '"' + convertUrlsToLinks(note.content) + '"';
                            textEl.style.fontStyle = 'italic';
                            noteEl.appendChild(textEl);

                            const dateEl = document.createElement('div');
                            dateEl.textContent = new Date(note.timestamp).toLocaleDateString();
                            dateEl.style.cssText = 'font-size: 10px; color: #94a3b8; margin-top: 2px; text-align: right;';
                            noteEl.appendChild(dateEl);
                            
                            contentDiv.appendChild(noteEl);
                        });
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
      if (!isPopupEnabled) return; // respect the toggle

      const popup = getOrCreatePopup();
      updatePopupContent(popup);
      popup.style.opacity = '1';
      // If HIDE_DELAY_MS is 0 we don't auto-hide; otherwise use timeout
      if (popupTimeout) {
        clearTimeout(popupTimeout);
        popupTimeout = null;
      }
      if (HIDE_DELAY_MS > 0) {
        popupTimeout = setTimeout(() => {
          popup.style.opacity = '0';
          popupTimeout = null;
        }, HIDE_DELAY_MS);
      }

      // Wire up close button (idempotent)
      const closeBtn = popup.querySelector('#docs-popup-close');
      if (closeBtn) {
        (closeBtn as HTMLElement).onclick = () => {
          popup.style.opacity = '0';
          // keep popup in DOM so it can be reopened by typing events
        };
      }

      try {
        const toggle = document.getElementById(TOGGLE_ID) || getOrCreateToggle();
        if (toggle) {
          setToggleVisual(toggle as HTMLElement, isPopupEnabled);
          (toggle as HTMLElement).setAttribute('aria-pressed', isPopupEnabled ? 'true' : 'false');
        }
      } catch (e) {
        // ignore
      }
    }
    // Initialize persisted toggle state and ensure toggle UI exists (top window only)
    try {
      browser.storage.local.get(POPUP_ENABLED_KEY).then((res) => {
        const val = (res as any)[POPUP_ENABLED_KEY];
        if (typeof val === 'boolean') {
          isPopupEnabled = val;
        } else {
          isPopupEnabled = true;
        }
        const toggle = getOrCreateToggle();
        setToggleVisual(toggle as HTMLElement, isPopupEnabled);
        toggle.setAttribute('aria-pressed', isPopupEnabled ? 'true' : 'false');
      }).catch(() => {
        isPopupEnabled = true;
        const toggle = getOrCreateToggle();
        setToggleVisual(toggle as HTMLElement, true);
        toggle.setAttribute('aria-pressed', 'true');
      });
    } catch (e) {
      // ignore
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