'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const tabContext = require('../shared/mixer-tab-context.js');

function createEvent() {
  const listeners = [];
  return { listeners, addListener(listener) { listeners.push(listener); }, fire(...args) { for (const listener of listeners) listener(...args); } };
}

test('tab context normalizes HTTP URLs and retains tab identity', () => {
  assert.equal(tabContext.normalizeHttpUrl('http://10.10.2.1/mixer?view=main#channel-4'), 'http://10.10.2.1/mixer?view=main');
  assert.deepEqual(tabContext.fromTab({ id: 31, windowId: 8, url: 'https://mixer.example/ui#top', title: 'Soundcraft Ui' }), {
    tabId: 31, windowId: 8, url: 'https://mixer.example/ui', title: 'Soundcraft Ui'
  });
});

test('browser-internal and credential-bearing URLs are rejected', () => {
  assert.equal(tabContext.normalizeHttpUrl('edge://settings'), null);
  assert.equal(tabContext.normalizeHttpUrl('chrome-extension://abc/page.html'), null);
  assert.equal(tabContext.normalizeHttpUrl('file:///tmp/mixer.html'), null);
  assert.equal(tabContext.normalizeHttpUrl('http://user:pass@10.10.2.1'), null);
});

test('toolbar action is configured as a native Side Panel open/close toggle', () => {
  const background = fs.readFileSync(require.resolve('../background.js'), 'utf8');
  assert.match(background, /setPanelBehavior\(\{\s*openPanelOnActionClick:\s*true\s*\}\)/);
  assert.match(background, /chrome\.offscreen\.createDocument/);
});

test('controller pins the active tab only from the explicit mixer button', () => {
  const source = fs.readFileSync(require.resolve('../controller/controller.js'), 'utf8');
  assert.match(source, /chrome\.tabs\.query\(\{\s*active:\s*true,\s*lastFocusedWindow:\s*true\s*\}\)/);
  assert.match(source, /async function useCurrentTabAsMixer\(\)/);
  assert.match(source, /chrome\.permissions\.request\(\{ origins: \[originPattern\] \}\)/);
  assert.match(source, /SELECTED_MIXER_CONTEXT_KEY/);
  assert.doesNotMatch(source, /mixerTabSelect/);
  assert.doesNotMatch(source, /syncMixerAddressFromActiveTab/);
});
