'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const controller = fs.readFileSync(path.join(root, 'controller/controller.js'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'background/midi-engine.js'), 'utf8');
const background = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const permissionJs = fs.readFileSync(path.join(root, 'midi-permission.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'controller/controller.html'), 'utf8');

function sourceOf(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const asyncStart = source.indexOf(`async function ${name}(`);
  const index = start < 0 ? asyncStart : (asyncStart < 0 ? start : Math.min(start, asyncStart));
  assert.notEqual(index, -1, `${name} must exist`);
  const next = nextName ? String(nextName).replace(/^(?:async\s+)?function\s+/, '') : '';
  const candidates = next ? [source.indexOf(`\nfunction ${next}(`, index), source.indexOf(`\nasync function ${next}(`, index)].filter((n) => n >= 0) : [];
  return source.slice(index, candidates.length ? Math.min(...candidates) : undefined);
}

test('MIDI permission is requested from a direct click in the regular extension tab', () => {
  assert.match(permissionJs, /requestButton\.addEventListener\('click'/);
  assert.match(permissionJs, /request = navigator\.requestMIDIAccess\(\)/);
  assert.match(permissionJs, /openSoundcraftMidiPermissionGranted: true/);
  assert.doesNotMatch(permissionJs, /\.onmidimessage\s*=|\.open\(|\.close\(/);
});

test('Side Panel delegates MIDI connection to the background and never requests Web MIDI itself', () => {
  assert.match(controller, /async function connectMidi\(\)[\s\S]*?sendEngineCommand\('CONNECT'\)/);
  assert.doesNotMatch(controller, /navigator\.requestMIDIAccess\(\)/);
  assert.doesNotMatch(controller, /input\.onmidimessage\s*=/);
  assert.match(controller, /target:\s*'background',[\s\S]*?type:\s*'ENGINE_COMMAND'/);
});

test('background Offscreen engine issues the actual Web MIDI request with a finite timeout', () => {
  const request = sourceOf(engine, 'requestMidiAccess', 'connectMidi');
  assert.match(request, /navigator\.requestMIDIAccess\(\)/);
  assert.match(request, /MIDI_REQUEST_TIMEOUT_MS/);
  assert.match(request, /Promise\.race\(\[request, timeout\]\)/);
});

test('opening the Side Panel does not automatically connect or trigger a permission prompt', () => {
  const startup = controller.slice(controller.lastIndexOf('(async () => {'));
  assert.doesNotMatch(startup, /connectMidi\(/);
  assert.match(startup, /SYNC_STATE/);
  assert.match(engine, /case 'CONNECT': return connectMidi\(\)/);
});

test('one-time MIDI permission grant is persisted and reused after Side Panel reopen', () => {
  assert.match(controller, /const MIDI_PERMISSION_GRANTED_KEY = 'openSoundcraftMidiPermissionGranted'/);
  assert.match(sourceOf(controller, 'loadSettings', 'saveMidiSettings'), /midiPermissionGrantedInTab = data\[MIDI_PERMISSION_GRANTED_KEY\] === true/);
  assert.match(permissionJs, /openSoundcraftMidiPermissionGranted: true/);
  assert.match(engine, /navigator\.requestMIDIAccess\(\)/);
  assert.match(controller, /if \(IS_SIDE_PANEL && !engineState\.connected && !midiPermissionGrantedInTab\)[\s\S]*?openMidiPermissionTab\(\)/);
});

test('permission bootstrap tab detects a previously granted permission without reopening ports', () => {
  assert.match(permissionJs, /navigator\.permissions\?\.query/);
  assert.match(permissionJs, /status\?\.state !== 'granted'/);
  assert.match(permissionJs, /await markPermissionGranted\(\)/);
  assert.doesNotMatch(permissionJs, /\.onmidimessage\s*=|\.open\(|\.close\(/);
});

test('only the explicitly selected MIDI input is opened; all-input mode remains opt-in', () => {
  assert.match(engine, /let selectedInputId = ''/);
  const attach = sourceOf(engine, 'attachSelectedInput', 'async function disconnectMidi');
  assert.match(attach, /selectedInputId === '\*'/);
  assert.match(attach, /input\.onmidimessage\s*=/);
  assert.match(engine, /selectedInputId = midiSettings\.inputId \|\| ''/);
});

test('Edge input detach avoids native MIDIPort.close calls', () => {
  const detach = sourceOf(engine, 'detachInput', 'function attachSelectedInput');
  assert.match(detach, /input\.onmidimessage = null/);
  assert.match(detach, /if \(!isEdge\(\)/);
  assert.match(detach, /input\.close\(\)/);
  const edgeBody = detach.slice(detach.indexOf('if (!isEdge()'));
  assert.match(edgeBody, /!isEdge\(\)/);
});

test('manual MIDI release detaches managed callbacks and drops the background MIDIAccess reference', () => {
  const disconnect = sourceOf(engine, 'disconnectMidi', 'function clampInt');
  assert.match(disconnect, /for \(const input of managedInputs\.values\(\)\) detachInput\(input\)/);
  assert.match(disconnect, /managedInputs = new Map\(\)/);
  assert.match(disconnect, /midiAccess = null/);
  assert.match(disconnect, /autoStart\]: false/);
  assert.doesNotMatch(disconnect.replace(/^\s*\/\/.*$/gm, ''), /\.close\(/);
  assert.match(controller, /els\.disconnectMidiBtn\.addEventListener\('click'/);
  assert.match(html, /id="disconnectMidiBtn"/);
});

test('no MIDI hot-plug statechange listener is installed in the background engine', () => {
  assert.doesNotMatch(engine, /midiAccess\.onstatechange\s*=/);
  assert.doesNotMatch(engine, /addEventListener\(['"]statechange/);
});

test('disconnected input and output ports are filtered from the background device lists', () => {
  const refresh = sourceOf(engine, 'refreshDevices', 'function detachInput');
  assert.match(refresh, /\[\.\.\.midiAccess\.inputs\.values\(\)\]\.filter\(isConnected\)/);
  assert.match(refresh, /\[\.\.\.midiAccess\.outputs\.values\(\)\]\.filter\(isConnected\)/);
});

test('MIDI output feedback is protected against disconnected and failed ports', () => {
  const send = sourceOf(engine, 'sendFeedbackBytes', 'function sendFaderFeedback');
  assert.match(send, /output\.state === 'disconnected'/);
  assert.match(send, /blockedOutputs\.has\(output\.id\)/);
  assert.match(send, /blockedOutputs\.add\(output\.id\)/);
});

test('there is no direct link to browser MIDI permission settings', () => {
  assert.doesNotMatch(html, /openMidiSettingsBtn|MIDI-Berechtigung in Edge öffnen/);
  assert.doesNotMatch(controller, /openMidiSettingsBtn|els\.openMidiSettingsBtn/);
});

test('feedback polling aborts when the MIDI device generation changes', () => {
  const poll = sourceOf(engine, 'pollFeedback', 'async function refreshMonitors');
  assert.match(poll, /const generationAtStart = generation/);
  assert.match(poll, /generationAtStart !== generation/);
});

test('Offscreen permissions are declared while Mixer host permissions remain optional', () => {
  assert.ok(manifest.permissions.includes('offscreen'));
  assert.deepEqual(manifest.optional_host_permissions, ['http://*/*', 'https://*/*']);
  assert.equal(manifest.host_permissions, undefined);
});
