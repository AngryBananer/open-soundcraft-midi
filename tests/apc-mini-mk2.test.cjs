'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const apc = require('../shared/apc-mini-mk2.js');

test('APC mini mk2 sends an exact solid red RGB pad message', () => {
  assert.deepEqual(apc.ledMessage(0, true, '#FF0000', '#000000'), [0x96, 0x00, 0x05]);
});

test('APC mini mk2 sends custom RGB values for matrix pads', () => {
  assert.deepEqual(apc.ledMessage(63, true, '#00FF00', '#000000'), [0x96, 63, 21]);
  assert.deepEqual(apc.ledMessage(63, false, '#00FF00', '#000000'), [0x96, 63, 0]);
});

test('peripheral Track and Scene buttons use their fixed-color on/off protocol', () => {
  assert.deepEqual(apc.ledMessage(0x64, true, '#0000FF', '#FFFFFF'), [0x90, 0x64, 0x01]);
  assert.deepEqual(apc.ledMessage(0x77, false, '#0000FF', '#FFFFFF'), [0x90, 0x77, 0x00]);
});

test('custom colors are mapped to the nearest supported APC palette velocity', () => {
  assert.equal(apc.nearestPaletteVelocity('#FF0000'), 5);
  assert.equal(apc.nearestPaletteVelocity('#00FF00'), 21);
  assert.equal(apc.PALETTE.length, 128);
});
