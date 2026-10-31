'use strict';

const ENGINE_KEYS = Object.freeze({
  mappings: 'openSoundcraftMidiMappings',
  midiSettings: 'openSoundcraftMidiMidiSettings',
  language: 'openSoundcraftMidiLanguage',
  feedbackColors: 'openSoundcraftMidiLastFeedbackColors',
  selectedMixer: 'openSoundcraftMidiSelectedMixerContext',
  autoStart: 'openSoundcraftMidiEngineEnabled'
});

const midiDeviceProfiles = window.OpenSoundcraftMidiDeviceProfiles;
const midiColors = window.OpenSoundcraftMidiColors;
const apc = window.OpenSoundcraftMidiApc;
const mappingMode = window.OpenSoundcraftMidiMappingMode;

let midiAccess = null;
let connectPromise = null;
let managedInputs = new Map();
let selectedInputId = '';
let selectedOutputId = '';
let mappings = [];
let midiSettings = { inputId: '', outputId: '', feedbackEnabled: true, feedbackFormat: 'auto' };
let language = 'de';
let mixerContext = null;
let pendingTarget = null;
let continuousLearning = false;
let learningArmed = false;
let feedbackPollInProgress = false;
let monitorRefreshInProgress = false;
let generation = 0;
const blockedOutputs = new Set();
const feedbackCache = new Map();
const feedbackEchoes = new Map();
const ccToggleHigh = new Map();
const MIDI_REQUEST_TIMEOUT_MS = 15000;
let resolveEngineReady;
let rejectEngineReady;
const engineReady = new Promise((resolve, reject) => { resolveEngineReady = resolve; rejectEngineReady = reject; });

const worker = new Worker(chrome.runtime.getURL('background/midi-worker.js'));
worker.onmessage = (event) => {
  if (event.data?.type === 'MIDI_DECODED') void handleMidiMessage(event.data.decoded, event.data.input);
};
worker.onerror = (event) => {
  console.error('[Open Soundcraft MIDI] MIDI worker failed:', event.message || event);
  publishStatus({ message: 'MIDI event worker failed.', severity: 'error' });
};

function rpc(operation, payload = {}) {
  return chrome.runtime.sendMessage({ target: 'background', type: 'ENGINE_RPC', operation, payload })
    .then((response) => {
      if (!response?.ok) throw new Error(response?.error || `Background operation failed: ${operation}`);
      return response.result;
    });
}

function sendPanel(type, payload = {}) {
  try { void chrome.runtime.sendMessage({ target: 'panel', type, ...payload }).catch(() => {}); }
  catch (_) { /* The panel may be closed. */ }
}

function publishStatus(extra = {}) {
  const inputs = midiAccess ? [...midiAccess.inputs.values()].map(serializePort) : [];
  const outputs = midiAccess ? [...midiAccess.outputs.values()].map(serializePort) : [];
  sendPanel('ENGINE_STATUS', {
    connected: Boolean(midiAccess),
    inputs,
    outputs,
    selectedInputId,
    selectedOutputId,
    feedbackEnabled: midiSettings.feedbackEnabled !== false,
    feedbackFormat: midiSettings.feedbackFormat || 'auto',
    learningArmed,
    continuousLearning,
    pendingTarget,
    ...extra
  });
}

function serializePort(port) {
  return {
    id: String(port.id),
    name: String(port.name || port.manufacturer || `${port.type} ${port.id}`),
    manufacturer: String(port.manufacturer || ''),
    state: String(port.state || 'connected'),
    type: String(port.type || '')
  };
}

