'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'controller/controller.html'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'controller/controller.js'), 'utf8');
const background = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'background/midi-engine.js'), 'utf8');

test('mixer selection UI contains no editable URL or mixer-tab dropdown', () => {
  assert.match(html, /id="openMixerBtn"/);
  assert.match(html, /id="mixerContextStatus"/);
  assert.doesNotMatch(html, /id="mixerAddressInput"|id="mixerTabSelect"|id="refreshTabsBtn"/);
});

test('mapping type controls are inferred and not exposed as dropdowns', () => {
  assert.doesNotMatch(html, /id="mappingModeSelect"|id="parameterModeSelect"/);
  assert.doesNotMatch(controller, /els\.mappingModeSelect|els\.parameterModeSelect/);
  // The currently-learned pending target's mode is inferred where MIDI Learn
  // actually runs: the background Offscreen engine.
  assert.match(engine, /resolveTargetMode\(pendingTarget/);
  assert.match(controller, /inferParameterMode\(key\)/);
  assert.doesNotMatch(controller, /const mode = document\.createElement\('select'\)/);
});

test('picked mixer widgets store their own fixed browser tab ID', () => {
  // Target inspection (DOM targets and in-page widget targets) runs in the
  // background Service Worker, which stamps the resolved tab ID onto the
  // returned target so later MIDI Learn/apply calls are sent to that same tab.
  assert.match(background, /async function inspectTarget\(payload\)/);
  assert.match(background, /backend: 'web-dom', origin, pageUrl: tab\.url, tabId,/);
  assert.match(background, /target: \{ \.\.\.picked\.target, backend: 'web', tabId,/);
  assert.match(controller, /async function findTabForTarget\(target\)/);
});
