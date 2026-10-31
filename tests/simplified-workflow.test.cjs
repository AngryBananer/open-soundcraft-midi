'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'controller/controller.html'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'controller/controller.js'), 'utf8');

test('mixer selection UI contains no editable URL or mixer-tab dropdown', () => {
  assert.match(html, /id="openMixerBtn"/);
  assert.match(html, /id="mixerContextStatus"/);
  assert.doesNotMatch(html, /id="mixerAddressInput"|id="mixerTabSelect"|id="refreshTabsBtn"/);
});

test('mapping type controls are inferred and not exposed as dropdowns', () => {
  assert.doesNotMatch(html, /id="mappingModeSelect"|id="parameterModeSelect"/);
  assert.doesNotMatch(controller, /els\.mappingModeSelect|els\.parameterModeSelect/);
  assert.match(controller, /resolveTargetMode\(pendingTarget/);
  assert.match(controller, /inferParameterMode\(key\)/);
  assert.doesNotMatch(controller, /const mode = document\.createElement\('select'\)/);
});

test('picked mixer widgets store their own fixed browser tab ID', () => {
  assert.match(controller, /backend: 'web-dom',[\s\S]*?tabId, selector/);
  assert.match(controller, /pendingTarget\.tabId = tabId/);
  assert.match(controller, /async function findTabForTarget\(target\)/);
});
