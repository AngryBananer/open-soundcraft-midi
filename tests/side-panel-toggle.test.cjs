'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const background = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'controller/controller.html'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'controller/controller.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

test('toolbar icon uses the browser-native open/close toggle for the Side Panel', () => {
  assert.match(background, /setPanelBehavior\(\{\s*openPanelOnActionClick:\s*true\s*\}\)/);
  assert.doesNotMatch(background, /chrome\.action\.onClicked/);
  assert.equal(manifest.action.default_title, 'Open / close Open Soundcraft MIDI sidebar');
});

test('controller remains configured as the browser Side Panel page', () => {
  assert.equal(manifest.side_panel.default_path, 'controller/controller.html');
  assert.ok(manifest.permissions.includes('sidePanel'));
});

test('the misleading in-panel settings-collapse control is removed', () => {
  assert.doesNotMatch(html, /settingsToggleBtn|settingsSummary/);
  assert.doesNotMatch(controller, /setSettingsHidden|applySettingsVisibility|SETTINGS_HIDDEN_KEY/);
});

test('the normal controller settings remain available whenever the Side Panel is open', () => {
  for (const id of ['midiSettingsCard', 'mixerSettingsCard', 'mappingsSettingsCard']) {
    assert.match(html, new RegExp(`id=\"${id}\"`));
  }
});
