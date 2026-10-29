# Open Soundcraft MIDI

> [!CAUTION]
> The code was completely written by AI. Use at your own risk.

**Beta · Version 0.4.0-beta.3 · MIT License**

Open Soundcraft MIDI maps MIDI controllers to the controls on a Soundcraft Ui mixer web interface. The mixer is controlled directly through the browser tab that serves its user interface; no additional local service is required.

The controller UI is available in **German and English**. This is an independent community project and is not affiliated with Soundcraft or HARMAN. Product names and trademarks belong to their respective owners.

## Features

- Web MIDI input discovery and live MIDI message monitor.
- MIDI Learn for absolute Control Change (CC), Note On buttons, and Pitch Bend.
- Target picking on canvas-based mixer UIs using the page's widget tree, with a DOM fallback for ordinary HTML controls.
- Assignment of faders, buttons, checkboxes, switchboxes, radio controls, tabs and other detected action widgets.
- Dynamic mapping labels: renaming a channel updates labels for faders and their buttons.
- MIDI output feedback for fader values to control-surface LED rings and motorised faders.
- Per-mapping MIDI feedback enable, output channel, and CC number. Output format can be Automatic, 7-bit CC or 14-bit Pitch Bend.
- Locally stored mappings with JSON import/export.
- Runtime permission prompts for the mixer website host.

## Install the browser extension

Requirements: a recent desktop version of Chrome or Edge and a MIDI controller. MIDI output feedback requires a controller that exposes a MIDI output port.

1. Download and extract the ZIP asset attached to the GitHub beta release, or download/clone this source tree.
2. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
3. Enable **Developer mode** and choose **Load unpacked**.
4. Select the extracted directory containing `manifest.json`.
5. Open the mixer web interface in a browser tab. The default address is `http://10.10.2.1`.
6. Click the extension icon to open the controller page.
7. Click **Connect MIDI** and grant browser MIDI access.
8. Enter the mixer address and click **Open / find mixer**. Grant site access when the browser prompts you.
9. Choose the mixer tab, click **Choose target**, then click the fader handle, button, switch, or other control you want to map.
10. Select the mapping type and click **Start MIDI Learn**. Move the desired CC knob/fader or press a MIDI button.

For an editable value, use an absolute CC fader/knob or Pitch Bend. For a button, use a MIDI button. On canvas-based interfaces, a segmented control is mapped using the exact point you clicked. Press `Esc` to cancel target picking.

### Host permissions

The default address is `http://10.10.2.1`. No mixer website access is granted automatically: when you explicitly open/find a mixer, the extension requests permission for that HTTP/HTTPS origin. Permission is scoped to that origin. The mixer page must be reachable from the computer running the browser.

## MIDI output feedback (LED rings and motor faders)

1. Connect MIDI and choose a device under **MIDI output**.
2. Keep **Send fader feedback** enabled.
3. For each fader mapping, leave **Feedback** enabled or configure its output channel and CC number.
4. Choose **Automatic** to use CC feedback for CC input mappings and Pitch Bend feedback for Pitch Bend mappings. Select a fixed format if your controller requires it.

The extension polls current values from mapped controls and sends a message only when the quantized output value changes. CC feedback is the common choice for LED rings; motor-fader and LED protocols differ between controllers, so match the channel/message type required by the device. The output feedback is not a device-specific SysEx implementation. A MIDI controller may echo outgoing messages into its input; the extension suppresses recently sent matching feedback messages to reduce loops.

## Renamed channel labels

The controller refreshes mapping labels from the active mixer page. It reads the current channel name through the strip widget API first, then falls back to the stable channel parameter prefix. Saved target identity does not depend on mutable display-name fields, and labels can still refresh if the individual control widget is rebuilt. Fader, Mute, Solo and other button assignments are kept in sync while the relevant mixer page is open.

## Existing profiles

Profiles from earlier releases are accepted where the saved target data is still compatible. Older target formats that do not store a browser-widget identity cannot be converted automatically. Recreate those mappings by selecting the same control on the mixer website.

Profiles are saved in browser extension storage. Use **Export JSON** before updating the extension or moving to another browser profile.

## Development and tests

Requirements: Node.js 20 or newer. No npm dependencies are needed for the extension or its tests.

```sh
npm run check
npm test
```

Tests exercise a simulated mixer widget tree, including Mute, Solo, generic buttons, parameter-backed sliders, coordinate-sensitive controls, renamed labels for both faders and buttons, and reading current normalized fader values. These tests do not replace testing with the specific mixer firmware and MIDI controller you use.

## Repository layout

- `manifest.json` — Chromium Manifest V3 extension manifest and host permissions.
- `background.js` — opens the controller page.
- `controller/` — bilingual UI, MIDI Learn, mapping profiles, MIDI output feedback.
- `content/soundcraft-ui.js` — target picker and DOM-control fallback.
- `tests/` — automated widget-interaction tests.
- `.github/workflows/` — CI and tagged beta release automation.

## Beta releases

A maintainer can publish a GitHub pre-release by pushing a tag such as `v0.4.0-beta.3`. GitHub Actions runs syntax checks and tests, packages the source, and attaches a ZIP to the pre-release. See [`docs/RELEASING.md`](docs/RELEASING.md).

## License

MIT; see `LICENSE`.
