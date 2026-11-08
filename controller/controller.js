// The DOM-matching/apply/inspect logic that runs inside the mixer page's MAIN
// world lives once in shared/soundcraft-page-bridge.js (loaded via
// controller.html before this script, and also by background.js for the
// service worker's own executeScript calls). We reference the single shared
// implementation here instead of keeping a second, independently maintained
// copy in sync by hand.
const soundcraftPageBridge = window.OpenSoundcraftBackgroundBridge && window.OpenSoundcraftBackgroundBridge.soundcraftPageBridge;

const $ = (id) => document.getElementById(id);
const IS_SIDE_PANEL = document.body.classList.contains('side-panel');
const IS_EDGE = /Edg\//i.test(navigator.userAgent);
const STORAGE_KEY = 'openSoundcraftMidiMappings';
const SELECTED_MIXER_CONTEXT_KEY = 'openSoundcraftMidiSelectedMixerContext';
const LEGACY_ACTIVE_TAB_CONTEXT_KEY = 'openSoundcraftMidiActiveTabContext';
const mixerTabContextUtils = window.OpenSoundcraftMixerTabContext || null;
const mappingModeUtils = window.OpenSoundcraftMidiMappingMode || null;
const MIDI_SETTINGS_KEY = 'openSoundcraftMidiMidiSettings';
const LANGUAGE_KEY = 'openSoundcraftMidiLanguage';
const FEEDBACK_COLORS_KEY = 'openSoundcraftMidiLastFeedbackColors';
const MIDI_PERMISSION_GRANTED_KEY = 'openSoundcraftMidiPermissionGranted';
const colorUtils = window.OpenSoundcraftMidiColors;
// Loaded by controller.html before this script. Keep a safe fallback so a
// missing optional profile helper can never interrupt MIDI Learn / mapping creation.
const deviceProfiles = window.OpenSoundcraftMidiDeviceProfiles || null;
let lastFeedbackColors = null;

