## v4.053 — 2026-06-09
- Fix crash "Cannot access 'isAfternoon' before initialization": spostata dichiarazione const isAfternoon prima di phoneBtn

## v4.052 — 2026-06-09
- Fix: pulsanti telefono, email e WhatsApp sempre visibili su ogni tappa (non pomeriggio), anche senza contatto salvato — aprono l'app rispettiva senza destinatario pre-compilato per ricerca manuale

## v4.051 — 2026-06-09
- Nuovo: orario fisso pausa pranzo — campo "alle HH:MM" nel form percorso e nel pannello modifica giro; default 12:30, modificabile; se vuoto usa la finestra dalle impostazioni; il planner inserisce il pranzo esattamente all'orario indicato

## v4.050 — 2026-06-09
- Fix WhatsApp/mail: se l'ETA calcolata è già nel passato viene restituito null → messaggio vuoto (WhatsApp apre senza testo, mail senza body)
- Mail precompilata: il body del mailto segue la stessa logica del messaggio WhatsApp (conferma appuntamento o ETA)
- Novità v4.050 aggiunta in renderMenuInfo()

## v4.049 — 2026-06-09
- Sezione "Novità" in Info app aggiornata con riepiloghi v4.030 e v4.040–v4.048 (erano mancanti); CLAUDE.md aggiornato con architettura apiStats, pattern WhatsApp e tutti i bug fix della sessione

## v4.048 — 2026-06-09
- Nuovo: pulsante WhatsApp nelle card tappa del giro — se data futura invia messaggio precompilato di conferma appuntamento; se data odierna invia ETA calcolata in tempo reale tenendo conto del ritardo accumulato

## v4.047 — 2026-06-09
- Fix critico: runSql e sqlValue non erano esportate da db.js — apiStats.js causava errore di import che mandava in crash il server ad ogni avvio, rendendo impossibile qualsiasi login

## v4.046 — 2026-06-09
- Fix login Safari PWA: tutti i fetch() ora usano URL assoluto (window.location.origin + path) — elimina l'errore "The string did not match the expected pattern." che si verificava con Face ID su iOS installato da home screen

## v4.045 — 2026-06-09
- Smart naming nuovi giri: se tutte le tappe hanno la stessa sede → nome sede; se stesso cliente → nome cliente; altrimenti prima tappa. Sempre con data in italiano (es. "Mediolanum — 9 giu"). Suffisso (2)(3)… se il nome esiste già

## v4.044 — 2026-06-09
- Fix: ricalcolo giro esistente aggiorna il record invece di crearne uno nuovo — nome e note vengono preservati
- Fix: due giri non possono avere lo stesso nome — rinomina restituisce errore 409 se il nome è già in uso

## v4.043 — 2026-06-09
- Nuovo: tracciamento chiamate API esterne — Google Maps (geocode/directions/places), OpenAI (chat/whisper), OpenRoute, Open-Meteo conteggiate in DB con flush ogni minuto
- Admin panel: nuova sezione "Chiamate API esterne" con totali giornalieri per servizio, pill riassuntive pagate/gratuite, filtro 7/30/90 giorni

## v4.042 — 2026-06-09
- Fix finestra oraria fissa su prima tappa: il planner ora retrocede l'orario di partenza per arrivare esattamente a timeFrom — prima ignorava il vincolo e partiva all'orario impostato nel form

## v4.041 — 2026-06-09
- Nuovo: pulsante cestino discreto su ogni card tappa nella vista risultato — rimuove la tappa dal giro; un toast invita a premere Ricalcola per aggiornare il percorso

## v4.040 — 2026-06-09
- Fix priorità pranzo su soste: il contatore cumulativo guida+lavoro viene azzerato quando si supera il punto di inserimento del pranzo — le soste non scattano più per minuti accumulati prima del pranzo
- prevServiceEnd avanzato della durata pranzo per rendere accurate le finestre temporali delle soste successive

## v4.039 — 2026-06-09
- Fix prima tappa: il planner ora sposta in testa qualsiasi tappa con fixedFirst=true, non solo la prima dell'array — il flag funziona indipendentemente dall'ordine corrente del giro

# Changelog — Organizzatore Percorsi

> Ogni fix viene annotato qui. Ogni 10 fix aggiornare le Info app (`renderMenuInfo()` in `public/app.js`).
> Ogni 100 fix fare un riassunto totale nella stessa sezione.

---

## v4.036 — 2026-06-08
- Fix ricerca tappa da giro: 4 campi (cliente/attività/sede/indirizzo), stile identico al form principale, preview e pulsante contestuale dopo selezione
- Fix toggle timing mode nel pannello giro: spostato da click a change — il campo "Arrivo target" appare correttamente; valori pre-popolati dal giro
- Fix selezione tappa: il pulsante "Aggiungi" appare solo dopo aver selezionato un contatto dalla lista

## v4.035 — 2026-06-08
- Mappe (risultato, archivio/contatto, picker) ora usano stile scuro quando il tema app è notte — continuità visiva col tema telefono
- Fix pranzo da risultato: state.resultLunchEnabled traccia la scelta dell'utente separatamente dall'output del planner — render() non reimposta più il checkbox; replanFromResult usa il valore esplicito

