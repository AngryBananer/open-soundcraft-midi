# Open Soundcraft MIDI

> ⚠️ **AI-generated code warning:** The entire codebase was written with AI. It has not been independently reviewed or fully audited. This is beta software. Use it at your own risk, test it before using it in a live environment, and back up your MIDI profiles regularly.

**Version:** 0.6.0 · **License:** MIT  
**Languages:** English · [Deutsch](README.de.md)

Open Soundcraft MIDI connects a MIDI controller to the browser-based interface of a Soundcraft Ui mixer. Mixer control is performed through the mixer tab that is open in your browser.

## Features

- Control mixer faders, buttons, switches, and other supported controls using MIDI.
- MIDI Learn for Control Change (CC), Note, and Pitch Bend messages, including continuous learning for multiple controls.
- Send fader values and button states back to compatible MIDI controllers, including LED rings, RGB pads, and supported motorized faders.
- AKAI APC mini MK2 button/pad LED feedback with configurable colors. The APC mini MK2's physical faders are not motorized and cannot display returned fader values.
- Map Soundcraft parameters directly, including controls that are not currently visible, such as Aux sends.
- Save mappings locally and import or export profiles as JSON.
- English and German interface in the Chromium Side Panel.

## Installation

**Requirements:** Desktop Microsoft Edge or Google Chrome (Chromium), and a MIDI controller. A MIDI output is also required for controller feedback. Use a current browser version with Side Panel and Web MIDI support.

1. Download and extract the project ZIP file.
2. Open `edge://extensions` in Edge or `chrome://extensions` in Chrome.
3. Enable **Developer mode** and choose **Load unpacked**.
4. Select the extracted project folder containing `manifest.json`.
5. Open the extension from the browser toolbar.

## Quick start

1. Open your Soundcraft Ui mixer web interface in a browser tab.
2. Open the extension Side Panel and click **Connect MIDI**. The current HTTP(S) tab is assigned as the mixer automatically. The browser may ask you to grant the extension access to the mixer website. To change the mixer tab later, use **Assign current tab as mixer**.
3. On the first MIDI connection, a separate permission tab may open. Click **Request MIDI access** in that tab. Then return to the Side Panel and click **Connect MIDI** again.
4. Select the desired **MIDI input**. To send feedback to the controller, also select a **MIDI output** and leave MIDI feedback enabled. The last selected input and output are restored when available.
5. Click **Pick target** and then click a control in the mixer. MIDI Learn starts automatically. Move a CC control, move a Pitch Bend control, or press a MIDI button, as appropriate for the selected mixer target. After a mapping is saved, the next target can be picked. Press `Esc` to stop continuous target selection/learning.
6. Manage saved assignments in **Mappings**. Use **Export JSON** to back up a profile; use **Import JSON** to restore one.

## Mapping controls that are not visible

Expand **Direct parameter target**, enter a Soundcraft parameter key, and apply it. Examples:

- `i.7.mix` — input fader
- `i.7.aux.0.value` — input Aux send
- `a.0.mix` — Aux master

Then choose **Start MIDI Learn** and move or press the MIDI control you want to assign.

## Interface and connection behavior

The **MIDI device**, **Mixer website**, and **Mappings** sections can be collapsed independently. Open or close the Side Panel using the extension toolbar button. Closing the Side Panel does not stop MIDI control. The background MIDI service runs only while a mixer tab is selected.

## Notes and limitations

- MIDI permission is granted to the extension. Permission to access the mixer website is requested separately when assigning the mixer tab.
- The initial Web MIDI permission request is made from a separate regular browser tab because some Chromium browsers do not reliably show the permission prompt from the Side Panel.
- Device feedback depends on the capabilities and MIDI protocol of the selected controller. The APC mini MK2 profile supports button/pad LEDs, not fader-position feedback.
- This is an independent community project and is not affiliated with Soundcraft or HARMAN. Product names and trademarks belong to their respective owners.
- Browser versions, mixer firmware, and MIDI hardware can behave differently. Automated tests do not replace testing with your own mixer and controller.

## Adding another MIDI controller

Controller support is modular. The hardware protocol belongs in its own device module, while detection and capabilities are registered in the shared device-profile module. See the implementation contract and step-by-step guide in [`docs/ADDING_MIDI_CONTROLLERS.md`](docs/ADDING_MIDI_CONTROLLERS.md).

## Development and tests

**Requirements:** Node.js 20 or later. No npm dependencies are required.

```sh
npm run check
npm test
```

## License

MIT. See [`LICENSE`](LICENSE).

---

[Read this README in German](README.de.md).
