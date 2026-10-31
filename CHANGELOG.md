# Changelog

## 0.5.0-beta.15

- Based this release on the Beta 14 codebase.
- Create the hidden Offscreen MIDI engine only while an explicitly selected Mixer tab exists; Side Panel startup without a Mixer no longer starts the background runtime.
- Automatically close the Offscreen Document when the selected Mixer tab is closed or navigated away from HTTP/HTTPS, terminating its decoder worker and feedback/monitor polling loops.
- Restore a previous MIDI session only when the selected Mixer tab is still available; preserve the saved MIDI device selection and auto-reconnect preference when the engine is stopped because the Mixer closed.
- Reduce fallback feedback polling from 1,500 ms to 250 ms and reduce monitor re-install retries from 3,000 ms to 1,000 ms. Event-driven Soundcraft parameter updates remain the primary feedback path.
- Add lifecycle and feedback-interval regression tests.



## 0.5.0-beta.14

- Moved Web MIDI ownership, MIDI Learn, mapping execution, MIDI output feedback, and Mixer value polling into a hidden Chromium Offscreen Document.
- The Side Panel is now a UI client only; closing it no longer terminates the MIDI engine.
- The Manifest V3 Service Worker coordinates the Offscreen Document and performs tab/content-script operations.
- Added an initialization handshake so Side Panel commands cannot race persistent engine-state loading.
- Reopening the Side Panel synchronizes mappings/settings without overwriting an ongoing background MIDI Learn session.
- Removed the Side Panel's fake `MIDIAccess` placeholder; MIDI ports are owned only by the background engine.
- Added the `offscreen` permission.

## 0.5.0-beta.13

- The extension toolbar icon now uses Chromium's native Side Panel toggle: click once to open the controller, click again to close it and reclaim the mixer width.
- Removed the in-panel “Hide settings” control; the full controller UI is shown whenever the panel is open.
- Removed the manual `action.onClicked` open-only handler so it cannot prevent the native close/toggle behaviour.
- Clarified the lifecycle limitation: closing a Side Panel unloads its document in current Chromium behaviour; this release toggles the UI but does not yet move the Web MIDI engine into a separate persistent background context.

# Changelog

## 0.5.0-beta.12 — 2026-10-31

### Changed
- Removed the **Open MIDI permission settings** shortcut from the MIDI device section. Permission diagnostics remain available in error messages, but there is no longer a button that navigates directly to browser settings.
- Added a persistent **Hide settings / Show settings** toggle in the Side Panel header.
- Hiding settings collapses the MIDI device, mixer setup and mapping editor cards into a compact status summary. The preference is stored in `chrome.storage.local` and restored the next time the Side Panel opens.
- The collapse is presentation-only: existing MIDI input handling, MIDI output feedback, mixer parameter monitoring and mapping-label refresh loops are not stopped when the settings cards are hidden.
- Added German and English labels and accessible expanded/collapsed state to the settings toggle.

### Verification
- Updated tests to assert that the direct browser-settings link is absent.
- Added tests for persisted visibility, correct card collapse/restore, localized toggle labels, and continued background timers/feedback functions while the settings UI is hidden.
- Live MIDI hardware and Edge Side Panel lifecycle still require verification on the target machine.

## 0.5.0-beta.11 - 2026-10-31

### Mixer tab selection
- Removed the editable mixer address and all mixer-tab discovery/selection dropdowns.
- The user opens the mixer website in a browser tab and clicks **Open mixer** once. The extension requests permission for that tab's origin and pins that exact tab ID and URL as the mixer target.
- Switching to other browser tabs no longer changes the selected mixer. The currently active browser tab is tracked only as a candidate for the explicit button.
- The selected mixer tab is stored in session storage and restored when the Side Panel is reopened. If the pinned tab is closed, the selection is cleared instead of silently routing controls to another same-origin tab.
- New mapping targets store their originating tab ID. After a browser restart, stale tab IDs fall back only to the explicitly selected mixer tab with the matching origin.

### Mapping type inference
- Removed the target-type dropdown from the learning workflow and the editable type dropdown from each mapping row.
- Fader/button type is taken from the selected mixer widget or DOM control. Direct Soundcraft parameter targets infer the type from the parameter name (for example `mix`/`aux.*.value` -> fader, `mute`/`solo` -> toggle).
- Existing saved mappings retain their stored type; the type is now display-only to avoid accidentally changing it independently from its target.

### Verification
- Added tests for direct-parameter type inference, invalid parameter keys, explicit one-time mixer-tab selection, and the absence of the manual tab/address and mapping-type selectors.
- Browser permission prompts, tab pinning in Edge, and live operation with the physical mixer still require user-side verification.


