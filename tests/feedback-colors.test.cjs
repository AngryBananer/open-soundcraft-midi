'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const colors = require('../shared/feedback-colors.js');

test('feedback color values are normalized and invalid values use defaults', () => {
  assert.deepEqual(colors.normalizeColors({ activeColor: '#ff3300', inactiveColor: 'bad' }), {
    activeColor: '#FF3300',
    inactiveColor: '#000000'
  });
});

test('latest selected active and inactive colors become defaults for new mappings', () => {
  const latest = colors.latestColorsFromMappings([
    { feedback: { activeColor: '#FF0000', inactiveColor: '#101010' } },
    { feedback: { activeColor: '#00AAFF' } }
  ]);
  assert.deepEqual(latest, { activeColor: '#00AAFF', inactiveColor: '#101010' });
});

test('empty mapping profiles use the standard color defaults', () => {
  assert.deepEqual(colors.latestColorsFromMappings([]), {
    activeColor: '#00FF00', inactiveColor: '#000000'
  });
});

test('last-used colors are available as normalized values for a new mapping', () => {
  const prefs = colors.normalizeColors({ activeColor: '#abc123', inactiveColor: '#987654' });
  assert.deepEqual(prefs, { activeColor: '#ABC123', inactiveColor: '#987654' });
});
