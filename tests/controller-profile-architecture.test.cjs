'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const engine = fs.readFileSync(path.join(root, 'background/midi-engine.js'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'controller/controller.js'), 'utf8');
const controllerHtml = fs.readFileSync(path.join(root, 'controller/controller.html'), 'utf8');
const offscreenHtml = fs.readFileSync(path.join(root, 'background/offscreen.html'), 'utf8');
const profileGuide = fs.readFileSync(path.join(root, 'docs/ADDING_MIDI_CONTROLLERS.md'), 'utf8');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

test('generic MIDI engine delegates button feedback to the profile API', () => {
  assert.match(engine, /midiDeviceProfiles\?\.createButtonFeedbackMessage\?\./);
  assert.doesNotMatch(engine, /apc-mini-mk2|OpenSoundcraftMidiApc|AKAI|0x96/);
});

test('generic Side Panel renders device profile options and capabilities from metadata', () => {
  assert.match(controller, /getFeedbackProfiles\?\.\(currentLanguage, mapping\.mode\)/);
  assert.match(controller, /profileLabel\.hidden = availableProfiles\.length <= 1/);
  assert.match(controller, /supportsFeedbackMode/);
  assert.match(controller, /getFeedbackProfile\?\./);
  assert.match(controller, /selectedProfileUi\.showColorControls/);
  assert.match(controller, /selectedProfileUi\.showOutputChannel/);
  assert.doesNotMatch(controller, /apc-mini-mk2|feedbackApc|AKAI APC|feedback-apc-hint/);
});

test('hardware module loads before the profile registry in both runtime pages', () => {
  for (const html of [controllerHtml, offscreenHtml]) {
    const hardwareIndex = html.indexOf('shared/apc-mini-mk2.js');
    const registryIndex = html.indexOf('shared/midi-device-profiles.js');
    assert.ok(hardwareIndex >= 0 && registryIndex > hardwareIndex);
  }
});

test('controller extension guide documents the profile API and end-to-end verification workflow', () => {
  for (const phrase of [
    'Profile API',
    'createButtonFeedbackMessage',
    'Step-by-step: add a device',
    'hardware',
    'Run all checks',
    'Rules for AI coding agents'
  ]) assert.ok(profileGuide.includes(phrase), `guide should include ${phrase}`);
  assert.match(readme, /docs\/ADDING_MIDI_CONTROLLERS\.md/);
});

test('saved and imported mappings replace a feedback profile that does not support their mode', () => {
  const loadStart = controller.indexOf('async function loadMappings()');
  const importStart = controller.indexOf('async function importMappingsFile(file)');
  assert.notEqual(loadStart, -1);
  assert.notEqual(importStart, -1);
  const loadSource = controller.slice(loadStart, controller.indexOf('\nfunction cancelLearn()', loadStart));
  const importSource = controller.slice(importStart, controller.indexOf('\nchrome.storage.onChanged.addListener', importStart));
  assert.match(loadSource, /supportsFeedbackMode\(mapping\.feedback\.profile, mapping\.mode\)/);
  assert.ok(loadSource.indexOf('mapping.mode = mappingModeUtils') < loadSource.indexOf('supportsFeedbackMode'));
  assert.match(importSource, /supportsFeedbackMode\(mapping\.feedback\.profile, mapping\.mode\)/);
});
