'use strict';

(function attachFeedbackColors(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.OpenSoundcraftMidiColors = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createFeedbackColors() {
  const DEFAULTS = Object.freeze({ activeColor: '#00FF00', inactiveColor: '#000000' });

  function normalizeHex(value, fallback) {
    const candidate = typeof value === 'string' ? value.trim() : '';
    return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate.toUpperCase() : fallback;
  }

  function normalizeColors(value, fallback = DEFAULTS) {
    return {
      activeColor: normalizeHex(value && value.activeColor, fallback.activeColor),
      inactiveColor: normalizeHex(value && value.inactiveColor, fallback.inactiveColor)
    };
  }

  function latestColorsFromMappings(mappings, fallback = DEFAULTS) {
    let result = normalizeColors(null, fallback);
    for (const mapping of Array.isArray(mappings) ? mappings : []) {
      if (!mapping || !mapping.feedback) continue;
      const feedback = mapping.feedback;
      result = {
        activeColor: normalizeHex(feedback.activeColor, result.activeColor),
        inactiveColor: normalizeHex(feedback.inactiveColor, result.inactiveColor)
      };
    }
    return result;
  }

  return Object.freeze({ DEFAULTS, normalizeHex, normalizeColors, latestColorsFromMappings });
});
