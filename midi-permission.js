'use strict';

const LANGUAGE_KEY = 'openSoundcraftMidiLanguage';
const statusNode = document.getElementById('status');
const requestButton = document.getElementById('request');
const copy = {
  de: {
    title: 'MIDI-Berechtigung für Open Soundcraft MIDI',
    description: 'Öffne diese Seite über die Seitenleiste und klicke anschließend auf die Schaltfläche unten. Edge benötigt für die MIDI-Anfrage eine Benutzeraktion in diesem normalen Tab. Nach der Freigabe kehre zur Seitenleiste zurück und klicke dort auf „MIDI verbinden“.',
    button: 'MIDI-Zugriff anfragen',
    requesting: 'MIDI-Berechtigung wird angefragt …',
    success: 'MIDI-Berechtigung erteilt. Kehre zur Seitenleiste zurück und klicke auf „MIDI verbinden“, um die MIDI-Verbindung zu starten.',
    fallback: 'Klicke in diesem Tab auf „MIDI-Zugriff anfragen“, um den Edge-Freigabedialog zu öffnen.',
    error: 'MIDI-Zugriff fehlgeschlagen: {name}: {message}',
    unsupported: 'Dieser Browser unterstützt Web MIDI nicht.',
    hint: 'Es werden hier keine MIDI-Eingänge geöffnet und keine MIDI-Daten verarbeitet.'
  },
  en: {
    title: 'MIDI permission for Open Soundcraft MIDI',
    description: 'Open this page from the Side Panel, then click the button below. Edge requires the MIDI request to originate from a user gesture in this regular tab. After granting access, return to the Side Panel and click “Connect MIDI”.',
    button: 'Request MIDI access',
    requesting: 'Requesting MIDI permission …',
    success: 'MIDI permission granted. Return to the Side Panel and click “Connect MIDI” to start the MIDI session.',
    fallback: 'Click “Request MIDI access” in this tab to show Edge’s permission prompt.',
    error: 'MIDI access failed: {name}: {message}',
    unsupported: 'This browser does not support Web MIDI.',
    hint: 'This page does not open MIDI inputs or process MIDI data.'
  }
};
let language = 'de';
let requestPending = false;

function setStatus(message, type = '') {
  statusNode.textContent = message;
  statusNode.className = type;
}

async function markPermissionGranted() {
  // Persist the one-time grant so the Side Panel returns to its normal layout
  // after it is closed/reopened or the browser is restarted.
  try { await chrome.storage.local.set({ openSoundcraftMidiPermissionGranted: true }); } catch (_) { /* The runtime message may still update an open panel. */ }
  setStatus(copy[language].success, 'success');
  requestButton.textContent = language === 'de' ? 'Freigabe erteilt' : 'Permission granted';
  requestButton.disabled = true;
  try { await chrome.runtime.sendMessage({ type: 'MIDI_PERMISSION_GRANTED' }); } catch (_) { /* Side Panel may not be open. */ }
}

async function detectPreviouslyGrantedPermission() {
  // This check is performed only in this regular extension tab, not in the
  // Side Panel. Treat only an explicit `granted` result as authoritative;
  // unsupported/inconsistent results simply fall back to the user button.
  try {
    if (!navigator.permissions?.query) return false;
    const status = await navigator.permissions.query({ name: 'midi' });
    if (status?.state !== 'granted') return false;
    await markPermissionGranted();
    return true;
  } catch (_) {
    return false;
  }
}

async function requestAccess() {
  if (requestPending) return;
  if (!navigator.requestMIDIAccess) {
    setStatus(copy[language].unsupported, 'error');
    return;
  }
  requestPending = true;
  requestButton.disabled = true;
  setStatus(copy[language].requesting);
  let request;
  try {
    // Keep this call synchronous within the button click when manually retried.
    request = navigator.requestMIDIAccess();
  } catch (error) {
    requestPending = false;
    requestButton.disabled = false;
    setStatus(copy[language].error.replace('{name}', error?.name || 'Error').replace('{message}', error?.message || String(error)), 'error');
    return;
  }
  try {
    const access = await request;
    // Do not set input.onmidimessage, call open(), or call close() on this page.
    // The permission grant is origin-wide; the Side Panel creates its own access object.
    void access;
    await markPermissionGranted();
  } catch (error) {
    requestPending = false;
    requestButton.disabled = false;
    const name = error?.name || 'Error';
    if (name === 'NotAllowedError' || name === 'SecurityError') setStatus(copy[language].fallback + ' ' + copy[language].error.replace('{name}', name).replace('{message}', error?.message || ''), 'error');
    else setStatus(copy[language].error.replace('{name}', name).replace('{message}', error?.message || String(error)), 'error');
  }
}

requestButton.addEventListener('click', () => { void requestAccess(); });

(async () => {
  try {
    const saved = await chrome.storage.local.get(LANGUAGE_KEY);
    language = saved[LANGUAGE_KEY] === 'en' ? 'en' : 'de';
  } catch (_) { /* German fallback. */ }
  document.documentElement.lang = language;
  document.getElementById('title').textContent = copy[language].title;
  document.getElementById('description').textContent = copy[language].description;
  document.getElementById('hint').textContent = copy[language].hint;
  requestButton.textContent = copy[language].button;
  // The request must be triggered by a real user gesture in this normal tab.
  // A click in the Side Panel does not reliably transfer activation to a new tab.
  setStatus(copy[language].fallback);
  // This also migrates users who already granted MIDI in an earlier beta.
  // Querying never opens a port or triggers a permission prompt.
  await detectPreviouslyGrantedPermission();
})();
