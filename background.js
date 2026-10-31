'use strict';

importScripts('shared/soundcraft-page-bridge.js');

const OFFSCREEN_PATH = 'background/offscreen.html';
const SELECTED_MIXER_CONTEXT_KEY = 'openSoundcraftMidiSelectedMixerContext';
const MAPPINGS_KEY = 'openSoundcraftMidiMappings';
const OFFSCREEN_AUTO_START_KEY = 'openSoundcraftMidiEngineEnabled';
let offscreenCreating = null;

async function configureSidePanel() {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    console.error('[Open Soundcraft MIDI] Could not configure the side-panel toggle:', error);
  }
}

async function hasOffscreenDocument() {
  if (typeof chrome.runtime.getContexts === 'function') {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)]
    });
    return contexts.length > 0;
  }
  return false;
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;
  if (offscreenCreating) return offscreenCreating;
  offscreenCreating = (async () => {
    try {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_PATH,
        reasons: ['WORKERS'],
        justification: 'Keep the MIDI device connection and feedback engine running when the visible Side Panel is closed. A dedicated worker decodes MIDI events outside the panel UI.'
      });
    } catch (error) {
      // Another event may have created the document between the context check
      // and createDocument(). Treat that race as success only if it now exists.
      if (!(await hasOffscreenDocument())) throw error;
    }
  })();
  try { await offscreenCreating; }
  finally { offscreenCreating = null; }
}

async function sendEngineCommand(command, payload = {}) {
  await ensureOffscreenDocument();
  const response = await chrome.runtime.sendMessage({ target: 'offscreen-engine', type: 'ENGINE_COMMAND', command, payload });
  if (response && response.ok === false) throw new Error(response.error || `Background MIDI command failed: ${command}`);
  return response?.result;
}

function normalizeError(error) {
  return error?.message || String(error || 'Unknown error');
}

async function selectedMixerTabId() {
  const stored = await chrome.storage.session.get(SELECTED_MIXER_CONTEXT_KEY);
  return Number.isInteger(stored?.[SELECTED_MIXER_CONTEXT_KEY]?.tabId) ? stored[SELECTED_MIXER_CONTEXT_KEY].tabId : null;
}

async function findTabForTarget(target) {
  const sessionTabId = await selectedMixerTabId();
  const candidates = [];
  if (Number.isInteger(target?.tabId)) candidates.push(target.tabId);
  if (Number.isInteger(sessionTabId) && !candidates.includes(sessionTabId)) candidates.push(sessionTabId);
  for (const tabId of candidates) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!tab?.url) continue;
      if (target?.origin) {
        try { if (new URL(tab.url).origin !== target.origin) continue; }
        catch (_) { continue; }
      }
      return tabId;
    } catch (_) { /* Try the pinned mixer tab. */ }
  }
  return null;
}

async function ensureContentScript(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab?.url || !/^https?:/i.test(tab.url)) throw new Error('The selected tab is not an HTTP(S) Mixer page.');
  try {
    const ping = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    if (ping?.ok) return;
  } catch (_) { /* Inject after the optional host permission has been granted. */ }
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content/soundcraft-ui.js'] });
  const ping = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
  if (!ping?.ok) throw new Error('The Mixer content script did not respond.');
}

async function applyMapping(payload) {
  const mapping = payload.mapping;
  if (!mapping?.target) return { ok: false, error: 'The mapping has no target.' };
  const target = mapping.target;
  const tabId = await findTabForTarget(target);
  if (!Number.isInteger(tabId)) return { ok: false, error: 'The selected Mixer tab is no longer available.' };
  if (target.backend === 'web-dom' || target.selector) {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'APPLY_MIDI_MAPPING', mapping, value: payload.value, pressed: payload.pressed,
      language: payload.language || 'de'
    });
    return response || { ok: false, error: 'The Mixer content script returned no response.' };
  }
  const results = await chrome.scripting.executeScript({
    target: { tabId }, world: 'MAIN', func: OpenSoundcraftBackgroundBridge.soundcraftPageBridge,
    args: ['apply', { target, mode: mapping.mode, value: payload.value, pressed: payload.pressed, language: payload.language || 'de' }]
  });
  return results?.[0]?.result || { ok: false, error: 'The Mixer page returned no result.' };
}

