# Istruzioni per Claude — Organizzatore Percorsi

## Regole da seguire SEMPRE, ad ogni modifica

### 1. Versione app
- La versione corrente è nel file `public/app.js` nella funzione `renderMenuInfo()`.
- **Ad ogni fix o modifica**, incrementa il terzo numero della versione di 1.
  - Formato: `v[major].[patch]` — es. `v4.001` → `v4.002` → `v4.003`
  - Il major (4) cambia solo se l'app cambia radicalmente struttura o funzionalità.
- Aggiorna anche la data se il mese è cambiato (es. `giugno 2026`).

### 2. Service Worker e asset versioning
- Ad ogni modifica a `public/app.js` o `public/styles.css`, aggiorna **sempre**:
  - `public/service-worker.js`: incrementa `CACHE_NAME` (es. `v200` → `v201`) e le query string degli asset (`?v=...`)
  - `public/index.html`: aggiorna le stesse query string `?v=...`
- Le query string devono essere identiche in `service-worker.js` e `index.html`.

### 3. Sicurezza — non committare mai
- `GOOGLE_MAPS_API_KEY` / chiave Maps — solo Vercel env vars
- `OPENAI_API_KEY` — solo Vercel env vars
- `ADMIN_SECRET` — solo Vercel env vars
- Indirizzi personali o coordinate di casa dell'utente

### 4. Branch e deploy
- Tutto va su branch `main` — Vercel deploya da `main`.
- Non creare PR a meno che l'utente non lo chieda esplicitamente.

---

## Architettura

- **Frontend**: `public/app.js` (SPA vanilla JS), `public/styles.css`
- **Backend**: `server/index.js` (HTTP server Node.js, no Express), `server/db.js` (SQLite locale / PostgreSQL su Vercel), `server/auth.js`, `server/planner.js`
- **Admin panel**: `public/admin/index.html` + `public/admin/app.js`
- **PWA**: `public/service-worker.js`, `public/manifest.webmanifest`

## Database
- Locale: SQLite in `./data/`
- Produzione (Vercel): PostgreSQL via `DATABASE_URL`
- Le migrazioni sono in `server/db.js` → `migrateAuth()`

## Sessioni
- Token-based, `SameSite=Lax`, scadenza 30 giorni con sliding expiry (`extendSession`)
- `state._authVerified`: flag che indica che l'utente ha già fatto login confermato — il 401 su API secondarie non fa logout se non era ancora verificato
- bfcache iOS: `pageshow` + `visibilitychange` ri-verificano la sessione senza ricaricare

## Condivisione giri
- Tabella `shared_routes`: snapshot JSON, scadenza 5 giorni
- URL pubblica: `/share/:token`
- I giri importati hanno `source = "imported"` e appaiono in viola

## Admin panel
- Accesso: `/admin/`
- Auth: `ADMIN_SECRET` env var, token HMAC con scadenza 2h
- Rate limit su login usa `X-Forwarded-For` per IP reale dietro proxy/Vercel
