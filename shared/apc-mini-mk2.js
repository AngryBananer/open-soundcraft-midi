'use strict';

(function attachApcMiniMk2(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.OpenSoundcraftMidiApc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // Velocity-to-RGB palette from the official APC mini mk2 communications protocol.
  const PALETTE = [
    '#000000','#1E1E1E','#7F7F7F','#FFFFFF','#FF4C4C','#FF0000','#590000','#190000',
    '#FFBD6C','#FF5400','#591D00','#271B00','#FFFF4C','#FFFF00','#595900','#191900',
    '#88FF4C','#54FF00','#1D5900','#142B00','#4CFF4C','#00FF00','#005900','#001900',
    '#4CFF5E','#00FF19','#00590D','#001902','#4CFF88','#00FF55','#00591D','#001F12',
    '#4CFFB7','#00FF99','#005935','#001912','#4CC3FF','#00A9FF','#004152','#001019',
    '#4C88FF','#0055FF','#001D59','#000819','#4C4CFF','#0000FF','#000059','#000019',
    '#874CFF','#5400FF','#190064','#0F0030','#FF4CFF','#FF00FF','#590059','#190019',
    '#FF4C87','#FF0054','#59001D','#220013','#FF1500','#993500','#795100','#436400',
    '#033900','#005735','#00547F','#0000FF','#00454F','#2500CC','#7F7F7F','#202020',
    '#FF0000','#BDFF2D','#AFED06','#64FF09','#108B00','#00FF87','#00A9FF','#002AFF',
    '#3F00FF','#7A00FF','#B21A7D','#402100','#FF4A00','#88E106','#72FF15','#00FF00',
    '#3BFF26','#59FF71','#38FFCC','#5B8AFF','#3151C6','#877FE9','#D31DFF','#FF005D',
    '#FF7F00','#B9B000','#90FF00','#835D07','#392B00','#144C10','#0D5038','#15152A',
    '#16205A','#693C1C','#A8000A','#DE513D','#D86A1C','#FFE126','#9EE12F','#67B50F',
    '#1E1E30','#DCFF6B','#80FFBD','#9A99FF','#8E66FF','#404040','#757575','#E0FFFF',
    '#A00000','#350000','#1AD000','#074200','#B9B000','#3F3100','#B35F00','#4B1502'
  ];

  const TRACK_BUTTON_FIRST = 0x64;
  const TRACK_BUTTON_LAST = 0x6b;
  const SCENE_BUTTON_FIRST = 0x70;
  const SCENE_BUTTON_LAST = 0x77;

  function parseHex(hex) {
    if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) throw new TypeError('Expected a #RRGGBB color');
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }

  function nearestPaletteVelocity(hex) {
    const [r, g, b] = parseHex(hex);
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < PALETTE.length; index += 1) {
      const [pr, pg, pb] = parseHex(PALETTE[index]);
      const distance = ((r - pr) ** 2) + ((g - pg) ** 2) + ((b - pb) ** 2);
      if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
    }
    return bestIndex;
  }

  function isPeripheralButton(note) {
    return (note >= TRACK_BUTTON_FIRST && note <= TRACK_BUTTON_LAST)
      || (note >= SCENE_BUTTON_FIRST && note <= SCENE_BUTTON_LAST);
  }

  function ledMessage(note, active, activeColor = '#00FF00', inactiveColor = '#000000') {
    if (!Number.isInteger(note) || note < 0 || note > 127) throw new RangeError('MIDI note must be between 0 and 127');
    if (isPeripheralButton(note)) {
      // Track/Scene buttons have fixed red/green LEDs; only on/off is configurable.
      return [0x90, note, active ? 0x01 : 0x00];
    }
    // Matrix pads are RGB. MIDI channel index 6 is solid at 100% brightness.
    const color = active ? activeColor : inactiveColor;
    return [0x96, note, nearestPaletteVelocity(color)];
  }

  function noteLedMessage(note, channel, velocity) {
    if (![note, channel, velocity].every(Number.isInteger) || note < 0 || note > 127 || channel < 0 || channel > 15 || velocity < 0 || velocity > 127) {
      throw new RangeError('Invalid MIDI note LED parameters');
    }
    return [0x90 | channel, note, velocity];
  }

  return Object.freeze({
    PALETTE: Object.freeze(PALETTE.slice()), parseHex, nearestPaletteVelocity,
    isPeripheralButton, ledMessage, noteLedMessage
  });
});
