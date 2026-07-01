# Istruzioni per Claude — Organizzatore Percorsi

> **Nota per Claude**: questo file va letto all'inizio di ogni sessione.
> Durante il lavoro, se scopri qualcosa di importante che potrebbe servire in futuro
> (un bug ricorrente, una regola implicita dell'utente, un'architettura non ovvia,
> una preferenza stilistica), **aggiornalo in autonomia** prima di fare il commit finale.
> Non serve chiedere permesso — è tuo compito tenerlo aggiornato.

---

## Setup obbligatorio — eseguire subito in ogni nuovo container/sessione

```bash
bash scripts/install-hooks.sh
```

Questo installa il hook `pre-commit` che blocca il commit se le regole non sono rispettate:
- versione app non aggiornata in app.js
- CHANGELOG.md non aggiornato
- service-worker.js e index.html non allineati
- multiplo di 10: sezione "Novità" mancante in renderMenuInfo()

---

## Regole operative — da seguire SEMPRE

### 1. Versione app
- La versione corrente è in `public/app.js` → funzione `renderMenuInfo()`.
- **Ad ogni fix o modifica**, incrementa il patch di 1: `v4.002` → `v4.003`
- Formato: `v[major].[patch tre cifre]` — es. `v4.001`, `v4.002`, …
- Il major cambia solo se l'app cambia radicalmente (nuova struttura, refactor totale).
- Aggiorna anche la data se il mese è cambiato (es. `giugno 2026`).
- Aggiorna anche l'etichetta "Novità vX.XXX" nella stessa funzione se hai aggiunto funzionalità.

### 1b. Changelog — regola OBBLIGATORIA
- **Ad ogni fix**, aggiungi una riga in `CHANGELOG.md` con versione, data e descrizione breve.
- **Ogni 10 fix** (v4.010, v4.020, …): aggiorna la sezione "Novità" in `renderMenuInfo()` con un riassunto dei fix degli ultimi 10.
- **Ogni 100 fix** (v4.100, v4.200, …): scrivi un riassunto totale nella stessa sezione, sostituendo i riepiloghi parziali.
- Il `CHANGELOG.md` è la fonte di verità — non affidarti al contesto della sessione.

### 2. Service Worker e asset versioning
Ad ogni modifica a `public/app.js` o `public/styles.css`, aggiorna **sempre**:
- `public/service-worker.js`: incrementa `CACHE_NAME` (es. `v200` → `v201`) **e** le query string (`?v=20260608-771` → `?v=20260608-772`)
- `public/index.html`: aggiorna le stesse query string — devono essere **identiche** a quelle in `service-worker.js`

Se dimentichi questo passaggio, gli utenti continuano a vedere la versione vecchia dalla cache PWA.

### 3. Sicurezza — non committare mai
- Chiave Google Maps API (`AIzaSy...`) — solo Vercel env vars (`GOOGLE_MAPS_API_KEY`)
- `OPENAI_API_KEY` — solo Vercel env vars
- `ADMIN_SECRET` — solo Vercel env vars
- Indirizzi personali, coordinate di casa o dati identificativi dell'utente

### 4. Branch e deploy
- **Push direttamente su `main`** — deploy automatico su Vercel, visibile a tutti gli utenti.
- Esiste anche il branch `dev` (anteprima Vercel separata), ma si usa **solo quando l'utente chiede esplicitamente** di lavorare in staging prima di rilasciare.
- Non creare PR a meno che l'utente non lo chieda esplicitamente.

### 5. Stile UI — preferenze dell'utente
- L'app ha uno stile coerente e minimalista. **Non introdurre** card con titolo in grande, sfondi pesanti o badge decorativi non presenti altrove nell'app.
- I componenti nuovi devono sembrare nativi all'app: stessi colori CSS var, stesso border-radius, stessa densità visiva.
- L'utente nota subito quando qualcosa "non è in linea col resto" — prima di aggiungere un nuovo componente, guarda come sono fatti quelli simili già esistenti.
- Niente emoji nell'UI (se non già presenti) — usare icone SVG inline tramite la funzione `_svg()` e l'oggetto `I` già definiti in `app.js`.

---

## Architettura del progetto

