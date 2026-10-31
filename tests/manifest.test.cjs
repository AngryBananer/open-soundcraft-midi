'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const manifest = require('../manifest.json');

test('mixer website permissions are optional and no website script runs automatically', () => {
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.optional_host_permissions, ['http://*/*', 'https://*/*']);
  assert.equal(manifest.content_scripts, undefined);
});

test('toolbar action enables the native Side Panel toggle; mixer selection is explicit in the panel', () => {
  assert.ok(manifest.permissions.includes('sidePanel'));
  assert.equal(manifest.side_panel.default_path, 'controller/controller.html');
  assert.ok(Number(manifest.minimum_chrome_version) >= 116, 'Side Panel API is supported by the declared Chromium minimum');
  assert.equal(manifest.action.default_title, 'Open / close Open Soundcraft MIDI sidebar');
});