const I18N = {
  de: {
    subtitle:'Open-Source-Beta · MIDI-Steuerung für Soundcraft-Ui-Mixer im Browser', language:'Sprache', notConnected:'Nicht verbunden',
    midiDeviceTitle:'1. MIDI-Gerät', midiDeviceDescription:'Controller verbinden und optional einen MIDI-Ausgang für LED- und Motorfader-Feedback wählen.', connectMidi:'MIDI verbinden', openMidiConnectTab:'MIDI-Berechtigung im neuen Tab anfragen', midiTabOpened:'MIDI-Berechtigungsseite geöffnet. Bitte dort auf „MIDI-Zugriff anfragen“ klicken. Danach zur Seitenleiste zurückkehren und „MIDI verbinden“ wählen.', midiPermissionGrantedClickToConnect:'Freigabe erteilt. Kehre zur Seitenleiste zurück und klicke auf „MIDI verbinden“.',
    midiInput:'MIDI-Eingang', allMidiInputs:'Alle MIDI-Eingänge', noMidiInputSelected:'Kein Eingang geöffnet', allMidiInputsRisk:'Alle Eingänge öffnen (nicht empfohlen)', refresh:'Aktualisieren', midiOutput:'MIDI-Ausgang', noMidiOutput:'Kein MIDI-Ausgang ausgewählt',
    faderFeedback:'MIDI-Feedback (Fader und Tasten)', feedbackFormat:'Feedback-Format', feedbackAuto:'Automatisch', feedbackCC:'Control Change (7 Bit)', feedbackPitchBend:'Pitch Bend (14 Bit)',
    parameterTargetTitle:'Direktparameter-Ziel (auch unsichtbare Fader)', parameterKey:'Soundcraft-Parameter', parameterLabel:'Anzeigename (optional)', addParameterTarget:'Parameter-Ziel übernehmen', parameterHelp:'Der Typ wird automatisch aus dem Parameter abgeleitet. Beispiele: i.7.mix (Fader), i.7.mute (Taste), i.7.aux.0.value (Aux-Send).', parameterInvalid:'Ungültiger Parameter-Schlüssel. Beispiel: i.7.aux.0.value.', parameterMissingTab:'Übernimm zuerst den aktuellen Browser-Tab als Mixer.',
    buttonFeedback:'Tasten-LED-Feedback', feedbackProfile:'LED-Profil', feedbackActiveColor:'Farbe aktiv', feedbackInactiveColor:'Farbe inaktiv',
    midiNotRequested:'MIDI-Zugriff wird erst nach Klick auf „MIDI verbinden“ angefordert.', midiRequesting:'MIDI-Zugriff wird angefragt …', midiNeedsUserGesture:'Klicke auf „MIDI verbinden“, um Edge die MIDI-Anfrage aus einer Benutzeraktion heraus zu zeigen.', midiPermissionDenied:'Edge hat den MIDI-Zugriff für diese Erweiterungsseite verweigert. Prüfe die MIDI-Berechtigung und Richtlinien für die Erweiterung, nicht nur für die Mixer-Adresse.', midiPermissionUnknown:'MIDI-Berechtigung wird nicht vorab abgefragt. Klicke auf „MIDI verbinden“, um Edge direkt anzufragen.', disconnectMidi:'MIDI-Empfang deaktivieren', midiReleased:'MIDI-Empfang wurde deaktiviert. In Edge wird der native Port nicht explizit geschlossen, um einen möglichen MIDI-Treiber-Hänger zu vermeiden. Zum erneuten Verbinden auf „MIDI verbinden“ klicken.', midiInputNotSelected:'MIDI ist verbunden. Wähle einen einzelnen Eingang; nicht ausgewählte Ports bleiben geschlossen.', midiAllInputsWarning:'Alle MIDI-Eingänge sind geöffnet. Bei Problemen nur einen Eingang auswählen.', midiInputActive:'{count} MIDI-Eingang/-Eingänge aktiv. {scope}', midiRequestTimeout:'Die MIDI-Anfrage hat nicht geantwortet. Prüfe die MIDI-Berechtigung in Edge und versuche es erneut.', midiDeviceDisconnected:'MIDI-Gerät getrennt. Feedback wurde angehalten; verbinde das Gerät erneut.', feedbackHint:'Wähle einen MIDI-Ausgang, um Fader-Werte und Tasten-Zustände zurückzusenden.', lastMidiMessage:'Letzte MIDI-Nachricht',
    mixerWebsiteTitle:'2. Mixer-Webseite', mixerWebsiteDescription:'Öffne die Mixer-Webseite. Beim Klick auf „MIDI verbinden“ wird der aktuelle Tab automatisch als Mixer übernommen. Mit der manuellen Auswahl kannst du das Mixer-Ziel wechseln.', useCurrentTab:'Aktuellen Tab manuell als Mixer festlegen', mixerNotSelected:'Noch kein Mixer-Tab ausgewählt.', mixerSelected:'Mixer-Tab festgelegt: {title} · {url}', permissionHint:'Beim ersten Zugriff fragt der Browser nach Berechtigung für die Mixer-Webseite.', chooseTarget:'Ziel wählen', targetHint:'Übernimm den Mixer-Tab und klicke auf ein Bedienelement. MIDI Learn startet automatisch; nach jeder Zuordnung wird das nächste Ziel aktiviert. ESC beendet den Lernmodus.',
    startMidiLearn:'MIDI Learn starten', cancel:'Lernmodus beenden',
    learnHint:'Klicke auf „Ziel wählen“ und danach auf ein Mixer-Bedienelement. MIDI Learn startet automatisch. Für Fader CC oder Pitch Bend, für Tasten einen MIDI-Taster verwenden. ESC beendet die Zuordnungssitzung.', mappingsTitle:'3. Zuordnungen',
    mappingsDescription:'Gespeicherte Zuordnungen verwalten und Profile als JSON sichern.', exportJson:'JSON exportieren', importJson:'JSON importieren', noMappings:'Noch keine Zuordnungen angelegt.',
    footerBeta:'Open-Source-Beta für Browser-Mixer-Weboberflächen.', footerDisclaimer:'Unabhängiges Community-Projekt, nicht mit Soundcraft/HARMAN verbunden.',
    channelShort:'Kan.', contentScriptNoResponse:'Das Steuerungsskript hat nicht geantwortet.', pickerNoStart:'Die Zielauswahl konnte nicht gestartet werden.', midiReady:'MIDI bereit', noMidiDeviceBadge:'Kein MIDI-Gerät', midiUnsupported:'Nicht unterstützt', midiError:'MIDI-Fehler', midiConnected:'MIDI verbunden',
    midiPermissionFail:'MIDI-Zugriff fehlgeschlagen: {error}. Prüfe Browser-Unterstützung und die MIDI-Berechtigung.', webMidiUnsupported:'Web MIDI wird von diesem Browser nicht unterstützt. Verwende einen aktuellen Chromium-Browser auf dem Desktop.',
    midiInputsAvailable:'{count} MIDI-Eingang/-Eingänge verfügbar. {scope}', allInputsMonitored:'Alle Eingänge werden überwacht.', oneInputMonitored:'Ein Eingang wird überwacht.', noMidiInputFound:'MIDI-Zugriff erlaubt, aber kein MIDI-Eingang gefunden.', midiInputOpenFailed:'MIDI-Eingang konnte nicht geöffnet werden: {error}',
    midiAccessReady:'MIDI-Zugriff ist bereit.', feedbackNeedsMidi:'Verbinde zuerst MIDI und wähle einen MIDI-Ausgang.', feedbackDisabled:'MIDI-Feedback ist deaktiviert.', feedbackNoOutput:'Kein MIDI-Ausgang ausgewählt. MIDI-Feedback wartet.',
    feedbackActive:'MIDI-Feedback aktiv: Fader-Werte und Tasten-Zustände werden ausgegeben ({format}).', feedbackFailure:'MIDI-Feedback fehlgeschlagen: {error}',
    invalidMixerAddress:'Ungültige Mixer-Adresse. Verwende eine HTTP- oder HTTPS-URL, z. B. http://10.10.2.1.',
    permissionDenied:'Keine Berechtigung für {origin}. Bitte erlaube den Zugriff, wenn der Browser danach fragt.', openingMixer:'Mixer-Tab wird übernommen und vorbereitet …', mixerOpened:'Mixer-Tab festgelegt: {url}',
    noMatchingTab:'Noch kein Mixer-Tab festgelegt. Öffne die Mixer-Webseite und übernimm den aktuellen Tab.', selectMixerTab:'Übernimm zuerst den aktuellen Browser-Tab als Mixer.', continuousPickerPrompt:'Nächstes Ziel auswählen: Klicke auf ein Bedienelement. ESC beendet den Lernmodus.', autoLearnStarted:'Ziel erkannt. MIDI Learn läuft automatisch. Bewege jetzt den Regler oder drücke die Taste.', learningStopped:'MIDI-Lernmodus beendet.',
    pickerInjectFail:'Zielauswahl konnte nicht gestartet werden: {error}. Prüfe die Seitenberechtigung für die Mixer-Adresse.', selectedTarget:'Ausgewählt: {label}', targetNotRecognized:'Das Bedienelement konnte nicht erkannt werden. Klicke genauer auf den Fadergriff oder die Taste.',
    targetReady:'Parameter-Ziel übernommen. Starte jetzt MIDI Learn.', selectTargetAgain:'Zuordnung erstellt. Wähle erneut ein Ziel, um weitere Bedienelemente zuzuweisen.',
    targetPicked:'Mixer-Ziel erkannt: {label}', waitingMidi:'Warte auf einen MIDI-CC-Regler, Pitch Bend oder eine Note-Taste. Bediene genau ein Element.',
    needMidiFirst:'Bitte zuerst MIDI verbinden.', needLearnTarget:'Wähle zuerst ein Ziel.', faderNeedsCC:'Fader-Zuordnungen benötigen einen absoluten CC-Regler oder Pitch Bend. Bitte erneut lernen.',
    midiAlreadyMapped:'Dieser MIDI-Befehl ist bereits „{label}“ zugeordnet. Alte Zuordnung ersetzen?', mappingSaved:'MIDI-Zuordnung gespeichert.', mappingReplaced:'Bestehende MIDI-Zuordnung wurde ersetzt.',
    mappingStored:'Gespeichert: {label} ← {midi}', mappingPaused:'deaktiviert', mappingActive:'aktiv', fader:'Fader', toggle:'Taste (Toggle)', feedback:'Feedback',
    delete:'Löschen', pause:'Pause', enable:'Aktivieren', outputChannel:'Out-Kanal', outputNumber:'Out-CC', unknownTarget:'Unbekanntes Ziel',
    importNoMappings:'JSON enthält kein mappings-Array.', invalidImport:'Eine oder mehrere Zuordnungen haben ein ungültiges Format.', importFailed:'Import fehlgeschlagen: {error}', imported:'{count} Zuordnung(en) importiert.',
    exportDone:'MIDI-Profil exportiert.', profileLoadFailed:'MIDI-Profil konnte nicht geladen werden: {error}',
    mixerTabUnavailable:'Mixer-Tab konnte nicht ermittelt werden.', inspectingTarget:'Prüfe das angeklickte Bedienelement …',
    pageWidgetUnavailable:'Mixer-Steuerelement nicht gefunden: {target}. Lade die Seite neu und wähle das Ziel erneut.', pageUnavailable:'Mixer-Tab nicht erreichbar: {error}. Prüfe, ob die Mixer-Seite geöffnet ist.',
    valuesUnavailable:'Fader-Wert konnte nicht gelesen werden.', webDomTarget:'Webseiten-Element', legacyTarget:'Diese Zuordnung stammt aus einem älteren, nicht mehr unterstützten Zielformat. Bitte lege sie über die Mixer-Webseite neu an.',
    languageSaved:'Sprache gespeichert.', waitingMidiShort:'Warte auf MIDI …', mixerNotSelectedShort:'nicht festgelegt'
  },
  en: {
    subtitle:'Open-source beta · MIDI control for Soundcraft Ui mixer web interfaces', language:'Language', notConnected:'Not connected',
    midiDeviceTitle:'1. MIDI device', midiDeviceDescription:'Connect your controller and optionally choose a MIDI output for LED-ring and motor-fader feedback.', connectMidi:'Connect MIDI', openMidiConnectTab:'Request MIDI permission in new tab', midiTabOpened:'MIDI permission page opened. Click “Request MIDI access” in that tab. Then return to the Side Panel and click “Connect MIDI”.', midiPermissionGrantedClickToConnect:'Permission granted. Return to the Side Panel and click “Connect MIDI”.',
    midiInput:'MIDI input', allMidiInputs:'All MIDI inputs', noMidiInputSelected:'No input opened', allMidiInputsRisk:'Open all inputs (not recommended)', refresh:'Refresh', midiOutput:'MIDI output', noMidiOutput:'No MIDI output selected',
    faderFeedback:'MIDI feedback (faders and buttons)', feedbackFormat:'Feedback format', feedbackAuto:'Automatic', feedbackCC:'Control Change (7-bit)', feedbackPitchBend:'Pitch Bend (14-bit)',
    parameterTargetTitle:'Direct parameter target (including hidden faders)', parameterKey:'Soundcraft parameter', parameterLabel:'Display name (optional)', addParameterTarget:'Use parameter target', parameterHelp:'The control type is inferred from the parameter. Examples: i.7.mix (fader), i.7.mute (button), i.7.aux.0.value (Aux send).', parameterInvalid:'Invalid parameter key. Example: i.7.aux.0.value.', parameterMissingTab:'Assign the current browser tab as the mixer first.',
    buttonFeedback:'Button LED feedback', feedbackProfile:'LED profile', feedbackActiveColor:'Active color', feedbackInactiveColor:'Inactive color',
    midiNotRequested:'MIDI access is requested only after clicking “Connect MIDI”.', midiRequesting:'Requesting MIDI access …', midiNeedsUserGesture:'Click “Connect MIDI” to request access directly from a user gesture.', midiPermissionDenied:'Edge denied MIDI access for this extension page. Check the extension permission and browser policies, not only the mixer website.', midiPermissionUnknown:'MIDI permission is not pre-checked. Click “Connect MIDI” to ask Edge directly.', disconnectMidi:'Stop MIDI input', midiReleased:'MIDI input handling has been stopped. In Edge, the native port is not explicitly closed to avoid a possible MIDI driver hang. Click “Connect MIDI” to reconnect.', midiInputNotSelected:'MIDI is connected. Select one input; other ports remain closed.', midiAllInputsWarning:'All MIDI inputs are open. Select only one input if you have problems.', midiInputActive:'{count} MIDI input(s) active. {scope}', midiRequestTimeout:'The MIDI request did not respond. Check the MIDI permission in Edge and try again.', midiDeviceDisconnected:'MIDI device disconnected. Feedback has been paused; reconnect the device.', feedbackHint:'Select a MIDI output to send fader values and button states back to your controller.', lastMidiMessage:'Last MIDI message',
    mixerWebsiteTitle:'2. Mixer website', mixerWebsiteDescription:'Open the mixer website. Clicking “Connect MIDI” automatically assigns the current tab as the mixer. Use manual selection to change the mixer target.', useCurrentTab:'Manually use current tab as mixer', mixerNotSelected:'No mixer tab selected yet.', mixerSelected:'Mixer tab pinned: {title} · {url}', permissionHint:'The browser will request permission for the mixer website on first access.', chooseTarget:'Choose target', targetHint:'Assign the mixer tab and click a control. MIDI Learn starts automatically; the next target is activated after each mapping. Press ESC to stop.',
    startMidiLearn:'Start MIDI Learn', cancel:'Stop learning',
    learnHint:'Click “Choose target”, then click a mixer control. MIDI Learn starts automatically. Use an absolute CC knob or Pitch Bend for values and a MIDI button for switches. Press ESC to stop the session.', mappingsTitle:'3. Mappings',
    mappingsDescription:'Profiles are saved locally in your browser and can be backed up as JSON.', exportJson:'Export JSON', importJson:'Import JSON', noMappings:'No mappings created yet.',
    footerBeta:'Open-source beta for browser-based mixer interfaces.', footerDisclaimer:'Independent community project; not affiliated with Soundcraft/HARMAN.',
    channelShort:'Ch', contentScriptNoResponse:'The control script did not respond.', pickerNoStart:'Target picking could not be started.', midiReady:'MIDI ready', noMidiDeviceBadge:'No MIDI device', midiUnsupported:'Unsupported', midiError:'MIDI error', midiConnected:'MIDI connected',
    midiPermissionFail:'MIDI access failed: {error}. Check browser support and MIDI permissions.', webMidiUnsupported:'Web MIDI is not supported by this browser. Use a current desktop Chromium browser.',
    midiInputsAvailable:'{count} MIDI input(s) available. {scope}', allInputsMonitored:'All inputs are monitored.', oneInputMonitored:'One input is monitored.', noMidiInputFound:'MIDI access granted, but no MIDI input was found.', midiInputOpenFailed:'Could not open MIDI input: {error}',
    midiAccessReady:'MIDI access is ready.', feedbackNeedsMidi:'Connect MIDI first and select a MIDI output.', feedbackDisabled:'MIDI feedback is disabled.', feedbackNoOutput:'No MIDI output selected. MIDI feedback is waiting.',
    feedbackActive:'MIDI feedback active: fader values and button states are sent ({format}).', feedbackFailure:'MIDI feedback failed: {error}',
    invalidMixerAddress:'Invalid mixer address. Use an HTTP or HTTPS URL, e.g. http://10.10.2.1.',
    permissionDenied:'Permission was not granted for {origin}. Allow access when prompted by the browser.', openingMixer:'Assigning and preparing mixer tab …', mixerOpened:'Mixer tab pinned: {url}',
    noMatchingTab:'No mixer tab pinned yet. Open the mixer website and assign the current tab.', selectMixerTab:'Assign the current browser tab as mixer first.', continuousPickerPrompt:'Choose the next target: click a mixer control. Press ESC to stop learning.', autoLearnStarted:'Target selected. MIDI Learn started automatically. Move a fader or press a button now.', learningStopped:'MIDI Learn session stopped.',
    pickerInjectFail:'Could not start target selection: {error}. Check site permissions for the mixer address.', selectedTarget:'Selected: {label}', targetNotRecognized:'Could not identify the control. Click more precisely on the fader handle or button.',
    targetReady:'Parameter target selected. Start MIDI Learn now.', selectTargetAgain:'Mapping created. Choose another target to assign more controls.',
    targetPicked:'Mixer target found: {label}', waitingMidi:'Waiting for a MIDI CC knob, Pitch Bend or Note button. Operate only one control.',
    needMidiFirst:'Connect MIDI first.', needLearnTarget:'Choose a target first.', faderNeedsCC:'Fader mappings require an absolute CC control or Pitch Bend. Please learn again.',
    midiAlreadyMapped:'This MIDI message is already mapped to “{label}”. Replace the existing mapping?', mappingSaved:'MIDI mapping saved.', mappingReplaced:'Replaced the existing MIDI mapping.',
    mappingStored:'Saved: {label} ← {midi}', mappingPaused:'paused', mappingActive:'active', fader:'Fader', toggle:'Button (toggle)', feedback:'Feedback',
    delete:'Delete', pause:'Pause', enable:'Enable', outputChannel:'Out ch.', outputNumber:'Out CC', unknownTarget:'Unknown target',
    importNoMappings:'JSON does not contain a mappings array.', invalidImport:'One or more mappings have an invalid format.', importFailed:'Import failed: {error}', imported:'Imported {count} mapping(s).',
    exportDone:'MIDI profile exported.', profileLoadFailed:'Could not load MIDI profile: {error}',
    mixerTabUnavailable:'Could not identify the mixer tab.', inspectingTarget:'Checking the selected control …',
    pageWidgetUnavailable:'Mixer control not found: {target}. Reload the page and select the target again.', pageUnavailable:'Mixer tab is unavailable: {error}. Check that the mixer website is open.',
    valuesUnavailable:'Could not read the fader value.', webDomTarget:'Web page element', legacyTarget:'This mapping uses an older target format that is no longer supported. Please recreate it through the mixer website.',
    languageSaved:'Language saved.', waitingMidiShort:'Waiting for MIDI …', mixerNotSelectedShort:'not assigned'
  }
};

