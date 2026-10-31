'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const controller = fs.readFileSync(path.join(root, 'controller/controller.js'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'background/midi-engine.js'), 'utf8');
const content = fs.readFileSync(path.join(root, 'content/soundcraft-ui.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'controller/controller.html'), 'utf8');
const permissionJs = fs.readFileSync(path.join(root, 'midi-permission.js'), 'utf8');

function sourceOf(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const asyncStart = source.indexOf(`async function ${name}(`);
  const index = start < 0 ? asyncStart : (asyncStart < 0 ? start : Math.min(start, asyncStart));
  assert.notEqual(index, -1, `${name} must exist`);
  const next = nextName ? String(nextName).replace(/^(?:async\s+)?function\s+/, '') : '';
  const candidates = next ? [source.indexOf(`\nfunction ${next}(`, index), source.indexOf(`\nasync function ${next}(`, index)].filter((n) => n >= 0) : [];
  return source.slice(index, candidates.length ? Math.min(...candidates) : undefined);
}

test('MIDI permission tab is opened on first setup; the actual request runs in a click handler there', () => {
  const startup = controller.slice(controller.lastIndexOf('(async () => {'));
  assert.match(startup, /await inspectMidiPermission\(\)/);
  assert.doesNotMatch(startup, /connectMidi\(/);
  assert.match(controller, /message\.type === 'MIDI_PERMISSION_GRANTED'[\s\S]*?midiPermissionGrantedInTab = true/);
  assert.match(permissionJs, /requestButton\.addEventListener\('click',[\s\S]*?requestAccess\(\)/);
  assert.match(permissionJs, /navigator\.requestMIDIAccess\(\)/);
  assert.match(controller, /openMidiPermissionTab\(\)/);
});

test('clicking a mixer target sends it to the background engine, which arms MIDI Learn', () => {
  assert.match(controller, /sendEngineCommand\('SET_LEARNING', \{ continuous: true \}\)/);
  const handler = sourceOf(engine, 'handlePickedTarget', 'async function startNextPicker');
  assert.match(handler, /learningArmed = Boolean\(midiAccess\)/);
  assert.match(handler, /ENGINE_TARGET_READY/);
});

test('a successful MIDI mapping reopens continuous target selection in the background', () => {
  const create = sourceOf(engine, 'createLearnedMapping', 'async function applyMapping');
  assert.match(create, /if \(continuousLearning\)/);
  assert.match(create, /await startNextPicker\(\)/);
  assert.match(engine, /async function startNextPicker/);
});

test('ESC stops continuous learning from the Side Panel and clears the page picker through the engine', () => {
  assert.match(controller, /window\.addEventListener\('keydown',[\s\S]*?event\.key === 'Escape'[\s\S]*?stopLearningSession/);
  assert.match(sourceOf(engine, 'stopLearning', 'async function onCommand'), /rpc\('CANCEL_PICKER'/);
});

test('ESC remains active on the mixer page after the target overlay disappears', () => {
  assert.match(content, /let continuousPickerMode = false/);
  assert.match(content, /document\.addEventListener\('keydown', onPickerKeyDown, true\)/);
  assert.match(content, /teardownPicker\(\{ endSession: true \}\)/);
});

test('the color helper is loaded before the controller script', () => {
  assert.ok(html.indexOf('../shared/feedback-colors.js') < html.indexOf('controller.js'));
  assert.ok(html.indexOf('../shared/midi-device-profiles.js') < html.indexOf('controller.js'));
});

test('new MIDI mappings inherit the persisted last-used feedback colors in the background engine', () => {
  const create = sourceOf(engine, 'createLearnedMapping', 'async function applyMapping');
  assert.match(create, /ENGINE_KEYS\.feedbackColors/);
  assert.match(create, /normalizeColors/);
  assert.match(create, /\.\.\.defaultColors/);
});

test('background LED feedback profile is detected from the currently selected output', () => {
  const create = sourceOf(engine, 'createLearnedMapping', 'async function applyMapping');
  assert.match(create, /detectFeedbackProfile\(output\) \|\| 'generic'/);
  assert.match(create, /profile, channel: message\.channel/);
});
