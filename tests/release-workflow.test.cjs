'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/release-beta.yml'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

test('release workflow accepts stable and prerelease version tags and supports manual reruns', () => {
  assert.match(workflow, /tags:\s*\n\s*- 'v\*'/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /prerelease:\s*\$\{\{ contains\(github\.ref_name, '-'\) \}\}/);
});

test('current stable version is consistent across extension metadata', () => {
  assert.equal(packageJson.version, '0.6.0');
  assert.equal(manifest.version, packageJson.version);
  assert.equal(manifest.version_name, packageJson.version);
});

test('release workflow rejects a tag that does not match package and manifest versions', () => {
  assert.match(workflow, /TAG_VERSION=/);
  assert.match(workflow, /PACKAGE_VERSION=/);
  assert.match(workflow, /MANIFEST_VERSION=/);
  assert.match(workflow, /does not match package\.json/);
  assert.match(workflow, /does not match manifest\.json/);
});
