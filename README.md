# GER_map_plz2

Interaktive Deutschlandkarte mit PLZ-2-Gebieten (erste zwei Ziffern) inkl. klickbarem Kontakt-Popup für `VAD`, `KAMLIGHT`, `KAMHEAVY`.

## Datenpflege: vollständige Liste pro PLZ-2

Kontakte werden **nicht** im Frontend-Code gepflegt, sondern in:

- [data/plz_contacts.csv](data/plz_contacts.csv)

Die CSV enthält die **komplette Liste** `00` bis `99` und pro PLZ-2 jeweils drei Einträge:

- `VAD`
- `KAMLIGHT`
- `KAMHEAVY`

Damit hat jede PLZ-2 eigene Eingabefelder (`name`, `tel`, `mail`).

## CSV-Format

Header:

`plz2,role,name,tel,mail`

Beispiel:

```csv
plz2,role,name,tel,mail
00,VAD,VAD Team PLZ 00,+49 30 10000 100,vad.plz00@firma.de
00,KAMLIGHT,KAMLIGHT Team PLZ 00,+49 30 10001 101,kamlight.plz00@firma.de
00,KAMHEAVY,KAMHEAVY Team PLZ 00,+49 30 10002 102,kamheavy.plz00@firma.de
```

## Build-Pipeline

1. CSV pflegen (`data/plz_contacts.csv`)
2. JSON generieren (`public/plz_contacts.json`)
3. Karte lädt JSON automatisch

Skripte:

- `npm run build:contacts` -> validiert CSV und erzeugt JSON
- `npm run dev` -> erzeugt JSON und startet Dev-Server
- `npm run build` -> erzeugt JSON und baut Dist

## Validierungen im Build-Skript

Das Skript [scripts/build-contacts.mjs](scripts/build-contacts.mjs) prüft:

- korrekten Header
- `plz2` zweistellig (`00-99`)
- `role` nur `VAD`, `KAMLIGHT`, `KAMHEAVY`
- `name`, `tel`, `mail` vorhanden
- keine doppelten Kombinationen `plz2+role`
- Vollständigkeit: alle `100 x 3 = 300` Kombinationen vorhanden

## Entwicklung

```bash
npm install
npm run dev
```

## Deployment / iFrame

1. `npm run build`
2. `dist/` deployen (enthaelt `index.html` und `map.html`)
3. `map.html` als iFrame einbinden

Beispiel:

```html
<iframe
  src="https://deine-domain.de/map.html"
  title="Interaktive Deutschlandkarte PLZ-2"
  style="width:100%;max-width:1000px;height:640px;border:0;border-radius:12px"
  loading="lazy"
></iframe>
```

Hinweis: Der Host muss iFrame-Einbettung erlauben (`X-Frame-Options`/`CSP frame-ancestors`).
