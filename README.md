# GER_map_plz2

Interaktive Deutschlandkarte mit PLZ-2-Gebieten (erste zwei Ziffern) inkl. klickbarem Kontakt-Popup für `VAD`, `KAMLIGHT`, `KAMHEAVY`.

## Datenschutz / Betriebsmodell

Dieses Projekt ist auf **Self-Hosting** ausgelegt.

- Keine automatische Veröffentlichung über GitHub Pages
- Keine sensiblen Kontaktdaten in fremden/geoeffentlichten Hosts nötig
- Jeder Betreiber hostet die Karte im eigenen Intranet / eigenen Webserver

## Datenpflege pro PLZ-2 (vollstaendige Liste)

Kontakte werden in der CSV gepflegt:

- [data/plz_contacts.csv](data/plz_contacts.csv)

Format:

`plz2,role,name,tel,mail`

- `plz2`: `00` bis `99`
- `role`: `VAD`, `KAMLIGHT`, `KAMHEAVY`
- pro PLZ-2 und Rolle genau ein Datensatz

## Ohne Node.js nutzbar

Die Karte kann direkt aus dem Repo gestartet werden (Windows-Bordmittel):

1. Repo herunterladen/klonen
2. `serve-map-windows.bat` starten
3. Browser: `http://localhost:8080/map.html`

Hinweis:
- Keine externen Downloads erforderlich
- Die Karte lädt Kontakte zuerst aus JSON und faellt dann auf CSV zurück:
  - `plz_contacts.json` / `public/plz_contacts.json`
  - `data/plz_contacts.csv` / `public/plz_contacts.csv`

## Mit Node.js (optional, für Build/Validierung)

```bash
npm install
npm run build
```

Skripte:

- `npm run build:contacts`: validiert CSV und erzeugt `public/plz_contacts.json`
- `npm run dev`: erzeugt JSON und startet Vite
- `npm run build`: erzeugt JSON und erstellt `dist/`

## Deployment im Intranet

### Variante A: Direkt aus Repo (ohne Build)
- Dateien auf internen Webserver legen (oder lokal per `serve-map-windows.bat`)
- iFrame auf `map.html`

### Variante B: Mit Build (`dist/`)
1. `npm run build`
2. Inhalt von `dist/` auf internen Webserver deployen
3. iFrame auf `map.html`

## iFrame-Einbindung

```html
<iframe
  src="https://dein-intranet-host/plz-map/map.html"
  title="Interaktive Deutschlandkarte PLZ-2"
  style="width:100%;max-width:1000px;height:640px;border:0;border-radius:12px"
  loading="lazy"
></iframe>
```

Hinweis: Host muss iFrame-Einbettung erlauben (`X-Frame-Options`/`CSP frame-ancestors`).