function isConnected(port) { return Boolean(port) && port.state !== 'disconnected'; }
function isEdge() { return /Edg\//i.test(navigator.userAgent); }

async function loadPersistentState() {
  const [local, session] = await Promise.all([
    rpc('STORAGE_GET_LOCAL', { keys: [ENGINE_KEYS.mappings, ENGINE_KEYS.midiSettings, ENGINE_KEYS.language, ENGINE_KEYS.feedbackColors] }),
    rpc('STORAGE_GET_SESSION', { keys: [ENGINE_KEYS.selectedMixer] })
  ]);
  mappings = Array.isArray(local?.[ENGINE_KEYS.mappings]) ? local[ENGINE_KEYS.mappings] : [];
  midiSettings = { ...midiSettings, ...(local?.[ENGINE_KEYS.midiSettings] || {}) };
  selectedInputId = midiSettings.inputId || '';
  selectedOutputId = midiSettings.outputId || '';
  language = local?.[ENGINE_KEYS.language] === 'en' ? 'en' : 'de';
  mixerContext = session?.[ENGINE_KEYS.selectedMixer] || null;
}

function requestMidiAccess() {
  if (typeof navigator.requestMIDIAccess !== 'function') {
    const error = new Error('Web MIDI is not available in the offscreen extension document.');
    error.name = 'NotSupportedError';
    return Promise.reject(error);
  }
  const request = navigator.requestMIDIAccess();
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error('MIDI access request timed out.');
      error.name = 'TimeoutError';
      reject(error);
    }, MIDI_REQUEST_TIMEOUT_MS);
  });
  return Promise.race([request, timeout]).finally(() => clearTimeout(timer));
}

async function connectMidi() {
  if (midiAccess) { refreshDevices(); return true; }
  if (connectPromise) return connectPromise;
  connectPromise = (async () => {
    publishStatus({ state: 'requesting', message: 'Requesting MIDI access in background…' });
    try {
      midiAccess = await requestMidiAccess();
      generation += 1;
      await rpc('STORAGE_SET_LOCAL', { values: { [ENGINE_KEYS.autoStart]: true } });
      refreshDevices();
      publishStatus({ state: 'connected', message: 'MIDI engine running in background.' });
      void pollFeedback();
      void refreshMonitors();
      return true;
    } catch (error) {
      midiAccess = null;
      publishStatus({ state: 'error', errorName: error?.name || 'Error', message: error?.message || String(error), permissionRequired: ['NotAllowedError', 'SecurityError'].includes(error?.name) });
      return false;
    } finally {
      connectPromise = null;
    }
  })();
  return connectPromise;
}

function refreshDevices() {
  if (!midiAccess) { publishStatus({ state: 'disconnected' }); return; }
  const inputs = [...midiAccess.inputs.values()].filter(isConnected);
  const outputs = [...midiAccess.outputs.values()].filter(isConnected);
  if (!inputs.some((port) => port.id === selectedInputId)) selectedInputId = '';
  if (!outputs.some((port) => port.id === selectedOutputId)) selectedOutputId = '';
  midiSettings.inputId = selectedInputId;
  midiSettings.outputId = selectedOutputId;
  attachSelectedInput();
  void rpc('STORAGE_SET_LOCAL', { values: { [ENGINE_KEYS.midiSettings]: midiSettings } }).catch(() => {});
  feedbackCache.clear();
  publishStatus({ state: 'connected' });
}

function detachInput(input) {
  if (!input) return;
  try { input.onmidimessage = null; } catch (_) { /* Drop stale wrapper only. */ }
  if (!isEdge() && input.state === 'connected' && input.connection === 'open' && typeof input.close === 'function') {
    try { void input.close().catch(() => {}); } catch (_) { /* Driver may be disconnecting. */ }
  }
}

function attachSelectedInput() {
  if (!midiAccess) return;
  const inputs = [...midiAccess.inputs.values()].filter(isConnected);
  const desired = selectedInputId === '*'
    ? inputs
    : selectedInputId ? inputs.filter((item) => item.id === selectedInputId) : [];
  const desiredIds = new Set(desired.map((item) => item.id));
  for (const [id, input] of managedInputs) {
    if (!desiredIds.has(id)) { detachInput(input); managedInputs.delete(id); }
  }
  for (const input of desired) {
    if (managedInputs.has(input.id)) continue;
    try {
      input.onmidimessage = (event) => {
        try {
          worker.postMessage({ type: 'DECODE_MIDI', bytes: Array.from(event.data || []), input: { id: input.id, name: input.name || input.manufacturer || input.id }, timeStamp: event.timeStamp });
        } catch (error) {
          console.warn('[Open Soundcraft MIDI] Could not dispatch MIDI input:', error);
        }
      };
      managedInputs.set(input.id, input);
    } catch (error) {
      publishStatus({ state: 'warning', message: `Could not open MIDI input: ${error?.message || error}` });
    }
  }
  publishStatus({
    state: 'connected',
    message: !inputs.length ? 'No MIDI input found.' : !managedInputs.size ? 'MIDI ready; select one input.' : `${managedInputs.size} MIDI input(s) active.`
  });
}