let currentLanguage = 'de';
function t(key, vars = {}) {
  const template = (I18N[currentLanguage] && I18N[currentLanguage][key]) || I18N.de[key] || key;
  return template.replace(/\{(\w+)\}/g, (_match, name) => vars[name] === undefined ? '' : String(vars[name]));
}
function applyLanguage() {
  document.documentElement.lang = currentLanguage;
  for (const element of document.querySelectorAll('[data-i18n]')) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const element of document.querySelectorAll('[data-i18n-placeholder]')) element.setAttribute('placeholder', t(element.dataset.i18nPlaceholder));
  for (const element of document.querySelectorAll('[data-i18n-title]')) element.setAttribute('title', t(element.dataset.i18nTitle));
  if (els.languageSelect) els.languageSelect.value = currentLanguage;
  if (els.connectMidiBtn && IS_SIDE_PANEL) els.connectMidiBtn.textContent = (engineState.connected || midiPermissionGrantedInTab) ? t('connectMidi') : t('openMidiConnectTab');
  renderMappings();
  void refreshMappingLabels();
  if (!engineState.connected) updateMidiPermissionStatusNote();
  updateMixerContextDisplay();
  if (midiLearnArmed) setNote(els.learnStatus, t('waitingMidi')); else if (targetPickerActive) setNote(els.learnStatus, t('continuousPickerPrompt')); else if (!pendingTarget) setNote(els.learnStatus, t('learnHint'));
  updateFeedbackStatus();
}

let midiPermissionGrantedInTab = false;
let midiPermissionState = 'unknown';
let preferredMidiOutputId = '';
let continuousLearning = false;
let targetPickerActive = false;
let selectedMidiInput = '';
let selectedMidiOutput = '';
let selectedMixerTabId = null;
let selectedMixerContext = null;
let currentBrowserTabContext = null;
let midiLearnArmed = false;
let pendingTarget = null;
let mappings = [];
const lastFeedbackValues = new Map();
let engineState = {
  connected: false, inputs: [], outputs: [], selectedInputId: '', selectedOutputId: '',
  feedbackEnabled: true, feedbackFormat: 'auto', learningArmed: false, continuousLearning: false, pendingTarget: null
};

async function sendEngineCommand(command, payload = {}) {
  const response = await chrome.runtime.sendMessage({ target: 'background', type: 'ENGINE_COMMAND', command, payload });
  if (!response?.ok) throw new Error(response?.error || `Background engine command failed: ${command}`);
  return response.result;
}

function syncEngineState() {
  return sendEngineCommand('SYNC_STATE', {
    mappings,
    midiSettings: {
      inputId: els.midiInputSelect?.value || selectedMidiInput || '',
      outputId: els.midiOutputSelect?.value || selectedMidiOutput || '',
      feedbackEnabled: Boolean(els.feedbackEnabled?.checked),
      feedbackFormat: els.feedbackFormatSelect?.value || 'auto'
    },
    mixerContext: selectedMixerContext,
    language: currentLanguage
  }).catch((error) => console.warn('[Open Soundcraft MIDI] Could not sync background engine:', error));
}

function applyEngineStatus(state) {
  if (!state || typeof state !== 'object') return;
  engineState = { ...engineState, ...state };
  // MIDI ports are owned exclusively by the offscreen background engine.
  selectedMidiInput = engineState.selectedInputId || '';
  selectedMidiOutput = engineState.selectedOutputId || '';
  preferredMidiOutputId = selectedMidiOutput;
  if (els.midiInputSelect && Array.isArray(engineState.inputs)) {
    const previous = selectedMidiInput;
    els.midiInputSelect.replaceChildren(new Option(t('noMidiInputSelected'), ''));
    els.midiInputSelect.add(new Option(t('allMidiInputsRisk'), '*'));
    for (const input of engineState.inputs) els.midiInputSelect.add(new Option(input.name || input.id, input.id));
    els.midiInputSelect.value = engineState.inputs.some((input) => input.id === previous) || previous === '*' ? previous : '';
  }
  if (els.midiOutputSelect && Array.isArray(engineState.outputs)) {
    const previous = selectedMidiOutput;
    els.midiOutputSelect.replaceChildren(new Option(t('noMidiOutput'), ''));
    for (const output of engineState.outputs) els.midiOutputSelect.add(new Option(output.name || output.id, output.id));
    els.midiOutputSelect.value = engineState.outputs.some((output) => output.id === previous) ? previous : '';
  }
  if (els.connectMidiBtn) els.connectMidiBtn.textContent = engineState.connected ? t('midiConnected') : (midiPermissionGrantedInTab ? t('connectMidi') : t('openMidiConnectTab'));
  if (els.disconnectMidiBtn) els.disconnectMidiBtn.disabled = !engineState.connected;
  if (typeof engineState.feedbackEnabled === 'boolean') els.feedbackEnabled.checked = engineState.feedbackEnabled;
  if (engineState.feedbackFormat) els.feedbackFormatSelect.value = engineState.feedbackFormat;
  if (engineState.pendingTarget !== undefined) pendingTarget = engineState.pendingTarget;
  if (typeof engineState.learningArmed === 'boolean') midiLearnArmed = engineState.learningArmed;
  if (typeof engineState.continuousLearning === 'boolean') continuousLearning = engineState.continuousLearning;
  if (state.permissionRequired === true) {
    // The background context can be denied if the browser permission was
    // revoked after initial setup. Re-enable the normal-tab permission flow.
    midiPermissionGrantedInTab = false;
    void chrome.storage.local.set({ [MIDI_PERMISSION_GRANTED_KEY]: false });
    if (els.connectMidiBtn) els.connectMidiBtn.textContent = t('openMidiConnectTab');
  }
  if (state.message) setNote(els.midiStatus, state.message, state.state === 'error' ? 'warning' : (state.connected ? 'success' : ''));
  if (state.errorName) setNote(els.midiStatus, `${state.errorName}: ${state.message || ''}`, 'warning');
  if (engineState.connected) updateBadge(t('midiReady'), 'good');
  else if (state.state === 'error') updateBadge(t('midiError'), 'bad');
  else updateBadge(t('notConnected'), 'neutral');
  updateLearnButtons();
  updateFeedbackStatus();
}

function boolFeedbackValue(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value >= 0.5;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'on', 'yes', 'active', 'enabled'].includes(normalized)) return true;
    if (['false', 'off', 'no', 'inactive', 'disabled', ''].includes(normalized)) return false;
    const numeric = Number(normalized);
    if (Number.isFinite(numeric)) return numeric >= 0.5;
  }
  return null;
}

