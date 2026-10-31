const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'controller', 'controller.js'),
  'utf8'
);
const start = source.indexOf('function soundcraftPageBridge(');
const end = source.indexOf('\nfunction installSoundcraftValueMonitor(', start);
assert.notEqual(start, -1, 'soundcraftPageBridge function must exist');
assert.notEqual(end, -1, 'soundcraftPageBridge end marker must exist');
const bridgeSource = source.slice(start, end).trim();

function fixture() {
  const state = {
    widgets: {},
    parameterValues: { 'i.7.aux.0.value': 0.25 },
    channels: {
      'i.7.': { mute: 0, solo: 0, mix: 0.25, pan: 0.4, name: 'Channel 7' },
      'i.8.': { mute: 0, solo: 0, mix: 0.5, pan: 0.5, name: 'Channel 8' }
    }
  };

  const baseWidgetPrototype = {
    onDown() {},
    onUp() {},
    getName() { return 'generic widget label'; },
    click() {
      if (typeof this.getState === 'function') this.getState();
      if (typeof this.onDown === 'function') this.onDown(0, 0, 0);
      if (typeof this.onUp === 'function') this.onUp(0);
    }
  };
  const root = {
    widgetName: 'MainMixer', x: 0, y: 0, w: 300, h: 200,
    offsetX: 0, offsetY: 0, widgets: [], enabled: true, visible: true,
    contains(px, py) { return this.enabled && this.visible && this.x <= px && px < this.x + this.w && this.y <= py && py < this.y + this.h; },
    globalWidgetName() { return 'MainMixer'; }
  };

  function makeStrip(name, x, id) {
    const strip = {
      widgetName: 'Strip', name, name2: null, id, subId: id,
      x, y: 0, w: 100, h: 200, offsetX: 0, offsetY: 0,
      widgets: [], enabled: true, visible: true, parent: root,
      contains(px, py) { return this.enabled && this.visible && this.x <= px && px < this.x + this.w && this.y <= py && py < this.y + this.h; },
      globalWidgetName() { return `MainMixer.Strip(${name})`; },
      getName() { return state.channels[name]?.name || `Channel ${id}`; },
    };

    for (const controlName of ['mute', 'solo']) {
      const box = Object.assign(Object.create(baseWidgetPrototype), {
        widgetName: 'CheckBox', name: 'CheckBox', key: null,
        x: controlName === 'mute' ? 4 : 58, y: 88, w: 38, h: 30,
        offsetX: 0, offsetY: 0, widgets: [], parent: strip,
        enabled: true, visible: true, disabled: false, state: 0,
        contains(px, py) { return this.enabled && this.visible && this.x <= px && px < this.x + this.w && this.y <= py && py < this.y + this.h; },
        globalWidgetName() { return `MainMixer.Strip(${name}).CheckBox`; },
        getState() { this.state = state.channels[name][controlName]; },
        onDown() { this.doClick(); },
        onUp() {},
        doClick() { state.channels[name][controlName] = this.state ? 0 : 1; this.state = state.channels[name][controlName]; }
      });
      strip[controlName] = box;
      strip.widgets.push(box);
    }

    const slider = Object.assign(Object.create(baseWidgetPrototype), {
      widgetName: 'Slider', key: `${name}mix`, x: 40, y: 130, w: 20, h: 65,
      offsetX: 0, offsetY: 0, widgets: [], parent: strip, enabled: true, visible: true, disabled: false,
      contains(px, py) { return this.enabled && this.visible && this.x <= px && px < this.x + this.w && this.y <= py && py < this.y + this.h; },
      globalWidgetName() { return `MainMixer.Strip(${name}).Slider`; },
      setValue(value) { state.channels[name].mix = value; },
      getVal() { return state.channels[name].mix; }
    });
    strip.sl = slider;
    strip.widgets.push(slider);

    const pan = Object.assign(Object.create(baseWidgetPrototype), {
      widgetName: 'PanSlider', key: `${name}pan`, x: 5, y: 45, w: 80, h: 30,
      offsetX: 0, offsetY: 0, widgets: [], parent: strip, enabled: true, visible: true, disabled: false,
      contains(px, py) { return this.enabled && this.visible && this.x <= px && px < this.x + this.w && this.y <= py && py < this.y + this.h; },
      globalWidgetName() { return `MainMixer.Strip(${name}).PanSlider`; },
      setVal(value) { state.channels[name].pan = value; },
      onValue() {}
    });
    strip.pan = pan;
    strip.widgets.push(pan);

    const button = Object.assign(Object.create(baseWidgetPrototype), {
      widgetName: 'Button', key: null, text: 'Record', x: 5, y: 15, w: 30, h: 25,
      offsetX: 0, offsetY: 0, widgets: [], parent: strip, enabled: true, visible: true, disabled: false, presses: 0,
      contains(px, py) { return this.enabled && this.visible && this.x <= px && px < this.x + this.w && this.y <= py && py < this.y + this.h; },
      globalWidgetName() { return `MainMixer.Strip(${name}).Button`; },
      onDown() { this.pressed = true; },
      onUp() { this.pressed = false; this.presses += 1; }
    });
    strip.record = button;
    strip.widgets.push(button);

    const pressOnly = Object.assign(Object.create(baseWidgetPrototype), {
      widgetName: 'CUSTOM_ACTION', key: null, name: 'pressOnly', x: 40, y: 15, w: 30, h: 25,
      offsetX: 0, offsetY: 0, widgets: [], parent: strip, enabled: true, visible: true, disabled: false,
      contains(px, py) { return this.enabled && this.visible && this.x <= px && px < this.x + this.w && this.y <= py && py < this.y + this.h; },
      globalWidgetName() { return `MainMixer.Strip(${name}).CUSTOM_ACTION`; },
      onPress() { state.channels[name].pressOnly = (state.channels[name].pressOnly || 0) + 1; }
    });
    strip.pressOnly = pressOnly;
    strip.widgets.push(pressOnly);
    state.widgets[name] = strip;
    return strip;
  }

  const switchBox = Object.assign(Object.create(baseWidgetPrototype), {
    widgetName: 'SWITCHBOX', key: null, name: 'Switchbox', items: ['OFF', 'ON'], itemW: 40,
    x: 210, y: 20, w: 80, h: 30, offsetX: 0, offsetY: 0, widgets: [], parent: root,
    enabled: true, visible: true, disabled: false, state: 0,
    contains(px, py) { return this.enabled && this.visible && this.x <= px && px < this.x + this.w && this.y <= py && py < this.y + this.h; },
    globalWidgetName() { return 'MainMixer.SWITCHBOX'; },
    onDown(px) { const item = Math.max(0, Math.min(1, Math.floor((px - this.x) / this.itemW))); this.state = item === this.state ? 1 - this.state : item; }
  });
  root.widgets.push(makeStrip('i.7.', 0, 7), makeStrip('i.8.', 100, 8), switchBox);
  const windowMock = {
    widgets: [root], mWidgets: [], isSmall: false, Widget: { prototype: baseWidgetPrototype },
    location: { origin: 'http://10.10.2.1', href: 'http://10.10.2.1/' },
    getValue(key) {
      if (Object.prototype.hasOwnProperty.call(state.parameterValues, key)) return state.parameterValues[key];
      const channel = state.channels[key.replace(/(mix|pan|mute|solo|name)$/, '')];
      const suffix = key.match(/(mix|pan|mute|solo|name)$/)?.[1];
      return channel ? channel[suffix] : null;
    },
    setValue(key, value) {
      state.parameterValues[key] = value;
      const channel = state.channels[key.replace(/(mix|pan|mute|solo|name)$/, '')];
      const suffix = key.match(/(mix|pan|mute|solo|name)$/)?.[1];
      if (channel && suffix) channel[suffix] = value;
    },
    regUpdate() {}
  };
  const bridgeImpl = vm.runInNewContext(`(${bridgeSource})`, { window: windowMock, Number, String, Array, Object, Set, Math, Boolean });
  const bridge = (action, payload = {}) => bridgeImpl(action, { language: 'en', ...payload });
  return { state, bridge, windowMock, root };
}