async function disconnectMidi() {
  generation += 1;
  // Keep the Edge/Windows safety policy: no native MIDIPort.close() calls.
  for (const input of managedInputs.values()) detachInput(input);
  managedInputs = new Map();
  midiAccess = null;
  selectedInputId = '';
  selectedOutputId = '';
  midiSettings.inputId = '';
  midiSettings.outputId = '';
  feedbackCache.clear();
  blockedOutputs.clear();
  feedbackEchoes.clear();
  await rpc('STORAGE_SET_LOCAL', {
    values: {
      [ENGINE_KEYS.midiSettings]: midiSettings,
      [ENGINE_KEYS.autoStart]: false
    }
  }).catch(() => {});
  publishStatus({ state: 'disconnected', message: 'MIDI engine stopped.' });
  return true;
}

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function sameMidi(mapping, message) {
  return mapping?.midi?.kind === message.kind && mapping.midi.channel === message.channel && mapping.midi.number === message.number;
}

function feedbackSignature(message) {
  if (message.kind === 'pitchbend') return `pitchbend:${message.channel}:${message.value}`;
  if (message.kind === 'cc') return `cc:${message.channel}:${message.number}:${message.value}`;
  if (message.kind === 'note') return `note:${message.channel}:${message.number}:${message.value}`;
  return '';
}

function isFeedbackEcho(message) {
  const signature = feedbackSignature(message);
  const sentAt = feedbackEchoes.get(signature);
  return Boolean(signature && Number.isFinite(sentAt) && Date.now() - sentAt < 160);
}

function describeMidi(message) {
  const channel = message.channel + 1;
  if (message.kind === 'cc') return `CC ${message.number} · CH ${channel} · ${message.value}`;
  if (message.kind === 'note') return `Note ${message.number} · CH ${channel} · ${message.pressed ? 'On' : 'Off'} · ${message.value}`;
  if (message.kind === 'pitchbend') return `Pitch Bend · CH ${channel} · ${message.value}`;
  return `${message.kind} · ${message.raw.join(' ')}`;
}

async function handleMidiMessage(message, input) {
  if (!message) return;
  sendPanel('ENGINE_MIDI_EVENT', { input, message, description: describeMidi(message) });
  if (isFeedbackEcho(message)) return;
  if (learningArmed && pendingTarget) {
    if (message.kind === 'cc' || (message.kind === 'note' && message.pressed) || message.kind === 'pitchbend') {
      await createLearnedMapping(message);
    }
    return;
  }
  for (const mapping of mappings) {
    if (mapping.enabled === false || !sameMidi(mapping, message)) continue;
    let shouldApply = false;
    if (mapping.mode === 'fader') shouldApply = message.kind === 'cc' || message.kind === 'pitchbend';
    else if (mapping.mode === 'toggle') {
      if (message.kind === 'note') shouldApply = message.pressed;
      else if (message.kind === 'cc') {
        const previous = ccToggleHigh.get(mapping.id) === true;
        const current = message.value >= 64;
        ccToggleHigh.set(mapping.id, current);
        shouldApply = current && !previous;
      }
    }
    if (shouldApply) void applyMapping(mapping, message);
  }
}

