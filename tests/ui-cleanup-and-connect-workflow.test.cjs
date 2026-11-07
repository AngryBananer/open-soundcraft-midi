'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'controller/controller.html'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'controller/controller.js'), 'utf8');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

test('the three main interface sections are independently collapsible', () => {
  for (const id of ['midiSettingsCard', 'mixerSettingsCard', 'mappingsSettingsCard']) {
    assert.match(html, new RegExp(`<details id="${id}" class="card section-card"`));
    const sectionStart = html.indexOf(`<details id="${id}"`);
    assert.match(html.slice(sectionStart, sectionStart + 500), /<summary class="section-summary">/);
  }
  assert.match(html, /<details class="parameter-builder">/);
});

test('Connect MIDI automatically assigns a valid active tab before connecting', () => {
  assert.match(controller, /async function connectMidiWorkflow\(\)/);
  const workflow = controller.match(/async function connectMidiWorkflow\(\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.ok(workflow.includes('useCurrentTabAsMixer()'));
  assert.ok(workflow.includes('openMidiPermissionTab()'));
  assert.ok(workflow.includes('connectMidi()'));
  assert.ok(workflow.indexOf('useCurrentTabAsMixer()') < workflow.indexOf('connectMidi()'));
  assert.match(controller, /els\.connectMidiBtn\.addEventListener\('click', \(\) => \{[\s\S]*?connectMidiWorkflow\(\)/);
});

test('Edge permission tab does not replace an already selected mixer tab', () => {
  const workflow = controller.match(/async function connectMidiWorkflow\(\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(workflow, /else if \(!Number\.isInteger\(selectedMixerTabId\) \|\| !selectedMixerContext\)/);
});

test('README starts with the requested AI-generated-code warning and stays focused', () => {
  assert.match(readme, /^# Open Soundcraft MIDI\n\n> ⚠️ \*\*AI-generated code warning:\*\*/);
  assert.match(readme, /## Features/);
  assert.match(readme, /## Installation/);
  assert.match(readme, /## Quick start/);
  assert.match(readme, /\[Read this README in German\]\(README\.de\.md\)/);
  assert.ok(fs.existsSync(path.join(root, 'README.de.md')), 'README.de.md must exist');
  assert.doesNotMatch(readme, /## Repository layout|## Troubleshooting|## Background runtime/);
});
