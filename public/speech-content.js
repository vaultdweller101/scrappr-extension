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

  var statusFill = document.createElement('div');
  statusFill.className = 'scrappr-voice-volume-fill';

  var statusText = document.createElement('div');
  statusText.className = 'scrappr-voice-status-text';
  statusText.textContent = 'Click to start a voice note for Scrappr.';

  status.appendChild(statusFill);
  status.appendChild(statusText);

  var reviewContainer = document.createElement('div');
  reviewContainer.className = 'scrappr-voice-review';
  reviewContainer.style.display = 'none';

  var reviewText = document.createElement('textarea');
  reviewText.className = 'scrappr-voice-review-text';

  var reviewActions = document.createElement('div');
  reviewActions.className = 'scrappr-voice-review-actions';

  var reviewSaveButton = document.createElement('button');
  reviewSaveButton.type = 'button';
  reviewSaveButton.className = 'scrappr-voice-review-button scrappr-voice-review-button-primary';
  reviewSaveButton.textContent = 'Save';

  var reviewRetakeButton = document.createElement('button');
  reviewRetakeButton.type = 'button';
  reviewRetakeButton.className = 'scrappr-voice-review-button';
  reviewRetakeButton.textContent = 'Retake';

  var reviewDiscardButton = document.createElement('button');
  reviewDiscardButton.type = 'button';
  reviewDiscardButton.className = 'scrappr-voice-review-button';
  reviewDiscardButton.textContent = 'Discard';

  reviewActions.appendChild(reviewSaveButton);
  reviewActions.appendChild(reviewRetakeButton);
  reviewActions.appendChild(reviewDiscardButton);

  reviewContainer.appendChild(reviewText);
  reviewContainer.appendChild(reviewActions);

  root.appendChild(button);
  root.appendChild(status);
  root.appendChild(reviewContainer);

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
    '  background: #ffffff;',
    '  color: #0f172a;',
    '  font-size: 11px;',
    '  max-width: 240px;',
    '  position: relative;',
    '  overflow: hidden;',
    '}',
    '.scrappr-voice-status-text {',
    '  position: relative;',
    '  z-index: 2;',
    '}',
    '.scrappr-voice-volume-fill {',
    '  position: absolute;',
    '  left: 0;',
    '  top: 0;',
    '  bottom: 0;',
    '  width: 0%;',
    '  background: rgba(59, 130, 246, 0.12);',
    '  z-index: 1;',
    '  pointer-events: none;',
    '}',
    '.scrappr-voice-review {',
    '  margin-top: 4px;',
    '  padding: 8px 10px;',
    '  border-radius: 8px;',
    '  background: #ffffff;',
    '  color: #0f172a;',
    '  font-size: 11px;',
    '  max-width: 260px;',
    '  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.15);',
    '}',
    '.scrappr-voice-review-text {',
    '  width: 100%;',
    '  min-height: 80px;',
    '  max-height: 160px;',
    '  margin-bottom: 8px;',
    '  padding: 6px 8px;',
    '  border-radius: 6px;',
    '  border: 1px solid rgba(148, 163, 184, 0.9);',
    '  background: #ffffff;',
    '  color: #0f172a;',
    '  font-family: inherit;',
    '  font-size: 11px;',
    '  line-height: 1.3;',
    '  resize: vertical;',
    '  box-sizing: border-box;',
    '}',
    '.scrappr-voice-review-actions {',
    '  display: flex;',
    '  gap: 6px;',
    '  justify-content: flex-end;',
    '}',
    '.scrappr-voice-review-button {',
    '  border-radius: 999px;',
    '  border: 1px solid #e6eef9;',
    '  background: #f1f5f9;',
    '  color: #0f172a;',
    '  font-size: 10px;',
    '  padding: 4px 10px;',
    '  cursor: pointer;',
    '}',
    '.scrappr-voice-review-button-primary {',
    '  border-color: #1d4ed8;',
    '  background: #1d4ed8;',
    '  color: #ffffff;',
    '}',
  ].join('\n');

  document.documentElement.appendChild(style);
  document.documentElement.appendChild(root);

  function setStatus(text) {
    statusText.textContent = text;
    status.style.display = text ? 'block' : 'none';
  }

  // --- Audio Logic ---
  var mediaRecorder = null;
  var audioChunks = [];
  var isRecording = false;

  var currentTranscript = '';

  var audioContext = null;
  var analyser = null;
  var sourceNode = null;
  var volumeAnimationId = null;
  var volumeDataArray = null;

  function startVolumeMeter(stream) {
    try {
      var AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) {
        return;
      }

      if (!audioContext) {
        audioContext = new AudioContextCtor();
      }

      if (audioContext.state === 'suspended') {
        audioContext.resume().catch(function () {});
      }

      sourceNode = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      sourceNode.connect(analyser);

      volumeDataArray = new Uint8Array(analyser.fftSize);

      if (volumeAnimationId) {
        cancelAnimationFrame(volumeAnimationId);
      }

      function updateVolume() {
        if (!analyser) {
          return;
        }
        analyser.getByteTimeDomainData(volumeDataArray);

        var sum = 0;
        for (var i = 0; i < volumeDataArray.length; i++) {
          var v = (volumeDataArray[i] - 128) / 128;
          sum += v * v;
        }

        var rms = Math.sqrt(sum / volumeDataArray.length) || 0;
        var level = Math.min(1, rms * 4);

        if (statusFill) {
          statusFill.style.width = (level * 100) + '%';
        }

        volumeAnimationId = requestAnimationFrame(updateVolume);
      }

      updateVolume();
    } catch (e) {
      console.warn('Scrappr: could not start volume meter', e);
    }
  }

  function stopVolumeMeter() {
    if (volumeAnimationId) {
      cancelAnimationFrame(volumeAnimationId);
      volumeAnimationId = null;
    }

    if (statusFill) {
      statusFill.style.width = '0%';
    }

    if (sourceNode) {
      try {
        sourceNode.disconnect();
      } catch (e) {}
      sourceNode = null;
    }

    if (analyser) {
      try {
        analyser.disconnect();
      } catch (e) {}
      analyser = null;
    }
  }

  async function startRecording() {
    try {
      setStatus('Requesting microphone...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      startVolumeMeter(stream);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stopVolumeMeter();
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
      stopVolumeMeter();
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
            handleTranscript(response.text);
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

  function handleTranscript(text) {
    var normalized = text == null ? '' : String(text);
    if (!normalized.trim()) {
      setStatus('No speech detected.');
      resetButton();
      return;
    }

    resetButton();
    showTranscriptReview(normalized);
  }

  function showTranscriptReview(text) {
    currentTranscript = text == null ? '' : String(text);
    reviewText.value = currentTranscript;
    reviewContainer.style.display = 'block';
    button.style.display = 'none';
    status.style.display = 'none';
    try {
      reviewText.focus();
      reviewText.setSelectionRange(reviewText.value.length, reviewText.value.length);
    } catch (e) {}
  }

  function hideTranscriptReview() {
    reviewContainer.style.display = 'none';
    button.style.display = 'inline-flex';
    if (statusText.textContent) {
      status.style.display = 'block';
    }
  }

  reviewText.addEventListener('input', function () {
    currentTranscript = reviewText.value || '';
  });

  reviewSaveButton.addEventListener('click', function () {
    if (!currentTranscript || !currentTranscript.trim()) {
      setStatus('No speech detected.');
      hideTranscriptReview();
      resetButton();
      return;
    }
    hideTranscriptReview();
    saveTranscript(currentTranscript);
  });

  reviewRetakeButton.addEventListener('click', function () {
    hideTranscriptReview();
    startRecording();
  });

  reviewDiscardButton.addEventListener('click', function () {
    currentTranscript = '';
    hideTranscriptReview();
    setStatus('Recording discarded.');
    resetButton();
  });

  function saveTranscript(text) {
    var normalized = text == null ? '' : String(text);
    if (!normalized.trim()) {
      setStatus('No speech detected.');
      resetButton();
      return;
    }

    setStatus('Saving note...');
    sendMessageToBackground({
      type: 'SAVE_TRANSCRIPT_NOTE',
      text: normalized
    }).then(function (response) {
      if (response && response.success) {
        setStatus('Note saved.');
        setTimeout(function () { setStatus(''); }, 5000);
      } else {
        var errorMsg = (response && response.error) || 'Failed to save note.';
        setStatus('Could not save note: ' + errorMsg);
      }
    }).catch(function (err) {
      console.error('Scrappr: save note error', err);
      setStatus('Could not save note.');
    }).finally(function () {
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