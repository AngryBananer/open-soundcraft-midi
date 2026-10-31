'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mode = require('../shared/mapping-mode.js');

test('direct Soundcraft value parameters infer fader mappings', () => {
  for (const key of ['i.7.mix', 'i.7.aux.0.value', 'a.0.mix', 'i.2.gain', 'i.4.pan']) {
    assert.equal(mode.inferParameterMode(key), 'fader', key);
  }
});

test('boolean Soundcraft parameters infer toggle mappings', () => {
  for (const key of ['i.7.mute', 'i.7.solo', 'i.3.phantom', 'i.1.bypass', 'i.2.stereo']) {
    assert.equal(mode.inferParameterMode(key), 'toggle', key);
  }
});

test('invalid direct parameter names are rejected', () => {
  assert.equal(mode.inferParameterMode('edge://settings'), null);
  assert.equal(mode.inferParameterMode('i.7'), null);
  assert.equal(mode.inferParameterMode(''), null);
});

test('target mode comes from the selected mixer control, not a UI selector', () => {
  assert.equal(mode.resolveTargetMode({ mode: 'fader' }), 'fader');
  assert.equal(mode.resolveTargetMode({ mode: 'toggle' }), 'toggle');
  assert.equal(mode.resolveTargetMode({ backend: 'web-parameter', key: 'i.7.mute' }), 'toggle');
  assert.equal(mode.resolveTargetMode({ widgetName: 'Slider' }), 'fader');
});