async function createLearnedMapping(message) {
  const mode = mappingMode?.resolveTargetMode(pendingTarget, pendingTarget?.mode || 'toggle') || pendingTarget?.mode || 'toggle';
  if (mode === 'fader' && message.kind !== 'cc' && message.kind !== 'pitchbend') {
    sendPanel('ENGINE_LEARN_WARNING', { message: 'A fader requires an absolute CC control or Pitch Bend.' });
    learningArmed = true;
    publishStatus();
    return;
  }
  const colorData = await rpc('STORAGE_GET_LOCAL', { keys: [ENGINE_KEYS.feedbackColors, ENGINE_KEYS.mappings] }).catch(() => ({}));
  const defaultColors = midiColors?.normalizeColors(colorData?.[ENGINE_KEYS.feedbackColors]
    || midiColors?.latestColorsFromMappings(mappings) || null) || { activeColor: '#00FF00', inactiveColor: '#000000' };
  const output = midiAccess?.outputs.get(selectedOutputId) || null;
  const profile = midiDeviceProfiles?.detectFeedbackProfile(output) || 'generic';
  const mapping = {
    id: crypto.randomUUID(), enabled: true, mode,
    midi: { kind: message.kind, channel: message.channel, number: message.number },
    feedback: { enabled: true, kind: 'auto', profile, channel: message.channel, number: message.number, ...defaultColors },
    target: { ...pendingTarget, mode },
    createdAt: new Date().toISOString()
  };
  const duplicate = mappings.find((item) => sameMidi(item, message));
  if (duplicate) mappings = mappings.filter((item) => item.id !== duplicate.id);
  mappings.push(mapping);
  await rpc('STORAGE_SET_LOCAL', { values: { [ENGINE_KEYS.mappings]: mappings } });
  learningArmed = false;
  pendingTarget = null;
  sendPanel('ENGINE_MAPPING_CREATED', { mapping, replaced: Boolean(duplicate), description: describeMidi(message) });
  feedbackCache.clear();
  publishStatus();
  if (continuousLearning) {
    await startNextPicker();
  } else {
    continuousLearning = false;
  }
}

async function applyMapping(mapping, message) {
  let value = message.value;
  if (message.kind === 'pitchbend') value = Math.round((message.value / 16383) * 127);
  try {
    const result = await rpc('APPLY_MAPPING', { mapping, value, pressed: message.pressed, language });
    if (!result?.ok) {
      sendPanel('ENGINE_WARNING', { message: result?.error || `Could not apply ${mapping.target?.label || 'mapping'}.` });
      return;
    }
    if (mapping.mode === 'toggle') {
      const state = typeof result.state === 'boolean' ? result.state : boolValue(result.value);
      if (state !== null) sendButtonFeedback(mapping, state);
    } else if (mapping.mode === 'fader' && Number.isFinite(result.value)) {
      sendFaderFeedback(mapping, result.value);
    }
  } catch (error) {
    sendPanel('ENGINE_WARNING', { message: `${mapping.target?.label || 'Mapping'}: ${error?.message || error}` });
  }
}

function boolValue(value) {
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

function normalizedValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : null;
}

function feedbackMessage(mapping, normalized) {
  const settings = mapping.feedback || {};
  let kind = midiSettings.feedbackFormat || 'auto';
  if (kind === 'auto') kind = mapping.midi.kind === 'pitchbend' ? 'pitchbend' : 'cc';
  const channel = Number.isInteger(settings.channel) ? Math.max(0, Math.min(15, settings.channel)) : mapping.midi.channel;
  if (kind === 'pitchbend') {
    const value = Math.round(Math.max(0, Math.min(1, normalized)) * 16383);
    return { kind, channel, number: 0, value, bytes: [0xe0 | channel, value & 0x7f, (value >> 7) & 0x7f] };
  }
  const number = Number.isInteger(settings.number) ? Math.max(0, Math.min(127, settings.number)) : mapping.midi.number;
  const value = Math.round(Math.max(0, Math.min(1, normalized)) * 127);
  return { kind: 'cc', channel, number, value, bytes: [0xb0 | channel, number, value] };
}

function sendFeedbackBytes(mapping, bytes, signature, value, echoSignature = '') {
  if (!midiAccess || midiSettings.feedbackEnabled === false || !mapping.feedback || mapping.feedback.enabled === false) return;
  const output = midiAccess.outputs.get(selectedOutputId);
  if (!output || output.state === 'disconnected' || blockedOutputs.has(output.id)) return;
  const cacheKey = `${output.id}:${signature}`;
  if (feedbackCache.get(cacheKey) === value) return;
  try {
    output.send(bytes);
    feedbackCache.set(cacheKey, value);
    if (echoSignature) feedbackEchoes.set(echoSignature, Date.now());
    while (feedbackEchoes.size > 300) feedbackEchoes.delete(feedbackEchoes.keys().next().value);
  } catch (error) {
    blockedOutputs.add(output.id);
    feedbackCache.clear();
    sendPanel('ENGINE_WARNING', { message: `MIDI feedback failed: ${error?.message || error}` });
  }
}