function feedbackParameterKey(target) {
  if (!target) return '';
  const direct = target.parameterKey || (target.backend === 'web-parameter' ? target.key : '');
  if (typeof direct === 'string' && /^(?:[ialfsp]\.\d+|m)(?:\.[a-zA-Z0-9_]+)+$/.test(direct)) return direct;
  if (typeof target.key === 'string' && /^(?:[ialfsp]\.\d+|m)(?:\.[a-zA-Z0-9_]+)+$/.test(target.key)) return target.key;
  const prefix = target.channelPrefix || target.ownerName || '';
  const control = target.controlName || target.propertyName || '';
  if (/^(?:[ialfsp]\.\d+\.|m\.)$/.test(prefix) && /^[a-z][a-z0-9_]*$/i.test(control)) return `${prefix}${control}`;
  return '';
}

function feedbackValueToNormalized(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : null;
}

const els = {
  connectionBadge: $('connectionBadge'), languageSelect: $('languageSelect'), midiSettingsCard: $('midiSettingsCard'), mixerSettingsCard: $('mixerSettingsCard'), mappingsSettingsCard: $('mappingsSettingsCard'), connectMidiBtn: $('connectMidiBtn'), disconnectMidiBtn: $('disconnectMidiBtn'), refreshMidiBtn: $('refreshMidiBtn'),
  midiInputSelect: $('midiInputSelect'), midiOutputSelect: $('midiOutputSelect'), midiStatus: $('midiStatus'), lastMidi: $('lastMidi'), midiLog: $('midiLog'),
  feedbackEnabled: $('feedbackEnabled'), feedbackFormatSelect: $('feedbackFormatSelect'), feedbackStatus: $('feedbackStatus'),
  openMixerBtn: $('openMixerBtn'), mixerContextStatus: $('mixerContextStatus'), pickTargetBtn: $('pickTargetBtn'),
  targetStatus: $('targetStatus'), armLearnBtn: $('armLearnBtn'), cancelLearnBtn: $('cancelLearnBtn'), learnStatus: $('learnStatus'),
  mappingList: $('mappingList'), exportBtn: $('exportBtn'), importBtn: $('importBtn'), importFile: $('importFile'), toast: $('toast'),
  parameterKeyInput: $('parameterKeyInput'), parameterLabelInput: $('parameterLabelInput'), addParameterTargetBtn: $('addParameterTargetBtn')
};

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => els.toast.classList.remove('show'), 2800);
}

// Append one received MIDI message to the compact diagnostic log. The engine
// sends raw MIDI bytes as an array; use textContent so device data is never
// interpreted as markup. Keep the list bounded during continuous MIDI input.
function addLog(description, raw = []) {
  if (!els.midiLog) return;

  const row = document.createElement('div');
  row.className = 'log-row';

  const label = document.createElement('span');
  label.textContent = String(description || 'MIDI');
  row.append(label);

  const bytes = Array.isArray(raw) || ArrayBuffer.isView(raw) ? Array.from(raw) : [];
  if (bytes.length) {
    const code = document.createElement('code');
    code.textContent = bytes
      .map((byte) => Number(byte))
      .filter((byte) => Number.isFinite(byte))
      .map((byte) => `0x${(byte & 0xff).toString(16).padStart(2, '0').toUpperCase()}`)
      .join(' ');
    row.append(code);
  }

  els.midiLog.prepend(row);
  while (els.midiLog.children.length > 12) {
    els.midiLog.lastElementChild?.remove();
  }
}

function setNote(element, message, kind = '') {
  element.textContent = message;
  element.classList.toggle('success', kind === 'success');
  element.classList.toggle('warning', kind === 'warning');
}

function inspectMidiPermission() {
  // Do not request access from the Side Panel. Edge requires the first-time
  // Web MIDI request to come from the dedicated normal extension tab.
  midiPermissionState = typeof navigator.requestMIDIAccess === 'function' ? 'unknown' : 'unsupported';
  updateMidiPermissionStatusNote();
  return midiPermissionState;
}

function updateMidiPermissionStatusNote() {
  if (engineState.connected) return;
  // Do not treat Permissions API's reported 'denied' state as a reason to
  // suppress the actual request. Edge can report a stale/extension-origin
  // state here; requestMIDIAccess() from the Connect button is authoritative.
  setNote(els.midiStatus, t('midiNotRequested'));
}

function updateBadge(text, state = 'neutral') {
  els.connectionBadge.textContent = text;
  els.connectionBadge.className = `badge ${state}`;
}

function rebuildMidiInputs() {
  void sendEngineCommand('REFRESH_DEVICES').catch((error) => setNote(els.midiStatus, error.message, 'warning'));
}

function rebuildMidiOutputs() { rebuildMidiInputs(); }

function attachMidiInputs() {
  void sendEngineCommand('SET_INPUT', { inputId: els.midiInputSelect?.value || '' }).catch((error) => setNote(els.midiStatus, error.message, 'warning'));
}


async function disconnectMidiDevices() {
  try {
    await sendEngineCommand('DISCONNECT');
    setNote(els.midiStatus, t('midiReleased'), 'success');
    return true;
  } catch (error) {
    setNote(els.midiStatus, error.message || String(error), 'warning');
    return false;
  }
}


async function openMidiPermissionTab() {
  const permissionPageUrl = chrome.runtime.getURL('midi-permission.html');
  try {
    // Open a fresh page for each request so the button is always enabled and
    // the user gesture belongs to this tab, not to a previously granted page.
    await chrome.tabs.create({ url: permissionPageUrl, active: true });
    setNote(els.midiStatus, t('midiTabOpened'), 'success');
  } catch (error) {
    setNote(els.midiStatus, `${t('midiTabOpened')} (${error.message || error})`, 'warning');
  }
}

async function connectMidi() {
  try {
    setNote(els.midiStatus, t('midiRequesting'));
    await sendEngineCommand('CONNECT');
    return true;
  } catch (error) {
    setNote(els.midiStatus, t('midiPermissionFail', { error: error.message || String(error) }), 'warning');
    updateBadge(t('midiError'), 'bad');
    return false;
  }
}

async function connectMidiWorkflow() {
  // The Connect button also performs the former 'Open mixer' action. A
  // browser-internal permission tab is not a mixer candidate, so keep the
  // previously selected mixer context while that tab is active.
  if (currentBrowserTabContext && Number.isInteger(currentBrowserTabContext.tabId)) {
    const mixerSelected = await useCurrentTabAsMixer();
    if (!mixerSelected) return false;
  } else if (!Number.isInteger(selectedMixerTabId) || !selectedMixerContext) {
    const mixerSelected = await useCurrentTabAsMixer();
    if (!mixerSelected) return false;
  }

  if (IS_SIDE_PANEL && !engineState.connected && !midiPermissionGrantedInTab) {
    await openMidiPermissionTab();
    return true;
  }
  return connectMidi();
}


function updateLearnButtons() {
  els.armLearnBtn.disabled = !pendingTarget || midiLearnArmed || !engineState.connected;
  els.cancelLearnBtn.disabled = !midiLearnArmed && !pendingTarget && !continuousLearning && !targetPickerActive;
  els.armLearnBtn.classList.toggle('armed', midiLearnArmed);
  els.armLearnBtn.textContent = midiLearnArmed ? t('waitingMidiShort') : t('startMidiLearn');
  els.cancelLearnBtn.textContent = t('cancel');
  els.pickTargetBtn.disabled = !Number.isInteger(selectedMixerTabId) || targetPickerActive;
  els.pickTargetBtn.classList.toggle('armed', continuousLearning);
}

function sameOriginTab(tab, origin) {
  if (!tab || !tab.url) return false;
  try { return new URL(tab.url).origin === origin; } catch (_) { return false; }
}

function updateMixerContextDisplay() {
  if (!els.mixerContextStatus) return;
  if (!selectedMixerContext || !Number.isInteger(selectedMixerTabId)) {
    els.mixerContextStatus.textContent = t('mixerNotSelected');
      return;
  }
  els.mixerContextStatus.textContent = t('mixerSelected', {
    title: selectedMixerContext.title || `Tab ${selectedMixerTabId}`,
    url: selectedMixerContext.url
  });
}

async function useCurrentTabAsMixer() {
  // This snapshot is refreshed independently from the pinned mixer tab. Both
  // Connect MIDI and the manual assignment button select only this captured tab.
  const context = currentBrowserTabContext;
  if (!context || !Number.isInteger(context.tabId)) {
    setNote(els.targetStatus, t('noMatchingTab'), 'warning');
    return false;
  }
  let url;
  try { url = new URL(context.url); }
  catch (_) { setNote(els.targetStatus, t('invalidMixerAddress'), 'warning'); return false; }
  const originPattern = `${url.origin}/*`;
  let permissionPromise;
  try {
    // Call permissions.request before the first await so Edge can associate it
    // directly with the user's click on this button.
    permissionPromise = chrome.permissions.request({ origins: [originPattern] });
  } catch (error) {
    setNote(els.targetStatus, `${t('permissionDenied', { origin: url.origin })} (${error.message || error})`, 'warning');
    return false;
  }
  els.openMixerBtn.disabled = true;
  setNote(els.targetStatus, t('openingMixer'));
  try {
    const permitted = await permissionPromise;
    if (!permitted) {
      setNote(els.targetStatus, t('permissionDenied', { origin: url.origin }), 'warning');
      return false;
    }
    // Pin the exact tab and URL captured when the user pressed the button.
    selectedMixerTabId = context.tabId;
    selectedMixerContext = { ...context };
    if (continuousLearning || targetPickerActive || midiLearnArmed || pendingTarget) {
      stopLearningSession({ fromPage: false, quiet: true });
    }
    await chrome.storage.session.set({ [SELECTED_MIXER_CONTEXT_KEY]: selectedMixerContext });
    void sendEngineCommand('SET_MIXER_CONTEXT', { context: selectedMixerContext }).catch(() => {});
    await ensureContentScript(selectedMixerTabId);
    updateMixerContextDisplay();
    updateLearnButtons();
    await refreshMappingLabels();
    await refreshFeedbackMonitors();
    void pollFaderFeedback();
    setNote(els.targetStatus, t('mixerOpened', { url: context.url }), 'success');
    toast(t('mixerOpened', { url: url.origin }));
    return true;
  } catch (error) {
    setNote(els.targetStatus, t('pickerInjectFail', { error: error.message }), 'warning');
    return false;
  } finally {
    els.openMixerBtn.disabled = !currentBrowserTabContext;
  }
}