test('picker identifies Mute and Solo widgets separately when names are not unique', () => {
  const { bridge } = fixture();
  const mute = bridge('inspect', { pageX: 110, pageY: 100 });
  const solo = bridge('inspect', { pageX: 165, pageY: 100 });
  assert.equal(mute.ok, true, JSON.stringify(mute));
  assert.equal(solo.ok, true, JSON.stringify(solo));
  assert.equal(mute.target.controlName, 'mute');
  assert.equal(solo.target.controlName, 'solo');
  assert.match(mute.target.label, /Channel 8 · Mute/);
  assert.match(solo.target.label, /Channel 8 · Solo/);
  assert.equal(mute.target.backend, 'web');
  assert.equal(mute.target.origin, 'http://10.10.2.1');
  assert.ok(Array.isArray(mute.target.path));
});

test('toggle mappings invoke the exact selected checkbox callback', () => {
  const { state, bridge } = fixture();
  const picked = bridge('inspect', { pageX: 110, pageY: 100 });
  const result = bridge('apply', { target: picked.target, mode: 'toggle', value: 127, pressed: true });
  assert.equal(result.ok, true);
  assert.equal(state.channels['i.8.'].mute, 1);
  assert.equal(state.channels['i.7.'].mute, 0);
});

test('generic Button widgets can be selected and clicked', () => {
  const { state, bridge } = fixture();
  const picked = bridge('inspect', { pageX: 110, pageY: 20 });
  assert.equal(picked.ok, true, JSON.stringify(picked));
  assert.equal(picked.target.widgetName, 'Button');
  assert.equal(picked.target.mode, 'toggle');
  const result = bridge('apply', { target: picked.target, mode: 'toggle', value: 127, pressed: true });
  assert.equal(result.ok, true);
  const strip = state.widgets['i.8.'];
  assert.equal(picked.target.controlName, 'record');
  assert.equal(picked.target.label, 'Channel 8 · Record');
  assert.equal(strip.record.presses, 1);
});


