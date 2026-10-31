'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const background = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'background/midi-engine.js'), 'utf8');
const offscreenHtml = fs.readFileSync(path.join(root, 'background/offscreen.html'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'background/midi-worker.js'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'controller/controller.js'), 'utf8');

test('Manifest V3 declares offscreen permission and an Offscreen Document runtime', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.permissions.includes('offscreen'));
  assert.equal(manifest.background.service_worker, 'background.js');
  assert.ok(Number(manifest.minimum_chrome_version) >= 116);
});

test('Offscreen Document loads device profiles and the MIDI engine in dependency order', () => {
  assert.match(offscreenHtml, /shared\/midi-device-profiles\.js/);
  assert.match(offscreenHtml, /shared\/apc-mini-mk2\.js/);
  assert.ok(offscreenHtml.indexOf('shared/midi-device-profiles.js') < offscreenHtml.indexOf('midi-engine.js'));
  assert.match(offscreenHtml, /midi-engine\.js/);
});

test('Offscreen Document owns Web MIDI access and the selected input callbacks', () => {
  assert.match(engine, /navigator\.requestMIDIAccess\(\)/);
  assert.match(engine, /input\.onmidimessage\s*=/);
  assert.match(engine, /midiAccess\.outputs\.get\(selectedOutputId\)/);
  assert.doesNotMatch(controller, /navigator\.requestMIDIAccess\(\)/);
  assert.doesNotMatch(controller, /input\.onmidimessage\s*=/);
});