async function refreshCurrentBrowserTabContext(tabId = null) {
  let tab = null;
  try {
    if (Number.isInteger(tabId)) tab = await chrome.tabs.get(tabId);
    else {
      const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      tab = activeTabs?.[0] || null;
    }
  } catch (_) { tab = null; }
  currentBrowserTabContext = activeTabContextFromTab(tab);
  if (els.openMixerBtn) els.openMixerBtn.disabled = !currentBrowserTabContext;
  return currentBrowserTabContext;
}

async function restoreSelectedMixerContext() {
  let stored = null;
  try {
    const data = await chrome.storage.session.get([SELECTED_MIXER_CONTEXT_KEY, LEGACY_ACTIVE_TAB_CONTEXT_KEY]);
    stored = data[SELECTED_MIXER_CONTEXT_KEY] || data[LEGACY_ACTIVE_TAB_CONTEXT_KEY] || null;
  } catch (_) { /* Session storage may be unavailable in older profiles. */ }
  if (!stored || !Number.isInteger(stored.tabId)) {
    updateMixerContextDisplay();
    updateLearnButtons();
    return false;
  }
  try {
    const tab = await chrome.tabs.get(stored.tabId);
    const context = activeTabContextFromTab(tab);
    if (!context) throw new Error('The previously selected mixer tab is no longer available.');
    selectedMixerTabId = context.tabId;
    selectedMixerContext = context;
    await chrome.storage.session.set({ [SELECTED_MIXER_CONTEXT_KEY]: context });
    await chrome.storage.session.remove(LEGACY_ACTIVE_TAB_CONTEXT_KEY);
    updateMixerContextDisplay();
    updateLearnButtons();
    return true;
  } catch (_) {
    selectedMixerTabId = null;
    selectedMixerContext = null;
    await chrome.storage.session.remove([SELECTED_MIXER_CONTEXT_KEY, LEGACY_ACTIVE_TAB_CONTEXT_KEY]).catch(() => {});
    updateMixerContextDisplay();
    updateLearnButtons();
    return false;
  }
}

async function ensureContentScript(tabId) {
  if (!Number.isInteger(tabId)) throw new Error(t('mixerTabUnavailable'));
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url || !/^https?:/i.test(tab.url)) throw new Error(t('invalidMixerAddress'));
  try {
    const existing = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    if (existing && existing.ok) return;
  } catch (_) { /* Inject below after the user has granted host permission. */ }
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content/soundcraft-ui.js'] });
  const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
  if (!response || !response.ok) throw new Error(t('contentScriptNoResponse'));
}

async function startTargetPickerSession() {
  if (!continuousLearning) return false;
  const tabId = selectedMixerTabId;
  if (!Number.isInteger(tabId)) {
    setNote(els.targetStatus, t('selectMixerTab'), 'warning');
    stopLearningSession({ fromPage: false, quiet: true });
    return false;
  }
  try {
    await ensureContentScript(tabId);
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'START_PICKER', language: currentLanguage, continuous: true
    });
    if (!response || !response.ok) throw new Error(t('pickerNoStart'));
    targetPickerActive = true;
    pendingTarget = null;
    void sendEngineCommand('SET_LEARNING', { continuous: true }).catch(() => {});
    midiLearnArmed = false;
    updateLearnButtons();
    setNote(els.targetStatus, t('continuousPickerPrompt'), 'success');
    setNote(els.learnStatus, t('continuousPickerPrompt'), 'success');
    return true;
  } catch (error) {
    setNote(els.targetStatus, t('pickerInjectFail', { error: error.message }), 'warning');
    stopLearningSession({ fromPage: false, quiet: true });
    return false;
  }
}

async function chooseMidiTarget() {
  if (!Number.isInteger(selectedMixerTabId)) {
    toast(t('selectMixerTab'));
    return;
  }
  continuousLearning = true;
  pendingTarget = null;
  midiLearnArmed = false;
  void sendEngineCommand('SET_LEARNING', { continuous: true }).catch(() => {});
  await startTargetPickerSession();
}

async function addParameterTarget() {
  if (continuousLearning || targetPickerActive || midiLearnArmed) stopLearningSession({ fromPage: false, quiet: true });
  const key = els.parameterKeyInput.value.trim();
  const match = key.match(/^((?:[ialfsp]\.\d+\.|m\.))(.+)$/i);
  if (!match || !/^(?:[ialfsp]\.\d+|m)(?:\.[a-zA-Z0-9_]+)+$/.test(key)) {
    setNote(els.targetStatus, t('parameterInvalid'), 'warning');
    return;
  }
  const tabId = selectedMixerTabId;
  if (!Number.isInteger(tabId)) {
    setNote(els.targetStatus, t('parameterMissingTab'), 'warning');
    return;
  }
  let tab;
  try { tab = await chrome.tabs.get(tabId); } catch (_) { tab = null; }
  if (!tab || !tab.url) {
    setNote(els.targetStatus, t('parameterMissingTab'), 'warning');
    return;
  }
  let origin;
  try { origin = new URL(tab.url).origin; } catch (_) { setNote(els.targetStatus, t('invalidMixerAddress'), 'warning'); return; }
  const prefix = match[1];
  const controlPath = match[2];
  const controlLabel = els.parameterLabelInput.value.trim() || controlPath.replace(/\./g, ' · ');
  const channelName = prefix === 'm.' ? '' : (prefix.replace(/\.$/, '') + ' · ');
  const mode = mappingModeUtils?.inferParameterMode(key) || 'fader';
  pendingTarget = {
    backend: 'web-parameter', origin, pageUrl: tab.url, tabId,
    parameterKey: key, key, channelPrefix: prefix,
    controlName: controlPath.split('.').pop(), controlLabel,
    channelName: '', label: els.parameterLabelInput.value.trim() || `${channelName}${controlLabel}`,
    mode, capabilities: [mode]
  };
  selectedMixerTabId = tabId;
  continuousLearning = false;
  targetPickerActive = false;
  midiLearnArmed = false;
  setNote(els.targetStatus, t('selectedTarget', { label: pendingTarget.label }), 'success');
  setNote(els.learnStatus, t('targetReady'), 'success');
  updateLearnButtons();
  void sendEngineCommand('SET_TARGET', { target: pendingTarget, continuous: false });
  toast(t('targetPicked', { label: pendingTarget.label }));
}

function getDefaultFeedbackColors() {
  return colorUtils ? colorUtils.normalizeColors(lastFeedbackColors || null) : {
    activeColor: '#00FF00', inactiveColor: '#000000'
  };
}

function getSelectedOutputFeedbackProfile(mode = 'toggle') {
  const output = engineState.outputs?.find((item) => item.id === selectedMidiOutput) || null;
  try {
    if (deviceProfiles && typeof deviceProfiles.detectFeedbackProfile === 'function') {
      return deviceProfiles.detectFeedbackProfile(output, mode) || 'generic';
    }
  } catch (error) {
    console.warn('[Open Soundcraft MIDI] Could not detect MIDI feedback profile:', error);
  }
  return 'generic';
}


async function persistLastFeedbackColors(colors) {
  const normalized = colorUtils
    ? colorUtils.normalizeColors(colors)
    : { activeColor: '#00FF00', inactiveColor: '#000000' };
  lastFeedbackColors = normalized;
  await chrome.storage.local.set({ [FEEDBACK_COLORS_KEY]: normalized });
}

function stopLearningSession(options = {}) {
  const fromPage = options.fromPage === true;
  const quiet = options.quiet === true;
  const tabId = selectedMixerTabId;
  const active = continuousLearning || targetPickerActive || midiLearnArmed || Boolean(pendingTarget);
  continuousLearning = false;
  targetPickerActive = false;
  midiLearnArmed = false;
  pendingTarget = null;
  void sendEngineCommand('STOP_LEARNING').catch(() => {});
  if (!fromPage && Number.isInteger(tabId)) {
    chrome.tabs.sendMessage(tabId, { type: 'CANCEL_PICKER' }).catch(() => {});
  }
  updateLearnButtons();
  if (active && !quiet) {
    setNote(els.learnStatus, t('learningStopped'), 'success');
    setNote(els.targetStatus, t('learningStopped'));
  }
}

async function findTabForTarget(target) {
  const origin = target?.origin || null;
  const candidates = [];
  if (Number.isInteger(target?.tabId)) candidates.push(target.tabId);
  if (Number.isInteger(selectedMixerTabId) && !candidates.includes(selectedMixerTabId)) candidates.push(selectedMixerTabId);
  for (const tabId of candidates) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab && tab.url && (!origin || sameOriginTab(tab, origin))) return tabId;
    } catch (_) { /* A closed/restarted tab ID may be stale; try the pinned mixer tab. */ }
  }
  // Do not silently route mappings to an arbitrary same-origin tab. The user
  // explicitly selects one mixer tab through Connect MIDI or the manual action.
  return null;
}

function updateFeedbackStatus() {
  if (!els.feedbackStatus) return;
  if (!els.feedbackEnabled.checked) { setNote(els.feedbackStatus, t('feedbackDisabled')); return; }
  if (!engineState.connected) { setNote(els.feedbackStatus, t('feedbackNeedsMidi')); return; }
  const output = engineState.outputs?.find((item) => item.id === els.midiOutputSelect.value && item.state !== 'disconnected');
  if (!output) { setNote(els.feedbackStatus, t('feedbackNoOutput'), 'warning'); return; }
  const format = els.feedbackFormatSelect.value === 'auto' ? 'CC / Pitch Bend' : (els.feedbackFormatSelect.value === 'cc' ? 'CC' : 'Pitch Bend');
  setNote(els.feedbackStatus, t('feedbackActive', { format }), 'success');
}


