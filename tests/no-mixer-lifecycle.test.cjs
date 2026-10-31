'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const background = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'background/midi-engine.js'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'controller/controller.js'), 'utf8');

test('Offscreen engine is created only when an explicitly selected Mixer tab exists', () => {
  assert.match(background, /async function hasSelectedMixerContext\(\)/);
  assert.match(background, /if \(!\(await hasSelectedMixerContext\(\)\)\) return false/);
  assert.match(background, /const engineAvailable = await ensureOffscreenDocument\(\)/);
  assert.match(background, /if \(command === 'CONNECT'\) throw new Error/);
});

test('The Side Panel leaves selected-tab storage cleanup to the Service Worker', () => {
  const removedStart = controller.indexOf("chrome.tabs.onRemoved.addListener");
  const removedHandler = controller.slice(removedStart, controller.indexOf('\n});', removedStart));
  assert.doesNotMatch(removedHandler, /storage\.session\.remove\(SELECTED_MIXER_CONTEXT_KEY\)/);
  const updatedStart = controller.indexOf("chrome.tabs.onUpdated.addListener");
  const updatedHandler = controller.slice(updatedStart, controller.indexOf("window.addEventListener('focus'", updatedStart));
  assert.doesNotMatch(updatedHandler, /storage\.session\.remove\(SELECTED_MIXER_CONTEXT_KEY\)/);
  assert.match(updatedHandler, /new URL\(context\.url\)\.origin === new URL\(selectedMixerContext\.url\)\.origin/);
});

test('Closing the selected Mixer stops the Offscreen Document', () => {
  const removedHandler = background.slice(background.indexOf('chrome.tabs.onRemoved.addListener'), background.indexOf('chrome.tabs.onUpdated.addListener'));
  assert.match(removedHandler, /storage\.session\.remove\(SELECTED_MIXER_CONTEXT_KEY\)/);
  assert.match(removedHandler, /closeOffscreenDocumentIfNoMixer\(\)/);
  assert.match(background, /await chrome\.offscreen\.closeDocument\(\)/);
  assert.match(background, /areaName === 'session'[\s\S]*?closeOffscreenDocumentIfNoMixer\(\)/);
});

test('Navigating the selected Mixer tab away from HTTP(S) also stops the engine', () => {
  const updatedHandler = background.slice(background.indexOf('chrome.tabs.onUpdated.addListener'), background.indexOf('async function restoreBackgroundEngine'));
  assert.match(updatedHandler, /if \(context\)/);
  assert.match(updatedHandler, /else \{/);
  assert.match(updatedHandler, /storage\.session\.remove\(SELECTED_MIXER_CONTEXT_KEY\)/);
  assert.match(updatedHandler, /closeOffscreenDocumentIfNoMixer\(\)/);
  assert.match(updatedHandler, /nextUrl\.origin === previousOrigin/);
});

test('Startup does not restore MIDI runtime without a live selected Mixer tab', () => {
  const restore = background.slice(background.indexOf('async function restoreBackgroundEngine'), background.indexOf("chrome.runtime.onInstalled.addListener"));
  assert.match(restore, /chrome\.tabs\.get\(context\.tabId\)/);
  assert.match(restore, /if \(!mixerTabAvailable\)/);
  assert.match(restore, /currentOrigin === previousOrigin/);
  assert.match(restore, /await closeOffscreenDocumentIfNoMixer\(\)/);
  assert.match(restore, /if \(saved\?\.\[OFFSCREEN_AUTO_START_KEY\] === true\)/);
});

test('Closing the Mixer publishes a disconnected status to an already-open Side Panel', () => {
  assert.match(background, /target: 'panel', type: 'ENGINE_STATUS', connected: false, state: 'idle'/);
  assert.match(background, /Selected Mixer is no longer available\. Background MIDI engine stopped\./);
});

test('MIDI output feedback uses short fallback polling while the Side Panel stays closed', () => {
  assert.match(engine, /pollFeedback\(\); \}, 250\)/);
  assert.match(engine, /refreshMonitors\(\); \}, 1000\)/);
});