function sendFaderFeedback(mapping, normalized) {
  if (!Number.isFinite(normalized)) return;
  const message = feedbackMessage(mapping, normalized);
  const signature = `${message.kind}:${message.channel}:${message.number}`;
  const echo = message.kind === 'pitchbend'
    ? `pitchbend:${message.channel}:${message.value}`
    : `cc:${message.channel}:${message.number}:${message.value}`;
  sendFeedbackBytes(mapping, message.bytes, signature, message.value, echo);
}

function sendButtonFeedback(mapping, active) {
  if (typeof active !== 'boolean' || !mapping.feedback || mapping.feedback.enabled === false || !midiAccess || midiSettings.feedbackEnabled === false) return;
  const output = midiAccess.outputs.get(selectedOutputId);
  if (!output || output.state === 'disconnected' || blockedOutputs.has(output.id)) return;
  const settings = mapping.feedback;
  const number = clampInt(settings.number, 0, 127, mapping.midi.number);
  const profile = settings.profile || 'generic';
  let bytes;
  let label;
  if (profile === 'apc-mini-mk2' && apc) {
    bytes = apc.ledMessage(number, active, settings.activeColor || '#00FF00', settings.inactiveColor || '#000000');
    label = 'apc-mini-mk2';
  } else {
    const channel = clampInt(Number.isInteger(settings.channel) ? settings.channel : mapping.midi.channel, 0, 15, mapping.midi.channel);
    const kind = settings.kind && settings.kind !== 'auto' ? settings.kind : mapping.midi.kind;
    bytes = kind === 'cc'
      ? [0xb0 | channel, number, active ? 127 : 0]
      : [0x90 | channel, number, active ? 127 : 0];
    label = `${kind}:${channel}`;
  }
  const echoChannel = bytes[0] & 0x0f;
  const status = bytes[0] & 0xf0;
  const echo = status === 0x90 || status === 0x80
    ? `note:${echoChannel}:${bytes[1]}:${bytes[2]}`
    : status === 0xb0 ? `cc:${echoChannel}:${bytes[1]}:${bytes[2]}` : '';
  sendFeedbackBytes(mapping, bytes, `button:${label}:${number}`, active ? 1 : 0, echo);
}

async function pollFeedback() {
  if (feedbackPollInProgress || !midiAccess || midiSettings.feedbackEnabled === false || !selectedOutputId || blockedOutputs.has(selectedOutputId)) return;
  const selectedOutput = midiAccess.outputs.get(selectedOutputId);
  if (!selectedOutput || selectedOutput.state === 'disconnected') return;
  const active = mappings.filter((mapping) => mapping.enabled !== false && ['fader', 'toggle'].includes(mapping.mode)
    && mapping.feedback?.enabled !== false && mapping.target && mapping.target.backend !== 'hardware');
  if (!active.length) return;
  feedbackPollInProgress = true;
  const generationAtStart = generation;
  try {
    const values = await rpc('READ_TARGET_VALUES', { mappings: active, language });
    if (generationAtStart !== generation || !Array.isArray(values)) return;
    for (const item of values) {
      const mapping = active.find((candidate) => candidate.id === item.id);
      if (!mapping) continue;
      if (mapping.mode === 'fader' && Number.isFinite(item.value)) sendFaderFeedback(mapping, item.value);
      else if (mapping.mode === 'toggle' && typeof item.state === 'boolean') sendButtonFeedback(mapping, item.state);
    }
  } catch (_) { /* A temporarily unavailable Mixer tab does not stop MIDI input. */ }
  finally { feedbackPollInProgress = false; }
}

async function refreshMonitors() {
  if (monitorRefreshInProgress) return;
  const active = mappings.filter((mapping) => mapping.enabled !== false && mapping.target && mapping.target.backend !== 'web-dom');
  if (!active.length) return;
  monitorRefreshInProgress = true;
  try { await rpc('REFRESH_MONITORS', { mappings: active, language }); }
  catch (_) { /* Retry on the next interval. */ }
  finally { monitorRefreshInProgress = false; }
}