```
public/
  app.js              # SPA intera — tutta la logica frontend
  styles.css          # CSS unico
  index.html          # Entry point PWA
  service-worker.js   # Cache PWA
  manifest.webmanifest
  admin/
    index.html        # Pannello admin separato
    app.js            # Logica admin

server/
  index.js            # HTTP server Node.js (no Express) — tutte le route API
  db.js               # Accesso DB: SQLite (locale) / PostgreSQL (Vercel)
  auth.js             # hashPassword, verifyPassword, generateToken
  planner.js          # Logica pianificazione percorso e soste
  multiDayPlanner.js  # Pianificazione multi-giorno (V5) — vedi sotto
```

> **Multi-giorno (V5):** prima di toccare `server/multiDayPlanner.js`, l'endpoint
> `/api/plan-multiday` o la UI `renderResultMultiDay`, **leggi SEMPRE `docs/MULTI_GIORNO.md`**
> (fonte di verità: modello mentale dell'utente, vincolo sui test offline, criterio "sul corridoio",
> approcci già falliti da non ripetere) e **aggiornalo** dopo ogni modifica.

---

## Database

- **Locale**: SQLite in `./data/work-routes.sqlite`
- **Produzione** (Vercel): PostgreSQL via env var `DATABASE_URL`
- Il codice in `db.js` gestisce entrambi — usa `getDbMode()` per distinguere
- Le migrazioni sono in `migrateAuth()` in `db.js` — vengono eseguite all'avvio
- Per aggiungere una colonna: aggiungi `ALTER TABLE ... ADD COLUMN ...` dentro `migrateAuth()` con `IF NOT EXISTS` (SQLite) o `DO $$ ... EXCEPTION WHEN duplicate_column` (Postgres)
- ⚠️ **REGOLA CRITICA (v5.077)**: le migrazioni girano SOLO quando `SCHEMA_VERSION` (in cima a `db.js`) cambia — l'esito è registrato nella tabella `schema_meta` e i cold start successivi le saltano (1 query invece di ~50: era la causa dei 504 a catena e del consumo folle di operazioni Prisma). **Se aggiungi/modifichi una migrazione DEVI incrementare `SCHEMA_VERSION`**, altrimenti in produzione non verrà mai eseguita.
- Il pool pg ha `query_timeout: 8000`: query appese → errore leggibile (esposto da `/api/health` in `dbError`), non 504. Un boot fallito viene ritentato dopo 30s (`ensureInit` in `index.js`).

---

## Soste e pause pranzo — architettura (v5.053)

Le soste (`type:"rest"`) e le pause pranzo (`type:"lunch"`) sono **vere tappe del giro**, con comportamento **uniforme** tra riempimento automatico da archivio e scelta manuale da Maps.

- **Planner** (`insertBreaks` in `planner.js`): decide *dove* va la pausa (in base a guida/lavoro cumulati e finestra pranzo) e prova a riempirla dall'**ARCHIVIO** (`addressType:"rest"` / `"restaurant"`, oppure `isRestStop`/`isLunchStop`). **Solo archivio, niente Places API** (rimossa in v5.048 su richiesta utente).
  - `findNearestRestStop(restStops, ...)` → **ritorna un ARRAY** ordinato per distanza (aperti prima, poi orario sconosciuto). `tryInsert` prende il primo spot non già usato.
  - `makeLunchEntry` cerca tra `restaurantStops`, calcola il travel reale del detour (haversine /50km/h, "sul percorso" se perp ≤ 2 km), valida orari con `candidateCloseMin`.
  - Break riempito da archivio → `placeAssigned:true`, `addressId`, `weeklyHours`, `notes`, travel reale. Nessun match → break **neutro** (`placeAssigned:false`, posizione stimata midpoint).
- **Client**: le schede break sono cliccabili (`data-break-pick`). Riempite mostrano nome/indirizzo + "Tocca per cambiare"; neutre mostrano "Tocca per scegliere". Tap → `openMapPickerForField` (picker Maps/Places in-app, centrato sulla posizione stimata) → `onUseDirectly` → replan.
- **Conversione** (`rebuildStopsFromResultRows`):
  - break scelti **manualmente da Maps** (`userPicked:true`) → diventano **tappe fisse persistenti** (il planner non può ri-derivarli, non sono in archivio). Pranzo manuale → `lunchBreak:false` nel replan (no doppia pausa).
  - break da **archivio o neutri** → scartati e **ri-derivati** dal planner ad ogni replan (restano gestiti automaticamente e modificabili).
