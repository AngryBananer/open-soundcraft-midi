const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'content', 'soundcraft-ui.js'),
  'utf8'
);

function createContext(sendMessage) {
  const windowListeners = new Map();
  const documentListeners = new Map();
  const window = {
    addEventListener(type, handler) {
      const handlers = windowListeners.get(type) || [];
      handlers.push(handler);
      windowListeners.set(type, handlers);
    }
  };
  const document = {
    addEventListener(type, handler) {
      const handlers = documentListeners.get(type) || [];
      handlers.push(handler);
      documentListeners.set(type, handlers);
    },
    getElementById() { return null; },
    querySelectorAll() { return []; },
    documentElement: { style: {}, append() {} },
    body: {}
  };
  const chrome = {
    runtime: {
      id: 'test-extension-id',
      sendMessage,
      onMessage: { addListener() {} }
    }
  };
  const context = {
    window,
    document,
    chrome,
    location: { origin: 'http://10.10.2.1' },
    console,
    Promise,
    setTimeout,
    clearTimeout
  };
  vm.runInNewContext(source, context, { filename: 'soundcraft-ui.js' });
  return { window, windowListeners };
}

test('content script catches synchronous Extension context invalidated errors', () => {
  let calls = 0;
  const { window, windowListeners } = createContext(() => {
    calls += 1;
    throw new Error('Uncaught Error: Extension context invalidated.');
  });
  const handler = windowListeners.get('message')[0];
  const event = {
    source: window,
    data: {
      source: 'open-soundcraft-midi-page-bridge',
      type: 'PARAMETER_CHANGED',
      key: 'i.1.mix',
      value: 0.5
    }
  };

  assert.doesNotThrow(() => handler(event));
  assert.doesNotThrow(() => handler(event));
  assert.equal(calls, 1, 'stale content script should stop messaging after invalidation');
});

test('content script still sends parameter updates when extension context is valid', async () => {
  const sent = [];
  const { window, windowListeners } = createContext((message) => {
    sent.push(message);
    return Promise.resolve({ ok: true });
  });
  const handler = windowListeners.get('message')[0];
  handler({
    source: window,
    data: {
      source: 'open-soundcraft-midi-page-bridge',
      type: 'PARAMETER_CHANGED',
      key: 'i.2.mix',
      value: 0.75
    }
  });
  await Promise.resolve();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, 'MIXER_PARAMETER_CHANGED');
  assert.equal(sent[0].key, 'i.2.mix');
  assert.equal(sent[0].value, 0.75);
});