test('action-only buttons use their action callback when they inherit the base pointer handler', () => {
  const { state, bridge } = fixture();
  const picked = bridge('inspect', { pageX: 145, pageY: 20 });
  assert.equal(picked.ok, true, JSON.stringify(picked));
  assert.equal(picked.target.widgetName, 'CUSTOM_ACTION');
  const result = bridge('apply', { target: picked.target, mode: 'toggle', value: 127, pressed: true });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(state.channels['i.8.'].pressOnly, 1);
});

test('multiple fader widget families are supported through their parameter APIs', () => {
  const { state, bridge } = fixture();
  const slider = bridge('inspect', { pageX: 145, pageY: 135 });
  assert.equal(slider.ok, true, JSON.stringify(slider));
  assert.equal(slider.target.widgetName, 'Slider');
  const sliderResult = bridge('apply', { target: slider.target, mode: 'fader', value: 96, pressed: true });
  assert.equal(sliderResult.ok, true);
  assert.equal(state.channels['i.8.'].mix, 96 / 127);

  const pan = bridge('inspect', { pageX: 115, pageY: 55 });
  assert.equal(pan.ok, true, JSON.stringify(pan));
  assert.equal(pan.target.widgetName, 'PanSlider');
  const panResult = bridge('apply', { target: pan.target, mode: 'fader', value: 32, pressed: true });
  assert.equal(panResult.ok, true);
  assert.equal(state.channels['i.8.'].pan, 32 / 127);
});

test('coordinate-sensitive switchbox uses the same segment that was picked', () => {
  const { bridge } = fixture();
  const picked = bridge('inspect', { pageX: 270, pageY: 30 });
  assert.equal(picked.ok, true, JSON.stringify(picked));
  assert.equal(picked.target.widgetName, 'SWITCHBOX');
  assert.ok(picked.target.hitXRatio > 0.5, `expected right-side hit ratio, got ${picked.target.hitXRatio}`);
  const result = bridge('apply', { target: picked.target, mode: 'toggle', value: 127, pressed: true });
  assert.equal(result.ok, true);
  assert.equal(result.value, 1);
});

test('mapping labels refresh after the channel name changes', () => {
  const { state, bridge } = fixture();
  const picked = bridge('inspect', { pageX: 110, pageY: 100 });
  state.channels['i.8.'].name = 'Renamed Vocal';
  const labels = bridge('labels', { targets: [{ id: 'mapping-1', target: picked.target }] });
  assert.equal(labels.length, 1);
  assert.equal(labels[0].id, 'mapping-1');
  assert.equal(labels[0].label, 'Renamed Vocal · Mute');
});


