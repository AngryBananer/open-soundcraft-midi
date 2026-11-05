# Adding a MIDI controller

This document is the implementation contract for developers and AI coding agents adding another MIDI controller to Open Soundcraft MIDI.

## Architecture and ownership

Controller-specific code must stay out of the generic MIDI engine and the general Side Panel UI.

| File | Responsibility | May contain device-specific code? |
|---|---|---:|
| `shared/<device-id>.js` | Hardware protocol: SysEx/CC/Note LED messages, color conversion, pad/button addressing, device-specific validation | Yes — only for that device |
| `shared/midi-device-profiles.js` | Profile registry, output-port detection, profile metadata and UI capabilities, adapter from generic feedback requests to device protocol | Yes — registry entries only |
| `shared/feedback-colors.js` | Generic color normalization and defaults | No |
| `background/midi-engine.js` | Generic Web MIDI lifecycle, MIDI Learn, mapping execution, feedback scheduling and sending the bytes returned by a profile | No |
| `controller/controller.js` | Generic Side Panel and mapping editor; renders profile options and UI capabilities from the registry | No |
| `controller/controller.html` | Loads shared modules in dependency order | No device logic; add a script tag for a new device module |

The generic engine must not contain device names, vendor matching, device-specific MIDI status bytes, LED palettes, hardware button ranges, or device-specific UI decisions.

## Profile API

`shared/midi-device-profiles.js` exposes `window.OpenSoundcraftMidiDeviceProfiles` (and a CommonJS export for tests) with these methods:

- `DEFAULT_PROFILE_ID`: ID of the generic fallback profile.
- `getFeedbackProfiles(language, mode)`: returns only profiles compatible with the mapping mode (`fader` or `toggle`). Omit `mode` only when a caller intentionally needs the full registry.
- `getFeedbackProfile(profileId)`: returns a profile definition, falling back to the generic profile for unknown IDs.
- `supportsFeedbackMode(profileOrId, mode)`: checks whether a profile can provide feedback for a fader or button mapping.
- `detectFeedbackProfile(output, mode)`: detects a compatible profile from the selected Web MIDI output's public `name` and `manufacturer` fields; incompatible devices fall back to `generic`.
- `createButtonFeedbackMessage(profileId, context)`: returns `{ bytes, cacheLabel }` for one button state update.

The feedback context passed to `createButtonFeedbackMessage` is:

```js
{
  number,          // MIDI note/controller number, 0..127
  active,          // boolean state
  settings,        // saved mapping.feedback object
  fallbackChannel, // learned MIDI channel, 0..15
  fallbackKind     // learned MIDI kind, normally "note" or "cc"
}
```

`bytes` must be a three-byte MIDI message accepted by `MIDIOutput.send()`. `cacheLabel` must be stable for a message type/channel combination; it forms part of the engine's feedback-cache key. Do not send MIDI directly from a profile. The engine remains responsible for output selection, connection checks, duplicate suppression, echo tracking and error handling.

Each profile has this shape:

```js
{
  id: 'vendor-model',
  label: { de: 'Gerätename', en: 'Device name' },
  capabilities: {
    buttonFeedback: true, // device can display button/pad state
    faderFeedback: false // true only if it can visibly display/act on returned fader values
  },
  ui: {
    showOutputChannel: true,
    showColorControls: false,
    hint: null // or { de: 'Hinweis', en: 'Hint' }
  },
  matchesOutput(output) { /* return true only for this device */ },
  createButtonFeedbackMessage(context) { /* return { bytes, cacheLabel } */ }
}
```

Keep profile metadata descriptive and declarative. `capabilities.buttonFeedback` and `capabilities.faderFeedback` control which mapping types may select the profile. A device with physical faders but no motorization, display, or fader-position LEDs must set `faderFeedback: false`; receiving MIDI input from a fader does not mean the device can display a returned fader value. `showOutputChannel` controls the generic output-channel editor. `showColorControls` enables the generic active/inactive color pickers for toggle mappings. `hint` is optional localized explanatory text displayed below those controls. Add new capabilities to this schema only when the generic UI can render them without learning about a particular device.