test('Side Panel is a UI client and routes MIDI commands to the background', () => {
  assert.ok(controller.includes('async function sendEngineCommand(command, payload = {})'));
  assert.match(controller, /target:\s*'background',[\s\S]*?type:\s*'ENGINE_COMMAND'/);
  assert.match(controller, /message\.type === 'ENGINE_STATUS'/);
  assert.doesNotMatch(controller, /function onMidiMessage\(/);
  assert.doesNotMatch(controller, /function sendMidiFeedbackBytes\(/);
});

test('Background creates a single Offscreen Document with the WORKERS lifetime reason', () => {
  assert.match(background, /chrome\.runtime\.getContexts/);
  assert.match(background, /chrome\.offscreen\.createDocument/);
  assert.match(background, /reasons:\s*\['WORKERS'\]/);
  assert.match(background, /OFFSCREEN_DOCUMENT/);
  assert.match(background, /chrome\.offscreen\.closeDocument/);
});

test('Background routes engine RPC for storage, mapping apply and feedback polling', () => {
  assert.match(background, /case 'STORAGE_GET_LOCAL'/);
  assert.match(background, /case 'STORAGE_SET_LOCAL'/);
  assert.match(background, /case 'APPLY_MAPPING'/);
  assert.match(background, /case 'READ_TARGET_VALUES'/);
  assert.match(background, /case 'REFRESH_MONITORS'/);
  assert.match(engine, /rpc\('APPLY_MAPPING'/);
  assert.ok(engine.includes('setInterval(() => { void pollFeedback(); }, 250)'));
});

test('background engine waits for persistent state before accepting Side Panel commands', () => {
  assert.match(engine, /const engineReady = new Promise/);
  assert.match(engine, /engineReady\.then\(\(\) => onCommand/);
  assert.match(engine, /resolveEngineReady\(true\)/);
  assert.match(engine, /if \(payload\.pendingTarget !== undefined\)/);
  const startupSync = controller.slice(controller.lastIndexOf("sendEngineCommand('SYNC_STATE'"), controller.lastIndexOf("sendEngineCommand('GET_STATE'"));
  assert.doesNotMatch(startupSync, /pendingTarget|continuousLearning|learningArmed/);
});

test('MIDI Learn and feedback runtime remain in Offscreen after panel closure', () => {
  assert.match(engine, /async function handleMidiMessage/);
  assert.match(engine, /async function createLearnedMapping/);
  assert.match(engine, /async function applyMapping/);
  assert.match(engine, /async function pollFeedback/);
  assert.match(engine, /async function refreshMonitors/);
  assert.match(background, /restoreBackgroundEngine/);
  assert.ok(background.includes('restoreBackgroundEngine'));
});

test('Offscreen engine releases input callbacks without native close calls on Edge', () => {
  const detachStart = engine.indexOf('function detachInput(input)');
  const detachEnd = engine.indexOf('function attachSelectedInput()', detachStart);
  const detach = engine.slice(detachStart, detachEnd);
  assert.match(detach, /input\.onmidimessage = null/);
  assert.match(detach, /if \(!isEdge\(\)/);
  assert.match(detach, /input\.close\(\)/);
  const disconnectStart = engine.indexOf('async function disconnectMidi()');
  const disconnectEnd = engine.indexOf('function clampInt', disconnectStart);
  const disconnect = engine.slice(disconnectStart, disconnectEnd);
  assert.match(disconnect, /for \(const input of managedInputs\.values\(\)\) detachInput\(input\)/);
  assert.doesNotMatch(disconnect.replace(/^\s*\/\/.*$/gm, ''), /midiAccess\.outputs|midiAccess\.inputs|\.close\(/);
});

test('MIDI engine keeps user permission request in a regular tab and uses saved grant in the Offscreen context', () => {
  const permission = fs.readFileSync(path.join(root, 'midi-permission.js'), 'utf8');
  assert.match(permission, /requestButton\.addEventListener\('click'/);
  assert.match(permission, /navigator\.requestMIDIAccess\(\)/);
  assert.match(permission, /openSoundcraftMidiPermissionGranted: true/);
  assert.match(engine, /if \(stored\?\.\[ENGINE_KEYS\.autoStart\] === true\) void connectMidi\(\)/);
});


test('Side Panel startup checks Web MIDI capability without making a permission request', () => {
  assert.match(controller, /function inspectMidiPermission\(\)/);
  const start = controller.indexOf('function inspectMidiPermission()');
  const end = controller.indexOf('function updateMidiPermissionStatusNote()', start);
  const helper = controller.slice(start, end);
  assert.match(helper, /typeof navigator\.requestMIDIAccess === 'function'/);
  assert.doesNotMatch(helper, /navigator\.requestMIDIAccess\(\)/);
});

test('Service Worker keeps asynchronous picker and mixer-parameter message channels open', () => {
  for (const type of ['TARGET_PICKED', 'PICKER_CANCELLED', 'MIXER_PARAMETER_CHANGED']) {
    const start = background.indexOf(`if (message.type === '${type}'`);
    assert.notEqual(start, -1, `${type} route exists`);
    const end = background.indexOf('\n  }', start);
    const route = background.slice(start, end);
    assert.match(route, /sendResponse\(/, `${type} responds asynchronously`);
    assert.match(route, /return true;/, `${type} keeps the async message channel alive`);
  }
});

test('Offscreen engine uses only runtime extension APIs and routes privileged work through the Service Worker', () => {
  const chromeApiNames = [...engine.matchAll(/chrome\.([A-Za-z0-9_.]+)/g)].map((match) => match[1]);
  assert.ok(chromeApiNames.every((name) => name === 'runtime.getURL' || name === 'runtime.sendMessage' || name === 'runtime.onMessage.addListener'));
  assert.match(engine, /rpc\('APPLY_MAPPING'/);
  assert.match(engine, /rpc\('READ_TARGET_VALUES'/);
  assert.match(engine, /rpc\('STORAGE_GET_LOCAL'/);
});


test('Closing the Side Panel is only a UI lifecycle event; the Offscreen document is not closed on panel unload', () => {
  assert.match(background, /async function closeOffscreenDocumentIfNoMixer\(\)/);
  assert.match(background, /openPanelOnActionClick:\s*true/);
  assert.match(engine, /setInterval\(\(\) => \{ void pollFeedback\(\); \}, 250\)/);
  assert.match(engine, /setInterval\(\(\) => \{ void refreshMonitors\(\); \}, 1000\)/);
  assert.doesNotMatch(controller, /window\.addEventListener\(['"]unload['"][\s\S]{0,500}DISCONNECT/);
});


test('revoked MIDI permission re-enables the one-time permission tab action', () => {
  assert.match(controller, /if \(state\.permissionRequired === true\)/);
  assert.match(controller, /\[MIDI_PERMISSION_GRANTED_KEY\]: false/);
  assert.match(controller, /t\('openMidiConnectTab'\)/);
});