async function readTargetValues(payload) {
  const mappings = Array.isArray(payload.mappings) ? payload.mappings : [];
  const groups = new Map();
  for (const mapping of mappings) {
    const target = mapping.target;
    const groupKey = target.origin || `tab:${target.tabId || ''}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(mapping);
  }
  const values = [];
  for (const group of groups.values()) {
    const tabId = await findTabForTarget(group[0].target);
    if (!Number.isInteger(tabId)) continue;
    const widgets = group.filter((mapping) => mapping.target.backend !== 'web-dom' && !mapping.target.selector);
    const dom = group.filter((mapping) => mapping.target.backend === 'web-dom' || mapping.target.selector);
    if (widgets.length) {
      try {
        const result = await chrome.scripting.executeScript({
          target: { tabId }, world: 'MAIN', func: OpenSoundcraftBackgroundBridge.soundcraftPageBridge,
          args: ['values', { targets: widgets.map((mapping) => ({ id: mapping.id, target: mapping.target })), language: payload.language || 'de' }]
        });
        if (Array.isArray(result?.[0]?.result)) values.push(...result[0].result);
      } catch (_) { /* Keep polling other Mixer targets. */ }
    }
    if (dom.length) {
      try {
        const result = await chrome.tabs.sendMessage(tabId, {
          type: 'READ_DOM_VALUES', targets: dom.map((mapping) => ({ id: mapping.id, target: mapping.target }))
        });
        if (Array.isArray(result?.values)) values.push(...result.values);
      } catch (_) { /* Ignore a closed or reloading page. */ }
    }
  }
  return values;
}

function feedbackParameterKey(target) {
  if (!target) return '';
  const direct = target.parameterKey || (target.backend === 'web-parameter' ? target.key : '');
  if (typeof direct === 'string' && /^(?:[ialfsp]\.\d+|m)(?:\.[a-zA-Z0-9_]+)+$/.test(direct)) return direct;
  if (typeof target.key === 'string' && /^(?:[ialfsp]\.\d+|m)(?:\.[a-zA-Z0-9_]+)+$/.test(target.key)) return target.key;
  const prefix = target.channelPrefix || target.ownerName || '';
  const control = target.controlName || target.propertyName || '';
  if (/^(?:[ialfsp]\.\d+\.|m\.)$/.test(prefix) && /^[a-z][a-z0-9_]*$/i.test(control)) return `${prefix}${control}`;
  return '';
}

async function refreshMonitors(payload) {
  const groups = new Map();
  for (const mapping of Array.isArray(payload.mappings) ? payload.mappings : []) {
    if (mapping.enabled === false || !mapping.target || mapping.target.backend === 'web-dom') continue;
    const key = feedbackParameterKey(mapping.target);
    if (!key || !mapping.target.origin) continue;
    if (!groups.has(mapping.target.origin)) groups.set(mapping.target.origin, new Set());
    groups.get(mapping.target.origin).add(key);
  }
  const outcomes = [];
  for (const keys of groups.values()) {
    const sample = (payload.mappings || []).find((mapping) => mapping.target?.origin && feedbackParameterKey(mapping.target) && keys.has(feedbackParameterKey(mapping.target)));
    const tabId = sample ? await findTabForTarget(sample.target) : null;
    if (!Number.isInteger(tabId)) continue;
    try {
      await ensureContentScript(tabId);
      const result = await chrome.scripting.executeScript({
        target: { tabId }, world: 'MAIN', func: OpenSoundcraftBackgroundBridge.installSoundcraftValueMonitor,
        args: [[...keys]]
      });
      outcomes.push(result?.[0]?.result || null);
    } catch (_) { /* The page may still be loading. */ }
  }
  return outcomes;
}

async function inspectTarget(payload) {
  const tabId = payload.tabId;
  const tab = await chrome.tabs.get(tabId);
  if (!tab?.url) throw new Error('The selected Mixer tab is not available.');
  const target = payload.target || {};
  const origin = (() => { try { return new URL(tab.url).origin; } catch (_) { return null; } })();
  if (target.domTarget) {
    const dom = target.domTarget;
    return {
      ok: true,
      target: {
        backend: 'web-dom', origin, pageUrl: tab.url, tabId,
        selector: dom.selector, elementLabel: dom.label,
        widgetName: dom.tagName || 'WebElement', controlName: dom.label || 'control',
        mode: dom.mode || 'toggle', capabilities: [dom.mode || 'toggle'],
        channelName: '', controlLabel: dom.label || 'Web element', label: dom.label || 'Web element'
      }
    };
  }
  const result = await chrome.scripting.executeScript({
    target: { tabId }, world: 'MAIN', func: OpenSoundcraftBackgroundBridge.soundcraftPageBridge,
    args: ['inspect', { pageX: target.pageX, pageY: target.pageY, language: payload.language || 'de' }]
  });
  const picked = result?.[0]?.result;
  if (!picked?.ok || !picked.target) return picked || { ok: false, error: 'No supported Mixer control was found.' };
  return { ok: true, target: { ...picked.target, backend: 'web', tabId, origin: picked.target.origin || origin, pageUrl: picked.target.pageUrl || tab.url } };
}

async function startPicker(payload) {
  const tabId = payload.tabId;
  if (!Number.isInteger(tabId)) throw new Error('No Mixer tab is selected.');
  await ensureContentScript(tabId);
  const response = await chrome.tabs.sendMessage(tabId, { type: 'START_PICKER', language: payload.language || 'de', continuous: true });
  if (!response?.ok) throw new Error('The target picker could not be started.');
  return response;
}

async function cancelPicker(payload) {
  if (!Number.isInteger(payload.tabId)) return { ok: true };
  try { return await chrome.tabs.sendMessage(payload.tabId, { type: 'CANCEL_PICKER' }); }
  catch (_) { return { ok: false, error: 'Mixer tab is not available.' }; }
}

async function handleEngineRpc(operation, payload) {
  switch (operation) {
    case 'STORAGE_GET_LOCAL': return chrome.storage.local.get(payload.keys || null);
    case 'STORAGE_SET_LOCAL': return chrome.storage.local.set(payload.values || {});
    case 'STORAGE_GET_SESSION': return chrome.storage.session.get(payload.keys || null);
    case 'STORAGE_SET_SESSION': return chrome.storage.session.set(payload.values || {});
    case 'APPLY_MAPPING': return applyMapping(payload);
    case 'READ_TARGET_VALUES': return readTargetValues(payload);
    case 'REFRESH_MONITORS': return refreshMonitors(payload);
    case 'INSPECT_TARGET': return inspectTarget(payload);
    case 'START_PICKER': return startPicker(payload);
    case 'CANCEL_PICKER': return cancelPicker(payload);
    default: throw new Error(`Unsupported engine RPC: ${operation}`);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;

  if (message.target === 'background' && message.type === 'ENGINE_COMMAND') {
    sendEngineCommand(message.command, message.payload || {})
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: normalizeError(error) }));
    return true;
  }

  if (message.target === 'background' && message.type === 'ENGINE_RPC') {
    handleEngineRpc(message.operation, message.payload || {})
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: normalizeError(error) }));
    return true;
  }

  if (message.type === 'TARGET_PICKED' && sender?.tab?.id !== undefined) {
    sendEngineCommand('TARGET_PICKED', {
      message,
      tabId: sender.tab.id,
      url: sender.tab.url || ''
    }).then((result) => sendResponse({ ok: true, result }))
      .catch((error) => {
        console.warn('[Open Soundcraft MIDI] Could not route picked target:', error);
        sendResponse({ ok: false, error: normalizeError(error) });
      });
    return true;
  }

  if (message.type === 'PICKER_CANCELLED') {
    sendEngineCommand('PICKER_CANCELLED')
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: normalizeError(error) }));
    return true;
  }

  if (message.type === 'MIXER_PARAMETER_CHANGED' && typeof message.key === 'string') {
    sendEngineCommand('PARAMETER_CHANGED', message)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: normalizeError(error) }));
    return true;
  }

  if (message.type === 'MIDI_PERMISSION_GRANTED') {
    // Permission page persists the grant; keep a broadcast for an open panel.
    return false;
  }

  return false;
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  const updates = {};
  if (changes[MAPPINGS_KEY]) updates.mappings = changes[MAPPINGS_KEY].newValue || [];
  if (changes.openSoundcraftMidiMidiSettings) updates.midiSettings = changes.openSoundcraftMidiMidiSettings.newValue || {};
  if (changes.openSoundcraftMidiLanguage) updates.language = changes.openSoundcraftMidiLanguage.newValue || 'de';
  if (Object.keys(updates).length) {
    void sendEngineCommand('SYNC_STATE', updates).catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void (async () => {
    const stored = await chrome.storage.session.get(SELECTED_MIXER_CONTEXT_KEY);
    if (stored?.[SELECTED_MIXER_CONTEXT_KEY]?.tabId === tabId) {
      await chrome.storage.session.remove(SELECTED_MIXER_CONTEXT_KEY);
      await sendEngineCommand('TAB_REMOVED', { tabId }).catch(() => {});
    }
  })();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url && changeInfo.status !== 'complete') return;
  void (async () => {
    const stored = await chrome.storage.session.get(SELECTED_MIXER_CONTEXT_KEY);
    if (stored?.[SELECTED_MIXER_CONTEXT_KEY]?.tabId !== tabId) return;
    let context = null;
    try {
      if (tab?.url && /^https?:/i.test(tab.url)) context = { tabId, url: tab.url, title: tab.title || tab.url, origin: new URL(tab.url).origin };
    } catch (_) { /* Ignore invalid tab URLs. */ }
    if (context) await chrome.storage.session.set({ [SELECTED_MIXER_CONTEXT_KEY]: context });
    await sendEngineCommand('TAB_UPDATED', { tabId, context }).catch(() => {});
  })();
});

async function restoreBackgroundEngine() {
  try {
    const saved = await chrome.storage.local.get(OFFSCREEN_AUTO_START_KEY);
    if (saved?.[OFFSCREEN_AUTO_START_KEY] === true) {
      // Creating the document restores the engine; midi-engine.js reads the
      // persisted auto-start flag and reconnects after its state is loaded.
      await ensureOffscreenDocument();
    }
  } catch (error) {
    console.warn('[Open Soundcraft MIDI] Could not restore background MIDI engine:', error);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void configureSidePanel();
  void restoreBackgroundEngine();
});
chrome.runtime.onStartup.addListener(() => {
  void configureSidePanel();
  void restoreBackgroundEngine();
});
void configureSidePanel();
