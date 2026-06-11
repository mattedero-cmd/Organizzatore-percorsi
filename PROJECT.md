# PROJECT

## Nome progetto

Organizzatore Percorsi

## Obiettivo

Web app responsive per organizzare giornate lavorative con piu tappe, clienti, indirizzi, tempi di guida, durata interventi, orari di apertura, meteo, mappa e costo finale.

L'app deve essere comoda su iPhone durante il lavoro: poche azioni, schermate chiare, ricerca rapida e inserimento vocale.

## Stato attuale

- Frontend responsive in `public/`.
- Backend API Node.js in `server/`.
- Database Postgres su Vercel (Prisma Postgres, nome: `prisma-postgres-cobalt-globe`).
- Variabili ambiente Vercel con prefisso `RouteOrg_` (es. `RouteOrg_DATABASE_URL`).
- Archivio indirizzi con filtro per cliente/attivita e citta.
- Giri salvati con rinomina ed eliminazione.
- Calcolo percorso ottimizzato, tempi, km e costi.
- Meteo per tappe (Open-Meteo gratuito).
- PWA installabile (cache v18).
- Mappa in app con Leaflet/OpenStreetMap e pulsanti navigazione esterna (Google Maps, Apple Mappe).
- Supporto vocale progressivo tramite Web Speech API e parser backend.
- Contatti rapidi (telefono/email) nelle tappe del risultato percorso.
- Ordine manuale tappe con ricalcolo.

## Fix applicati il 2026-06-02 (sessione Claude Code)

- `server/db.js`: aggiunto riconoscimento variabili Postgres con prefisso `RouteOrg_`
  (`RouteOrg_DATABASE_URL`, `RouteOrg_POSTGRES_URL`, `RouteOrg_PRISMA_DATABASE_URL`).
  Senza questo fix il DB non si connetteva su Vercel e tutti i giri fallivano con errore 500.
- `public/app.js`: aggiunto guard in `renderResult` prima di accedere a `result.rows`,
  `result.finalLeg` e `result.summary`. Evita crash silenzioso su giri con struttura incompleta.
- Cache PWA aggiornata a v18.

## Fix applicati il 2026-06-02 (seconda sessione Claude Code)

- `public/styles.css`: toast non leggibile in night mode. Il toast usava
  `background: var(--text)` che in night mode e quasi bianco (#f7ffff), con
  `color: white` → testo bianco su sfondo bianco. Sostituito con colori fissi
  `background: #1a2a2a` e `color: #f0fffe` che funzionano in entrambi i temi.
- `server/weatherService.js`: caricamento giro bloccante per timeout meteo.
  `attachWeather` chiamava Open-Meteo in sequenza (una per tappa, 9s timeout
  ciascuna). Con 3 tappe = 27s, Vercel chiudeva la connessione. Fix: chiamate
  parallele con `Promise.all` e timeout ridotto a 5s → max 5s totali per N tappe.
- Cache PWA aggiornata a v19.

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
  index.html               # shell PWA, carica SOLO app.js + styles.css
  app.js                   # logica principale, state, render, eventi — tutta la UI
  styles.css               # CSS unico
  service-worker.js        # PWA offline, cache versionata
  manifest.webmanifest
  seed-addresses.json
  route-management-lite.js    # NO-OP (compatibilità HTML in cache)
  archive-filter-enhancer.js  # NO-OP (compatibilità HTML in cache)
server/
  index.js                 # HTTP server, routing API (no Express)
  db.js                    # SQLite/Postgres, CRUD, supporto prefisso RouteOrg_
  planner.js               # ottimizzazione percorso, permutazioni
  googleMapsService.js     # Places/Geocoding/Directions
  mapService.js            # routing MapQuest/ORS/fallback
  weatherService.js        # meteo Open-Meteo/OpenWeatherMap
  voiceParser.js           # parser comandi vocali
  apiStats.js              # tracciamento chiamate API esterne
  auth.js                  # hash password, token
  env.js                   # caricamento .env
```

## Caricamento script in index.html

`index.html` carica **solo** `app.js` (ES module) e `styles.css`. Tutta la UI vive
in `app.js` seguendo i pattern `render()`/`api()`/`_svg()`.

> Nota storica: in passato esisteva una catena di "enhancer/guard/lite" che
> wrappavano `window.fetch` e riscrivevano `#app.innerHTML`. Sono stati rimossi
> (v4.073) perché non più caricati e fonte di bug/duplicazione. Restano solo due
> file no-op (`route-management-lite.js`, `archive-filter-enhancer.js`) come
> innocua compatibilità per eventuali HTML ancora in cache PWA. **Non
> reintrodurre** script paralleli: ogni funzionalità va dentro `app.js`.

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
