'use strict';

(function (root) {
  const TOGGLE_TAILS = new Set([
    'mute', 'solo', 'phantom', 'phantompower', 'hiz', 'polarity', 'phase', 'invert',
    'rec', 'record', 'play', 'stop', 'pre', 'post', 'postproc', 'bypass', 'stereo',
    'link', 'on', 'enabled', 'active', 'switch', 'toggle', 'safe', 'dim', 'cut'
  ]);
  const FADER_TAILS = new Set([
    'mix', 'value', 'level', 'volume', 'gain', 'sl', 'fader', 'slider', 'pan',
    'panslider', 'delay', 'threshold', 'ratio', 'attack', 'release', 'frequency',
    'freq', 'q', 'width', 'send', 'amount', 'depth', 'time', 'feedback'
  ]);

  function inferParameterMode(parameterKey) {
    if (typeof parameterKey !== 'string' || !/^(?:[ialfsp]\.\d+|m)(?:\.[a-zA-Z0-9_]+)+$/.test(parameterKey)) return null;
    const parts = parameterKey.toLowerCase().split('.');
    const tail = parts[parts.length - 1];
    if (TOGGLE_TAILS.has(tail)) return 'toggle';
    if (FADER_TAILS.has(tail)) return 'fader';
    // Soundcraft send-value fields are continuous, even when nested under aux/fx.
    if (tail === 'value' && (parts.includes('aux') || parts.includes('fx'))) return 'fader';
    // Unknown numeric Soundcraft parameters default to a continuous control.
    return 'fader';
  }

  function resolveTargetMode(target, fallback = 'toggle') {
    if (target && (target.mode === 'fader' || target.mode === 'toggle')) return target.mode;
    if (target && target.backend === 'web-parameter') {
      return inferParameterMode(target.parameterKey || target.key) || fallback;
    }
    if (Array.isArray(target?.capabilities)) {
      if (target.capabilities.length === 1 && ['fader', 'toggle'].includes(target.capabilities[0])) return target.capabilities[0];
    }
    if (/slider|knob|fader/i.test(String(target?.widgetName || ''))) return 'fader';
    return fallback === 'fader' ? 'fader' : 'toggle';
  }

  const api = Object.freeze({ inferParameterMode, resolveTargetMode });
  root.OpenSoundcraftMidiMappingMode = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