async function pollFaderFeedback() {
  try { await sendEngineCommand('POLL_FEEDBACK'); } catch (_) { /* Engine may not be active yet. */ }
}


async function refreshFeedbackMonitors() {
  try { await sendEngineCommand('REFRESH_MONITORS'); } catch (_) { /* Engine may not be active yet. */ }
}


function activeTabContextFromTab(tab) {
  try { return mixerTabContextUtils?.fromTab(tab) || null; }
  catch (_) { return null; }
}

async function loadSettings() {
  const data = await chrome.storage.local.get([MIDI_SETTINGS_KEY, LANGUAGE_KEY, FEEDBACK_COLORS_KEY, MIDI_PERMISSION_GRANTED_KEY]);
  const midi = data[MIDI_SETTINGS_KEY] || {};
  if (typeof midi.feedbackEnabled === 'boolean') els.feedbackEnabled.checked = midi.feedbackEnabled;
  if (midi.feedbackFormat) els.feedbackFormatSelect.value = midi.feedbackFormat;
  if (midi.inputId) selectedMidiInput = midi.inputId;
  if (midi.outputId) selectedMidiOutput = midi.outputId;
  lastFeedbackColors = data[FEEDBACK_COLORS_KEY] && colorUtils ? colorUtils.normalizeColors(data[FEEDBACK_COLORS_KEY]) : null;
  // The first-time permission grant is stored persistently. Side Panel contexts
  // are recreated when closed, so an in-memory flag alone would reopen the
  // permission tab on every subsequent launch.
  midiPermissionGrantedInTab = data[MIDI_PERMISSION_GRANTED_KEY] === true;
  currentLanguage = data[LANGUAGE_KEY] === 'en' ? 'en' : 'de';
  applyLanguage();
}
async function saveMidiSettings() {
  // Keep a remembered device ID if its port is temporarily absent from the
  // currently rendered options. Explicitly choosing the empty option still
  // clears the remembered ID via the select's change handler.
  await chrome.storage.local.set({ [MIDI_SETTINGS_KEY]: {
    inputId: els.midiInputSelect.value || selectedMidiInput || '', outputId: els.midiOutputSelect.value || selectedMidiOutput || '', feedbackEnabled: els.feedbackEnabled.checked,
    feedbackFormat: els.feedbackFormatSelect.value
  } });
  void sendEngineCommand('UPDATE_SETTINGS', { settings: { inputId: els.midiInputSelect.value || selectedMidiInput || '', outputId: els.midiOutputSelect.value || selectedMidiOutput || '', feedbackEnabled: els.feedbackEnabled.checked, feedbackFormat: els.feedbackFormatSelect.value } }).catch(() => {});
}

let mappingLabelRefreshRunning = false;
async function refreshMappingLabels() {
  if (mappingLabelRefreshRunning || !mappings.length) return;
  mappingLabelRefreshRunning = true;
  let changed = false;
  try {
    const browserGroups = new Map();
    for (const mapping of mappings) {
      if (!mapping.target || mapping.target.backend === 'hardware' || mapping.target.backend === 'web-dom' || mapping.target.selector) continue;
      if (!(mapping.target.path || mapping.target.key || mapping.target.widgetName)) continue;
      const tabId = await findTabForTarget(mapping.target);
      if (!Number.isInteger(tabId)) continue;
      const group = browserGroups.get(tabId) || [];
      group.push(mapping);
      browserGroups.set(tabId, group);
    }
    for (const [tabId, group] of browserGroups) {
      try {
        const resultList = await chrome.scripting.executeScript({
          target: { tabId }, world: 'MAIN', func: soundcraftPageBridge,
          args: ['labels', { targets: group.map((mapping) => ({ id: mapping.id, target: mapping.target })), language: currentLanguage }]
        });
        const labels = resultList?.[0]?.result;
        if (!Array.isArray(labels)) continue;
        for (const item of labels) {
          const mapping = mappings.find((entry) => entry.id === item.id);
          if (mapping && item.label) {
            let itemChanged = false;
            if (mapping.target.label !== item.label) { mapping.target.label = item.label; itemChanged = true; }
            if (item.channelName && mapping.target.channelName !== item.channelName) { mapping.target.channelName = item.channelName; itemChanged = true; }
            if (item.controlLabel && mapping.target.controlLabel !== item.controlLabel) { mapping.target.controlLabel = item.controlLabel; itemChanged = true; }
            if (itemChanged) changed = true;
          }
        }
      } catch (_) { /* A selected page may be closed or reloading. */ }
    }
    const domGroups = new Map();
    for (const mapping of mappings) {
      if (!mapping.target || (mapping.target.backend !== 'web-dom' && !mapping.target.selector)) continue;
      const tabId = await findTabForTarget(mapping.target);
      if (!Number.isInteger(tabId)) continue;
      if (!domGroups.has(tabId)) domGroups.set(tabId, []);
      domGroups.get(tabId).push(mapping);
    }
    for (const [tabId, group] of domGroups) {
      try {
        const response = await chrome.tabs.sendMessage(tabId, { type: 'READ_DOM_LABELS', targets: group.map((mapping) => ({ id: mapping.id, target: mapping.target })) });
        for (const item of response?.labels || []) {
          const mapping = mappings.find((entry) => entry.id === item.id);
          if (mapping && item.label && mapping.target.label !== item.label) { mapping.target.label = item.label; changed = true; }
        }
      } catch (_) { /* Ignore disconnected tabs. */ }
    }
  } finally {
    mappingLabelRefreshRunning = false;
  }
  if (changed) { renderMappings(); await saveMappings(); }
}


