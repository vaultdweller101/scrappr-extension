(function () {
  // Avoid double-injecting on the same page
  if (window.__scrapprVoiceWidgetInjected) return;
  window.__scrapprVoiceWidgetInjected = true;

  var SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    // Browser does not support Web Speech in this context
    return;
  }

  function getStorage() {
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      return {
        get: function (key) {
          return browser.storage.local.get(key);
        },
        set: function (obj) {
          return browser.storage.local.set(obj);
        }
      };
    }
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return {
        get: function (key) {
          return new Promise(function (resolve, reject) {
            chrome.storage.local.get(key, function (result) {
              if (chrome.runtime && chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve(result);
              }
            });
          });
        },
        set: function (obj) {
          return new Promise(function (resolve, reject) {
            chrome.storage.local.set(obj, function () {
              if (chrome.runtime && chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve();
              }
            });
          });
        }
      };
    }
    return null;
  }

  var storage = getStorage();
  if (!storage) {
    console.warn('Scrappr voice: no storage provider available (browser.storage.local / chrome.storage.local missing).');
  } else {
    console.log('Scrappr voice: storage provider initialized.');
  }

  // --- UI setup ---

  var root = document.createElement('div');
  root.id = 'scrappr-voice-widget-root';
  root.setAttribute('aria-live', 'polite');

  var button = document.createElement('button');
  button.type = 'button';
  button.className = 'scrappr-voice-button';
  button.setAttribute('aria-pressed', 'false');
  button.setAttribute('aria-label', 'Start a Scrappr voice note');
  button.textContent = 'Voice note';

  var status = document.createElement('div');
  status.className = 'scrappr-voice-status';
  status.textContent = 'Click to start a voice note for Scrappr.';

  root.appendChild(button);
  root.appendChild(status);

  var style = document.createElement('style');
  style.textContent = [
    '#scrappr-voice-widget-root {',
    '  position: fixed;',
    '  right: 16px;',
    '  bottom: 16px;',
    '  z-index: 9999;',
    '  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
    '}',
    '.scrappr-voice-button {',
    '  display: inline-flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  padding: 6px 12px;',
    '  border-radius: 999px;',
    '  border: 1px solid #3b82f6;',
    '  background: #ffffff;',
    '  color: #3b82f6;',
    '  font-size: 12px;',
    '  font-weight: 500;',
    '  cursor: pointer;',
    '  box-shadow: 0 4px 10px rgba(15, 23, 42, 0.12);',
    '}',
    '.scrappr-voice-button-active {',
    '  background: #3b82f6;',
    '  color: #ffffff;',
    '  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.35);',
    '}',
    '.scrappr-voice-button:focus-visible {',
    '  outline: 2px solid #1d4ed8;',
    '  outline-offset: 2px;',
    '}',
    '.scrappr-voice-status {',
    '  margin-top: 4px;',
    '  padding: 4px 8px;',
    '  border-radius: 6px;',
    '  background: rgba(15, 23, 42, 0.75);',
    '  color: #e5e7eb;',
    '  font-size: 11px;',
    '  max-width: 240px;',
    '}',
  ].join('\n');

  document.documentElement.appendChild(style);
  document.documentElement.appendChild(root);

  function setStatus(text) {
    status.textContent = text;
  }

  function setRecordingVisual(isRecording) {
    button.setAttribute('aria-pressed', isRecording ? 'true' : 'false');
    if (isRecording) {
      button.classList.add('scrappr-voice-button-active');
    } else {
      button.classList.remove('scrappr-voice-button-active');
    }
  }

  // --- Speech recognition wiring ---

  var recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = (navigator && navigator.language) || 'en-US';

  var isRecording = false;
  var transcript = '';

  function saveTranscriptIfAny() {
    var text = transcript.trim();
    if (!text) {
      console.log('Scrappr voice: saveTranscriptIfAny called with empty text, skipping.');
      return;
    }
    if (!storage) {
      console.warn('Scrappr voice: storage is not available, cannot save transcript of length', text.length);
      return;
    }

    var now = Date.now();
    console.log('Scrappr voice: attempting to save transcript', { length: text.length, preview: text.slice(0, 80) });

    storage
      .get('scrapprVoiceNotesPending')
      .then(function (result) {
        var existing = result && result.scrapprVoiceNotesPending;
        var list = Array.isArray(existing) ? existing.slice() : [];
        console.log('Scrappr voice: loaded existing pending voice notes', {
          existingCount: Array.isArray(existing) ? existing.length : 0
        });
        list.push({ id: now, createdAt: now, text: text });
        return storage.set({ scrapprVoiceNotesPending: list });
      })
      .then(function () {
        console.log('Scrappr voice: successfully saved voice note with id', now);
        setStatus('Voice note saved for Scrappr. Open the popup to import it.');
      })
      .catch(function (err) {
        console.warn('Scrappr voice: failed to save voice note', err);
        setStatus('Could not save voice note to Scrappr.');
      });
  }

  recognition.onstart = function () {
    isRecording = true;
    transcript = '';
    console.log('Scrappr voice: recognition started');
    setRecordingVisual(true);
    setStatus('Listening… Speak clearly, then click again to save.');
  };

  recognition.onresult = function (event) {
    var finalTranscript = '';
    for (var i = event.resultIndex; i < event.results.length; i++) {
      var result = event.results[i];
      if (result.isFinal && result[0]) {
        finalTranscript += result[0].transcript;
      }
    }
    if (!finalTranscript) return;
    console.log('Scrappr voice: received final transcript chunk', finalTranscript);
    transcript += finalTranscript + ' ';
  };

  recognition.onerror = function (event) {
    isRecording = false;
    setRecordingVisual(false);
    console.warn('Scrappr voice: recognition error', event && event.error, event);
    if (event && event.error === 'not-allowed') {
      setStatus('Microphone access was blocked for docs.google.com. Check site settings.');
    } else {
      setStatus('There was a problem with speech recognition.');
    }
  };

  recognition.onend = function () {
    console.log('Scrappr voice: recognition ended, transcript length', transcript.trim().length);
    if (isRecording) {
      // onend can fire even while recording; treat this as a stop
      isRecording = false;
      setRecordingVisual(false);
    }
    // When a session ends, attempt to save whatever we captured
    if (transcript.trim()) {
      saveTranscriptIfAny();
      transcript = '';
    } else if (!isRecording) {
      setStatus('No speech detected. Click to try recording again.');
    }
  };

  function startRecording() {
    try {
      recognition.start();
    } catch (e) {
      // start can throw if called too quickly; ignore
      setStatus('Could not start listening yet. Try again in a moment.');
    }
  }

  function stopRecording() {
    try {
      recognition.stop();
    } catch (e) {
      setStatus('Could not stop listening cleanly, but recording has ended.');
    }
  }

  button.addEventListener('click', function (event) {
    event.preventDefault();
    console.log('Scrappr voice: button click, isRecording =', isRecording);
    if (!isRecording) {
      setStatus('Requesting microphone permission for docs.google.com…');
      startRecording();
    } else {
      setStatus('Stopping…');
      stopRecording();
    }
  });

  button.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      button.click();
    }
  });
})();