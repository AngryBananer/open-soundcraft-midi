'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const engine = fs.readFileSync(path.join(root, 'background/midi-engine.js'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'controller/controller.js'), 'utf8');

function functionSource(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const asyncStart = source.indexOf(`async function ${name}(`);
  const index = start < 0 ? asyncStart : (asyncStart < 0 ? start : Math.min(start, asyncStart));
  assert.notEqual(index, -1, `${name} must exist`);
  const next = nextName ? String(nextName).replace(/^(?:async\s+)?function\s+/, '') : '';
  const candidates = next ? [source.indexOf(`\nfunction ${next}(`, index), source.indexOf(`\nasync function ${next}(`, index)].filter((n) => n >= 0) : [];
  return source.slice(index, candidates.length ? Math.min(...candidates) : undefined);
}

test('connect restores the stored input and output IDs before refreshing available ports', () => {
  const connect = functionSource(engine, 'connectMidi', 'function refreshDevices');
  assert.match(connect, /selectedInputId = midiSettings\.inputId \|\| ''/);
  assert.match(connect, /selectedOutputId = midiSettings\.outputId \|\| ''/);
  assert.ok(connect.indexOf('selectedInputId = midiSettings.inputId') < connect.indexOf('requestMidiAccess()'));
});

test('manual MIDI disconnect retains the last selected input and output IDs', () => {
  const disconnect = functionSource(engine, 'disconnectMidi', 'function clampInt');
  assert.match(disconnect, /midiSettings\.inputId = selectedInputId/);
  assert.match(disconnect, /midiSettings\.outputId = selectedOutputId/);
  assert.doesNotMatch(disconnect, /selectedInputId = ''|selectedOutputId = ''|midiSettings\.inputId = ''|midiSettings\.outputId = ''/);
  assert.match(disconnect, /\[ENGINE_KEYS\.midiSettings\]: midiSettings/);
  assert.match(disconnect, /\[ENGINE_KEYS\.autoStart\]: false/);
});

test('refreshing devices preserves remembered IDs while a controller is temporarily unavailable', () => {
  const refresh = functionSource(engine, 'refreshDevices', 'function detachInput');
  assert.match(refresh, /midiSettings\.inputId = selectedInputId/);
  assert.match(refresh, /midiSettings\.outputId = selectedOutputId/);
  assert.doesNotMatch(refresh, /if \(!inputs\.some\(\(port\) => port\.id === selectedInputId\)\) selectedInputId = ''/);
  assert.doesNotMatch(refresh, /if \(!outputs\.some\(\(port\) => port\.id === selectedOutputId\)\) selectedOutputId = ''/);
});

test('saving unrelated preferences does not erase a remembered device missing from the current select options', () => {
  const save = functionSource(controller, 'saveMidiSettings');
  assert.match(save, /els\.midiInputSelect\.value \|\| selectedMidiInput \|\| ''/);
  assert.match(save, /els\.midiOutputSelect\.value \|\| selectedMidiOutput \|\| ''/);
});

test('explicit empty device selections clear the saved IDs instead of reviving an older selection', () => {
  const update = functionSource(engine, 'onCommand', 'chrome.runtime.onMessage.addListener');
  assert.match(update, /case 'UPDATE_SETTINGS': \{[\s\S]*?hasOwnProperty\.call\(settings, 'inputId'\)[\s\S]*?selectedInputId = String\(settings\.inputId \|\| ''\)/);
  assert.match(update, /hasOwnProperty\.call\(payload\.midiSettings, 'outputId'\)[\s\S]*?selectedOutputId = String\(payload\.midiSettings\.outputId \|\| ''\)/);
  assert.doesNotMatch(update, /selectedInputId = midiSettings\.inputId \|\| selectedInputId/);
  assert.doesNotMatch(update, /selectedOutputId = midiSettings\.outputId \|\| selectedOutputId/);
});

test('explicitly changing the MIDI input or output still updates the remembered selection', () => {
  assert.match(controller, /midiInputSelect\.addEventListener\('change', async \(\) => \{ selectedMidiInput = els\.midiInputSelect\.value/);
  assert.match(controller, /midiOutputSelect\.addEventListener\('change', async \(\) => \{ selectedMidiOutput = els\.midiOutputSelect\.value/);
});