## 0.5.0-beta.10 - 2026-10-31

- Automatically use the active HTTP/HTTPS browser tab URL as the mixer address when the extension toolbar button is clicked.
- Open the Side Panel from the toolbar action after capturing the active tab and store the tab context in session storage so an already-open panel can react immediately.
- Keep the current tab selected when multiple tabs share the same mixer origin; refresh the address when the user switches tabs or navigates in the active tab.
- Keep the editable mixer address and the `http://10.10.2.1` fallback for browser-internal tabs and manual workflows.
- Require Chromium 116 or newer for programmatic Side Panel opening from the toolbar action.

## 0.5.0-beta.9 — 2026-10-31

### Fixed
- Fixed MIDI Learn failing when a newly learned MIDI message was received. Beta 8 called `getSelectedOutputFeedbackProfile()` with an undeclared `deviceProfiles` identifier, causing a `ReferenceError` during mapping creation.
- Bind the already loaded `window.OpenSoundcraftMidiDeviceProfiles` helper explicitly in the controller before it is used.
- Treat LED-profile detection as optional and fall back to `generic` if the helper is unavailable or throws; profile detection can no longer interrupt saving a MIDI mapping.

### Verification
- Added a regression test that evaluates the selected-output profile resolver in a browser-like global context, without injecting the missing identifier into the test scope.
- Syntax/manifest checks and the full automated test suite pass.
- Physical MIDI controller and live mixer interaction still require user-side verification.


## 0.5.0-beta.6 — 2026-10-31


## 0.5.0-beta.7 — 2026-10-31

- Persist the successful first-time MIDI permission grant in `chrome.storage.local`, so closing/reopening the Side Panel no longer shows the permission-in-a-new-tab action again.
- Keep the normal **Connect MIDI** action and existing MIDI device layout after the initial grant.
- If Edge later revokes MIDI access and `requestMIDIAccess()` returns `NotAllowedError` or `SecurityError`, clear the saved grant marker and make the first-time permission action available again.
- The permission tab writes the persistent marker before notifying an open Side Panel; the Side Panel also listens for storage changes to update its UI immediately.
- The permission tab checks for an already-granted MIDI permission (without opening ports or prompting) and migrates earlier beta users to the saved one-time-grant state.

- The Side Panel's **Request MIDI permission in new tab** button opens a fresh dedicated permission page. The page waits for the user to click **Request MIDI access** in that tab before calling `navigator.requestMIDIAccess()`; a Side Panel click is not relied on as a user gesture in the new tab. When permission is granted, it only notifies the Side Panel; the user clicks **Connect MIDI** there to start a separate MIDI session from a fresh user gesture, avoiding an immediate second `requestMIDIAccess()` call in the permission callback.
- Added `midi-permission.html` and `midi-permission.js`. The permission page does not open MIDI ports or receive data; it only obtains the origin permission and notifies the Side Panel.
- On Microsoft Edge, MIDI disconnect now detaches only the input callbacks opened by the extension and drops JS references. The Edge path does not enumerate the native input/output maps, touch output ports, mutate statechange handlers, or call `MIDIPort.close()`. Native cleanup is left to Edge/garbage collection. Other Chromium browsers retain explicit close behaviour.
- Updated German and English labels and release documentation to describe the tab-based permission flow and Edge-specific disconnect behaviour accurately.
- Validation: syntax/manifest checks and all 53 automated tests pass. The Edge permission prompt and hardware disconnect still require testing on the affected Windows/Edge machine.


## 0.5.0-beta.5 — 2026-10-30

### Fixed
- Removed the Web MIDI Permissions API pre-check that could incorrectly report MIDI as disabled in Edge extension-page contexts. The extension now calls `navigator.requestMIDIAccess()` directly from the explicit **Connect MIDI** button, with no automatic startup request.
- Permission failures now display the real DOMException name/message, the extension page's actual origin, and the available MIDI Permissions-Policy state. Guidance clarifies that MIDI permission applies to the extension origin, not the mixer IP.
- Added a bounded port-close helper which clears its timeout after a successful close and avoids leaving orphaned timers during manual release.

### Safer device handling
- MIDI inputs are not opened automatically. The default is no input selected; a single input must be selected explicitly. Opening all inputs remains an opt-in warning mode.
- Added **Disconnect MIDI / release ports** to detach input listeners, close any open ports with a timeout, and drop the `MIDIAccess` reference before a controller is unplugged.
- Removed JavaScript `MIDIAccess.statechange` hot-plug subscriptions in this safe mode. Refresh the port list manually after reconnecting a device.
- Output feedback remains idle unless a user selects a MIDI output and enables feedback.

