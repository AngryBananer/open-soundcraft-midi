# Open Soundcraft MIDI

> ⚠️ **Warnung – KI-generierter Code:** Der gesamte Code dieses Projekts wurde vollständig mit KI geschrieben. Er wurde nicht unabhängig vollständig geprüft oder auditiert. Die Erweiterung ist Beta-Software. Nutzung auf eigene Verantwortung; teste sie vor einem Live-Einsatz und sichere deine Profile regelmäßig.

**Version:** 0.5.0-beta.20 · **Lizenz:** MIT

Open Soundcraft MIDI verbindet einen MIDI-Controller mit der Weboberfläche eines Soundcraft-Ui-Mixers. Die Steuerung erfolgt über den geöffneten Mixer-Tab im Browser.

## Funktionen

- Fader, Tasten, Schalter und weitere Mixer-Bedienelemente per MIDI steuern.
- MIDI Learn für CC-Regler, Note-Tasten und Pitch Bend; fortlaufende Zuordnung mehrerer Bedienelemente.
- Rückmeldung von Fader-Werten und Tasten-Zuständen an LED-Ringe, RGB-Pads und Motorfader.
- Vordefiniertes LED-Feedback-Profil für den AKAI APC mini MK2; Farben pro Zuordnung konfigurierbar.
- Direkte Soundcraft-Parameter-Zuordnung, auch für aktuell nicht sichtbare Fader und Aux-Sends.
- MIDI-Profile lokal speichern sowie als JSON importieren und exportieren.
- Deutsch- und englischsprachige Oberfläche im Chromium-Side-Panel.

## Installation

**Voraussetzungen:** Desktop-Version von Microsoft Edge oder Google Chrome (Chromium) und ein MIDI-Controller. Für LED- oder Motorfader-Feedback wird zusätzlich ein MIDI-Ausgang benötigt.

1. ZIP-Datei herunterladen und vollständig entpacken.
2. `edge://extensions` (Edge) oder `chrome://extensions` (Chrome) öffnen.
3. **Entwicklermodus** aktivieren und **Entpackte Erweiterung laden** wählen.
4. Den entpackten Projektordner auswählen, in dem `manifest.json` liegt.
5. Die Erweiterung über das Symbol in der Symbolleiste öffnen.

## Nutzung

1. Die Soundcraft-Ui-Mixer-Webseite in einem Browser-Tab öffnen.
2. Im Side-Panel auf **MIDI verbinden** klicken. Der aktuelle HTTP(S)-Tab wird dabei automatisch als Mixer übernommen und die Browser-Berechtigung für diese Webseite bei Bedarf angefragt. Mit **Aktuellen Tab manuell als Mixer festlegen** kann das Mixer-Ziel später gewechselt werden.
3. Beim ersten MIDI-Start öffnet sich ein Berechtigungs-Tab. Dort **MIDI-Zugriff anfragen** anklicken, anschließend zur Seitenleiste zurückkehren und erneut **MIDI verbinden** wählen.
4. Den gewünschten **MIDI-Eingang** auswählen. Für Rückmeldungen zusätzlich einen **MIDI-Ausgang** wählen und MIDI-Feedback aktiviert lassen.
5. Auf **Ziel wählen** klicken und anschließend das gewünschte Bedienelement im Mixer anklicken. MIDI Learn startet automatisch. Den CC-Regler/Pitch-Bend bewegen oder die MIDI-Taste drücken. Nach dem Speichern wird das nächste Mixer-Ziel zur Auswahl angeboten. Mit `Esc` wird der fortlaufende Lernmodus beendet.
6. Zuordnungen im Bereich **Zuordnungen** verwalten. Mit **JSON exportieren** kannst du Profile sichern und später wieder importieren.

### Nicht sichtbare Mixer-Parameter

Den Bereich **Direktparameter-Ziel** aufklappen, den Soundcraft-Parameterschlüssel eingeben und übernehmen. Beispiele: `i.7.mix` (Input-Fader), `i.7.aux.0.value` (Aux-Send) oder `a.0.mix` (Aux-Master). Danach **MIDI Learn starten** wählen und den gewünschten MIDI-Regler bzw. die Taste bedienen.

### Bedienoberfläche und Verbindung

Die Bereiche **MIDI-Gerät**, **Mixer-Webseite** und **Zuordnungen** lassen sich unabhängig einklappen. Das Side-Panel kann über das Erweiterungssymbol geöffnet und geschlossen werden. Das Schließen der Seitenleiste beendet die MIDI-Steuerung nicht; der Hintergrunddienst läuft nur, solange ein Mixer-Tab ausgewählt ist.

## Hinweise

- Die MIDI-Berechtigung gilt für die Erweiterung. Die Berechtigung für die Mixer-Webseite wird separat beim Übernehmen des Tabs erteilt.
- Der erste MIDI-Zugriff erfolgt über den separaten Berechtigungs-Tab.
- Die Erweiterung ist ein unabhängiges Community-Projekt und nicht mit Soundcraft oder HARMAN verbunden. Produktnamen und Marken gehören ihren jeweiligen Inhabern.
- Browser-, Mixer-Firmware- und MIDI-Controller-Verhalten können variieren. Automatisierte Tests ersetzen keinen Test mit der eigenen Hardware.

## Controller erweitern

Neue MIDI-Controller werden über ein eigenes Hardware-Modul und das zentrale Profilregister integriert. Die verbindliche Architektur, Schnittstellenbeschreibung, Schritt-für-Schritt-Anleitung und Test-Checkliste stehen in [`docs/ADDING_MIDI_CONTROLLERS.md`](docs/ADDING_MIDI_CONTROLLERS.md).

## Entwicklung und Tests

Voraussetzung: Node.js 20 oder neuer. Es werden keine npm-Abhängigkeiten benötigt.

```sh
npm run check
npm test
```

## Lizenz

MIT – siehe [`LICENSE`](LICENSE).
