'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'controller', 'controller.js'), 'utf8');
const start = source.indexOf('function installSoundcraftValueMonitor(');
const end = source.indexOf('\nconst $ =', start);
assert.notEqual(start, -1, 'installSoundcraftValueMonitor must exist');
assert.notEqual(end, -1, 'monitor function end marker must exist');
const monitorSource = source.slice(start, end).trim();

function createMonitorFixture() {
  const values = { 'i.7.mix': 0.25, 'i.7.mute': 0 };
  const messages = [];
  const windowMock = {
    location: { origin: 'http://10.10.2.1' },
    postMessage(message) { messages.push(message); },
    getValue(key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
    setValue(key, value) { values[key] = value; },
    setValueX(key, value) { values[key] = value; },
    putValue(key, value) { values[key] = value; }
  };
  const install = vm.runInNewContext(`(${monitorSource})`, { window: windowMock, Array, Set, Object, String });
  return { windowMock, install, messages, values };
}

test('Soundcraft value monitor pushes local and remote parameter changes to the extension', () => {
  const { windowMock, install, messages, values } = createMonitorFixture();
  const result = install(['i.7.mix', 'i.7.mute']);
  assert.equal(result.ok, true);
  assert.ok(result.installed.includes('setValue'));
  assert.ok(result.installed.includes('putValue'));
  assert.ok(result.installed.includes('setValueX'));

  messages.length = 0;
  windowMock.setValue('i.7.mix', 0.75);
  windowMock.putValue('i.7.mute', 1);
  assert.equal(values['i.7.mix'], 0.75);
  assert.equal(values['i.7.mute'], 1);
  assert.ok(messages.some((message) => message.key === 'i.7.mix' && message.value === 0.75));
  assert.ok(messages.some((message) => message.key === 'i.7.mute' && message.value === 1));
});

test('Soundcraft value monitor ignores unwatched parameters and does not double-wrap functions', () => {
  const { windowMock, install, messages } = createMonitorFixture();
  const first = install(['i.7.mix']);
  const second = install(['i.7.mix']);
  assert.deepEqual(second.installed, first.installed);
  messages.length = 0;
  windowMock.putValue('i.8.mix', 0.9);
  assert.equal(messages.length, 0);
  windowMock.setValueX('i.7.mix', 0.5);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].key, 'i.7.mix');
});