The generic profile supports both standard MIDI button and fader feedback. A hardware-specific profile must opt into each capability explicitly. The Side Panel filters the selector by mapping mode and hides the selector when only one compatible profile exists. When loading or importing old mappings, incompatible profile IDs are replaced with `generic`.

## Step-by-step: add a device

1. **Identify the MIDI protocol.** Record the actual input/output port names and manufacturer, how the device addresses LEDs, supported message types/channels, color encoding, and which buttons have fixed rather than RGB colors. Prefer the manufacturer's protocol documentation and verify uncertain behavior with hardware.
2. **Create the hardware module.** Add `shared/<device-id>.js` using the same UMD pattern as `shared/apc-mini-mk2.js`: expose a named `window.OpenSoundcraftMidi<Device>` API and `module.exports` for Node tests. Keep protocol constants, palette/color conversion, address ranges, byte validation and message construction in this file. Pure functions are preferred.
3. **Load the module before the registry.** Add `<script src="../shared/<device-id>.js"></script>` to both `controller/controller.html` and `background/offscreen.html`. The device module must load before `shared/midi-device-profiles.js`; the registry must load before `controller.js` or `midi-engine.js`.
4. **Register the profile.** In `shared/midi-device-profiles.js`, obtain the module's global API and add a definition with a unique stable ID, localized label, output detection, UI capabilities and `createButtonFeedbackMessage`. The adapter should translate the generic context into the device module's protocol call. Do not add a device-name `if` or a protocol branch to the engine or UI.
5. **Keep detection conservative.** Web MIDI does not expose USB vendor/product IDs consistently. Match normalized `output.name` and `output.manufacturer` strings, tolerate known OS prefixes/punctuation variations, and return the generic profile for unknown outputs. Do not guess a device from a partial ambiguous name.
6. **Add protocol tests.** Create `tests/<device-id>.test.cjs` for exact bytes, color mapping, fixed-color buttons, boundary values and invalid input. Test the profile registry separately for name detection, localized metadata, UI capabilities and the adapter's returned message.
7. **Run all checks.** Run `npm run check` and `npm test`. Add a regression assertion that `background/midi-engine.js` and `controller/controller.js` do not contain the new device ID, manufacturer name, or protocol-specific message constants.
8. **Verify with hardware.** Test every supported LED/button group, active and inactive states, output reconnect, multiple mappings and feedback echo suppression on the actual controller. Automated tests cannot prove that a physical device interprets a message as expected.

## Reference implementation: AKAI APC mini MK2

The APC mini MK2 declares `buttonFeedback: true` and `faderFeedback: false`: it has physical, non-motorized faders but no visible fader-position feedback. Its pad/button LED protocol is therefore offered only for toggle mappings.

Use these existing files as the example implementation:

- Protocol and palette: `shared/apc-mini-mk2.js`
- Device detection, localized profile metadata and generic adapter: `shared/midi-device-profiles.js`
- Protocol tests: `tests/apc-mini-mk2.test.cjs`
- Profile tests: `tests/midi-device-profiles.test.cjs`

The profile currently exposes configurable RGB colors for matrix pads. Track/Scene buttons use their fixed-color on/off protocol, so the profile hides the generic output-channel field and provides a localized explanatory hint.

## Rules for AI coding agents

When asked to add or change a controller:

1. Read this document and inspect the existing reference device module and profile tests first.
2. Modify only the new device module, the profile registry, the two HTML script lists, tests, and documentation unless a concrete shared-API gap requires another change.
3. Do not add device-specific conditionals, names, constants, message bytes or UI labels to `background/midi-engine.js` or `controller/controller.js`.
4. Preserve existing profile IDs and saved mapping compatibility. Never rename an existing ID without a migration.
5. Add tests for both the hardware protocol and the profile integration; run the complete test suite.
6. State clearly which behavior was verified with automated tests and which still requires physical hardware.
