(function () {
  // Avoid double-injecting on the same page
  if (window.__scrapprVoiceWidgetInjected) return;
  window.__scrapprVoiceWidgetInjected = true;

  // --- Storage Helper ---
  function getStorage() {
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      return {
        get: (key) => browser.storage.local.get(key),
        set: (obj) => browser.storage.local.set(obj)
      };
    }
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return {
        get: (key) => new Promise((resolve, reject) => {
          chrome.storage.local.get(key, (result) => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
            else resolve(result);
          });
        }),
        set: (obj) => new Promise((resolve, reject) => {
          chrome.storage.local.set(obj, () => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
            else resolve();
          });
        })
      };
    }
    return null;
  }

  var storage = getStorage();
  
  // --- Message Sender Helper ---
  function sendMessageToBackground(message) {
    if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.sendMessage) {
      return browser.runtime.sendMessage(message);
    }
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve(response);
        });
      });
    }
    return Promise.reject("No runtime available");
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
    status.style.display = text ? 'block' : 'none';
  }

  // --- Audio Logic ---
  var mediaRecorder = null;
  var audioChunks = [];
  var isRecording = false;

  async function startRecording() {
    try {
      setStatus('Requesting microphone...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks to release mic
        stream.getTracks().forEach(track => track.stop());
        
        setStatus('Processing audio...');
        button.textContent = 'Processing...';
        button.disabled = true;
        button.classList.remove('recording');

        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        await processAudio(audioBlob);
      };

      mediaRecorder.start();
      isRecording = true;
      button.textContent = 'Stop Recording';
      button.classList.add('recording');
      setStatus('Recording... Click Stop when done.');

    } catch (err) {
      console.error('Scrappr: Mic error', err);
      setStatus('Could not access microphone. Please allow access.');
    }
  }

  function stopRecording() {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      isRecording = false;
    }
  }

  async function processAudio(blob) {
    try {
      // Convert Blob to Base64
      var reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async function() {
        var base64data = reader.result.split(',')[1];
        
        setStatus('Transcribing...');
        
        try {
          // Send to Background Script
          var response = await sendMessageToBackground({ 
            type: 'TRANSCRIBE_AUDIO', 
            audioBase64: base64data 
          });

          if (response && response.success) {
            saveTranscript(response.text);
          } else {
            var errorMsg = response.error || "Unknown error";
            if (errorMsg.includes("signed in")) {
              setStatus('Please open Scrappr extension and sign in first.');
            } else {
              setStatus('Transcription failed: ' + errorMsg);
            }
            resetButton();
          }
        } catch (err) {
          console.error('Scrappr: Background message error', err);
          setStatus('Error communicating with extension.');
          resetButton();
        }
      };
    } catch (e) {
      setStatus('Error processing audio file.');
      resetButton();
    }
  }

  function saveTranscript(text) {
    if (!text) {
      setStatus('No speech detected.');
      resetButton();
      return;
    }

    var now = Date.now();
    storage.get('scrapprVoiceNotesPending').then(function(result) {
      var list = result.scrapprVoiceNotesPending || [];
      list.push({ id: now, createdAt: now, text: text });
      return storage.set({ scrapprVoiceNotesPending: list });
    }).then(function() {
      setStatus('Note saved! Open extension to import.');
      setTimeout(() => setStatus(''), 5000);
    }).catch(function(err) {
      setStatus('Could not save note to storage.');
    }).finally(function() {
      resetButton();
    });
  }

  function resetButton() {
    button.textContent = 'Voice note';
    button.disabled = false;
    button.classList.remove('recording');
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