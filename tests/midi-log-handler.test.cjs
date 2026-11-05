'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const controller = fs.readFileSync(path.join(root, 'controller/controller.js'), 'utf8');

function createElement(tagName) {
  const element = {
    tagName,
    className: '',
    textContent: '',
    children: [],
    append(child) { this.children.push(child); },
    prepend(child) { this.children.unshift(child); },
    remove() {
      if (!this.parent) return;
      const index = this.parent.children.indexOf(this);
      if (index >= 0) this.parent.children.splice(index, 1);
    }
  };
  Object.defineProperty(element, 'lastElementChild', {
    get() {
      const child = this.children[this.children.length - 1] || null;
      if (child) child.parent = this;
      return child;
    }
  });
  return element;
}

function loadAddLog(midiLog) {
  const match = controller.match(/function addLog\(description, raw = \[\]\) \{[\s\S]*?\n\}/);
  assert.ok(match, 'controller must define addLog');
  const document = { createElement };
  return vm.runInNewContext(`${match[0]}\naddLog;`, {
    els: { midiLog },
    document,
    ArrayBuffer
  });
}

test('MIDI event handler calls a defined addLog helper', () => {
  assert.match(controller, /addLog\(description, message\.message\?\.raw \|\| \[\]\);/);
});

test('MIDI log safely displays descriptions and raw bytes in hexadecimal', () => {
  const midiLog = createElement('div');
  const addLog = loadAddLog(midiLog);

  addLog('<device message>', [0x90, 0x2a, 0x7f]);

  assert.equal(midiLog.children.length, 1);
  const row = midiLog.children[0];
  assert.equal(row.className, 'log-row');
  assert.equal(row.children[0].textContent, '<device message>');
  assert.equal(row.children[1].textContent, '0x90 0x2A 0x7F');
});

test('MIDI log accepts typed byte arrays and retains only the latest 12 messages', () => {
  const midiLog = createElement('div');
  const addLog = loadAddLog(midiLog);

  addLog('Typed', new Uint8Array([0xb0, 0x07, 0x40]));
  assert.equal(midiLog.children[0].children[1].textContent, '0xB0 0x07 0x40');

  for (let index = 0; index < 15; index += 1) addLog(`Message ${index}`, []);
  assert.equal(midiLog.children.length, 12);
  assert.equal(midiLog.children[0].children[0].textContent, 'Message 14');
});
