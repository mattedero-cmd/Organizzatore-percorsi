# Istruzioni per Claude — Organizzatore Percorsi

> **Nota per Claude**: questo file va letto all'inizio di ogni sessione.
> Durante il lavoro, se scopri qualcosa di importante che potrebbe servire in futuro
> (un bug ricorrente, una regola implicita dell'utente, un'architettura non ovvia,
> una preferenza stilistica), **aggiornalo in autonomia** prima di fare il commit finale.
> Non serve chiedere permesso — è tuo compito tenerlo aggiornato.

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
- Tutto va su branch `main` — Vercel ascolta `main` e deploya automaticamente.
- Non creare PR a meno che l'utente non lo chieda esplicitamente.
- Push con `git push -u origin main`.

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
```

---

## Database

- **Locale**: SQLite in `./data/work-routes.sqlite`
- **Produzione** (Vercel): PostgreSQL via env var `DATABASE_URL`
- Il codice in `db.js` gestisce entrambi — usa `getDbMode()` per distinguere
- Le migrazioni sono in `migrateAuth()` in `db.js` — vengono eseguite all'avvio
- Per aggiungere una colonna: aggiungi `ALTER TABLE ... ADD COLUMN ...` dentro `migrateAuth()` con `IF NOT EXISTS` (SQLite) o `DO $$ ... EXCEPTION WHEN duplicate_column` (Postgres)

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
