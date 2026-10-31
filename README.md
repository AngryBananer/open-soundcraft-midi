# Open Soundcraft MIDI

> [!CAUTION]
> The code was completely written by AI. Use at your own risk.
**Beta · Version 0.5.0-beta.14 · MIT License**

Open Soundcraft MIDI maps MIDI controllers to controls on a Soundcraft Ui mixer web interface. The mixer is controlled directly through its browser tab; no additional local service is required.

The controller UI is available in **German and English**. This is an independent community project and is not affiliated with Soundcraft or HARMAN. Product names and trademarks belong to their respective owners.

## Features

- Web MIDI input discovery and live MIDI message monitor. MIDI ownership runs in a hidden Offscreen Document; the Side Panel is only the UI.
- On first setup, **Request MIDI permission in new tab** opens a normal extension tab. Click **Request MIDI access** in that tab to issue the Web MIDI request directly from a user gesture. The successful grant is stored locally; after that, the new-tab permission action is hidden and the Side Panel returns to its normal **Connect MIDI** control.
- MIDI Learn for absolute Control Change (CC), Note On buttons, and Pitch Bend.
- Continuous target-picking workflow: clicking a mixer control automatically arms MIDI Learn; after learning the MIDI message, the next target picker opens automatically.
- Press `Esc` in either the mixer tab or Side Panel to stop the continuous learning session. The **Stop learning** button does the same.
- Target picking on canvas-based mixer UIs using the page's widget tree, with a DOM fallback for ordinary HTML controls.
- Assignment of faders, buttons, checkboxes, switchboxes, radio controls, tabs and other detected action widgets.
- Dynamic mapping labels: renaming a channel updates labels for faders and their buttons.
- MIDI output feedback for fader values and button states to control-surface LED rings, RGB pads and motorised faders.
- Configurable active/inactive button LED colors. Color pickers show the current color; the last chosen colors are persisted and prefilled for new mappings. New mappings automatically preselect the LED feedback profile detected from the currently selected MIDI output (AKAI APC mini MK2 is detected by its Web MIDI port name/manufacturer; other devices use Generic MIDI). Existing mappings retain their manual profile choice.
- Direct Soundcraft parameter mappings for controls that are not currently visible, including Aux Sends.
- Chromium Side Panel opened and closed by clicking the extension toolbar icon. Click once to open the controller; click again to close the Side Panel and reclaim the mixer width. The full controller settings are shown whenever the Side Panel is open. Click **Open mixer** once to pin the exact active browser tab as the mixer target.
- Event-driven fader and button feedback by monitoring Soundcraft parameter updates, with a slower polling fallback.
- Per-mapping MIDI feedback enable, output channel, and CC number. Output format can be Automatic, 7-bit CC or 14-bit Pitch Bend.
- Locally stored mappings with JSON import/export.
- Runtime permission prompts for the mixer website host.

## Install the browser extension

Requirements: a recent desktop version of Chrome or Edge and a MIDI controller. MIDI output feedback requires a controller that exposes a MIDI output port.

1. Download and extract the ZIP asset attached to the GitHub beta release, or download/clone this source tree.
2. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
3. Enable **Developer mode** and choose **Load unpacked**.
4. Select the extracted directory containing `manifest.json`.
5. Open the mixer web interface in a browser tab, then click the extension toolbar icon to open the Side Panel.
6. In the Side Panel, click **Open mixer**. The extension reads the active tab's HTTP/HTTPS URL, requests access for that website origin, and pins that exact tab as the mixer target. Switching to other browser tabs does not change the pinned mixer. If you close the selected mixer tab, assign a new one with the same button.
7. On first MIDI setup, click **Request MIDI permission in new tab** in the Side Panel. In the dedicated permission tab, click **Request MIDI access** so the API call runs directly in a user gesture. After the browser grants access, return to the Side Panel and click **Connect MIDI**. Later starts use the normal **Connect MIDI** button. The MIDI session remains alive when the Side Panel is closed, and can be stopped explicitly with **Disconnect MIDI**. MIDI permission applies to the extension origin (`chrome-extension://…`), not the mixer IP. Check `edge://settings/content/midiDevices` and `edge://policy` if the request is denied.
8. Click **Choose target**, then click the desired fader handle, button, switch, or another control in the pinned mixer tab. The control type is detected from the selected mixer widget; there is no Fader/Button type dropdown.
9. MIDI Learn starts automatically. Move the desired CC knob/fader or press a MIDI button. After the mapping is saved, target picking automatically opens again for the next control.

For an editable value, use an absolute CC fader/knob or Pitch Bend. For a button, use a MIDI button. On canvas-based interfaces, a segmented control is mapped using the exact point you clicked. The repeated target-picking / MIDI Learn workflow continues until you press `Esc` in the mixer tab or Side Panel, or click **Stop learning**.

### Map controls that are not visible

