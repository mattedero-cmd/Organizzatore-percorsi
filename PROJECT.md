# PROJECT

## Nome progetto

Organizzatore Percorsi

## Obiettivo

Web app responsive per organizzare giornate lavorative con piu tappe, clienti, indirizzi, tempi di guida, durata interventi, orari di apertura, meteo, mappa e costo finale.

L'app deve essere comoda su iPhone durante il lavoro: poche azioni, schermate chiare, ricerca rapida e inserimento vocale.

## Stato attuale

- Frontend responsive in `public/`.
- Backend API Node.js in `server/`.
- Database locale SQLite e supporto Postgres/Vercel.
- Archivio indirizzi.
- Giri salvati.
- Calcolo percorso, tempi, km e costi.
- Meteo per tappe.
- PWA installabile.
- Mappa in app con Leaflet/OpenStreetMap e apertura navigazione esterna.
- Supporto vocale progressivo tramite Web Speech API e parser backend.

## Regola di continuita per Codex

Prima di riprendere lavori importanti, rileggere:

- `PROJECT.md`
- `VISIONE_PROGETTO.md`
- `ROADMAP.md`
- `DECISIONI.md`

Dopo modifiche rilevanti, aggiornare questi file prima di chiudere il turno.

## Repository e pubblicazione

Repository GitHub di riferimento:

`mattedero-cmd/Organizzatore-percorsi`

Deploy pubblico:

`https://organizzatore-percorsi.vercel.app`

Regola: mantenere il progetto sincronizzato su GitHub. Vercel deve pubblicare da GitHub quando possibile.

## Architettura attuale

```text
public/
  index.html
  app.js
  styles.css
  map-enhancer.js
  route-actions-enhancer.js
  service-worker.js
server/
  index.js
  db.js
  planner.js
  mapService.js
  weatherService.js
  voiceParser.js
data/
  seed-addresses.json
```

## API principali

- `GET /api/addresses`
- `POST /api/addresses`
- `PUT /api/addresses/:id`
- `DELETE /api/addresses/:id`
- `POST /api/plan`
- `POST /api/route-shape`
- `GET /api/routes`
- `GET /api/routes/:id`
- `PUT /api/routes/:id`
- `DELETE /api/routes/:id`
- `POST /api/voice/parse`
