# Contesto per la prossima sessione — Organizzatore Percorsi

> Questo file è stato scritto al termine della sessione del 14 giugno 2026 (v4.118).
> Leggerlo all'inizio della prossima chat prima di fare qualsiasi cosa.

---

## Versione corrente: v4.118

Asset: `?v=20260614-888` · Service worker: `percorsi-lavoro-v317`

---

## Cosa si stava sistemando: logica soste/pranzo attorno a tappe con orari spezzati

### Il caso concreto (Fineco — Riva del Garda)

**Dati tappa**: orari 09:00–13:00 / 14:00–18:00, durata visita 3 ore.

**Giro**: Bar Cles → Mediolanum FBO → Fineco → Marinello Creativity Center (data 2026-06-11)

**Scenario**: il planner calcola un arrivo a Fineco alle ~12:24. Poiché rimangono solo 36 minuti prima della chiusura mattutina (< soglia minima di 45 min), NON divide il lavoro tra mattina e pomeriggio. Aspetta le 14:00 e fa tutto in un colpo. Nel frattempo, cerca un ristorante per il pranzo durante l'attesa.

**Comportamento atteso (v4.118)**:
1. Sosta Fink Gasthaus (08:30–08:45) dopo Bar Cles
2. Rilevata attesa 96 min a Fineco (12:24→14:00) dentro finestra pranzo → cerca ristorante vicino
3. New Kurdistan sul percorso Mediolanum→Fineco: pranzo ~12:39–13:24
4. Fineco: arrivo 13:24, attesa fino alle 14:00, lavoro 14:00–17:00 ✓
5. Malga Cimana come sosta verso Marinello alle 17:00
6. Il timeShift si azzera dopo Fineco (l'attesa da 96 min assorbe i 60 min accumulati)

---

## Bug fixati in questa sessione (v4.110 → v4.118)

| Versione | Bug | Fix |
|---|---|---|
| v4.110 | Open-Meteo 429 (richieste parallele) | Cache + in-flight dedup (`openMeteoCache` + `openMeteoInflight`) |
| v4.110 | Sosta duplicata Bar Caffè Obber | Dedup guard by lat/lng in `tryInsert` |
| v4.111 | MeteoTrentino timeout (2.5s troppo breve) | `WEATHER_FETCH_TIMEOUT_MS` → 6000ms |
| v4.111 | Ordine tappe cambiato al ricalcolo | `manualOrder: true` in `replanFromResult()` |
| v4.112 | Icona meteo non cliccabile | Wrap in `<a href=sourceUrl>` se presente |
| v4.113 | Arrivo nel gap chiusura (13:03) → lavora durante chiusura | Safety net in `scheduleStop` per arrivo nel gap |
| v4.114 | Gap mattina/pomeriggio non usato per pranzo | Sezione 4 in `insertBreaks`: cerca ristorante nel gap tra morning e afternoon row |
| v4.115 | `replanFromResult` non passava orari apertura (split) | Aggiunto `openMorning/closeMorning/openAfternoon/closeAfternoon` al payload |
| v4.115 | `replanFromResult` usava durationMinutes=6 (solo mattina) | Somma morning+afternoon durationMinutes |
| v4.115 | Soste salvate troppo lontane inserite (Obber da Riva) | `findNearestRestStop` ora controlla `maxDirectKm` dalla posizione corrente |
| v4.116 | Orari "Non indicato" per giri salvati al ricalcolo | Fallback su `state.allAddresses` per orari mancanti nelle righe risultato |
| v4.116 | Tempi di guida non visibili senza espandere | `rc-drive-row` sempre visibile su ogni card (tappa/sosta/pranzo) |
| v4.117 | Split con < 45 min mattutini invalidato dalle soste | Soglia minima 45 min; se inferiore → attende pomeriggio e fa tutto in un colpo |
| v4.117 | Nessun pranzo durante lunga attesa apertura | Sezione 5 in `insertBreaks`: cerca ristorante se wait ≥ lunchBreakMin+10 in finestra pranzo |
| v4.118 | `shiftRowTimes` spostava serviceStart di 70+ min (15:10 invece di 14:00) | Re-ancora service start a `max(newArrival, origServiceStart)` per stop con wait time |
| v4.118 | Tappe successive a Fineco sovra-spostate (timeShift non calava) | Dopo stop con wait time: `timeShift = max(0, timeShift - waitMin)` |
| v4.118 | Pranzo durante attesa collocato alle 10:59 invece di 12:39 | `entry.driveOffset = lunchAt - parseTime(row.departureTime)` |

---

## Architettura rilevante

### `server/planner.js` — funzioni chiave

**`scheduleStop(arrival, stop, opts)`**
- Calcola serviceStart/serviceEnd rispettando gli orari di apertura
- Split solo se `morningWork >= 45 min` (v4.117) — altrimenti aspetta il pomeriggio
- Safety net: arrivo nel gap tra finestre → sposta all'apertura pomeridiana

**`insertBreaks(rows, options)`** — 5 sezioni:
1. Pranzo nel posto "normale" (tra due tappe nel corretto orario pranzo)
2. Pranzo nella prima posizione utile (fallback)
3. Pranzo "pranzo-fisso" (lunchTime esplicito da utente)
4. Pranzo nel gap morning/afternoon di una tappa spezzata
5. **Pranzo durante attesa apertura** (v4.117–v4.118): se una tappa ha wait time ≥ lunchBreakMin+10 nella finestra pranzo → cerca ristorante, inserisce con `driveOffset = lunchAt - parseTime(row.departureTime)`

**`shiftRowTimes(row, minutes)`**
- Per stop con `fixedWindow`: sposta solo arrivo, mantiene service times assolute
- Per stop con **wait time** (`origServiceStart > origArrival`): ri-ancora serviceStart a `max(newArrival, origServiceStart)` — fix v4.118
- Per stop normali: sposta tutto uniformemente

**Loop finale buildFinalRows** (dentro `insertBreaks`):
- Dopo ogni stop con wait time: `timeShift = max(0, timeShift - waitMin)` — fix v4.118

**`replanFromResult()`** in `public/app.js`
- Legge `state.result.rows`, rimuove le soste, ricostruisce i stop
- Per split stops (stopPart="morning"): somma morning+afternoon durationMinutes
- Fallback su `state.allAddresses` per orari apertura mancanti nelle righe salvate
- Invia `openMorning/closeMorning/openAfternoon/closeAfternoon` al server

---

## Cosa potrebbe ancora non funzionare (da testare)

1. **Pranzo durante attesa**: il log del prossimo giro con Fineco dirà se New Kurdistan è correttamente collocato alle 12:39–13:24 e se Fineco lavora 14:00–17:00. Inviare il log di debug come conferma.

2. **Scenari edge per shiftRowTimes**: se timeShift > waitTime (cioè le soste aggiungono più tempo dell'attesa), il servizio inizia dopo l'apertura (`max(newArrival, origServiceStart) = newArrival > origServiceStart`). Il completion time sarebbe corretto (newArrival + durationMinutes) ma potrebbe essere tardi rispetto alla chiusura pomeridiana — serve warning se serviceEnd > closeAfternoon.

3. **Bar Cles**: nel log appare con `hours="Non indicato"` anche in v4.118. Da verificare se ha weeklyHours nell'archivio e se il fallback funziona anche per lui.

---

## Regole operative (ricordare sempre)

- Versione corrente: **v4.118** — prossimo fix → v4.119
- Formato: `v[major].[patch tre cifre]` — es. v4.119, v4.120
- Ogni fix: aggiornare versione in `renderMenuInfo()`, CHANGELOG.md, `service-worker.js` (CACHE_NAME e ?v=), `index.html` (?v=)
- Ogni 10 fix (v4.120): aggiornare la sezione "Novità" in `renderMenuInfo()` con riepilogo degli ultimi 10
- Push direttamente su `main` (deploy automatico Vercel)
- Non creare PR salvo richiesta esplicita
- Non committare mai API keys o indirizzi personali
