'use strict';

(function attachMidiDeviceProfiles(root, factory) {
  const apc = (root && root.OpenSoundcraftMidiApc)
    || (typeof module !== 'undefined' && module.exports && typeof require === 'function' ? require('./apc-mini-mk2.js') : null);
  const api = factory(apc);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.OpenSoundcraftMidiDeviceProfiles = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMidiDeviceProfiles(apc) {
  const DEFAULT_PROFILE_ID = 'generic';

  function clampInteger(value, min, max, fallback) {
    const number = Number(value);
    return Number.isInteger(number) ? Math.max(min, Math.min(max, number)) : fallback;
  }

  function createGenericButtonFeedbackMessage({ number, active, settings = {}, fallbackChannel = 0, fallbackKind = 'note' }) {
    const requestedChannel = Number.isInteger(settings.channel) ? settings.channel : fallbackChannel;
    const channel = clampInteger(requestedChannel, 0, 15, 0);
    const midiNumber = clampInteger(number, 0, 127, 0);
    const kind = settings.kind && settings.kind !== 'auto' ? settings.kind : fallbackKind;
    const bytes = kind === 'cc'
      ? [0xb0 | channel, midiNumber, active ? 127 : 0]
      : [0x90 | channel, midiNumber, active ? 127 : 0];
    return { bytes, cacheLabel: `${kind}:${channel}` };
  }

  function outputIdentity(output) {
    if (!output) return '';
    const name = String(output.name || '');
    const manufacturer = String(output.manufacturer || '');
    return `${manufacturer} ${name}`.toLowerCase().replace(/[_-]+/g, ' ');
  }

  const definitions = [
    {
      id: DEFAULT_PROFILE_ID,
      label: { de: 'Generisches MIDI', en: 'Generic MIDI' },
      capabilities: Object.freeze({ buttonFeedback: true, faderFeedback: true }),
      ui: Object.freeze({
        showOutputChannel: true,
        showColorControls: false,
        hint: null
      }),
      matchesOutput: () => false,
      createButtonFeedbackMessage: createGenericButtonFeedbackMessage
    }
  ];

  if (apc && typeof apc.ledMessage === 'function') {
    definitions.push({
      id: 'apc-mini-mk2',
      label: { de: 'AKAI APC mini MK2', en: 'AKAI APC mini MK2' },
      // The APC mini MK2 has physical, non-motorized faders but no fader
      // position display. Its device-specific feedback is limited to LEDs.
      capabilities: Object.freeze({ buttonFeedback: true, faderFeedback: false }),
      ui: Object.freeze({
        showOutputChannel: false,
        showColorControls: true,
        hint: Object.freeze({
          de: 'RGB-Pads unterstützen die konfigurierbaren Farben. Track-/Scene-Tasten besitzen feste rot/grüne LEDs und unterstützen nur Ein/Aus.',
          en: 'RGB pads support configurable colors. Track/Scene buttons have fixed red/green LEDs and support on/off only.'
        })
      }),
      matchesOutput(output) {
        const identity = outputIdentity(output);
        return /\bapc\s*mini\s*mk\s*2\b/i.test(identity)
          || (/\bakai\b/i.test(identity) && /\bapc\b/i.test(identity)
            && /\bmini\b/i.test(identity) && /\bmk\s*2\b/i.test(identity));
      },
      createButtonFeedbackMessage({ number, active, settings = {} }) {
        return {
          bytes: apc.ledMessage(
            number,
            active,
            settings.activeColor || '#00FF00',
            settings.inactiveColor || '#000000'
          ),
          cacheLabel: 'apc-mini-mk2'
        };
      }
    });
  }

  const profilesById = new Map(definitions.map((profile) => [profile.id, Object.freeze(profile)]));

  function getFeedbackProfile(profileId) {
    return profilesById.get(profileId) || profilesById.get(DEFAULT_PROFILE_ID);
  }

  function supportsFeedbackMode(profileOrId, mode) {
    const profile = typeof profileOrId === 'string' ? getFeedbackProfile(profileOrId) : profileOrId;
    if (!profile || !profile.capabilities) return false;
    if (mode === 'fader') return profile.capabilities.faderFeedback === true;
    if (mode === 'toggle') return profile.capabilities.buttonFeedback === true;
    return false;
  }

  function getFeedbackProfiles(language = 'en', mode = null) {
    const locale = language === 'de' ? 'de' : 'en';
    return definitions
      .filter((profile) => mode == null || supportsFeedbackMode(profile, mode))
      .map((profile) => ({
        id: profile.id,
        label: profile.label[locale] || profile.label.en || profile.id,
        ui: profile.ui,
        capabilities: profile.capabilities
      }));
  }

  function detectFeedbackProfile(output, mode = 'toggle') {
    for (const profile of definitions) {
      if (profile.id === DEFAULT_PROFILE_ID || !supportsFeedbackMode(profile, mode)) continue;
      try {
        if (profile.matchesOutput(output)) return profile.id;
      } catch (_) {
        // A broken optional detector must not prevent generic MIDI operation.
      }
    }
    return DEFAULT_PROFILE_ID;
  }

  function createButtonFeedbackMessage(profileId, context) {
    const profile = getFeedbackProfile(profileId);
    return profile.createButtonFeedbackMessage(context || {});
  }

  return Object.freeze({
    DEFAULT_PROFILE_ID,
    getFeedbackProfile,
    getFeedbackProfiles,
    supportsFeedbackMode,
    detectFeedbackProfile,
    createButtonFeedbackMessage
  });
});