### Verification
- `npm run check` and `npm test` pass. Tests cover explicit permission requests, origin-aware error diagnostics, no-input-by-default behavior, manual port release, timeout cleanup, and no hot-plug listener.
- These automated tests do not exercise Edge's native Windows MIDI backend or validate an actual USB disconnect on the target PC.

### Known limitation
- A browser-process crash in Edge/Windows MIDI drivers cannot be caught or fully prevented by the extension. If Edge still crashes after all MIDI inputs are unselected and ports released, the issue is below the extension layer and requires Edge/Windows version and driver investigation.

## 0.5.0-beta.3 — 2026-10-30

### Fixed
- Guard content-script messages against synchronous `chrome.runtime.sendMessage()` exceptions after an extension reload invalidates the old content-script context.
- Stop sending further messages from a stale content-script context after the first invalidation is detected.
- Keep asynchronous message rejections handled and optionally log non-invalidation errors for target-picking messages.

### Notes
- A page that was already open during an extension reload still needs one refresh so the new content script can be installed. This guard prevents the stale script from producing repeated uncaught errors; it cannot revive an invalidated extension context.

### Verified
- JavaScript syntax and the automated test suite pass.
- Added a regression test for the synchronous `Extension context invalidated` failure path.

# Changelog

## 0.5.0-beta.2 — 2026-10-30

### Fixed
- The Side Panel now requests Web MIDI access automatically when it opens, instead of requiring the user to press Connect MIDI first. The button remains available as a retry if the browser blocks or denies the automatic request.
- Color input swatches now have explicit sizing and visible hex-value labels, so the selected active/inactive colors are visible in each mapping.
- Missing or malformed color fields in old profiles are normalized safely.

### Added
- Persist the most recently selected active and inactive LED colors in extension storage and use them as defaults for newly learned mappings.
- Clicking a target in the mixer automatically starts MIDI Learn.
- After a MIDI assignment is saved, target picking automatically reopens so multiple controls can be learned in sequence.
- `Esc` ends the continuous learning session both when focus is in the mixer tab and when focus is in the Side Panel. The Stop learning button provides the same action.
- Added tests for color preference persistence, automatic MIDI access initialization, auto-learn after target selection, continuous picker restart, and ESC cancellation.

### Verified
- `npm run check` passes.
- All automated tests pass.
- Tests use a simulated mixer page and static workflow assertions; browser MIDI permission prompts, live mixer interaction, and physical MIDI hardware still require verification on the user's computer.

## 0.5.0-beta.1 — 2026-10-30

### Added
- Replaced the separate controller tab with a persistent Chromium Side Panel opened from the extension toolbar button. The panel remains available while switching between browser tabs.
- Added direct Soundcraft parameter targets for controls that are not visible in the current mixer view (for example input-to-Aux send values).
- Added push-style MIDI feedback by monitoring Soundcraft `setValue`, `setValueX` and `putValue` parameter updates. A slower polling pass remains as a fallback for unsupported page variants and DOM controls.
- Extended button-state feedback for generic MIDI outputs and AKAI APC mini MK2. RGB pad active/inactive colors are configurable and mapped to the APC palette; fixed-color Track/Scene buttons are controlled on/off.
- Kept button feedback active while a control is not visible by following its stable parameter key.

### Changed
- Set the minimum supported Chrome version to 114 for the Side Panel API.
- Reduced the fallback feedback polling frequency; Soundcraft parameter updates are now event-driven where the page API is available.
- Hid the generic MIDI output-channel setting when the APC mini MK2 profile is selected because its LED protocol uses fixed channels.

### Verified
- `npm run check` passes.
- Automated tests cover direct hidden Aux Send targets, parameter monitor push updates, Side Panel manifest configuration, and APC mini MK2 LED message formats.
- Tests use a simulated mixer page. The physical Soundcraft mixer and APC mini MK2 hardware still require live verification.

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
- Tests use a simulated mixer widget tree; please verify on the physical mixer web interface after updating the extension.

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


## 0.5.0-beta.8 — 2026-10-31

- Automatically preselect the LED feedback profile for newly created mappings based on the currently selected MIDI output.
- Detect the AKAI APC mini MK2 from the Web MIDI output name/manufacturer and default its new button mappings to the `apc-mini-mk2` profile.
- Keep the generic profile as the fallback for other devices, no selected output, or unidentified output names.
- Preserve manual per-mapping profile selection; changing the selected MIDI output does not silently rewrite existing mappings.
