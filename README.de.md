# Open Soundcraft MIDI

> [!CAUTION]
> **KI-generierter Code:** Der gesamte Code dieses Projekts wurde vollständig mit KI geschrieben. Er wurde nicht unabhängig vollständig geprüft oder auditiert. Die Erweiterung ist Beta-Software. Nutzung auf eigene Verantwortung; teste sie vor einem Live-Einsatz und sichere deine MIDI-Profile regelmäßig.

**Version:** 0.6.0-beta.2 · **Lizenz:** MIT  
**Sprachen:** [English](README.md) · Deutsch

Open Soundcraft MIDI verbindet einen MIDI-Controller mit der browserbasierten Oberfläche eines Soundcraft-Ui-Mixers. Die Steuerung erfolgt über den im Browser geöffneten Mixer-Tab.

## Funktionen

- Fader, Tasten, Schalter und weitere unterstützte Mixer-Bedienelemente per MIDI steuern.
- MIDI Learn für Control Change (CC), Note und Pitch Bend; fortlaufende Zuordnung mehrerer Bedienelemente.
- Fader-Werte und Tasten-Zustände an kompatible MIDI-Controller zurücksenden, darunter LED-Ringe, RGB-Pads und unterstützte Motorfader.
- LED-Feedback für Tasten und Pads des AKAI APC mini MK2 mit konfigurierbaren Farben. Die physischen Fader des APC mini MK2 sind nicht motorisiert und können keine zurückgesendeten Fader-Werte anzeigen.
- Direkte Soundcraft-Parameter-Zuordnung, auch für aktuell nicht sichtbare Bedienelemente wie Aux-Sends.
- Zuordnungen lokal speichern sowie Profile als JSON importieren und exportieren.
- Deutsch- und englischsprachige Oberfläche im Chromium-Side-Panel.

## Installation

**Voraussetzungen:** Desktop-Version von Microsoft Edge oder Google Chrome (Chromium) und ein MIDI-Controller. Für Rückmeldungen an den Controller wird zusätzlich ein MIDI-Ausgang benötigt. Verwende eine aktuelle Browserversion mit Side-Panel- und Web-MIDI-Unterstützung.

1. ZIP-Datei herunterladen und vollständig entpacken.
2. `edge://extensions` (Edge) oder `chrome://extensions` (Chrome) öffnen.
3. **Entwicklermodus** aktivieren und **Entpackte Erweiterung laden** wählen.
4. Den entpackten Projektordner auswählen, in dem `manifest.json` liegt.
5. Die Erweiterung über das Symbol in der Browser-Symbolleiste öffnen.

## Schnellstart

1. Die Soundcraft-Ui-Mixer-Webseite in einem Browser-Tab öffnen.
2. Die Seitenleiste der Erweiterung öffnen und auf **MIDI verbinden** klicken. Der aktuelle HTTP(S)-Tab wird automatisch als Mixer übernommen. Der Browser fragt gegebenenfalls nach der Berechtigung für den Zugriff auf die Mixer-Webseite. Mit **Aktuellen Tab als Mixer festlegen** kann das Mixer-Ziel später gewechselt werden.
3. Beim ersten MIDI-Verbindungsaufbau öffnet sich möglicherweise ein separater Berechtigungs-Tab. Dort auf **MIDI-Zugriff anfragen** klicken. Anschließend zur Seitenleiste zurückkehren und erneut **MIDI verbinden** wählen.
4. Den gewünschten **MIDI-Eingang** auswählen. Für Rückmeldungen an den Controller zusätzlich einen **MIDI-Ausgang** auswählen und MIDI-Feedback aktiviert lassen. Die zuletzt ausgewählten Ein- und Ausgänge werden wiederhergestellt, sofern sie verfügbar sind.
5. Auf **Ziel wählen** klicken und anschließend das gewünschte Bedienelement im Mixer anklicken. MIDI Learn startet automatisch. Je nach Ziel einen CC-Regler, Pitch Bend oder eine MIDI-Taste bedienen. Nach dem Speichern einer Zuordnung kann das nächste Ziel ausgewählt werden. Mit `Esc` wird die fortlaufende Zielauswahl bzw. der Lernmodus beendet.
6. Zuordnungen im Bereich **Zuordnungen** verwalten. Mit **JSON exportieren** kannst du ein Profil sichern und mit **JSON importieren** wiederherstellen.

## Nicht sichtbare Mixer-Parameter zuordnen

Den Bereich **Direktparameter-Ziel** aufklappen, einen Soundcraft-Parameterschlüssel eingeben und übernehmen. Beispiele:

- `i.7.mix` – Input-Fader
- `i.7.aux.0.value` – Input-Aux-Send
- `a.0.mix` – Aux-Master

Anschließend **MIDI Learn starten** wählen und den gewünschten MIDI-Regler bzw. die Taste bedienen.

## Bedienoberfläche und Verbindung

Die Bereiche **MIDI-Gerät**, **Mixer-Webseite** und **Zuordnungen** lassen sich unabhängig einklappen. Das Side-Panel wird über das Erweiterungssymbol geöffnet und geschlossen. Das Schließen der Seitenleiste beendet die MIDI-Steuerung nicht. Der Hintergrunddienst läuft nur, solange ein Mixer-Tab ausgewählt ist.

## Hinweise und Einschränkungen

- Die MIDI-Berechtigung wird der Erweiterung erteilt. Die Berechtigung für die Mixer-Webseite wird separat beim Festlegen des Mixer-Tabs angefragt.
- Die erste Web-MIDI-Berechtigungsanfrage erfolgt über einen separaten normalen Browser-Tab, da manche Chromium-Browser den Freigabedialog aus dem Side-Panel nicht zuverlässig anzeigen.
- Das Feedback hängt von den Fähigkeiten und dem MIDI-Protokoll des Controllers ab. Das APC-mini-MK2-Profil unterstützt Tasten-/Pad-LEDs, aber keine Fader-Wert-Rückmeldung.
- Dieses unabhängige Community-Projekt steht in keiner Verbindung zu Soundcraft oder HARMAN. Produktnamen und Marken gehören ihren jeweiligen Inhabern.
- Browserversionen, Mixer-Firmware und MIDI-Hardware können sich unterschiedlich verhalten. Automatisierte Tests ersetzen keinen Test mit dem eigenen Mixer und Controller.

## Weitere MIDI-Controller hinzufügen

Die Controller-Unterstützung ist modular aufgebaut. Das Hardware-Protokoll gehört in ein eigenes Gerätemodul; Erkennung und Fähigkeiten werden im gemeinsamen Geräteprofil-Modul registriert. Die technische Schnittstellenbeschreibung und Schritt-für-Schritt-Anleitung stehen in [`docs/ADDING_MIDI_CONTROLLERS.md`](docs/ADDING_MIDI_CONTROLLERS.md).

## Entwicklung und Tests

**Voraussetzung:** Node.js 20 oder neuer. Es werden keine npm-Abhängigkeiten benötigt.

```sh
npm run check
npm test
```

## Lizenz

MIT – siehe [`LICENSE`](LICENSE).

---

[Read this README in English](README.md).