function handleParameterChanged(message) {
  if (!midiAccess || midiSettings.feedbackEnabled === false) return;
  for (const mapping of mappings) {
    if (mapping.enabled === false || mapping.feedback?.enabled === false || mapping.target?.origin !== message.origin) continue;
    const key = mapping.target?.parameterKey || mapping.target?.key || '';
    if (key !== message.key) continue;
    if (mapping.mode === 'fader') {
      const value = normalizedValue(message.value);
      if (value !== null) sendFaderFeedback(mapping, value);
    } else if (mapping.mode === 'toggle') {
      const active = boolValue(message.value);
      if (active !== null) sendButtonFeedback(mapping, active);
    }
  }
}

async function handlePickedTarget(payload) {
  const tabId = payload?.tabId;
  const tabUrl = payload?.url || '';
  if (!Number.isInteger(tabId)) return;
  let target;
  try {
    target = await rpc('INSPECT_TARGET', { tabId, url: tabUrl, target: payload.message?.target || {}, language });
  } catch (error) {
    sendPanel('ENGINE_WARNING', { message: `Target selection failed: ${error?.message || error}` });
    return;
  }
  if (!target?.ok || !target.target) {
    sendPanel('ENGINE_WARNING', { message: target?.error || 'The selected Mixer control could not be recognized.' });
    return;
  }
  pendingTarget = target.target;
  pendingTarget.mode = mappingMode?.resolveTargetMode(pendingTarget, pendingTarget.mode || 'toggle') || pendingTarget.mode || 'toggle';
  learningArmed = Boolean(midiAccess);
  sendPanel('ENGINE_TARGET_READY', { target: pendingTarget, learningArmed });
  publishStatus({ message: learningArmed ? 'Target selected. Move or press the MIDI control.' : 'Target selected. Connect MIDI first.' });
}

async function startNextPicker() {
  const tabId = Number.isInteger(mixerContext?.tabId) ? mixerContext.tabId : pendingTarget?.tabId;
  if (!Number.isInteger(tabId)) {
    continuousLearning = false;
    publishStatus({ message: 'Mixer tab is not available; continuous learning stopped.' });
    return;
  }
  try {
    await rpc('START_PICKER', { tabId, language });
    learningArmed = false;
    pendingTarget = null;
    sendPanel('ENGINE_PICKER_STARTED', {});
    publishStatus({ message: 'Select the next Mixer control. Press ESC to stop.' });
  } catch (error) {
    continuousLearning = false;
    learningArmed = false;
    sendPanel('ENGINE_WARNING', { message: `Could not start target selection: ${error?.message || error}` });
    publishStatus();
  }
}

async function stopLearning(options = {}) {
  const stopPicker = options.stopPicker !== false;
  continuousLearning = false;
  learningArmed = false;
  pendingTarget = null;
  if (stopPicker && Number.isInteger(mixerContext?.tabId)) {
    void rpc('CANCEL_PICKER', { tabId: mixerContext.tabId }).catch(() => {});
  }
  sendPanel('ENGINE_LEARNING_STOPPED', {});
  publishStatus();
}