## v4.034 — 2026-06-08
- Fix: modifiche nel giro non chiudono più i pannelli — state.expandedPanels traccia quali <details> rv-panel sono aperti e li ripristina dopo render()
- Fix: change handler per timingMode/endSameAsStart/lunchBreak ora guarda solo #route-form, non i pannelli risultato
- Fix: cambio timeWindowMode e blur su Dalle/Alle fanno update inline senza render() — il pannello resta aperto
- Fix: ricerca Google Contacts ripristina il focus dopo render() — ogni lettera non butta fuori dalla barra

## v4.033 — 2026-06-08
- Fix maggiorazione oraria: calcolo orario partenza ora usa driveMinutes con buffer (non base Maps) — gli arrivi alle tappe sono ora puntuali
- Fix pranzo deselezionato: hidden input garantisce che il valore "off" arrivi sempre al server; server ora riconosce "off"/"false" esplicitamente
- Planner ora restituisce lunchBreak, lunchBreakMinutes, maxReturnTime nel risultato
- Fix pannello "Modifica impostazioni giro": campo Rientro max aggiunto e pre-popolato; startTime pre-popolato dall'impostazione originale (non dall'orario calcolato)

## v4.032 — 2026-06-08
- UX: tutti i campi orario (`type="time"`) usano step 5 minuti (step="300") in tutta l'app

## v4.031 — 2026-06-08
- Fix toggle pranzo: passaggio di timeFrom/timeTo/timeWindowMode/fixedFirst/ignoreHours/maxReturnTime nel re-plan — aggiunta e rimozione pranzo ora entrambe funzionanti
- Fix toggle pranzo: durata tappa fissa calcolata da timeFrom/timeTo (non dalla somma delle parti split)
- Fix planner: baseRow ora include timeFrom/timeTo/timeWindowMode/fixedFirst/ignoreHours — le result rows portano sempre i dati della finestra oraria

## v4.030 — 2026-06-08
- Fix "fissa": durata tappa visualizzata come `timeTo − timeFrom` (non modificabile) sia nel form percorso che nella card risultato
- Fix planner: `effectiveDuration` calcolata correttamente per finestre fisse (e split con pranzo), metriche `durationMinutes` e `totalWorkMinutes` ora accurate

## v4.029 — 2026-06-08
- Fix layout pulsanti card giro: Rinomina / Condividi / Duplica / Elimina ora su una sola riga (grid 4 colonne)

## v4.028 — 2026-06-08
- UX: rimosso rinomina su tap del nome giro — aggiunto pulsante "Rinomina" esplicito nella riga azioni della card

## v4.027 — 2026-06-08
- Fix: modifica impostazioni tappa non chiude più la card — stato expanded persistito in `state.expandedStops`
- UX: pulsante Ricalcola tappa diventa accent (tema) non appena si modifica un'impostazione

## v4.026 — 2026-06-08
- Nuovo: impostazioni tappa (durata, finestra oraria Dalle/Alle + modalità, prima tappa, ignora orari) ora modificabili direttamente dalla card tappa nel giro, con pulsante Ricalcola inline
- Rimossa sezione "Finestre orarie tappe" dal pannello impostazioni giro (ora tutto è nelle card tappa)

## v4.025 — 2026-06-08
- Fix auto-ricalcolo: rimosso render() su blur per rv-row (tap fantasma iOS sul bottone Ricalcola)
- UX: sezione "Finestre orarie tappe" spostata dentro "Modifica impostazioni giro", unico bottone Ricalcola

## v4.024 — 2026-06-08
- Fix definitivo picker iOS Dalle/Alle: render() spostato su blur invece di change — il picker non viene più distrutto mentre è aperto

## v4.023 — 2026-06-08
- Layout finestra oraria riordinato: riga 1 "Finestra oraria" + selettore, riga 2 Dalle/Alle

## v4.022 — 2026-06-08
- Nuovo: pannello "Finestre orarie tappe" nella vista risultato — modifica Dalle/Alle/Modalità di ogni tappa e ricalcola senza uscire dal giro

## v4.021 — 2026-06-08
- Fix picker iOS: rimosso autofill su focus che causava chiusura immediata
- UI selettore modalità sempre visibile accanto a "Finestra oraria", grigio/non-cliccabile se nessun orario inserito

## v4.020 — 2026-06-08
- Fix UI selettore modalità finestra oraria: segmented control compatto stile iOS, radio nascosti, testo 0.78rem

## v4.019 — 2026-06-08
- Fix selettore modalità finestra oraria: ora compatto su una riga
- Fix picker orario iOS: render() spostato su evento "change" invece di "input" — il picker non viene più chiuso mentre si scrolla

## v4.018 — 2026-06-08
- Miglioramento finestra oraria tappa: due modalità — "Disponibilità" (lavoro dura X min, può iniziare in qualsiasi momento nella fascia) e "Fissa" (lavoro inizia e finisce esattamente agli orari indicati)

## v4.017 — 2026-06-08
- Nuovo: vincolo orario "Dalle/Alle" per ogni tappa — fissa la tappa in una finestra oraria, il planner pianifica tutto il resto di conseguenza

## v4.016 — 2026-06-08
- Campo "Rientro max" pre-compilato con l'orario default dalle impostazioni (maxReturnTime), modificabile per ogni giro

## v4.015 — 2026-06-08
- Rinominato "Entro le" → "Rientro max" nel form percorso

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
