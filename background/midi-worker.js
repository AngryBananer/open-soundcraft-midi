'use strict';

// Lightweight decoder worker. Apart from reducing work in the MIDI event
// callback, this makes the Offscreen document's WORKERS lifetime reason real
// and keeps parsing independent from device I/O.
self.onmessage = (event) => {
  const data = event.data || {};
  if (data.type !== 'DECODE_MIDI' || !Array.isArray(data.bytes)) return;
  const bytes = data.bytes.map((value) => Number(value) & 0xff);
  if (bytes.length < 2) return;
  const status = bytes[0] & 0xf0;
  const channel = bytes[0] & 0x0f;
  let decoded;
  if (status === 0xb0 && bytes.length >= 3) {
    decoded = { kind: 'cc', channel, number: bytes[1], value: bytes[2], pressed: bytes[2] >= 64, raw: bytes };
  } else if ((status === 0x90 || status === 0x80) && bytes.length >= 3) {
    const pressed = status === 0x90 && bytes[2] > 0;
    decoded = { kind: 'note', channel, number: bytes[1], value: status === 0x90 ? bytes[2] : 0, pressed, raw: bytes };
  } else if (status === 0xe0 && bytes.length >= 3) {
    decoded = { kind: 'pitchbend', channel, number: 0, value: (bytes[2] << 7) | bytes[1], pressed: true, raw: bytes };
  } else {
    decoded = { kind: `status-${status.toString(16)}`, channel, number: bytes[1], value: bytes[2] ?? 0, pressed: false, raw: bytes };
  }
  self.postMessage({ type: 'MIDI_DECODED', decoded, input: data.input || null, timeStamp: data.timeStamp || 0 });
};