Use **Direct Soundcraft parameter target** instead of target picking. This binds a MIDI control to a Soundcraft parameter key, so the control is not required to be visible in the current mixer view. Examples include `i.7.mix` for an input fader, `i.7.aux.0.value` for an input-to-Aux send, and `a.0.mix` for an Aux master. The exact key and valid channel/index depend on the mixer configuration and firmware. The control type is inferred from the parameter key (for example `mix` and `aux.*.value` are continuous faders; `mute` and `solo` are toggles). No type dropdown is needed. Then use **Start MIDI Learn** for that directly entered parameter target. The mixer tab must remain open and connected; changing its visible page does not affect the direct parameter mapping.

### Host permissions

No mixer website access is granted automatically: when you click **Open mixer**, the extension requests permission for that HTTP/HTTPS origin. Permission is scoped to that origin. The selected tab remains pinned when you switch to other browser tabs. The mixer page must be reachable from the computer running the browser.

After completing setup, click the extension toolbar icon to close the Side Panel and reclaim the mixer width. Click the same icon again to reopen the full controller. The browser performs this toggle using Chromium’s native `openPanelOnActionClick` behaviour. MIDI input handling, mapping execution, LED/fader feedback and Mixer monitoring run in a hidden Offscreen Document, independent of the Side Panel. Closing the Side Panel no longer stops the MIDI engine. The extension Service Worker routes browser-tab operations; it does not own the Web MIDI ports.

## Background runtime and Side Panel lifecycle

Web MIDI ports, MIDI Learn, mapping execution, LED / motor-fader feedback and mixer-value polling are owned by the hidden Offscreen Document, not by the visible Side Panel. The Side Panel can therefore be closed with the toolbar icon without stopping MIDI control. The Offscreen Document is created by the Manifest V3 Service Worker and uses the `WORKERS` lifetime reason for its decoder worker. It remains active while the browser profile is running; closing the browser, disabling/reloading the extension, revoking MIDI permission or a browser/OS crash will stop the session. The Side Panel is only a UI client and receives status updates when it is open again.

The Offscreen Document can use web platform APIs such as Web MIDI, but Chrome exposes only the `chrome.runtime` extension API from that context. Storage, tab access, scripting and page operations are therefore routed through the Service Worker using message RPC. This keeps the actual native MIDI session in one hidden Window context while keeping privileged tab operations in the Service Worker.

## MIDI output feedback (LED rings and motor faders)

1. Click **Connect MIDI**. Previously granted permission is reused; if access is denied, check the extension origin in Edge MIDI settings and retry. Then choose a device under **MIDI output**.
2. Keep **MIDI feedback (faders and buttons)** enabled.
3. For each mapping, leave **Feedback** enabled or configure its output channel and CC number.
4. Choose **Automatic** to use CC feedback for CC input mappings and Pitch Bend feedback for Pitch Bend mappings. Select a fixed format if your controller requires it.

For Soundcraft parameter targets, the extension pushes changes to the Side Panel by observing the mixer page's `setValue`, `setValueX` and `putValue` functions. A slower polling pass remains as a fallback for firmware variants and DOM-only controls. MIDI output is sent only when the quantized value or button state changes. CC feedback is the common choice for LED rings; motor-fader and LED protocols differ between controllers, so match the channel/message type required by the device. The generic feedback is not a device-specific SysEx implementation. A MIDI controller may echo outgoing messages into its input; the extension suppresses recently sent matching feedback messages to reduce loops.

### AKAI APC mini MK2 button LEDs

When the **AKAI APC mini MK2** is selected as the MIDI output, new mappings automatically preselect the **AKAI APC mini MK2** feedback profile. For other outputs (or when no output is selected), new mappings default to **Generic MIDI**. You can still change the profile manually for any mapping and set active/inactive colours. The 8×8 RGB pad matrix uses the device palette (the selected hex colours are mapped to the nearest available palette entry). Track and Scene buttons have fixed red/green LEDs and can only be switched on/off; their colours are hardware-defined. The selected colors remain the defaults for subsequent mappings. The extension sends standard Note On LED messages and does not use SysEx for the APC mini MK2 feedback.

## Renamed channel labels

The controller refreshes mapping labels from the mixer page. It reads the current channel name through the strip widget API first, then falls back to the stable channel parameter prefix. Saved target identity does not depend on mutable display-name fields, and labels can still refresh if the individual control widget is rebuilt. Fader, Mute, Solo and other button assignments are kept in sync while the relevant mixer page is open.

## Existing profiles

Profiles from earlier releases are accepted where the saved target data is still compatible. Older target formats that do not store a browser-widget identity cannot be converted automatically. Recreate those mappings by selecting the same control on the mixer website.

Profiles and last-used feedback colors are saved in browser extension storage. Use **Export JSON** before updating the extension or moving to another browser profile.

## Development and tests

Requirements: Node.js 20 or newer. No npm dependencies are needed for the extension or its tests.

```sh
npm run check
npm test
```

Tests exercise a simulated mixer widget tree, including Mute, Solo, generic buttons, parameter-backed sliders, coordinate-sensitive controls, renamed labels for both faders and buttons, direct parameter targets, feedback color persistence, gesture-bound MIDI permission requests, explicit active-tab mixer selection, accurate permission diagnostics, no-input-by-default behaviour, Edge tab-based MIDI permission requests, Edge-safe input detachment without native close calls, bounded port closing on other Chromium browsers, and the continuous MIDI Learn / ESC workflow. These tests do not replace testing with the specific mixer firmware and MIDI controller you use.