test('renaming a channel updates both button and fader mapping labels', () => {
  const { state, bridge } = fixture();
  const button = bridge('inspect', { pageX: 110, pageY: 20 });
  const fader = bridge('inspect', { pageX: 145, pageY: 135 });
  assert.equal(button.target.label, 'Channel 8 · Record');
  assert.equal(fader.target.label, 'Channel 8 · Fader');
  state.channels['i.8.'].name = 'Renamed Vocal';
  const labels = bridge('labels', { targets: [
    { id: 'button', target: button.target }, { id: 'fader', target: fader.target }
  ] });
  assert.equal(labels.find((entry) => entry.id === 'button').label, 'Renamed Vocal · Record');
  assert.equal(labels.find((entry) => entry.id === 'fader').label, 'Renamed Vocal · Fader');
});

test('renamed display metadata does not invalidate a saved control path', () => {
  const { state, bridge } = fixture();
  const button = bridge('inspect', { pageX: 110, pageY: 20 });
  const strip = state.widgets['i.8.'];
  strip.record.name = 'Renamed record widget label';
  state.channels['i.8.'].name = 'New Channel Name';
  const labels = bridge('labels', { targets: [{ id: 'button', target: button.target }] });
  assert.equal(labels[0].label, 'New Channel Name · Record');
});

test('channel labels still refresh through the strip API if global getValue is unavailable', () => {
  const { state, bridge, windowMock } = fixture();
  const button = bridge('inspect', { pageX: 110, pageY: 20 });
  delete windowMock.getValue;
  state.channels['i.8.'].name = 'Hardware Vocal';
  const labels = bridge('labels', { targets: [{ id: 'button', target: button.target }] });
  assert.equal(labels[0].label, 'Hardware Vocal · Record');
});

test('channel name refresh survives when a button widget is rebuilt', () => {
  const { state, bridge, root } = fixture();
  const button = bridge('inspect', { pageX: 110, pageY: 20 });
  state.channels['i.8.'].name = 'Rebuilt Strip';
  // Simulate a mixer mode/view change replacing the button object after selection.
  root.widgets[0].widgets = root.widgets[0].widgets.filter((widget) => widget !== root.widgets[0].record);
  const labels = bridge('labels', { targets: [{ id: 'button', target: button.target }] });
  assert.equal(labels[0].label, 'Rebuilt Strip · Record');
  assert.equal(labels[0].channelPrefix, 'i.8.');
});

test('feedback value polling reads the current normalized fader value', () => {
  const { bridge } = fixture();
  const fader = bridge('inspect', { pageX: 145, pageY: 135 });
  const values = bridge('values', { targets: [{ id: 'fb-1', target: fader.target }] });
  assert.equal(values.length, 1);
  assert.equal(values[0].id, 'fb-1');
  assert.equal(values[0].value, 0.5);
});

test('control labels are localized by the selected UI language', () => {
  const { bridge } = fixture();
  const recordDe = bridge('inspect', { pageX: 110, pageY: 20, language: 'de' });
  assert.equal(recordDe.ok, true, JSON.stringify(recordDe));
  assert.equal(recordDe.target.controlLabel, 'Aufnahme');
  const recordEn = bridge('inspect', { pageX: 110, pageY: 20, language: 'en' });
  assert.equal(recordEn.target.controlLabel, 'Record');
});


test('direct Soundcraft parameter targets control hidden Aux Send faders', () => {
  const { state, bridge } = fixture();
  const target = { backend: 'web-parameter', parameterKey: 'i.7.aux.0.value', key: 'i.7.aux.0.value' };
  const result = bridge('apply', { target, mode: 'fader', value: 96 });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(state.parameterValues['i.7.aux.0.value'], 96 / 127);
});

test('direct parameter targets toggle a backing boolean parameter without a visible widget', () => {
  const { state, bridge } = fixture();
  const target = { backend: 'web-parameter', parameterKey: 'i.8.mute', key: 'i.8.mute' };
  assert.equal(bridge('apply', { target, mode: 'toggle', value: 127, pressed: true }).ok, true);
  assert.equal(state.channels['i.8.'].mute, 1);
});

test('direct parameter target labels use the current renamed channel name', () => {
  const { state, bridge } = fixture();
  state.channels['i.7.'].name = 'Drum Bus';
  const target = { backend: 'web-parameter', parameterKey: 'i.7.aux.0.value', key: 'i.7.aux.0.value', channelPrefix: 'i.7.', controlLabel: 'Aux 1 Send' };
  const labels = bridge('labels', { targets: [{ id: 'hidden-aux', target }] });
  assert.equal(labels[0].label, 'Drum Bus · Aux 1 Send');
});
