# Changelog

## 0.4.0-beta.3 — 2026-10-29

### Fixed
- Restored channel rename updates by preferring the active strip widget's `getName()` method, with a stable channel-prefix parameter fallback.
- Saved control paths no longer fail validation solely because a widget's display-facing `name` or `name2` field changes.
- Mapping labels can refresh from the channel strip even if the assigned button is temporarily rebuilt or removed during a mixer view change.
- Channel name, prefix, and control label metadata are persisted independently instead of updating only when the composed label changes.

### Verified
- `npm run check` passes.
- All 14 automated tests pass, including renaming both fader and button mappings, mutable widget name metadata, and name refresh when a button widget is rebuilt.
- ZIP packaging and extension manifest validation are included in the final check.

### Beta note
- Tests use a simulated widget tree; please verify on the physical mixer web interface after updating the extension.

## 0.4.0-beta.2 — 2026-10-29

### Changed
- Tab discovery now follows the configured mixer address exclusively, defaulting to `http://10.10.2.1`.
- Content-script injection is performed after the user explicitly grants permission for the selected mixer website origin; no website host access is granted automatically at installation.
- Channel-name resolution now reads the current `<channel-prefix>name` value from the mixer widget API, including for button and checkbox mappings whose parent widget does not implement `getName()`.
- Updated beta version and release instructions.

### Verified
- Syntax/manifest validation passes.
- All 11 automated tests pass, including fader feedback, renamed fader/button labels, action-only buttons, and the optional website permission setup.

### Beta notes
- Run a live check with the physical mixer and intended MIDI controller. The automated tests use a simulated widget tree.
- Motor-fader and LED protocols vary by controller; standard CC and Pitch Bend output are available, but device-specific SysEx protocols are not implemented.

## 0.4.0-beta.1 — 2026-10-29

### Added
- Direct browser-tab control for the mixer web interface, with `http://10.10.2.1` as the default address.
- Permission flow for user-selected HTTP/HTTPS mixer origins; no separate local bridge service is required.
- German and English UI language selection.
- MIDI output selection and current fader-value feedback for LED rings and motorised faders, using CC or Pitch Bend messages.
- Per-mapping feedback enable, output channel and CC number.
- DOM-control target and feedback fallback for mixer pages that expose standard HTML controls.

### Changed
- Mapping target identity includes the website origin so mappings are sent to the appropriate open mixer tab.
- Channel-name lookup prefers the enclosing channel strip, keeping fader, Mute, Solo and other button labels synchronized after a rename.
- The controller UI and documentation describe browser-based mixer access instead of using a separate hardware protocol bridge.

### Fixed
- Avoided repeated MIDI feedback messages when the quantized fader value has not changed.
- Suppressed recent matching feedback echoes to reduce input/output loops.
- Removed the extra grid overflow at the mapping delete and action controls on narrow layouts.

### Beta notes
- The mixer widget integration and MIDI feedback are tested against simulated widgets, not every firmware version or controller protocol.
- Controller-specific motor-fader protocols and SysEx feedback are not implemented. Select the appropriate MIDI output message format for the device.