- Le righe break materializzate (`planner.js`, blocco `result.push`) propagano `weeklyHours`, `notes`, `addressId`, `placeAssigned`.

> Non reintrodurre la ricerca automatica via Places API: l'utente vuole esplicitamente solo l'archivio in automatico, e la scelta manuale via picker.

---

## Sessioni utente

- Token casuale 32 byte hex, salvato in cookie `HttpOnly; SameSite=Lax`
- Scadenza 30 giorni con **sliding expiry**: ogni chiamata a `/api/auth/me` estende la sessione
- `state._authVerified`: flag che indica che l'utente ha completato almeno un login nella sessione corrente. Il 401 su API secondarie fa logout **solo** se questo flag è `true`. Evita falsi logout su app appena aperta.
- **bfcache iOS Safari**: `pageshow` (e.persisted) e `visibilitychange` ri-verificano `/api/auth/me` senza ricaricare la pagina — fix per utenti che trovavano l'app "dentro ma slogati"

---

## Frontend — pattern importanti in app.js

- **`state`**: oggetto globale con tutto lo stato dell'app
- **`render()`**: funzione di re-render principale — chiamata dopo ogni cambio di stato
- **`api(path, options)`**: wrapper fetch con gestione 401/errori
- **`_svg(path, size)`**: genera SVG inline da path SVG; `I` è l'oggetto con le icone nominate
- **`showToast(msg)`**: mostra un toast temporaneo
- **`normalizeSavedRoute(r)`**: normalizza un giro salvato per la visualizzazione
- **`replanFromResult()`**: ricostruisce e ripilanifica il giro corrente dal risultato — usato dai pannelli di modifica dentro la vista risultato

