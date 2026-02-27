# GER_map_plz2

Interaktive Deutschlandkarte mit PLZ-2-Gebieten (erste zwei Ziffern) inkl. klickbarem Kontakt-Popup für `VAD`, `KAMLIGHT`, `KAMHEAVY`.

## Ziel der Datenpflege (barrierearm)
Kontaktdaten werden **nicht** im Frontend-Code gepflegt, sondern in einer leicht editierbaren CSV-Datei:

- Datei: `data/plz_contacts.csv`
- Pflegebar in Excel / LibreOffice / Google Sheets
- Regeln statt Einzelpflege je PLZ:
  - `default` (Fallback)
  - `range` (z. B. 20-39)
  - `exact` (Ausnahme, z. B. 10)

Damit kann das Fachteam Daten ohne Codeänderungen pflegen.

## Datenpipeline

1. CSV pflegen: `data/plz_contacts.csv`
2. Build-Skript erzeugt JSON: `scripts/build-contacts.mjs`
3. Ausgabe für Frontend: `public/plz_contacts.json`
4. Karte lädt zur Laufzeit `plz_contacts.json` und löst Regeln pro PLZ-2 auf.

Priorität der Regeln im Frontend:

1. `exact`
2. `range` (kleinster Bereich gewinnt)
3. `default`
4. Fallback-Kontakt (wenn nichts gepflegt ist)

## CSV-Format
Pflicht-Header:

`rule_type,plz2_exact,plz2_from,plz2_to,role,name,tel,mail`

Erlaubte `rule_type`:
- `default`
- `range`
- `exact`

Beispiele stehen bereits in `data/plz_contacts.csv`.

## Entwicklung

```bash
npm install
npm run dev
```

Wichtige Skripte:

- `npm run build:contacts` erzeugt `public/plz_contacts.json`
- `npm run dev` erzeugt zuerst Kontakte und startet dann Vite
- `npm run build` erzeugt Kontakte und erstellt den Build

## Projektstruktur

- `map.js`: Kartenlogik, PLZ-Rendering, Label-Placement, Kontakt-Resolver
- `styles.css`: CI-angepasste UI-Styles
- `map.html`: Kartenansicht
- `public/gemeinden_simplify200.geojson`: Geodaten
- `public/plz_contacts.json`: generierte Kontaktregeln
- `data/plz_contacts.csv`: editierbare Quelldaten
- `scripts/build-contacts.mjs`: CSV -> JSON Generator

## Hinweis zur Pflege
Wenn ihr viele Änderungen habt:

1. CSV in Tabellen-Tool pflegen
2. Als CSV exportieren
3. `npm run build:contacts` ausführen
4. Ergebnis in Karte prüfen