async function onCommand(command, payload = {}) {
  switch (command) {
    case 'CONNECT': return connectMidi();
    case 'DISCONNECT': return disconnectMidi();
    case 'REFRESH_DEVICES': refreshDevices(); return true;
    case 'SET_INPUT':
      selectedInputId = String(payload.inputId || '');
      midiSettings.inputId = selectedInputId;
      attachSelectedInput();
      await rpc('STORAGE_SET_LOCAL', { values: { [ENGINE_KEYS.midiSettings]: midiSettings } });
      publishStatus(); return true;
    case 'SET_OUTPUT':
      selectedOutputId = String(payload.outputId || '');
      midiSettings.outputId = selectedOutputId;
      blockedOutputs.delete(selectedOutputId);
      feedbackCache.clear();
      await rpc('STORAGE_SET_LOCAL', { values: { [ENGINE_KEYS.midiSettings]: midiSettings } });
      publishStatus(); void pollFeedback(); return true;
    case 'UPDATE_SETTINGS':
      midiSettings = { ...midiSettings, ...(payload.settings || {}) };
      selectedInputId = midiSettings.inputId || selectedInputId;
      selectedOutputId = midiSettings.outputId || selectedOutputId;
      feedbackCache.clear();
      await rpc('STORAGE_SET_LOCAL', { values: { [ENGINE_KEYS.midiSettings]: midiSettings } });
      attachSelectedInput(); publishStatus(); void pollFeedback(); return true;
    case 'SYNC_STATE':
      if (Array.isArray(payload.mappings)) mappings = payload.mappings;
      if (payload.midiSettings) midiSettings = { ...midiSettings, ...payload.midiSettings };
      if (payload.mixerContext !== undefined) mixerContext = payload.mixerContext;
      if (payload.language) language = payload.language === 'en' ? 'en' : 'de';
      if (payload.pendingTarget !== undefined) pendingTarget = payload.pendingTarget;
      if (typeof payload.continuousLearning === 'boolean') continuousLearning = payload.continuousLearning;
      if (typeof payload.learningArmed === 'boolean') learningArmed = payload.learningArmed;
      selectedInputId = midiSettings.inputId || selectedInputId;
      selectedOutputId = midiSettings.outputId || selectedOutputId;
      if (midiAccess) { attachSelectedInput(); publishStatus(); void pollFeedback(); }
      return true;
    case 'SET_MIXER_CONTEXT': mixerContext = payload.context || null; void refreshMonitors(); return true;
    case 'SET_MAPPINGS': mappings = Array.isArray(payload.mappings) ? payload.mappings : []; feedbackCache.clear(); void refreshMonitors(); void pollFeedback(); return true;
    case 'SET_TARGET':
      pendingTarget = payload.target || null;
      learningArmed = false;
      continuousLearning = payload.continuous === true;
      publishStatus(); return true;
    case 'SET_LEARNING': continuousLearning = payload.continuous === true; learningArmed = false; publishStatus(); return true;
    case 'ARM_LEARN':
      if (!midiAccess) return false;
      if (!pendingTarget) return false;
      learningArmed = true; publishStatus({ message: 'Waiting for MIDI input.' }); return true;
    case 'STOP_LEARNING': await stopLearning(); return true;
    case 'TARGET_PICKED': await handlePickedTarget(payload); return true;
    case 'PICKER_CANCELLED': await stopLearning({ stopPicker: false }); return true;
    case 'PARAMETER_CHANGED': handleParameterChanged(payload); return true;
    case 'GET_STATE': publishStatus(); return true;
    case 'POLL_FEEDBACK': void pollFeedback(); return true;
    case 'REFRESH_MONITORS': void refreshMonitors(); return true;
    case 'TAB_REMOVED':
      if (payload.tabId === mixerContext?.tabId) {
        mixerContext = null;
        await stopLearning({ stopPicker: false });
        publishStatus({ message: 'Mixer tab closed.' });
      }
      return true;
    case 'TAB_UPDATED':
      if (payload.tabId === mixerContext?.tabId && payload.context) mixerContext = payload.context;
      return true;
    default: return false;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'offscreen-engine' || message.type !== 'ENGINE_COMMAND') return false;
  // Do not process commands until persisted state has been loaded. This avoids
  // a race where a newly opened Side Panel overwrites an active learn session.
  void engineReady.then(() => onCommand(message.command, message.payload || {}))
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => {
      sendPanel('ENGINE_WARNING', { message: error?.message || String(error) });
      sendResponse({ ok: false, error: error?.message || String(error) });
    });
  return true;
});

(async () => {
  try {
    await loadPersistentState();
    const stored = await rpc('STORAGE_GET_LOCAL', { keys: [ENGINE_KEYS.autoStart] }).catch(() => ({}));
    resolveEngineReady(true);
    publishStatus({ state: 'idle', message: 'Background MIDI engine ready.' });
    if (stored?.[ENGINE_KEYS.autoStart] === true) void connectMidi();
    setInterval(() => { void pollFeedback(); }, 1500);
    setInterval(() => { void refreshMonitors(); }, 3000);
  } catch (error) {
    rejectEngineReady(error);
    console.error('[Open Soundcraft MIDI] Background engine initialization failed:', error);
    publishStatus({ state: 'error', message: error?.message || String(error) });
  }
})();
