# Changelog — Organizzatore Percorsi

> Ogni fix viene annotato qui. Ogni 10 fix aggiornare le Info app (`renderMenuInfo()` in `public/app.js`).
> Ogni 100 fix fare un riassunto totale nella stessa sezione.

---

## v4.014 — 2026-06-08
- Fix strutturale campi Data/Partenza/Entro le: sostituito flex con CSS Grid (repeat 3, 1fr) — i figli non possono più uscire dalla griglia indipendentemente dal contenuto

## v4.013 — 2026-06-08
- Fix definitivo layout campi Data/Partenza/Entro le: min-width:0 su input e overflow:hidden forza il ridimensionamento su Safari iOS

## v4.012 — 2026-06-08
- Fix layout campi Data/Partenza/Entro le: justify-content space-evenly per spaziatura uniforme e centratura

## v4.011 — 2026-06-08
- Fix layout campi Data/Partenza/Entro le: dimensione fissa flex: 0 0 calc(33.33% - 20px) per eliminare sovrapposizioni

## v4.010 — 2026-06-08
- Fix layout campi Data/Partenza/Entro le: ogni card ridotta di ~10px con max-width: calc(33.33% - 10px)

## v4.009 — 2026-06-08
- Fix layout campi Data/Partenza/Entro le: rimosso max-width fisso, ora `flex: 1 1 0` divide lo spazio equamente senza sovrapposizioni

## v4.008 — 2026-06-08
- Fix layout card tappa: campo Durata ora compatto (88px) su riga orizzontale con gli orari alla sua destra
- Fix layout campi Data/Partenza/Entro le: ridotti ulteriormente (~10px) per evitare overflow su schermi piccoli

## v4.001 — 2026-06-08
- Guida app riscritta con icone SVG al posto delle emoji
- Tutte le nuove funzioni documentate nella guida
- Schermata Info app aggiornata: versione 4.001, logo, stato integrazioni, lista novità

## v4.002 — 2026-06-08
- Fix: soste e ristoranti trovati via Places API non vengono più inseriti se tutti i candidati risultano chiusi all'orario previsto (restituisce `null` invece di inserire con warning)

## v4.007 — 2026-06-08
- Fix layout card tappa: Durata e orari ora in colonna, non più fianco a fianco con sovrapposizione
- Fix layout campi Data/Partenza/Entro le: ognuno limitato a 1/3 della riga, non si sovrappongono

## v4.006 — 2026-06-08
- Durata intervento ora in formato HH:MM (es. 00:45, 01:30) in tutti i form: contatti, tappa manuale, pannello risultato

## v4.005 — 2026-06-08
- Fix layout: tre campi orario (Data / Partenza / Entro le) ora sulla stessa riga, gap ridotto a 12px, max-width 100%

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