function mappingTypeLabel(mapping) { return mapping.mode === 'fader' ? t('fader') : t('toggle'); }
function clampInteger(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function renderMappings() {
  els.mappingList.replaceChildren();
  if (!mappings.length) {
    const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = t('noMappings'); els.mappingList.append(empty);
      return;
  }
  for (const mapping of mappings) {
    mapping.feedback ||= { enabled: true, kind: 'auto', profile: 'generic', channel: mapping.midi.channel, number: mapping.midi.number, ...getDefaultFeedbackColors() }
    const row = document.createElement('div'); row.className = 'mapping';
    const target = document.createElement('div');
    const title = document.createElement('div'); title.className = 'mapping-title'; title.textContent = mapping.target.label || t('unknownTarget');
    const kind = document.createElement('small'); kind.textContent = `${mappingTypeLabel(mapping)} · ${mapping.enabled === false ? t('mappingPaused') : t('mappingActive')}`;
    target.append(title, kind);

    const selector = document.createElement('div'); selector.className = 'mapping-details';
    const midiText = document.createElement('code');
    midiText.textContent = `${mapping.midi.kind.toUpperCase()} ${mapping.midi.number} · ${t('channelShort')} ${mapping.midi.channel + 1}`;
    const targetDetails = document.createElement('small');
    targetDetails.textContent = mapping.target.key || (mapping.target.ownerName && mapping.target.controlName ? `${mapping.target.ownerName} · ${mapping.target.controlName}` : '') || mapping.target.globalName || mapping.target.selector || mapping.target.widgetName || t('unknownTarget');
    selector.append(midiText, targetDetails);

    const feedbackControls = document.createElement('div'); feedbackControls.className = 'mapping-feedback';
    const feedbackLabel = document.createElement('label'); feedbackLabel.className = 'mapping-feedback-toggle';
    const feedbackCheck = document.createElement('input'); feedbackCheck.type = 'checkbox'; feedbackCheck.checked = mapping.feedback.enabled !== false;
    feedbackCheck.addEventListener('change', async () => { mapping.feedback.enabled = feedbackCheck.checked; lastFeedbackValues.clear(); await saveMappings(); updateFeedbackStatus(); });
    const feedbackText = document.createElement('span'); feedbackText.textContent = t('feedback'); feedbackLabel.append(feedbackCheck, feedbackText);

    const profileLabel = document.createElement('label'); profileLabel.textContent = t('feedbackProfile');
    const profileSelect = document.createElement('select'); profileSelect.className = 'feedback-profile';
    const availableProfiles = deviceProfiles?.getFeedbackProfiles?.(currentLanguage, mapping.mode)
      || [{ id: 'generic', label: currentLanguage === 'de' ? 'Generisches MIDI' : 'Generic MIDI', ui: { showOutputChannel: true, showColorControls: false, hint: null } }];
    for (const profile of availableProfiles) profileSelect.add(new Option(profile.label, profile.id));
    // A sole compatible profile is a fixed capability, not a user choice.
    profileLabel.hidden = availableProfiles.length <= 1;
    profileSelect.value = availableProfiles.some((profile) => profile.id === mapping.feedback.profile)
      ? mapping.feedback.profile
      : (deviceProfiles?.DEFAULT_PROFILE_ID || 'generic');
    mapping.feedback.profile = profileSelect.value;
    profileSelect.addEventListener('change', async () => { mapping.feedback.profile = profileSelect.value; lastFeedbackValues.clear(); await saveMappings(); renderMappings(); void pollFaderFeedback(); });
    profileLabel.append(profileSelect);
    const selectedFeedbackProfile = deviceProfiles?.getFeedbackProfile?.(profileSelect.value)
      || { ui: { showOutputChannel: true, showColorControls: false, hint: null } };
    const selectedProfileUi = selectedFeedbackProfile.ui || {};

    const outChannelLabel = document.createElement('label'); outChannelLabel.textContent = t('outputChannel');
    outChannelLabel.hidden = selectedProfileUi.showOutputChannel === false;
    const outChannel = document.createElement('input'); outChannel.type = 'number'; outChannel.min = '1'; outChannel.max = '16'; outChannel.value = String((Number.isInteger(mapping.feedback.channel) ? mapping.feedback.channel : mapping.midi.channel) + 1); outChannel.title = t('outputChannel');
    outChannel.addEventListener('change', async () => { mapping.feedback.channel = clampInteger(outChannel.value, 1, 16, mapping.midi.channel + 1) - 1; outChannel.value = String(mapping.feedback.channel + 1); lastFeedbackValues.clear(); await saveMappings(); });
    const outNumberLabel = document.createElement('label'); outNumberLabel.textContent = t('outputNumber');
    const outNumber = document.createElement('input'); outNumber.type = 'number'; outNumber.min = '0'; outNumber.max = '127'; outNumber.value = String(Number.isInteger(mapping.feedback.number) ? mapping.feedback.number : mapping.midi.number); outNumber.title = t('outputNumber');
    outNumber.addEventListener('change', async () => { mapping.feedback.number = clampInteger(outNumber.value, 0, 127, mapping.midi.number); outNumber.value = String(mapping.feedback.number); lastFeedbackValues.clear(); await saveMappings(); void pollFaderFeedback(); });
    outChannelLabel.append(outChannel); outNumberLabel.append(outNumber);
    feedbackControls.append(feedbackLabel, profileLabel, outChannelLabel, outNumberLabel);

    if (mapping.mode === 'toggle' && selectedProfileUi.showColorControls === true) {
      const colorControls = document.createElement('div'); colorControls.className = 'mapping-feedback-colors';
      const activeLabel = document.createElement('label'); activeLabel.append(document.createTextNode(`${t('feedbackActiveColor')} `));
      const activeColor = document.createElement('input'); activeColor.type = 'color';
      mapping.feedback.activeColor = colorUtils ? colorUtils.normalizeHex(mapping.feedback.activeColor, getDefaultFeedbackColors().activeColor) : (mapping.feedback.activeColor || '#00FF00');
      activeColor.value = mapping.feedback.activeColor;
      activeColor.setAttribute('value', activeColor.value);
      activeColor.title = activeColor.value;
      const activeValue = document.createElement('span'); activeValue.className = 'color-value'; activeValue.textContent = activeColor.value;
      activeColor.addEventListener('input', () => { activeValue.textContent = activeColor.value.toUpperCase(); activeColor.title = activeValue.textContent; });
      activeColor.addEventListener('change', async () => {
        mapping.feedback.activeColor = activeColor.value.toUpperCase();
        activeValue.textContent = mapping.feedback.activeColor; activeColor.title = mapping.feedback.activeColor;
        await persistLastFeedbackColors({ activeColor: mapping.feedback.activeColor, inactiveColor: mapping.feedback.inactiveColor });
        lastFeedbackValues.clear(); await saveMappings(); void pollFaderFeedback();
      });
      activeLabel.append(activeColor, activeValue);
      const inactiveLabel = document.createElement('label'); inactiveLabel.append(document.createTextNode(`${t('feedbackInactiveColor')} `));
      const inactiveColor = document.createElement('input'); inactiveColor.type = 'color';
      mapping.feedback.inactiveColor = colorUtils ? colorUtils.normalizeHex(mapping.feedback.inactiveColor, getDefaultFeedbackColors().inactiveColor) : (mapping.feedback.inactiveColor || '#000000');
      inactiveColor.value = mapping.feedback.inactiveColor;
      inactiveColor.setAttribute('value', inactiveColor.value);
      inactiveColor.title = inactiveColor.value;
      const inactiveValue = document.createElement('span'); inactiveValue.className = 'color-value'; inactiveValue.textContent = inactiveColor.value;
      inactiveColor.addEventListener('input', () => { inactiveValue.textContent = inactiveColor.value.toUpperCase(); inactiveColor.title = inactiveValue.textContent; });
      inactiveColor.addEventListener('change', async () => {
        mapping.feedback.inactiveColor = inactiveColor.value.toUpperCase();
        inactiveValue.textContent = mapping.feedback.inactiveColor; inactiveColor.title = mapping.feedback.inactiveColor;
        await persistLastFeedbackColors({ activeColor: mapping.feedback.activeColor, inactiveColor: mapping.feedback.inactiveColor });
        lastFeedbackValues.clear(); await saveMappings(); void pollFaderFeedback();
      });
      inactiveLabel.append(inactiveColor, inactiveValue);
      colorControls.append(activeLabel, inactiveLabel);
      feedbackControls.append(colorControls);
      const hintText = selectedProfileUi.hint && (selectedProfileUi.hint[currentLanguage] || selectedProfileUi.hint.en);
      if (hintText) { const hint = document.createElement('small'); hint.className = 'feedback-profile-hint'; hint.textContent = hintText; feedbackControls.append(hint); }
    }
    selector.append(feedbackControls);

    const actions = document.createElement('div'); actions.className = 'mapping-actions';
    const enabled = document.createElement('button'); enabled.className = 'secondary'; enabled.textContent = mapping.enabled === false ? t('enable') : t('pause');
    enabled.addEventListener('click', async () => { mapping.enabled = mapping.enabled === false; lastFeedbackValues.clear(); await saveMappings(); renderMappings(); });
    const remove = document.createElement('button'); remove.className = 'mapping-delete'; remove.textContent = t('delete');
    remove.addEventListener('click', async () => { mappings = mappings.filter((item) => item.id !== mapping.id); lastFeedbackValues.clear(); await saveMappings(); renderMappings(); });
    actions.append(enabled, remove);
    row.append(target, selector, actions); els.mappingList.append(row);
  }
}

async function saveMappings() { await chrome.storage.local.set({ [STORAGE_KEY]: mappings }); void sendEngineCommand('SET_MAPPINGS', { mappings }).catch(() => {}); void refreshFeedbackMonitors(); }
async function loadMappings() {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    mappings = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
    for (const mapping of mappings) {
      if (!mapping.feedback) mapping.feedback = { enabled: true, kind: 'auto', profile: 'generic', channel: mapping.midi.channel, number: mapping.midi.number, ...getDefaultFeedbackColors() };
      mapping.feedback.profile ||= 'generic';
      if (mapping.target?.backend === 'demo') mapping.target.backend = 'web';
      mapping.mode = mappingModeUtils?.resolveTargetMode(mapping.target, mapping.mode || 'toggle') || mapping.mode || 'toggle';
      if (deviceProfiles?.supportsFeedbackMode && !deviceProfiles.supportsFeedbackMode(mapping.feedback.profile, mapping.mode)) {
        mapping.feedback.profile = deviceProfiles.DEFAULT_PROFILE_ID || 'generic';
      }
      Object.assign(mapping.feedback, colorUtils ? colorUtils.normalizeColors(mapping.feedback, getDefaultFeedbackColors()) : getDefaultFeedbackColors());
      if (mapping.mode === 'toggle' && mapping.feedback.enabled === undefined) mapping.feedback.enabled = true;
    }
    renderMappings();
  } catch (error) { toast(t('profileLoadFailed', { error: error.message })); }
}

function cancelLearn() {
  stopLearningSession({ fromPage: false });
}