## Repository layout

- `manifest.json` — Chromium Manifest V3 extension manifest and host permissions.
- `background.js` — coordinates the Offscreen MIDI engine, tab communication and native toolbar-icon Side Panel toggle.
- `controller/` — bilingual Side Panel UI client, mapping editor and MIDI Learn controls. MIDI I/O is owned by the Offscreen engine.
- `midi-permission.html` / `midi-permission.js` — dedicated in-tab permission bootstrap for Edge.
- `content/soundcraft-ui.js` — target picker and DOM-control fallback.
- `shared/apc-mini-mk2.js` — APC mini MK2 LED protocol helpers.
- `shared/feedback-colors.js` — persisted color defaults and color validation.
- `shared/midi-device-profiles.js` — detects supported controller-specific feedback profiles from MIDI output names.
- `background/offscreen.html` and `background/midi-engine.js` — hidden persistent MIDI runtime, input handling, MIDI Learn and output feedback.
- `background/midi-worker.js` — lightweight MIDI message decoder worker.
- `shared/soundcraft-page-bridge.js` — injected bridge for direct Soundcraft page parameter access.
- `tests/` — automated widget-interaction and background-runtime tests.
- `.github/workflows/` — CI and tagged beta release automation.

## Beta releases

A maintainer can publish a GitHub pre-release by pushing a tag such as `v0.5.0-beta.14`. GitHub Actions runs syntax checks and tests, packages the source, and attaches a ZIP to the pre-release. See [`docs/RELEASING.md`](docs/RELEASING.md).

## License

MIT; see `LICENSE`.


## Troubleshooting: MIDI permission in Edge

This release does not pre-check `navigator.permissions.query({ name: "midi" })`, because some Edge extension-page contexts can report a misleading state. On first setup, the Side Panel opens `midi-permission.html` in a normal tab. The request is not made on page load: click **Request MIDI access** in the new tab so Edge sees a user gesture in that tab. On success, the grant is stored in `chrome.storage.local`; the Side Panel returns to its normal **Connect MIDI** appearance and hides the new-tab permission action on later launches. The actual `MIDIAccess` session is created by clicking **Connect MIDI** in the Side Panel, avoiding a second initialization from inside the permission callback. If Edge later revokes permission, a failed direct request clears the saved grant marker and makes the first-time permission flow available again. Check `edge://settings/content/midiDevices` and `edge://policy` if access is denied. The permission applies to the extension page origin, not the mixer address such as `http://10.10.2.1`.

## Troubleshooting: MIDI device disconnect

This beta does not subscribe to MIDI hot-plug `statechange` events. Device lists are refreshed manually with **Refresh** after reconnecting. MIDI input handlers are detached when you click **Stop MIDI input**. On Edge, explicit native port closing is skipped; on other Chromium browsers, open ports are asked to close. MIDI feedback is idle unless you select an output and enable it. This reduces extension-side activity, but cannot guarantee protection from a native Edge or Windows MIDI-driver crash.

## Troubleshooting: Extension context invalidated

If the extension is reloaded or updated while the mixer page is open, Chrome invalidates the old content-script context. Refresh the mixer page once (`Ctrl+Shift+R`) after reloading the extension, then reopen the Side Panel. Version 0.5.0-beta.3 safely ignores late messages from the stale context instead of throwing an uncaught error. It cannot restore an already invalidated context without a page refresh.


## MIDI port safety on Windows / Edge

The extension does not open any MIDI input automatically. Select only the controller input you need; opening an input by assigning `onmidimessage` implicitly opens its native MIDI port. The **Stop MIDI input** button removes input handlers. On Edge, the extension deliberately does not call the native `MIDIPort.close()` method because this path may hang the Windows MIDI backend; cleanup is left to Edge when references are released. On other Chromium browsers, explicit port closing remains enabled. Device hot-plug changes are not monitored automatically in this beta; click **Refresh** after reconnecting.

This is a defensive workaround, not a guaranteed fix for a native Chromium/Windows MIDI backend crash. Chromium has documented Windows MIDI disconnect bugs involving WinMM handle cleanup. If Edge still crashes after no inputs are selected (and no output is selected), the crash is likely below the extension layer; update Edge and Windows, and report the Edge version plus Windows build. Do not use the **All MIDI inputs** option unless necessary.


## Edge-specific MIDI permission and device handling

The first Web MIDI permission request is made from the dedicated `midi-permission.html` extension tab, after the user clicks **Request MIDI access** in that tab. The grant is stored locally. The Offscreen Document then owns the actual `MIDIAccess` object and the selected MIDI ports; the Side Panel sends connect/disconnect commands to that engine. Closing the Side Panel does not close the MIDI ports. On Edge/Windows, manual disconnect detaches the exact input callbacks opened by this extension and releases its references without calling `MIDIPort.close()`. Device hot-plug changes are not monitored automatically in this beta; click **Refresh** after reconnecting. This avoids some extension-side close operations but cannot guarantee protection from a native Chromium/Windows MIDI backend crash.
