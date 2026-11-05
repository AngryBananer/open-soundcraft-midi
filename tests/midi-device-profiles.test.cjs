'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const profiles = require('../shared/midi-device-profiles.js');

test('AKAI APC mini MK2 name selects its device-specific LED profile', () => {
  assert.equal(profiles.detectFeedbackProfile({ name: 'APC mini mk2', manufacturer: 'Akai Professional' }), 'apc-mini-mk2');
});

test('APC mini MK2 MIDI port names with OS prefixes are detected', () => {
  assert.equal(profiles.detectFeedbackProfile({ name: 'MIDIIN2 (APC mini mk2)', manufacturer: 'AKAI' }, 'toggle'), 'apc-mini-mk2');
  assert.equal(profiles.detectFeedbackProfile({ name: 'MIDIIN2 (APC mini mk2)', manufacturer: 'AKAI' }, 'fader'), 'generic');
});

test('APC mini MK2 names with punctuation variations are detected', () => {
  assert.equal(profiles.detectFeedbackProfile({ name: 'APC-mini-MK2 MIDI 1' }, 'toggle'), 'apc-mini-mk2');
});

test('other devices and missing outputs use the generic profile', () => {
  assert.equal(profiles.detectFeedbackProfile({ name: 'Launchkey Mini MK3', manufacturer: 'Novation' }), 'generic');
  assert.equal(profiles.detectFeedbackProfile(null), 'generic');
  assert.equal(profiles.detectFeedbackProfile(undefined), 'generic');
});


test('background MIDI Learn detects LED profile from its selected MIDI output', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const engine = fs.readFileSync(path.join(__dirname, '..', 'background', 'midi-engine.js'), 'utf8');
  const learnStart = engine.indexOf('async function createLearnedMapping(message)');
  const learnEnd = engine.indexOf('\nasync function applyMapping', learnStart);
  assert.notEqual(learnStart, -1);
  assert.ok(learnEnd > learnStart);
  const learn = engine.slice(learnStart, learnEnd);
  assert.match(learn, /midiDeviceProfiles\?\.detectFeedbackProfile\(output, mode\) \|\| 'generic'/);
  assert.match(learn, /profile, channel: message.channel/);
  assert.match(engine, /const midiDeviceProfiles = window\.OpenSoundcraftMidiDeviceProfiles/);
});

test('profile registry exposes localized labels and device-independent UI capabilities', () => {
  const german = profiles.getFeedbackProfiles('de');
  const english = profiles.getFeedbackProfiles('en');
  const genericDe = german.find((profile) => profile.id === 'generic');
  const apcDe = german.find((profile) => profile.id === 'apc-mini-mk2');
  const apcEn = english.find((profile) => profile.id === 'apc-mini-mk2');
  assert.equal(genericDe.label, 'Generisches MIDI');
  assert.equal(genericDe.ui.showOutputChannel, true);
  assert.deepEqual(genericDe.capabilities, { buttonFeedback: true, faderFeedback: true });
  assert.equal(genericDe.ui.showColorControls, false);
  assert.equal(apcDe.label, 'AKAI APC mini MK2');
  assert.equal(apcDe.ui.showOutputChannel, false);
  assert.deepEqual(apcDe.capabilities, { buttonFeedback: true, faderFeedback: false });
  assert.equal(apcDe.ui.showColorControls, true);
  assert.match(apcDe.ui.hint.de, /RGB-Pads/);
  assert.match(apcEn.ui.hint.en, /RGB pads/);
});

test('generic profile creates standard Note On and CC feedback without device knowledge in the engine', () => {
  assert.deepEqual(profiles.createButtonFeedbackMessage('generic', {
    number: 12, active: true, settings: { channel: 2, kind: 'note' }, fallbackChannel: 0, fallbackKind: 'note'
  }), { bytes: [0x92, 12, 127], cacheLabel: 'note:2' });
  assert.deepEqual(profiles.createButtonFeedbackMessage('generic', {
    number: 7, active: false, settings: { channel: 4, kind: 'cc' }, fallbackChannel: 0, fallbackKind: 'note'
  }), { bytes: [0xb4, 7, 0], cacheLabel: 'cc:4' });
});

test('APC profile adapter delegates LED message generation to its hardware module', () => {
  assert.deepEqual(profiles.createButtonFeedbackMessage('apc-mini-mk2', {
    number: 63,
    active: true,
    settings: { activeColor: '#FF0000', inactiveColor: '#000000' }
  }), { bytes: [0x96, 63, 5], cacheLabel: 'apc-mini-mk2' });
});

test('unknown profile IDs safely use the generic feedback profile', () => {
  assert.deepEqual(profiles.createButtonFeedbackMessage('not-a-real-device', {
    number: 1, active: true, settings: {}, fallbackChannel: 0, fallbackKind: 'note'
  }), { bytes: [0x90, 1, 127], cacheLabel: 'note:0' });
});


test('profile selector only offers profiles compatible with the mapping type', () => {
  const faderProfiles = profiles.getFeedbackProfiles('de', 'fader');
  const buttonProfiles = profiles.getFeedbackProfiles('de', 'toggle');
  assert.deepEqual(faderProfiles.map((profile) => profile.id), ['generic']);
  assert.deepEqual(buttonProfiles.map((profile) => profile.id), ['generic', 'apc-mini-mk2']);
  assert.equal(profiles.supportsFeedbackMode('apc-mini-mk2', 'fader'), false);
  assert.equal(profiles.supportsFeedbackMode('apc-mini-mk2', 'toggle'), true);
  assert.equal(profiles.supportsFeedbackMode('generic', 'fader'), true);
});

test('APC output is auto-selected only for button mappings', () => {
  const output = { name: 'APC mini mk2', manufacturer: 'Akai Professional' };
  assert.equal(profiles.detectFeedbackProfile(output, 'toggle'), 'apc-mini-mk2');
  assert.equal(profiles.detectFeedbackProfile(output, 'fader'), 'generic');
});