function exportMappings() {
  const blob = new Blob([JSON.stringify({ version: '0.6.0-beta.3', mappings }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = 'open-soundcraft-midi-profile.json'; anchor.click(); URL.revokeObjectURL(url); toast(t('exportDone'));
}

async function importMappingsFile(file) {
  try {
    const data = JSON.parse(await file.text());
    const next = Array.isArray(data) ? data : data.mappings;
    if (!Array.isArray(next)) throw new Error(t('importNoMappings'));
    for (const mapping of next) {
      if (!mapping || typeof mapping.id !== 'string' || !mapping.midi || !mapping.target || !(mapping.target.backend === 'hardware' || mapping.target.path || mapping.target.key || mapping.target.selector || (mapping.target.widgetName === 'CheckBox' && ['mute', 'solo'].includes(mapping.target.controlName) && typeof mapping.target.ownerName === 'string')) || !['fader', 'toggle'].includes(mapping.mode)) throw new Error(t('invalidImport'));
      if (mapping.target.backend === 'demo') mapping.target.backend = 'web';
      mapping.mode = mappingModeUtils?.resolveTargetMode(mapping.target, mapping.mode || 'toggle') || mapping.mode || 'toggle';
      if (!mapping.feedback) mapping.feedback = { enabled: true, kind: 'auto', profile: 'generic', channel: mapping.midi.channel, number: mapping.midi.number, ...getDefaultFeedbackColors() };
      else {
        mapping.feedback.profile ||= 'generic';
        if (deviceProfiles?.supportsFeedbackMode && !deviceProfiles.supportsFeedbackMode(mapping.feedback.profile, mapping.mode)) {
          mapping.feedback.profile = deviceProfiles.DEFAULT_PROFILE_ID || 'generic';
        }
        Object.assign(mapping.feedback, colorUtils ? colorUtils.normalizeColors(mapping.feedback, getDefaultFeedbackColors()) : getDefaultFeedbackColors());
        if (mapping.mode === 'toggle' && mapping.feedback.enabled === undefined) mapping.feedback.enabled = true;
      }
    }
    mappings = next; await saveMappings(); renderMappings(); toast(t('imported', { count: mappings.length }));
  } catch (error) { toast(t('importFailed', { error: error.message })); }
  finally { els.importFile.value = ''; }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (changes[STORAGE_KEY] && Array.isArray(changes[STORAGE_KEY].newValue)) {
    mappings = changes[STORAGE_KEY].newValue;
    renderMappings();
  }
  if (!changes[MIDI_PERMISSION_GRANTED_KEY]) return;
  const granted = changes[MIDI_PERMISSION_GRANTED_KEY].newValue === true;
  midiPermissionGrantedInTab = granted;
  if (els.connectMidiBtn && !engineState.connected) els.connectMidiBtn.textContent = granted ? t('connectMidi') : t('openMidiConnectTab');
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || !message.type) return;
  if (message.type === 'MIDI_PERMISSION_GRANTED' && IS_SIDE_PANEL && sender?.id === chrome.runtime.id) {
    // Do not immediately create a second MIDIAccess object in the Side Panel
    // after the permission tab's request resolves. Wait for a fresh click here.
    midiPermissionGrantedInTab = true;
    void chrome.storage.local.set({ [MIDI_PERMISSION_GRANTED_KEY]: true });
    if (els.connectMidiBtn) els.connectMidiBtn.textContent = t('connectMidi');
    setNote(els.midiStatus, t('midiPermissionGrantedClickToConnect'), 'success');
    return;
  }
  if (message.type === 'ENGINE_STATUS') { applyEngineStatus(message); return; }
  if (message.type === 'ENGINE_MIDI_EVENT') {
    const description = message.description || '';
    els.lastMidi.textContent = `${message.input?.name || message.input?.id || 'MIDI'}: ${description}`;
    addLog(description, message.message?.raw || []);
    return;
  }
  if (message.type === 'ENGINE_TARGET_READY') {
    pendingTarget = message.target || null;
    midiLearnArmed = message.learningArmed === true;
    targetPickerActive = false;
    setNote(els.targetStatus, t('selectedTarget', { label: pendingTarget?.label || t('unknownTarget') }), 'success');
    setNote(els.learnStatus, midiLearnArmed ? t('autoLearnStarted') : t('needMidiFirst'), midiLearnArmed ? 'success' : 'warning');
    updateLearnButtons();
    toast(t('targetPicked', { label: pendingTarget?.label || t('unknownTarget') }));
    return;
  }
  if (message.type === 'ENGINE_PICKER_STARTED') {
    targetPickerActive = true; pendingTarget = null; midiLearnArmed = false; updateLearnButtons(); return;
  }
  if (message.type === 'ENGINE_MAPPING_CREATED') {
    void loadMappings();
    setNote(els.learnStatus, t('mappingStored', { label: message.mapping?.target?.label || t('unknownTarget'), midi: message.description || '' }), 'success');
    toast(message.replaced ? t('mappingReplaced') : t('mappingSaved'));
    return;
  }
  if (message.type === 'ENGINE_LEARN_WARNING' || message.type === 'ENGINE_WARNING') {
    setNote(els.learnStatus, message.message || t('midiError'), 'warning');
    return;
  }
  if (message.type === 'ENGINE_LEARNING_STOPPED') {
    continuousLearning = false; targetPickerActive = false; midiLearnArmed = false; pendingTarget = null; updateLearnButtons(); return;
  }
});

els.addParameterTargetBtn.addEventListener('click', () => void addParameterTarget());

els.languageSelect.addEventListener('change', async () => {
  currentLanguage = els.languageSelect.value === 'en' ? 'en' : 'de';
  await chrome.storage.local.set({ [LANGUAGE_KEY]: currentLanguage });
  applyLanguage();
  toast(t('languageSaved'));
});
els.connectMidiBtn.addEventListener('click', () => {
  // Select the current mixer tab first; then continue the existing MIDI
  // permission / connection workflow.
  void connectMidiWorkflow();
});
els.disconnectMidiBtn.addEventListener('click', () => void disconnectMidiDevices());
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && (continuousLearning || targetPickerActive || midiLearnArmed || pendingTarget)) {
    event.preventDefault();
    stopLearningSession({ fromPage: false });
  }
}, true);
els.refreshMidiBtn.addEventListener('click', () => { if (engineState.connected) rebuildMidiInputs(); else setNote(els.midiStatus, t('midiNotRequested')); });
els.midiInputSelect.addEventListener('change', async () => { selectedMidiInput = els.midiInputSelect.value; await saveMidiSettings(); void sendEngineCommand('SET_INPUT', { inputId: selectedMidiInput }).catch((error) => setNote(els.midiStatus, error.message, 'warning')); });
els.midiOutputSelect.addEventListener('change', async () => { selectedMidiOutput = els.midiOutputSelect.value; preferredMidiOutputId = selectedMidiOutput; lastFeedbackValues.clear(); await saveMidiSettings(); updateFeedbackStatus(); void sendEngineCommand('SET_OUTPUT', { outputId: selectedMidiOutput }).catch(() => {}); });
els.feedbackEnabled.addEventListener('change', async () => { lastFeedbackValues.clear(); await saveMidiSettings(); updateFeedbackStatus(); });
els.feedbackFormatSelect.addEventListener('change', async () => { lastFeedbackValues.clear(); await saveMidiSettings(); updateFeedbackStatus(); });
els.openMixerBtn.addEventListener('click', () => void useCurrentTabAsMixer());
els.pickTargetBtn.addEventListener('click', () => void chooseMidiTarget());
els.armLearnBtn.addEventListener('click', () => {
  if (!pendingTarget) { setNote(els.learnStatus, t('needLearnTarget'), 'warning'); return; }
  if (!engineState.connected) { setNote(els.learnStatus, t('needMidiFirst'), 'warning'); return; }
  midiLearnArmed = true; updateLearnButtons(); setNote(els.learnStatus, t('waitingMidi'), 'warning');
  void sendEngineCommand('ARM_LEARN').catch((error) => setNote(els.learnStatus, error.message, 'warning'));
});
els.cancelLearnBtn.addEventListener('click', cancelLearn);
els.exportBtn.addEventListener('click', exportMappings);
els.importBtn.addEventListener('click', () => els.importFile.click());
els.importFile.addEventListener('change', () => { if (els.importFile.files?.[0]) void importMappingsFile(els.importFile.files[0]); });

(async () => {
  // Load preferences first so mappings missing older color fields inherit the
  // user's most recently selected colors rather than hard-coded defaults.
  await loadSettings();
  // Track the current browser tab as a candidate. It becomes the mixer only
  // after the user clicks Connect MIDI or the manual mixer-selection button.
  await refreshCurrentBrowserTabContext();
  await restoreSelectedMixerContext();
  // MIDI permission is requested once in a dedicated normal extension tab.
  // The hidden Offscreen Document owns MIDIAccess and the active MIDI ports.
  await loadMappings();
  if (!lastFeedbackColors && colorUtils) {
    lastFeedbackColors = colorUtils.latestColorsFromMappings(mappings);
    await chrome.storage.local.set({ [FEEDBACK_COLORS_KEY]: lastFeedbackColors });
  }
  await refreshFeedbackMonitors();
  await inspectMidiPermission();
  await sendEngineCommand('SYNC_STATE', { mappings, midiSettings: { inputId: selectedMidiInput, outputId: selectedMidiOutput, feedbackEnabled: els.feedbackEnabled.checked, feedbackFormat: els.feedbackFormatSelect.value }, mixerContext: selectedMixerContext, language: currentLanguage }).catch((error) => console.warn('[Open Soundcraft MIDI] Background engine not yet available:', error));
  await sendEngineCommand('GET_STATE').catch(() => {});
  updateLearnButtons();
  updateFeedbackStatus();
  // MIDI permission is bootstrapped in midi-permission.html. The offscreen
  // background engine owns the single MIDIAccess object and keeps it alive
  // while this Side Panel is closed.
})().catch((error) => console.error(error));
window.setInterval(() => { void refreshMappingLabels(); }, 2500);
// MIDI input, mapping execution, and feedback polling live in the persistent offscreen engine.
// Keep the active tab as a candidate; focusing another tab never changes the
// pinned mixer by itself. Connect MIDI or the manual selection button performs
// the change. Navigating the pinned tab itself updates its URL, not its ID.
chrome.tabs.onActivated.addListener((activeInfo) => {
  void refreshCurrentBrowserTabContext(activeInfo?.tabId);
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') void refreshFeedbackMonitors();
  if (tab?.active && (changeInfo.url || changeInfo.status === 'complete')) {
    void refreshCurrentBrowserTabContext(tabId);
  }
  if (tabId === selectedMixerTabId && (changeInfo.url || changeInfo.status === 'complete')) {
    const context = activeTabContextFromTab(tab);
    let sameOrigin = false;
    try {
      sameOrigin = Boolean(context && selectedMixerContext?.url
        && new URL(context.url).origin === new URL(selectedMixerContext.url).origin);
    } catch (_) { sameOrigin = false; }
    if (context && sameOrigin) {
      selectedMixerContext = context;
      void chrome.storage.session.set({ [SELECTED_MIXER_CONTEXT_KEY]: context });
      updateMixerContextDisplay();
    } else {
      selectedMixerTabId = null;
      selectedMixerContext = null;
      // The Service Worker owns the session-context removal and Offscreen shutdown.
      if (continuousLearning || targetPickerActive || midiLearnArmed || pendingTarget) {
        stopLearningSession({ fromPage: false, quiet: true });
      }
      updateMixerContextDisplay();
      updateLearnButtons();
      setNote(els.targetStatus, t('mixerNotSelected'), 'warning');
    }
  }
});
window.addEventListener('focus', () => { void refreshCurrentBrowserTabContext(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void refreshCurrentBrowserTabContext();
});
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === selectedMixerTabId) {
    selectedMixerTabId = null;
    selectedMixerContext = null;
    // The Service Worker clears the stored context and stops the Offscreen engine.
    updateMixerContextDisplay();
    updateLearnButtons();
    setNote(els.targetStatus, t('noMatchingTab'), 'warning');
    if (continuousLearning || targetPickerActive || midiLearnArmed || pendingTarget) stopLearningSession({ fromPage: false, quiet: true });
  }
  void refreshCurrentBrowserTabContext();
});
