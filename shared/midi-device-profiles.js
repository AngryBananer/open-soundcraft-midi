'use strict';

(function attachMidiDeviceProfiles(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.OpenSoundcraftMidiDeviceProfiles = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  /**
   * Determine a sensible LED feedback profile from the currently selected MIDI output.
   * Web MIDI exposes port name/manufacturer (but not USB vendor/product IDs) consistently
   * across Chromium browsers, so matching is intentionally based on those public fields.
   */
  function detectFeedbackProfile(output) {
    if (!output) return 'generic';
    const name = String(output.name || '');
    const manufacturer = String(output.manufacturer || '');
    const identity = `${manufacturer} ${name}`.toLowerCase().replace(/[_-]+/g, ' ');
    if (/\bapc\s*mini\s*mk\s*2\b/i.test(identity)
      || (/\bakai\b/i.test(identity) && /\bapc\b/i.test(identity) && /\bmini\b/i.test(identity) && /\bmk\s*2\b/i.test(identity))) {
      return 'apc-mini-mk2';
    }
    return 'generic';
  }

  return Object.freeze({ detectFeedbackProfile });
});
