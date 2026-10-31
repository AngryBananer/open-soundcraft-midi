'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const profiles = require('../shared/midi-device-profiles.js');

test('AKAI APC mini MK2 name selects its device-specific LED profile', () => {
  assert.equal(profiles.detectFeedbackProfile({ name: 'APC mini mk2', manufacturer: 'Akai Professional' }), 'apc-mini-mk2');
});

test('APC mini MK2 MIDI port names with OS prefixes are detected', () => {
  assert.equal(profiles.detectFeedbackProfile({ name: 'MIDIIN2 (APC mini mk2)', manufacturer: 'AKAI' }), 'apc-mini-mk2');
});

test('APC mini MK2 names with punctuation variations are detected', () => {
  assert.equal(profiles.detectFeedbackProfile({ name: 'APC-mini-MK2 MIDI 1' }), 'apc-mini-mk2');
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
  assert.match(learn, /midiDeviceProfiles\?\.detectFeedbackProfile\(output\) \|\| 'generic'/);
  assert.match(learn, /profile, channel: message.channel/);
  assert.match(engine, /const midiDeviceProfiles = window\.OpenSoundcraftMidiDeviceProfiles/);
});
