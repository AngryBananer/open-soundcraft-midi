'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const manifest = require('../manifest.json');

test('mixer website permissions are optional and no website script runs automatically', () => {
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.optional_host_permissions, ['http://*/*', 'https://*/*']);
  assert.equal(manifest.content_scripts, undefined);
});