### Ordine handler click sulle card salvate (CRITICO)
I click sulle saved-card vengono gestiti in questo ordine preciso in `renderSaved()`:
1. `[data-share-route]`
2. `[data-rename-route]` (sul titolo `<p>`, non sul container)
3. `[data-delete-route]`
4. `[data-duplicate-route]`
5. `[data-open-route]` (sull'`<article>` intero — deve essere ULTIMO)

Se l'ordine è sbagliato, cliccare i pulsanti apre il giro invece di eseguire l'azione.
Non usare `stopPropagation()` sui container dei pulsanti — rompe tutto. È presente solo sull'input data.

---

## Condivisione giri

- Tabella `shared_routes`: `(token, user_id, route_json, created_at, expires_at)`
- Scadenza 5 giorni; pulizia automatica ogni 6h con `setInterval`
- URL pubblica: `/share/:token` → serve `index.html`, il frontend intercetta il path
- `GET /api/share/:token` — endpoint pubblico, nessuna auth richiesta
- `POST /api/routes/:id/share` — crea il token, richiede auth
- `POST /api/share/:token/import` — importa nel proprio account, richiede auth
- I giri importati hanno `source = "imported"` nel DB e appaiono in viola nell'UI

---

## Admin panel (`/admin/`)

- Autenticazione: `POST /api/admin/login` con `{ secret: ADMIN_SECRET }`
- Il token admin è un HMAC SHA-256 con scadenza 2h, passato in header `x-admin-token`
- Rate limit login: max 3 tentativi, lock 30 min — usa `X-Forwarded-For` per l'IP reale (fix per Vercel/proxy che avrebbero tutti lo stesso IP socket)
- Auto-refresh ogni 30 secondi — `startAutoRefresh()` viene chiamato dopo il login E al boot se c'è già un token in `sessionStorage`

---

## Bug noti e fix già applicati (non riaprire)

| Bug | Fix applicato |
|-----|---------------|
| Utenti loggati fuori su iOS bfcache | `pageshow` + `visibilitychange` in `app.js` |
| Cookie bloccato su iOS PWA | `SameSite=Lax` (era `Strict`) |
| Pulsanti saved-card non funzionavano | Rimosso `stopPropagation()` dal container, handler nell'ordine corretto |
| Rename triggera apertura giro | `data-rename-route` verificato PRIMA di `data-open-route` |
| Admin login bloccato su Vercel | Rate limit usa `X-Forwarded-For` |
| Admin auto-refresh non partiva | `startAutoRefresh()` aggiunto dopo `doLogin()` |
| Autofill Safari blocca pulsante Accedi | `novalidate` sui form, lettura valori diretta dagli input |
| Data/ora sovrapposti su iOS | `min-height: unset`, `gap: 23px`, `max-width: 75%` su `.rp-when-row` |
| Sosta/ristorante chiuso inserito comunque | `googleMapsService.js`: quando tutti i candidati sono chiusi all'orario previsto, restituisce `null` invece di inserire con warning |
| Login impossibile su Safari PWA con Face ID | `fetch()` con URL relativo lancia `TypeError: "The string did not match the expected pattern."` in Safari PWA — fix: `window.location.origin + path` in **tutti** i fetch, inclusi `api()`, `fetch('/api/auth/me')` e il form di login |
| Server crash ad avvio su Vercel (forced login) | `runSql` e `sqlValue` non erano `export` in `db.js` — import da `apiStats.js` crashava il server; **esportare sempre** le funzioni DB usate da moduli esterni |
| Impostazioni tappa mancanti per tappe spezzate | `getRvStopRow` escludeva `stopPart === "morning"` — fix: includere morning nel filtro, calcolare `rvStopIdx` solo per morning/undefined |
| Flag "Prima tappa" ignorato dal planner | Planner cercava `fixedFirst` solo in pos. 0 — fix: `findIndex` su tutta la lista + `splice`/`unshift` |
| Pranzo non prioritario sulle soste | `cumulative` non si azzerava al punto pranzo — fix: reset a 0 e avanzamento `prevServiceEnd` quando `lunchIns.beforeIndex === i` |
| Finestra fissa prima tappa non ritarda partenza | Planner non back-calcolava da `timeFrom` — fix: se prima tappa ha `timeWindowMode="fixed"`, impostare `targetArrival = parseTime(timeFrom)` |
| Ricalcolo crea nuovo giro invece di aggiornare | `/api/plan` con `body.id` ora chiama `updateRoutePayload` se il giro esiste già |
| Durata personalizzata tappa torna al default | Le tappe spezzate mattina/pomeriggio venivano ricostruite come 2 tappe con durate parziali. Fix: `plannedStops` (planner.js) riunisce i tronconi in 1 voce con durata totale; helper frontend `rebuildStopsFromResultRows` riunisce per `stopUid` e preserva la durata. **Per ricostruire tappe da `result.rows`/`plannedStops` usare SEMPRE questo helper** |
| Tappe temporanee scartate al ricalcolo | `replanFromResult` deduplicava per `addressId`; le tappe temporanee (addressId null) collassavano in una. Fix: dedup per `stopUid` |
| "Scegli sulla mappa" non compila la tappa (giro esistente) | `#rv-custom-map-btn` chiamava `openMapPickerForField` con parametro inesistente `onPick`. Fix: passare `labelEl/addressEl/latEl/lngEl`. Il toast di `applyPick` conferma solo se l'indirizzo è stato risolto |

---

## Architettura aggiuntiva (moduli server)

```
server/
  apiStats.js         # Tracciamento chiamate API esterne — buffer in memoria, flush ogni 60s
                      # initApiStatsTable() chiamato in index.js dopo initDb()
                      # trackCall(service, endpoint) importato da googleMapsService, mapService, weatherService, index.js
  googleMapsService.js  # Places API, Geocoding, Directions — usa trackCall("google_maps", ...)
  mapService.js         # OpenRoute / MapQuest fallback — usa trackCall("openroute", ...)
  weatherService.js     # Open-Meteo — usa trackCall("open_meteo", ...)
```

### Tabella `api_calls`
```sql
(day TEXT, service TEXT, endpoint TEXT, count INTEGER, PRIMARY KEY (day, service, endpoint))
```
Upsert atomico: `INSERT ... ON CONFLICT DO UPDATE SET count = count + excluded.count`

---

## WhatsApp — pattern messaggi (v4.048)

- Funzione `buildWhatsAppMessage(result, row)` in `app.js`
- Data futura → conferma appuntamento con data italiana e ora arrivo
- Data odierna → ETA = orario pianificato + ritardo accumulato rispetto all'ultima tappa con `serviceEndTime` ≤ ora attuale
- Numero formattato da `formatPhoneForWhatsApp(phone)`: strip spazi/trattini, prefisso 39 se assente
- URL: `https://wa.me/{phone}?text={encoded}`
- Click handler: `.rc-wa-btn[data-wa-stop]` nel listener globale click in `app.js`
