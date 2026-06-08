# Changelog — Organizzatore Percorsi

> Ogni fix viene annotato qui. Ogni 10 fix aggiornare le Info app (`renderMenuInfo()` in `public/app.js`).
> Ogni 100 fix fare un riassunto totale nella stessa sezione.

---

## v4.001 — 2026-06-08
- Guida app riscritta con icone SVG al posto delle emoji
- Tutte le nuove funzioni documentate nella guida
- Schermata Info app aggiornata: versione 4.001, logo, stato integrazioni, lista novità

## v4.002 — 2026-06-08
- Fix: soste e ristoranti trovati via Places API non vengono più inseriti se tutti i candidati risultano chiusi all'orario previsto (restituisce `null` invece di inserire con warning)

## v4.004 — 2026-06-08
- Nuovo: note libere per ogni giro — textarea nel pannello "Note giro" dentro la vista risultato, con salvataggio separato dal ricalcolo
- Nuovo: le note vengono mostrate nella card del giro salvato e nell'header della vista risultato
- Nuovo: campo "Non oltre le" nella sezione orari del form — finestra di partenza; se il calcolo porta a partire dopo quell'ora viene segnalato come warning
- Fix: durata interventi già mostrata in formato h+min in tutta l'app tramite `minutesLabel`

## v4.003 — 2026-06-08
- Fix: anche i contatti salvati come "sosta" o "ristorante" ora rispettano gli orari di apertura — se chiusi all'orario della sosta vengono saltati e si passa al fallback Places API
- Fix login admin: rate limit usa `X-Forwarded-For` per IP reale dietro proxy/Vercel
- Fix login admin: `startAutoRefresh()` ora chiamato subito dopo il login, non solo al boot
- Fix login app: `novalidate` sui form + lettura valori diretta dagli input per compatibilità autofill Safari iOS
