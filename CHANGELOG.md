## v5.074 — 2026-06-28
- FIX "intrappolato in locale, non posso loggarmi né uscire": in modalità local-first l'app apre con un utente fittizio "locale", quindi non mostra il login; e i pulsanti Esci/Accedi facevano `fetch` SENZA timeout → col server lento restavano appesi e non succedeva nulla. Fix: (1) logout con timeout 6s + prosegue comunque (svuota utente e mostra la schermata di accesso anche se il server non risponde); (2) login/registrazione/setup con timeout 15s + al successo `syncFromServer` scarica subito i dati e ri-renderizza; (3) nuovo pulsante "Accedi / Sincronizza" nel menu Account quando NON autenticati (`!state._authVerified`), che porta direttamente all'accesso senza dover prima uscire. Così dopo un avvio in locale l'utente può accedere al proprio account e riavere i dati.

## v5.073 — 2026-06-28
- FIX dati "spariti" dopo il fix avvio v5.072: se il server era lento l'app si apriva in locale (IndexedDB vuota) e i dati non tornavano. NB: i dati sul server (Postgres) NON erano persi — `syncFromServer` SOLO scarica dal server, `_applyPull` scrive SOLO in locale (`_idbReplaceAll`), non cancella mai il server; e senza mutazioni utente la coda è vuota → server intatto. Fix: (1) `syncFromServer` ora parte SEMPRE in background dopo l'avvio (non solo se l'auth veloce entro 6s è riuscita), così col cookie valido scarica i dati e ri-renderizza appena il server risponde → i dati RITORNANO da soli; (2) timeout 20s su `_serverFetch` (prima nessuno). Con v5.072+5.073 l'app si apre sempre e recupera i dati non appena il server è raggiungibile.

## v5.072 — 2026-06-28
- FIX CRITICO avvio: l'app restava bloccata sullo splash iniziale. Causa: nel boot (`init` → `loadInitialData`) le fetch a `/api/auth/me`, `/api/health`, `/api/config`, `/api/settings` NON avevano timeout — con server lento/bloccato (cold start o deploy Vercel in corso) l'`await` non ritornava mai e `hideSplash()` non veniva chiamato (i `.catch` intercettano i reject, non gli hang). Fix: helper `timeoutSignal(ms)` (AbortController+setTimeout, universale, non `AbortSignal.timeout` che è iOS 16+); `api()` applica un timeout (default 60s; 6s per le chiamate di boot); `/api/auth/me` 6s; SAFETY NET che forza `hideSplash()` dopo 9s comunque vada. Così l'app si apre SEMPRE (in locale via IndexedDB se il server non risponde), coerente col design local-first.

## v5.071 — 2026-06-28
- Multi-giorno: aggiunta una riga di versione nella Diagnostica (`MOTORE: per-zona + fillPartial (v5.071)`) per capire a colpo d'occhio se il server sta girando la nuova logica o un build vecchio (deploy Vercel in ritardo/collisioni tra sessioni). Nessun cambio alla logica di raggruppamento. Bump per forzare un deploy pulito.

## v5.070 — 2026-06-28
- Multi-giorno: `server/multiDayPlanner.js` riportato alla costruzione PER-ZONA (v5.029) + aggiunta UNIONE PARZIALE sul corridoio (`fillPartial`). NB: su `main` era finita (sessione parallela) la versione a greedy globale "gate sul corridoio", che sul giro reale faceva SNAKE (Ortisei→…→Valsugana) e FRAMMENTAVA (4 giornate da 1 tappa) — vedi `docs/MULTI_GIORNO.md`, "greedy globale" tra gli approcci falliti. Si torna a: `assignZones` (zone = valli, corrette) → `growDays` per-zona → `fillPartial` (NUOVO) → `fillDays`. `fillPartial`: una giornata lontana POVERA (slack > `SLACK_MIN` 75') assorbe singoli GRUPPI atomici "sulla via" da zone adiacenti (resto LIBERO), con metrica DIRECTNESS = `legMin(seme,g)/(legMin(seme,casa)+legMin(g,casa))` (savings di Clarke-Wright) ANCORATA AL SEME FISSO — l'unico ancoraggio che l'hub vicino casa non inganna (Ortisei→Pergine 0.85 escluso, San Candido→Trento 0.79 escluso, Tione→Riva 0.39 incluso); soglie `TAU_PARTIAL` 0.45, `CORRIDOR_DETOUR` 25'; GATE ANTI-FURTO (il donatore resta non-vuoto e fattibile); sposta gruppi interi (co-locate mai separate). Additivo: no-op se nessuna giornata è povera. Mantenuto il fix `if→while` in `dayHoursFeasible` dalla v5.069. Esito di un design-panel multi-agente. Da validare/tarare sulla Diagnostica del giro reale.

## v5.069 — 2026-06-28
Sync offline affidabile — outbox durabile + merge non distruttivo (IndexedDB v2):
- **Le cancellazioni offline non “risorgono” più**: ogni modifica/cancellazione viene messa in una coda durabile (`outbox`) che sopravvive a reload e mancanza di rete; alla riconnessione viene inviata al server PRIMA di ri-scaricare i dati, così un giro/indirizzo cancellato offline resta cancellato.
- **Niente più perdita di scritture offline**: creazioni e modifiche fatte senza rete vengono inviate appena torna la connessione (al riavvio e sull'evento `online`), con riconciliazione dell'id assegnato dal server.
- **Pull non distruttivo**: al sync iniziale i record con operazioni ancora in coda non vengono sovrascritti dal server (le modifiche locali non sincronizzate vincono), e i record con una cancellazione in sospeso non vengono re-importati.
- Verificato con simulazione dei casi critici (cancella offline, crea offline, crea+modifica offline, delete/update in sospeso durante il pull).

> Nota: la deduplica perfetta tra PIÙ dispositivi che modificano lo STESSO record contemporaneamente offline richiederebbe un id stabile lato server (`client_uid`): è un irrobustimento futuro. I casi reali a singolo utente (un device, o device diversi non in conflitto simultaneo) sono coperti.

## v5.068 — 2026-06-28
Giri salvati offline + sync dettaglio (fix regressione local-first):
- **Apertura giri salvati**: prima, da sincronizzati, il sync scaricava solo un riassunto dei giri → aprendo un giro salvato si vedevano 0 tappe / niente meteo. Ora ogni giro pianificato viene messo in cache COMPLETO in IndexedDB (tappe, meteo, costi) e il sync usa `/api/routes?full=1`, quindi lista e apertura funzionano anche offline.
- **Server `/api/routes?full=1`**: nuova opzione che restituisce i giri completi da un'unica query (`listRoutes(full)`), senza N+1.
- **Rinomina giro**: la PUT locale faceva un replace che cancellava il dettaglio del giro dalla cache fino al sync successivo; ora fa merge e preserva tappe/meteo.
- **Condivisione / Duplica / Import / Backup**: i giri vengono sempre normalizzati nella forma "piatta" che il server e l'import si aspettano (helper `_routeRecordToFlat`), così il giro condiviso/importato/duplicato/ripristinato mantiene nome, partenza/arrivo e tappe (prima poteva risultare vuoto o senza nome).
- `/api/plan` restituisce ora anche il nome assegnato, così la cache locale mostra subito il nome reale.

> Restano da affrontare, come intervento di sync dedicato e testato a parte: cancellazioni offline che “risorgono” al sync, collisioni di id tra dispositivi diversi nel backup, e merge non distruttivo durante il sync iniziale.

## v5.067 — 2026-06-28
Audit discrepanze tra funzioni simili + fix bug e pulizia (nessuna funzione rimossa):
- **Pranzo (planner)**: i limiti di detour/orario del gap di chiusura (`gapMaxDetourKm`, `gapLunchClose`) ora vengono effettivamente passati a `makeLunchEntry` nei tre rami split-gap/wait-time — prima erano calcolati ma ignorati, così un ristorante troppo lontano poteva spingere la tappa pomeridiana.
- **`/opening` locale (offline)**: ritornava `{status}` con chiavi sbagliate e logica errata (chiave giorno `mon`/`tue` invece che numerica) → badge sempre "Sconosciuto". Ora ritorna `{isOpen, weekdayText}` come il server, con calcolo aperto/chiuso orario-aware e testo settimanale lunedì-first.
- **`deriveHoursFromWeekly`**: se il lunedì era "chiuso" azzerava gli orari legacy invece di prendere il primo giorno feriale aperto. Corretto.
- **Ricerca indirizzi offline**: ora ordinata come il server (attività, cliente, località, id).
- **Piani multi-giorno offline**: calcolato `stopCount` → niente più "undefined tappe".
- **`dayHoursFeasible` (multi-giorno)**: modello soste allineato agli altri stimatori (`while` invece di `if`).
- **`stopHoursHint`**: giorno "continuo" senza orari completi ora mostra "—" come `weeklyHoursSummary`.
- **WhatsApp/telefono**: `formatPhoneForWhatsApp` semplificato (rimosso handling `+` morto); `parseTimeToMinutes` ora valida i range e accetta `:`/`.` come il planner; tipo telefono dedotto con helper condiviso `detectPhoneType` anche nell'autocomplete del form (prima solo nel picker mappa).
- **Admin login**: niente più crash 500 con body senza `secret` → 401 corretto.
- **Condivisione giri**: non marca più il payload del creatore come `imported` (il tag lo mette il client all'import) e registra l'autore reale invece di `user_id=0`.
- **Pulizia**: rimosso codice morto (`_scSave/_scLoad/_scApply`, `showNicknameSetup`, guardia `t < -0.05` irraggiungibile); schede break pranzo/sosta unificate in `renderBreakCard`; `readWeeklyHours()` chiamata una volta sola; default `max_detour_km` allineato (1.5) tra SQLite e Postgres.

## v5.066 — 2026-06-26
- Sync bidirezionale IndexedDB ↔ server: all'avvio (se login disponibile) scarica tutti i dati dal server e aggiorna IndexedDB; ogni scrittura viene replicata al server in background (fire-and-forget). Backup settimanale automatico: se l'ultimo backup ha più di 7 giorni, l'intero IndexedDB viene inviato al server via `/api/backup`. L'app si avvia sempre con i dati locali — il login non è più bloccante: se il server non risponde, continua offline senza errori.

## v5.065 — 2026-06-26
- Architettura local-first: tutti i dati (indirizzi, giri salvati, impostazioni, cartelle, piani multi-giorno) ora sono in IndexedDB nel browser. Il server è mantenuto solo per la pianificazione percorso (chiave Google Maps lato server) e le API di condivisione. Login e registrazione rimossi — nessun account necessario. Il server non richiede più autenticazione per le API di pianificazione. La funzione di condivisione giri invia ora il JSON del giro direttamente al server invece di recuperarlo dal DB server-side.

## v5.064 — 2026-06-25
- Diagnostica crash Vercel: handler `uncaughtException`/`unhandledRejection` logga l'errore esatto nei Function Logs. `export default server` per compatibilità @vercel/node ESM. `server.on('error')` per non crashare su EADDRINUSE.

## v5.063 — 2026-06-25
- Fix definitivo FUNCTION_INVOCATION_FAILED: init DB ora lazy (alla prima richiesta HTTP) invece che top-level await nel modulo. Su Vercel serverless, un top-level await che aspetta Postgres può durare 30s+; Vercel uccide la funzione dopo ~10s prima che il catch possa girare → crash opaco su ogni richiesta. Con lazy init il modulo si carica istantaneamente; se il DB non risponde, /api/health riporta bootFailed+errore e ogni altra API risponde 503 leggibile. Aggiunto connectionTimeoutMillis:8000 al pool pg per fail-fast.

## v5.062 — 2026-06-25
- Boot resiliente del server: se `initDb`/`initApiStatsTable` lanciano (Postgres irraggiungibile, migrazione fallita), il modulo non fallisce più a caricarsi. Su Vercel un throw al top-level rendeva ogni invocazione un opaco `FUNCTION_INVOCATION_FAILED` ("Serverless Function has crashed") — 500 su tutto, login impossibile. Ora l'errore viene catturato in `bootError`, esposto su `/api/health` (`bootFailed:true` + dettaglio) e ogni altra API risponde 503 leggibile invece di crashare.

## v5.061 — 2026-06-25
- Diagnostica DB su `/api/health`: l'endpoint ora esegue un `SELECT 1` reale e restituisce `dbOk`, `dbError`, `dbMode` e `databaseUrlConfigured`. Permette di distinguere un 500 da database irraggiungibile (provider sospeso, `DATABASE_URL` scaduta) — che si manifesta come schermata di login — da un errore del codice applicativo.

## v5.060 — 2026-06-24
- Segnaposti nearby nel picker con InfoWindow stile Google Maps: tocca un segnaposto e vedi nome, rating (stelle), numero recensioni e stato aperto/chiuso, con pulsante "Scegli questo locale". Aggiornata sezione Novità (multiplo di 10).

## v5.059 — 2026-06-24
- Card sosta riempita: tap sulla card avvia la navigazione (Google/Apple Maps secondo preferenza); pulsante matita dedicato per cambiare il locale; cestino per eliminare. Estratta `openBreakPicker` come helper condiviso tra tap-neutro e pulsante modifica.

## v5.058 — 2026-06-24
- Card sosta/pranzo — gestione completa: apertura picker con ricerca nearby automatica (bar o ristoranti colorati sulla mappa in base al tipo di sosta); card riempita mostra pulsanti Naviga (link Google Maps) + Elimina; breakType passato al picker per ricerca contestualizzata.

## v5.057 — 2026-06-24
- Fix auto-sosta duplicata dopo import da Maps: il post-work break della tappa precedente ora controlla se la riga successiva ha `breakOrigin` e in quel caso salta l'auto-inserimento, evitando la card "Sosta" vuota affiancata alla card con il locale scelto.

## v5.056 — 2026-06-24
- Fix import sosta da Maps: la sosta scelta non crea più una tappa duplicata separata. Il planner ora tratta i break con `breakOrigin` come "pause già prese" (reset cumulativo, nessuna auto-sosta aggiuntiva) e li emette come row di tipo "rest"/"lunch" con i dati reali del locale. La card sosta nel risultato mostra nome + indirizzo + orari reali e rimane cliccabile per cambiare.

## v5.055 — 2026-06-24
- Fix picker Maps: con viewport-fit=cover il modal a schermo intero si estendeva sotto la status bar. Aggiunto padding-top:env(safe-area-inset-top) all'header del picker e padding-bottom:env(safe-area-inset-bottom) al footer.

## v5.054 — 2026-06-24
- Fix barra nav iOS ancora "troppo in basso": aggiunto `viewport-fit=cover` al meta viewport (necessario affinché `env(safe-area-inset-bottom)` restituisca il valore reale su iPhone); sostituito `height:100%` con `height:100dvh` su html/body/.shell per calcolo corretto dell'altezza senza barre browser; padding-bottom .app aggiorna dinamicamente per l'altezza della home bar.

## v5.053 — 2026-06-24
- Soste/pranzo come vere tappe, comportamento uniforme archivio + Maps:
  - Planner: ripristinato riempimento break da ARCHIVIO (solo archivio, no Places API). `findNearestRestStop`/`candidateCloseMin` ripristinate; `makeLunchEntry`/`tryInsert` cercano ristoranti/soste salvati vicino al punto della pausa e calcolano travel reale del detour. Break riempiti: `placeAssigned:true`, `addressId`, `weeklyHours`, `notes`, type sosta/pranzo. Fallback neutro se nessun match in archivio. Fix: `findNearestRestStop` ritorna un array → `tryInsert` prende il primo spot non duplicato.
  - Client: schede break cliccabili. Riempite da archivio mostrano nome/indirizzo ("Tocca per cambiare"); neutre mostrano "Tocca per scegliere". Tap → picker Maps/Places in-app (`openMapPickerForField`, centrato sulla posizione stimata) → scelta → replan.
  - `rebuildStopsFromResultRows`: i break scelti manualmente da Maps (`userPicked`) diventano tappe fisse persistenti (routing reale); i break da archivio/neutri sono ri-derivati dal planner ad ogni replan. Pranzo manuale → `lunchBreak:false` per evitare doppia pausa.

## v5.052 — 2026-06-24
- Fix definitivo barra nav inferiore iOS: html/body bloccati al viewport (height:100%; overflow:hidden) nella media query mobile; .shell diventa flex-column; .app scorre internamente (overflow-y:auto; flex:1; min-height:0). La tab bar position:fixed non viene più influenzata dallo scroll del body.

## v5.051 — 2026-06-24
- Card Sosta e Pausa pranzo: clic sulla card apre Maps con ricerca bar/ristorante vicino. Rimossi pulsanti separati (Maps + lente). Piccola icona segnaposto come affordance visiva.

## v5.050 — 2026-06-24
- Fix critico: `const routePayloadMatch` dichiarata due volte in server/index.js (merge di due commit v5.048 da agenti paralleli) causava SyntaxError al boot — server non partiva, login dava errore su Safari.

## v5.049 — 2026-06-24
- Fix Safari PWA: URL assoluti (window.location.origin) su tutti i fetch rimasti con URL relativo — logout, cambio password, profilo, condivisione giro, trascrizione vocale. Risolve "The string did not match the expected pattern".

## v5.048 — 2026-06-24
- Card sosta e pranzo neutrali: nessun luogo pre-selezionato, l'utente apre Maps o cerca nell'app

## v5.047 — 2026-06-24
- Fix duplicazione giro: replanWithOrder e toggle-lunch-break passavano /api/plan senza id → creavano nuovo giro. Fix: aggiunto id+name al payload. Aggiunto state.route.id per tracciare il giro in modifica nel tab Percorso; planCurrentRoute usa state.route.id invece di state.result?.id

## v5.046 — 2026-06-24
- "Scegli su Maps" e "Completa con Maps" ora funzionano nel pannello Percorso (non solo archivio): importano nome, indirizzo, coordinate e orari; applyPlaceToRoutePanel aggiorna state.route direttamente; completeFormWithMaps rileva il pannello attivo e applica i dati al contesto corretto

## v5.045 — 2026-06-23
- Multi-giorno: REVERT alla costruzione PER-ZONA della v5.029 (per-zona + unione a giornate INTERE). Il greedy globale "gate sul corridoio" (v5.030–v5.044) sul giro reale faceva SNAKE (Ortisei→…→Pergine/Levico) e FRAMMENTAVA (4 giornate da una tappa: Cles/Tione/Merano/Primiero), perché nessun criterio a sole distanze punto-punto separa le valli: una tappa vicino casa ha detour basso da qualsiasi seme lontano (Pergine da Ortisei 25'<35 → snake) e due estremi-partner lontani hanno detour alto (Tione→Riva 44'>35 → spezzati), con Mezzolombardo/Valsugana rubati ad altre zone. Le ZONE (`assignZones`) sono invece corrette → si torna a costruire SEMPRE per-zona, con unione di riempimento a giornate INTERE adiacenti compatibili (`fillDays`). Documentata la lezione in `docs/MULTI_GIORNO.md` (greedy globale tra gli approcci falliti). `server/multiDayPlanner.js` ripristinato da b64b1a1 (v5.029). NB versione rinumerata sopra v5.044 della sessione parallela.

## v5.044 — 2026-06-23
- Multi-giorno: nuova logica di costruzione delle giornate (greedy "gate sul corridoio" + accrescimento contiguo), sostituisce il riempimento per deviazione-marginale che sul giro reale snakeava (Ortisei→Valsugana), saltava a tappe vicino casa (San Candido→Trento) e impastava gli estremi soli (Primiero+Cles). In `buildDayClusters`: seme = punto più lontano (F, definisce il corridoio F→casa); si aggiunge il gruppo più VICINO al giorno (gap) tra quelli SUL CORRIDOIO — `detour = legMin(F,t)+legMin(t,casa)−legMin(F,casa)` ≤ `ON_CORRIDOR_DETOUR_MAX` (35') — e fattibili (rientro ≤ endMin−15', no oltre chiusura) → riempie il corridoio in modo contiguo dal seme verso casa; le tappe in eccesso restano libere. Orfani: solo gruppi entro `NEAR_HOME_RADIUS` (35'), accorpati con `growDays`; gli estremi lontani isolati restano giornate proprie (non più impastati). Aggiunta `ON_CORRIDOR_DETOUR_MAX`, rimossa `MERGE_DETOUR_PER_STOP`. (Logica era v5.031 in una sessione parallela: rinumerata v5.044 per collisione coi fix meteo/iOS v5.031–v5.043.) Tarabile sui tempi reali.

## v5.043 — 2026-06-23
- Fix menu fisso in basso: rimosso overflow-x:clip da .shell (causava breaking di position:fixed su iOS Safari), spostato su .app
- Fix regressione pausa pranzo: findNearestRestStop ora restituisce tutti i candidati validi in ordine di preferenza; makeLunchEntry li prova tutti prima di passare alla Places API

## v5.042 — 2026-06-23
- Cache sessione senza scadenza: i dati restano validi per tutta la sessione (invalidati solo al logout o chiusura browser)

## v5.041 — 2026-06-23
- Fix pausa pranzo fuori orario: validateSpot ora controlla che arrivo+durata pranzo stia dentro la finestra di apertura del locale (sia per ristoranti salvati che Places API); findNearbyRestaurant restituisce periods per abilitare il controllo

## v5.040 — 2026-06-23
- Fast reload iOS: cache sessionStorage (TTL 5min) — al ritorno da background l'app mostra subito l'UI salvata e aggiorna i dati in background; splash ridotto a 150ms; rimosso ripristino tab pl_nav

## v5.039 — 2026-06-22
- Fix 3bMeteo per tappe importate da Google Maps: il comune viene ora estratto dall'indirizzo completo (CAP + città) invece di usare row.location che contiene il nome dell'attività (es. "Nima s.a.s." → estratto "Trento")

## v5.038 — 2026-06-22
- Fix URL 3bMeteo: spazi sostituiti con + invece di - (es. "spini+di+gardolo")

## v5.037 — 2026-06-22
- Fix regressione meteo: to3bSlug semplificata (solo lowercase + spazi→trattini) — la versione precedente con strip di accenti/apostrofi rompeva le tappe d'archivio

## v5.036 — 2026-06-22
- Fix 3bMeteo 404: URL ora generato con slug (lowercase, spazi→trattini, accenti e apostrofi rimossi) invece di encodeURIComponent — risolve le tappe importate da Google Maps con spazi nel nome città

## v5.035 — 2026-06-22
- Fix meteo: anche le tappe Trentino aprono 3bMeteo al clic (MeteoTrentino resta la fonte dati API, ma il link di consultazione è sempre 3bMeteo)

## v5.034 — 2026-06-22
- Cambio sito meteo: icona meteo apre ora 3bMeteo sul comune della tappa (era ilMeteo.it); MeteoTrentino invariato per tappe in Trentino

## v5.033 — 2026-06-22
- Meteo cliccabile su tutte le tappe: le soste fuori Trentino/Alto Adige aprono ora ilMeteo.it per la città della tappa (prima mancava sourceUrl nei risultati Open-Meteo/OpenWeather/Weatherbit); Alto Adige punta a ilMeteo.it per comune specifico

## v5.032 — 2026-06-22
- Due fix. (1) AVVISO "arrivo oltre l'orario target" errato: ricalcolando un giro creato in "arrivo a orario fisso" e passandolo a "partenza a orario fisso", il payload continuava a trasportare il vecchio `firstArrivalTime`, così il planner manteneva un orario di arrivo target e mostrava l'avviso (e bloccava la prima tappa nell'ottimizzazione dell'ordine). Fix in `planner.js`: in modalità `depart_at` `firstArrivalRequired` è forzato a `null`, quindi nessun orario target e ordine libero; la partenza resta fissata da `startTime`. (2) ORARI DA MAPS per le tappe temporanee: scegliendo una tappa dalla mappa (sia in creazione che in modifica del giro), anche se non salvata in archivio, gli orari di apertura/chiusura vengono ora estratti da Google Places e salvati nel giro, così il planner li rispetta. Nuovo helper `googlePeriodsToWeeklyHours` (estratto dal picker archivio, ora condiviso); `openMapPickerForField` richiede `opening_hours` a Google e passa i `weeklyHours` ai callback; le tappe temporanee (result view e creazione giro) e i luoghi salvati dal picker ereditano gli orari. La durata personalizzata e gli orari sopravvivono al ricalcolo (preservati da `rebuildStopsFromResultRows` e nei `plannedStops`).

## v5.031 — 2026-06-22
- Due fix sulla gestione delle tappe. (1) DURATA PERSONALIZZATA che tornava al default: la durata di una singola tappa veniva persa nella ricostruzione del giro dalle righe di risultato. Causa: `plannedStops` (server) salvava le tappe spezzate mattina/pomeriggio come DUE voci con durate parziali (es. 60+30 invece di 90), e i percorsi "riprogramma"/"cambio data" le trattavano come tappe separate; inoltre `replanFromResult` deduplicava per `addressId`, scartando tutte le tappe temporanee tranne la prima (addressId null condiviso). Fix: `plannedStops` ora riunisce i tronconi in UNA voce per tappa con la durata TOTALE; nuovo helper frontend `rebuildStopsFromResultRows` (usato da `replanFromResult` e dal cambio data) riunisce le parti mattina/pomeriggio per `stopUid` e preserva la durata; il default (45') si applica solo se la tappa non ha alcuna durata. (2) AGGIUNTA TAPPA DALLA MAPPA dentro un giro: il pulsante "Scegli sulla mappa" del pannello manuale chiamava `openMapPickerForField` con un parametro inesistente (`onPick`), quindi i campi (indirizzo, lat, lng, cliente) non venivano mai compilati pur mostrando il toast di conferma. Fix: passati i veri `labelEl/addressEl/latEl/lngEl`, così la selezione compila davvero i campi; il toast ora conferma solo se l'indirizzo è stato risolto (altrimenti avvisa che ci sono solo le coordinate). Le tappe temporanee in attesa di ricalcolo mostrano l'etichetta "provvisoria".

## v5.030 — 2026-06-21
- Multi-giorno RIPROGETTATO: `buildDayClusters` ora è un unico GREEDY far-first con UNIONE PARZIALE, secondo la specifica in 8 fasi dell'utente. Rimossi la costruzione per-zona + `fillDays` (unione a giornate intere), che lasciava le giornate lontane corte quando il cluster adiacente era grande (San Candido non poteva prendere SOLO una parte di Ortisei/Bressanone/Bolzano). Nuovo flusso: (1) `assignZones` resta solo per la Diagnostica `ZONE`; (2) finché restano gruppi lontani (>`NEAR_HOME_RADIUS`), seme = gruppo più lontano, poi accresce il gruppo con la MINIMA deviazione-per-tappa `(driveMin(giorno+g)−driveMin(giorno))/nTappe(g)` ≤ `MERGE_DETOUR_PER_STOP` (22'), fattibile (rientro ≤ endMin − `MERGE_RETURN_MARGIN` 15', nessuna tappa oltre chiusura) — le tappe in eccesso restano LIBERE; (3) orfani vicino casa + eventuali singleton dissolti → accorpati con `growDays` (far-first, senza limite di direzione, "accorpare necessariamente"); (4) ordine finale near→far. Tappe co-locate sempre insieme (gruppi atomici). Fattibilità sempre dal motore reale (`evaluateDayTiming`). Fallback offline invariato. Verificato offline (struttura): co-locate unite, unione parziale Tione/Riva+Rovereto, nessuna giornata vuota; la qualità delle valli dipende dai tempi reali Google (offline la linea d'aria mescola). Tarabili `MERGE_DETOUR_PER_STOP`/`NEAR_HOME_RADIUS`.

## v5.029 — 2026-06-21
- Multi-giorno, criterio di unione delle giornate cambiato da "corridoio = guida ≤ 1.4×2×estremo" a DEVIAZIONE PER TAPPA. Sul giro reale il corridoio-ratio scalava con la distanza: troppo permissivo per i semi lontani (San Candido 169' → univa Cavalese/Fiemme, 391km) e troppo stretto per le zone a "V" (Tione/Riva, estremo 77' ma guida ~200' → bloccava Rovereto che è sulla via). Nuovo metro scale-free `MERGE_DETOUR_PER_STOP` (22'): un'unione è ammessa se `(driveMin(A∪B) − driveMin(A)) / nTappe(B)` ≤ 22'. Verificato sui numeri reali: Tione/Riva+Rovereto ~7'/tappa sì, Primiero+Valsugana ~18'/tappa sì, San Candido+Cavalese ~27'/tappa no, Sen Jan+Merano ~71'/tappa no. `fillDays` calcola la guida del giorno-base da solo per la deviazione marginale. Tarabile.

## v5.028 — 2026-06-21
- Multi-giorno: SALVA e RICALCOLA un giro. Si salva solo l'INPUT (tappe + parametri base), per rifare la suddivisione in giornate senza re-inserire le tappe. Backend: tabella `multiday_plans` (user_id, name, payload_json={baseReq,stops}) in `db.js` (+ `initMultiDayPlansTable` in migrateAuth), funzioni `listMultiDayPlans`/`saveMultiDayPlan`/`deleteMultiDayPlan`, endpoint `GET/POST /api/multiday-plans` e `DELETE /api/multiday-plans/:id`. Frontend: pulsante "Salva giro" nella vista suddivisione (renderResultMultiDay, usa `state.mdStops`), elenco "Giri salvati (più giorni)" nel form percorso (`renderMultiDayPlansList`) con Ricalcola (`recalcSavedMultiDay` → POST /api/plan-multiday con data odierna → vista giornate) ed elimina. `refreshMultiDayPlans` al boot.

## v5.027 — 2026-06-21
- Multi-giorno, `fillDays` RISCRITTA per unire GIORNATE INTERE invece di singole tappe. Sul giro reale il riempimento tappa-per-tappa aveva tre difetti: (1) separava tappe dello stesso paese (le due di Rovereto in giorni diversi); (2) appendeva tappe vicino casa a giorni di direzione sbagliata (Pergine nel giro di Tione/Riva, Trento in quello di Merano → FUORI CHIUSURA Trento); (3) il limite di gap 60' bloccava il collegamento Primiero↔Levico (84', corridoio pulito della Valsugana) lasciando Primiero solo. Ora si uniscono due GIORNATE intere solo se l'unione resta FATTIBILE (con margine `MERGE_RETURN_MARGIN` 15') E un CORRIDOIO (`CORRIDOR_FACTOR` 1.4), procedendo dalla più lontana e unendo la più vicina compatibile. Rimosso il limite di gap fisso (il corridoio + fattibilità sono i veri vincoli; così Primiero+Valsugana, gap 84' ma corridoio pulito, si unisce). Verificato offline: le due Rovereto restano insieme, Trento/Pergine restano in Valsugana, nessun serpente. `dayFeasible` restituisce `driveMin`. Tarabili: `CORRIDOR_FACTOR`, `MERGE_RETURN_MARGIN`.

## v5.026 — 2026-06-21
- Multi-giorno, controllo CORRIDOIO nella fase di riempimento (`CORRIDOR_FACTOR` 1.4). Sul giro reale `fillDays` incatenava troppo: una giornata sommava salti corti e attraversava 4 valli (Ortisei→Bolzano→Egna→Mezzolombardo→Cles→Pergine, 6 tappe, piena ma incoerente). Fix: una tappa viene assorbita solo se la giornata resta un corridoio andata-ritorno, cioè guida totale ≤ `CORRIDOR_FACTOR × 2 × distanza dell'estremo da casa` (un corridoio pulito guida ≈ 2× l'estremo; un serpente molto di più). Oltre a gap (60') e fattibilità reale. `dayFeasible`/`evaluateDayTiming` ora restituiscono `driveMin`. Verificato (offline): l'unione buona Tione/Riva+Rovereto resta, la catena tra valli sparisce. `CORRIDOR_FACTOR` tarabile sulla Diagnostica.

## v5.025 — 2026-06-21
- Multi-giorno, FASE DI RIEMPIMENTO (`fillDays`): le giornate per-zona finivano presto (Cles/Mezzolombardo 10:52, Tione/Riva 11:47, San Candido 13:13 — ore inutilizzate). Su indicazione utente: dopo aver creato i giri, si riempiono unendo le giornate adiacenti. Partendo dalla giornata col punto più LONTANO da casa, assorbe le tappe più vicine (entro `MERGE_MAX_GAP` 60' di strada) dalle altre giornate finché resta FATTIBILE (motore reale: orari/chiusure/pranzo/arrivo). Le valli opposte non si uniscono (gap + fattibilità). Verificato: Tione/Riva assorbe Rovereto (esempio dell'utente). Le giornate da 1 tappa non unite restano "resti": ≥2 riempite insieme, una sola isolata se inevitabile. Ordine finale near→far. Diagnostica: riga "DOPO RIEMPIMENTO". NB: la qualità delle unioni dipende dai tempi reali Google (offline la linea d'aria unisce male); da validare sul giro reale. `MERGE_MAX_GAP` tarabile.

## v5.024 — 2026-06-21
- Multi-giorno, chiarita la regola dei "resti" (su precisazione utente): le tappe rimaste indietro si RIEMPIONO in una giornata; se non ci stanno tutte si usa una seconda (prima si riempie una giornata); una tappa resta isolata solo se inevitabile (non combinabile). Funzionalmente è ciò che già faceva `growDays` in v5.023 (riempie un giorno col motore reale, sfora solo al bisogno): qui solo commento e messaggio Diagnostica più chiari ("le riempio in una giornata, al bisogno due").

## v5.023 — 2026-06-21
- Multi-giorno, affinamenti alla logica per zone (su indicazione dell'utente): (1) ordine dei giri dalla zona con l'estremo PIÙ VICINO a casa, allontanandosi (orderedZones per seedHome crescente); (2) le "tappe rimaste indietro" — le giornate da UNA sola tappa — vengono accorpate in un unico gruppo e ri-clusterizzate insieme alla fine (`growDays` estratto come helper; dissolve i singleton se ≥2, una tappa davvero isolata resta sola). Sempre con orari/chiusure pranzo/logica di arrivo dal motore reale. Diagnostica: riga ZONE "dal più vicino a casa", riga RESTI quando accorpa. NB: la qualità delle zone lontane dipende dai tempi reali Google (offline la linea d'aria mescola).

## v5.022 — 2026-06-21
- Multi-giorno RIDISEGNATO per ZONE (su indicazione dell'utente): prima si individuano gli estremi delle varie zone, poi ogni tappa va nella zona del suo estremo, poi si costruiscono i giri DENTRO ogni zona. Nuova `assignZones(groups, home)`: ordina i gruppi per distanza da casa; un gruppo apre una nuova zona se è più vicino a CASA che a qualunque seme/estremo già scelto (direzione propria), altrimenti entra nella zona del seme più vicino su strada. Evita il partner-eating (Cles+Mezzolombardo non assorbiti dal Nord) e non mescola valli. Le tappe entro `NEAR_HOME_RADIUS` (35') sono accorpate in UN'unica zona vicino-casa (prima ognuna diventava una giornata a sé). `buildDayClusters` costruisce le giornate per-zona col motore reale per la fattibilità (una zona grande si spezza in più giornate, estremo→casa). Aggiunto skip weekend: `addWorkdaysISO` — le giornate sono solo feriali (Lun–Ven), così non si pianificano tappe in giorni di chiusura (prima i piani lunghi sconfinavano nel weekend con tappe FUORI CHIUSURA). `dayFeasible` usa l'indice giornata → data del giorno lavorativo. Diagnostica: riga ZONE con composizione di ogni zona. NB: la QUALITÀ delle zone lontane dipende dai tempi reali di Google (offline la linea d'aria le mescola); da validare sul giro reale.

## v5.021 — 2026-06-21
- Multi-giorno: REVERT del vincolo direzionale `NEAR_HOME_FACTOR` (v5.020). Sul giro reale frammentava il piano in 8 giornate: il vincolo (entra solo se distanza dal gruppo ≤ 1.3×distanza da casa) lasciava le tappe vicino casa senza un giorno valido quando il loro partner naturale era già stato preso (es. Mezzolombardo finiva nel Nord, orfanando Cles a 28') o quando cadevano in giornate di chiusura. Le 8 giornate, partendo da lunedì, sconfinavano nel weekend (sabato/domenica → banche CHIUSE): Pergine e Trento risultavano serviti FUORI CHIUSURA in giornate da una sola tappa. Tornati alla logica v5.019 (accrescimento "più vicino al gruppo" + motore reale per la fattibilità). Diagnostica invariata. Lezione (docs/MULTI_GIORNO.md): il problema vero ora visibile è (1) la scelta del giorno della settimana per evitare le chiusure, e (2) il partner-eating; non un'altra soglia direzionale a tentativi.

## v5.020 — 2026-06-21
- Multi-giorno, VINCOLO DIREZIONALE (causa del "perché salta Ortisei"). Diagnosi dai dati reali: nel giorno del Nord (seme San Candido) finivano Egna e soprattutto Pergine (22' da casa, Valsugana, altra direzione); Pergine veniva servita oltre la chiusura e spingeva fuori Ortisei (che invece è a 46' da Bressanone, sul corridoio). È il problema della "rete a stella": una tappa vicino casa è comoda da appendere a qualsiasi giornata perché vicina al rientro. Fix: in `buildDayClusters` una tappa entra solo se la distanza-strada dal GRUPPO è ≤ `NEAR_HOME_FACTOR` (1.3) × la distanza da CASA; altrimenti è rimandata a un giorno vicino-casa, dove le tappe vicine si raggruppano tra loro. Verificato a mano sui tempi reali del giro: Pergine/Trento/Levico escono dai giorni lontani e formano una giornata dedicata; Ortisei resta col Nord. Diagnostica: i candidati scartati per direzione sono etichettati `ALTRA DIREZIONE (gruppo Xmin > 1.3×casa Ymin)`. Soglia tarabile sulla Diagnostica. Da validare sul giro reale.

## v5.019 — 2026-06-21
- Diagnostica multi-giorno arricchita per iterare sui raggruppamenti coi dati reali (offline non riproducibile): (1) GEOMETRIA — tempo-strada da casa a ogni paese ordinato lontano→vicino, e per ogni paese il vicino più prossimo su strada (per "vedere" i corridoi); (2) SEME di ogni giornata (paese più lontano che la apre — rivela i salti tra valli); (3) a fine giornata l'elenco dei 6 candidati più vicini NON entrati, ognuno con tempo dal gruppo, tempo da casa e verdetto reale (rientro HH:MM, OLTRE ORARIO, FUORI CHIUSURA con paese) — distingue divisione forzata da chiusura/orario vs errore di direzione; (4) per ogni giornata finale: margine fino al rientro max, attesa totale, orario del pranzo inserito. Aggiunto `opts.endMin`. Solo logging, nessun cambio alla logica di raggruppamento.

## v5.018 — 2026-06-21
- Diagnostica multi-giorno leggibile: tutte le tappe usano ora la LOCALITÀ (`location`, il paese) invece del `customer`, che per molti clienti è identico (es. tutte le filiali "Intesa S. Paolo IOL") rendendo il log illeggibile. Nuovo helper `nameOf`. Ogni giornata logga la sequenza dei paesi (`A → B → C`), la prossima tappa scartata col paese e il verdetto reale (rientro pause-incluse, FUORI CHIUSURA). `evaluateDayTiming` restituisce le `lateStops` per località. Necessario per diagnosticare i raggruppamenti su dati reali (corridoi spezzati tra giornate).

## v5.017 — 2026-06-21
- Multi-giorno: la fattibilità di ogni giornata è ora decisa dal MOTORE REALE della giornata singola. Nuova funzione `evaluateDayTiming` (planner.js): riusa la stessa pipeline (`normalizeStop` → `buildLegMatrix` con cache → `evaluateOrder`/`scheduleStop`) per orari di apertura/chiusura, tolleranza, spezzare interventi; pranzo e soste come allowance di tempo (coerente col motore reale: le pause spostano la fine, le chiusure sono valutate sul programma pre-pause). Salta `insertBreaks` → niente lookup Places, quindi è economica come oracolo di fattibilità (resa possibile dalla cache tragitti della v5.016). `buildDayClusters` è ora async e usa questo oracolo come gate (`dayFeasible`): una giornata è valida solo se rientra in maxReturnTime pause-incluse e nessuna tappa è servita oltre la chiusura. Eliminata la divergenza tra l'approssimazione del multi-giorno e il motore reale, causa di bug ricorrenti (es. Bressanone esiliato in una giornata dedicata per l'interazione con il pranzo). Le vecchie `estimateDayMinutes`/`dayHoursFeasible` restano solo come fallback offline. Diagnostica: per ogni giornata chiusa mostra il verdetto reale (orario di rientro pause-incluse, eventuali FUORI CHIUSURA). Da validare sul giro reale con la Diagnostica.

## v5.016 — 2026-06-21
- Routing: aggiunta una cache dei tragitti in `googleMapsService.routeBetween` (chiave = coppia di coordinate arrotondate, direzionale). Prima ogni chiamata colpiva l'API Directions; ora le tratte ripetute (matrice multi-giorno + `planRoute` per ogni giornata, che ricostruisce le stesse tratte) sono servite dalla cache. Riduce chiamate/latenza ed è la base tecnica per far usare al multi-giorno il motore reale `planRoute` come oracolo di fattibilità (obiettivo: il giorno multi-giorno deve comportarsi ESATTAMENTE come la giornata singola — pranzo, soste, spezzare interventi, orari). NB: `insertBreaks` fa lookup Places per ristoranti/soste, quindi usare planRoute come gate richiede una modalità "solo tempi" (prossimo passo) per non moltiplicare le chiamate Places.

## v5.015 — 2026-06-21
- Multi-giorno: REVERT del criterio "sul corridoio/detour" della v5.014. Sul giro reale (tempi Google) FRAMMENTAVA il piano: con seme = tappa più lontana + accrescimento solo "sulla via", ogni valle lontana di direzione diversa (Bressanone N, Cles NO, Primiero E) diventava un seme isolato in una giornata dedicata → 9 giornate inspiegabili. È il fallimento opposto allo swap (che invece mescolava). Ripristinato l'accrescimento "tappa più vicina al gruppo" + swap pass-through/terminale (la versione che l'utente ha valutato come la migliore finora). Aggiornato docs/MULTI_GIORNO.md (corridoio/detour aggiunto agli approcci falliti). Nuova cache (v345). Disciplina: niente altre modifiche all'algoritmo senza la Diagnostica del giro reale.

## v5.014 — 2026-06-21
- Multi-giorno: rimosso lo swap pass-through/terminale (causa principale del mescolamento di valli — tirava dentro tappe "lontane da casa" senza guardare la direzione, es. Cavalese dopo Bressanone, Tione+Riva+Bolzano insieme) e sostituito l'accrescimento "tappa più vicina al gruppo" con il criterio "sul corridoio": una tappa B entra nella giornata del seme/estremo F solo se è sulla via di rientro F→casa, misurato col detour `tempo(F→B)+tempo(B→casa)−tempo(F→casa)`; entra il gruppo col detour minore, entro la soglia `ON_CORRIDOR_FRACTION × tempo(F→casa)` (0.4, tarabile). Così una diramazione breve (Ortisei, Merano) entra ma un'altra valle (Cavalese da Bressanone) no. Diagnostica: per ogni giornata chiusa logga il detour di ogni candidato scartato (FUORI CORRIDOIO / OLTRE BUDGET / ORARI NON ok) per tarare la soglia sul giro reale. Mantenute le correzioni orarie buone (1ª tappa all'apertura, finestra pomeridiana, conteggio soste). Documentato tutto in docs/MULTI_GIORNO.md (da leggere sempre prima di toccare il multi-giorno). NB: i test offline usano la linea d'aria e NON validano i raggruppamenti reali — da verificare in produzione con la Diagnostica.

## v5.013 — 2026-06-16
- Multi-giorno: REVERT alla logica della v5.011. La v5.012 (accrescimento per costo di inserimento con soglia "sulla via") peggiorava i raggruppamenti reali rispetto alla v5.011, quindi è stata annullata con git revert. Tornati a: accrescimento "tappa più vicina al gruppo" + swap pass-through/terminale + verifica oraria accurata (1ª tappa all'apertura, finestra pomeridiana, conteggio soste). Nuova cache (v343) per non servire la v5.012 dalla PWA. Nota di processo: basta modifiche all'algoritmo a tentativi senza dati reali — i prossimi cambi solo su diagnostica del giro vero.

## v5.011 — 2026-06-16
- Multi-giorno: (1) swap pass-through/terminale — dopo l'accrescimento, se resta fuori un gruppo più lontano da casa di una tappa già nel giorno, lo si scambia con la tappa più vicina a casa (se budget+orari reggono). Così le tappe di passaggio (es. Bressanone) entrano nella zona lontana e a saltare è quella terminale vicino a casa, non una di passaggio. (2) dayHoursFeasible reso accurato: la 1ª tappa (più lontana) inizia all'apertura (riproduce il calcolo a ritroso del far-first) invece che a startMin+guida — prima era pessimista di ~ore e scartava tappe valide; inoltre se l'arrivo è a ridosso della chiusura mattutina si prova la finestra pomeridiana (come il planner reale) invece di bocciare; conteggiato anche il tempo soste. Verificato col modello corridoio: Giorno 1 = San Candido+Brunico+Bressanone+Ortisei, Egna/Trento rimandati.

## v5.010 — 2026-06-16
- Multi-giorno: la verifica di fattibilità oraria (dayHoursFeasible) ora conteggia il tempo delle soste durante i tragitti lunghi, come fa il planner reale. Prima la stima era troppo ottimista e poteva assegnare a una giornata una tappa che nella realtà veniva servita dopo la chiusura (caso reale: Giorno 3 con tappa FUORI CHIUSURA e rientro 18:35 > 18:30). Ora quelle tappe vengono rimandate a un altro giorno. Conseguenza: giornate un po' meno piene (per rispettare gli orari, come da regola utente). Aggiornata la sezione Novità (riepilogo v5.001–v5.010).

## v5.009 — 2026-06-16
- Diagnostica multi-giorno: per ogni giornata logga la 1ª tappa con orari risolti (openingHours), orario di arrivo e se è scattato il calcolo a ritroso (targetArrivalTime) o si è partiti all'orario fisso. Serve a diagnosticare le tappe lontane che "partono tardi" (es. San Candido arrivo 9:50 invece di 8:30 = orari non risolti per quel giorno della settimana → nessun back-calc). Reso realRows riutilizzabile nel log.

## v5.008 — 2026-06-16
- Multi-giorno, diagnostica: planMultiDay produce un debug[] (riquadro "Diagnostica" copiabile nella vista) con: copertura matrice tempi reali Google (realPairs = coppie con source "google"; offline/fallback evidenziato), motivo di chiusura di ogni giornata (prossima tappa vicina + se è OLTRE BUDGET o orari NON ok — spiega i giorni con poche tappe tipo "San Candido solitario"), e tappe servite fuori chiusura per giornata. buildLegTimeMatrix ora distingue google vs local-estimate via source.
- Co-locazione per nome paese: groupColocated raggruppa le tappe con stessa località (oltre che entro ~6 min di strada), così due tappe dello stesso comune (es. Rovereto) non vengono più divise tra giornate.

## v5.007 — 2026-06-16
- Multi-giorno, tre richieste utente: (1) ordine giornaliero "far-first" bloccato — orderDayFarFirst mette la tappa più lontana per prima e poi rientra (nearest-neighbor), il giro viene passato a planRoute con manualOrder/lockOrder; così il viaggio lungo si fa a negozi chiusi e si massimizza il tempo utile. (2) dayHoursFeasible ora simula l'ordine far-first reale (non più EDF): una tappa che cadrebbe dopo la chiusura non viene assegnata a quella giornata (finisce in un altro giorno). (3) groupColocated raggruppa in unità atomiche le tappe entro ~6 min di strada (stesso paese/molto vicine) e il clustering lavora su questi gruppi: tappe co-locate mai divise tra giornate. Verificato offline: Bressanone A+B stesso giorno; giro giorno 1 parte dalla più lontana

## v5.006 — 2026-06-16
- Multi-giorno: criterio di accrescimento cambiato da "minimo costo di percorso verso casa" a "tappa più vicina al gruppo del giorno" (per tempo di strada). Il vecchio criterio infilava le tappe vicine a casa (Egna, Trento) nel giro lontano perché "sulla via del ritorno", creando zigzag nord-sud e giornate oltre l'orario. Ora ogni giornata cresce come zona compatta attorno al punto più lontano (tutto il nord, comprese deviazioni di zona tipo Merano/Ortisei) e le tappe vicine a casa restano per gli ultimi giorni. Verificato con matrice stradale simulata (corridoio A22 + diramazioni): Giorno 1 = zona nord, Egna/Trento rimandati

## v5.005 — 2026-06-16
- Multi-giorno: clustering basato sui tempi di guida REALI su strada invece della linea d'aria. La metrica haversine raggruppava male in montagna (es. la Val di Fassa sembra "sulla strada" Trento→San Candido ma su strada è un vallone laterale, mentre Bolzano/Egna sull'A22 venivano ignorati). Ora planMultiDay precalcola una matrice dei tempi reali (routeBetween) tra casa e tutte le tappe e la usa in tutto il clustering (legMin/nearestNeighborOrder/estimateDayMinutes/dayHoursFeasible/seme più lontano/costo di inserimento); fallback haversile×roadFactor offline. Verificato con matrice simulata corridoio-A22-vs-ValFassa: San Candido raggruppato col corridoio (Brunico/Bressanone/Bolzano), non con la Val di Fassa

## v5.004 — 2026-06-16
- Multi-giorno: riscritta la logica di clustering (buildDayClusters) secondo il modo di ragionare dell'utente — far-first con accrescimento a minimo costo di percorso. Ogni giornata semina la tappa più lontana da casa e aggiunge le tappe col minimo costo di inserimento nel giro (quelle "sulla via di casa"), rispettando budget e orari. Conseguenze: il fronte massimo si accorcia ogni giorno (non si torna mai più lontano di dove si è già stati); le tappe co-locate finiscono insieme (costo ~0); le tappe vicine a casa restano per ultime. Rimossa la ri-ottimizzazione globale dei km (improveClusters non più usata) che rompeva questo schema. Verificato con test (3 zone → fronte 52→33→30km monotono; co-locate insieme; orari rispettati)

## v5.003 — 2026-06-16
- Multi-giorno: riorganizzazione manuale. Backend: planMultiDay accetta payload.manualDays (assegnazione+ordine forniti dall'utente, niente clustering, ordine bloccato per giornata) e include stops[] per giornata nel risultato. Frontend: renderResultMultiDay editabile — trascinamento tappe tra/dentro le giornate (Pointer Events: mouse+touch), frecce su/giù (oltre l'ultima giornata creano un nuovo giorno), banner + "Ricalcola giornate" (#md-recalc) che rilancia /api/plan-multiday con manualDays. Verificato il backend offline (assegnazione manuale rispettata); il drag su touch va verificato su dispositivo.

## v5.002 — 2026-06-16
- Multi-giorno: vincolo orari di apertura nel clustering. buildDayClusters/improveClusters ora accettano/spostano una tappa in una giornata solo se è hours-feasible: nuovo dayHoursFeasible simula la giornata in ordine earliest-deadline-first e rifiuta se una tappa arriva dopo la chiusura o finisce oltre la chiusura + 10 min (tolleranza). resolveStopWindows gestisce weeklyHours per giorno della settimana, orario continuato, finestra utente, ignoreHours, closedToday. Le tappe con orari incompatibili finiscono su giornate diverse invece di essere servite oltre l'orario. Verificato con test (due tappe 08-10 lontane → 2 giornate; tappe senza orari → raggruppate)

## v5.001 — 2026-06-15
- UI multi-giorno: pulsante "Pianifica su più giorni" nel form percorso (#plan-multiday) → POST /api/plan-multiday; nuova vista renderResultMultiDay nel tab Risultato (riepilogo totali + elenco giornate con orari, km e tappe). Risultato in state.resultMultiDay (separato da state.result per non interferire col mono-giorno). Stili nativi (.card/.metric/.summary-grid/.badge + inline), nessuna nuova classe CSS

## v5.000 — 2026-06-15
- Nuova versione maggiore: avvio della pianificazione multi-giorno.
- Nuovo modulo server/multiDayPlanner.js: estimateDayMinutes (stima durata giornata), buildDayClusters (clustering farthest-seed + nearest-accretion con budget orario, + improveClusters ricerca locale per ridurre i km), planMultiDay (geocodifica → clustering → planRoute per ogni giornata su date consecutive, base unica casa/ufficio, n. giorni automatico, ottimizzazione km totali). Scelte concordate: rientro a casa ogni sera, capienza = finestra startTime→maxReturnTime, giornate automatiche, meno km totali.
- Nuovo endpoint POST /api/plan-multiday (autenticato, riusa settings + rubrica).
- Verificato con test deterministici (clustering: 12 tappe → 3 giornate coerenti entro budget; end-to-end con planRoute offline: date consecutive, ogni giornata entro la finestra oraria).
- UI, salvataggio del piano e meteo per giornata: prossimi passi (vedi ROADMAP).

## v4.130 — 2026-06-15
- Fix planner: pranzo nel gap di chiusura per le tappe spezzate. Nella scansione finestra (Sezione 3), se la riga in finestra è la parte mattutina di una tappa spezzata (con pomeriggio stessa sede), il pranzo viene inserito nel gap di chiusura (prima della parte pomeridiana, con i limiti del gap come la Sezione 4) invece che prima della tappa. Risolve il caso in cui, guidando verso la tappa spezzata durante la finestra pranzo, il pranzo finiva prima della tappa lasciando vuoto il gap. Verificato con test: mattina 12:29-13:30, pranzo 13:30-14:30 (nel gap), pomeriggio 14:45-16:14
- Info app: aggiornata la sezione Novità con riepilogo v4.121–v4.130

## v4.129 — 2026-06-15
- Fix planner: pranzo collocato DOPO l'intervento quando la tappa si conclude entro la finestra pranzo. La scansione finestra (Sezione 3) ora, se la tappa verso cui si guida finisce entro [LUNCH_OPEN, LUNCH_CLOSE] ed è non-split, inserisce il pranzo dopo la tappa (vicino ad essa) invece che prima sulla guida. Risolve: (1) pranzo a Riva del Garda piazzato prima dell'intervento di Riva — ora si fa prima l'intervento; (2) tappa spinta dentro la propria chiusura di mezzogiorno dallo spostamento del pranzo (Riva lavorava 13:47-14:17 durante chiusura 13:30-14:45) — ora resta nel mattino 12:29-12:59 e si mangia dopo. Tappe lunghe (fine oltre 14:00) usano ancora il pranzo in guida. Verificato con test su insertBreaks (caso corto e caso lungo)

## v4.128 — 2026-06-15
- Fix planner: avviso "arrivo prima dell'apertura" mancante quando le pause spostano l'arrivo. shiftRowTimes ora, se dopo lo spostamento l'arrivo resta prima dell'apertura (attesa residua: newSvc > newArr), aggiunge il warning. Caso: Intesa Riva del Garda, arrivo 14:35 con apertura PM 14:45 — l'attesa di 10min c'era (span arrivo→fine = 40min con 30min di lavoro) ma non era segnalata, perché scheduleStop calcola il warning sull'orario di arrivo precedente alle pause. Verificato con test su shiftRowTimes

## v4.127 — 2026-06-15
- Pranzi (findNearbyRestaurant): soglie qualità su richiesta utente — rating ≥ 4.3 (era 3.8), recensioni ≥ 20 (era 10), fascia prezzo ≤ ~25€/persona (price_level ≤ 2, invariato). Aggiunta "pizzeria" alla keyword di ricerca (ora mensa/trattoria/osteria/ristorante/pizzeria)

## v4.126 — 2026-06-15
- Soste automatiche (findNearbyRestStop): ripristinata una soglia qualità minima su richiesta utente — si scartano i locali con meno di 4 stelle o meno di 5 recensioni. Resta attiva la ricerca per vicinanza (rankby=distance) e l'ordinamento per distanza dal percorso: tra i locali ≥4★/5 recensioni si sceglie il più vicino al tragitto

## v4.125 — 2026-06-15
- Fix soste automatiche (googleMapsService.findNearbyRestStop): la ricerca usava il ranking di prominenza entro un raggio (restituiva le mete più famose, anche lontane dal percorso) e poi ordinava per rating·log(recensioni), scegliendo il locale meglio recensito anche se a km dalla strada (es. Malga Cimana ⭐4.5 a 6.7 km perp). Ora: (1) rankby=distance per ottenere i bar più vicini al punto; (2) filtro qualità abbassato — si scartano solo hotel e locali con rating < 2.5, non più quelli con < 5 recensioni; (3) ordinamento per vicinanza al percorso (bucket 0.5 km) con rating solo come spareggio. Risultato: si preferisce un locale modesto sul tragitto a uno ottimo ma lontano

## v4.124 — 2026-06-14
- Fix planner: soste automatiche fuori portata. Nel retry esteso (raggio 25km) dopo lo scarto per distanza, il travelKm del nuovo spot veniva ricalcolato ma non rivalidato, così una sosta a ~14km/17min (oltre il limite 8.3km×1.5=12.5km, a volte in direzione opposta alla tappa successiva) veniva inserita per una pausa di 10-15min. Ora se la deviazione supera maxDetourKm×1.5 la sosta viene scartata e non inserita

## v4.123 — 2026-06-14
- Nuovo: flag isRestStop e isLunchStop su contatti — un cliente può essere contrassegnato come sosta caffè e/o luogo pranzo; il planner lo include nei pool corrispondenti; badge ☕🍽 sulle card archivio

## v4.122 — 2026-06-14
- Fix planner: la parte pomeriggio di una tappa spezzata per orari di apertura ha orari assoluti (apertura negozio). shiftRowTimes ora la ancora come per le finestre fisse e azzera il timeShift dopo: la pausa pranzo inserita nel gap di chiusura viene assorbita dal gap invece di spingere avanti la ripresa pomeridiana (es. ripresa 14:30 e non 15:30). Verificato con test su insertBreaks (prima 15:30/fine 16:46 oltre chiusura, dopo 14:30/15:46)
- UI: la card della pausa pranzo mostra sempre il tempo di guida — deviazione andata/ritorno per il ristorante, oppure "sul percorso, nessuna deviazione" se è sul tragitto (driveMinutes=0)

## v4.121 — 2026-06-14
- Fix planner: tappa lavorata durante la chiusura → split forzato. In scheduleStop, quando l'intervento non sta interamente nel pomeriggio (es. Mediolanum 09:00–13:00/14:30–16:00, arrivo 12:16, durata 120min: mattina solo 44min, pomeriggio 90min < 120min), la tappa veniva lavorata dritta attraverso la chiusura ignorando gli orari. Ora viene spezzata comunque (mattina 12:16–13:00 + pomeriggio 14:30–15:46) anche se la fetta mattutina è < 45min, perché è l'unico modo di rispettare gli orari — e il gap di chiusura 13:00–14:30 diventa la pausa pranzo che prima non veniva mai inserita. Comportamento v4.117 (fetta sottile ma pomeriggio capiente → tutto al pomeriggio) preservato. Verificato con test su 4 scenari

## v4.120 — 2026-06-14
- Fix planner: pranzo durante attesa apertura — il ristorante viene cercato vicino alla tappa di destinazione (dove si attende), non lungo la tratta percorsa per arrivarci. Section 5 ora passa la tappa stessa come from e to in makeLunchEntry, così il centro ricerca è la destinazione (es. Fineco/Riva del Garda) e non un punto a metà strada (es. New Kurdistan a Bolzano)

## v4.119 — 2026-06-14
- Fix planner: shiftRowTimes segnala un avviso ("intervento oltre l'orario di chiusura per soste accumulate") quando le soste inserite prima di una tappa con attesa spingono l'inizio del servizio oltre l'apertura e la fine supera l'orario di chiusura — prima la tappa sforava la chiusura senza alcun avviso

## v4.118 — 2026-06-14
- Fix planner: shiftRowTimes ora ri-ancora l'orario di servizio all'apertura effettiva per le tappe con attesa (es. Fineco arriva 13:24 ma apre alle 14:00 → lavora 14:00-17:00, non 15:10-18:10)
- Fix planner: dopo una tappa con attesa, il timeShift accumulato viene ridotto dell'attesa assorbita — le tappe successive non vengono più sovra-spostate
- Fix planner: il pranzo "durante attesa" ora usa driveOffset corretto, collocandolo all'orario di arrivo alla tappa (non alla partenza dalla tappa precedente)

## v4.117 — 2026-06-14
- Fix planner: soglia minima 45 min per il lavoro mattutino — se il tempo prima della chiusura è inferiore, l'intervento viene spostato interamente al pomeriggio (risolve Fineco 13:03 che faceva 36min di lavoro durante la chiusura)
- Nuovo planner: pranzo durante attesa apertura — se si arriva vicino a una tappa chiusa con tempo sufficiente nella finestra pranzo, cerca un ristorante in zona

## v4.116 — 2026-06-14
- Fix: ricalcolo giro — gli orari vengono ora recuperati dall'archivio contatti locale (state.allAddresses) come fallback, risolvendo definitivamente il caso Fineco "Non indicato" su giri salvati in precedenza
- Nuovo: tempi di viaggio sempre visibili su ogni card (tappa, sosta, pranzo) — mostra 🚗 Xmin · Ykm senza dover espandere il dettaglio

## v4.115 — 2026-06-14
- Fix: ricalcolo giro (replanFromResult) — le tappe spezzate (es. Fineco 09:00–13:00/14:00–18:00) ora trasmettono openMorning/closeMorning/openAfternoon/closeAfternoon al server, e la durata è la somma mattina+pomeriggio (non solo i 6min mattutini)
- Fix: soste automatiche — le soste salvate vengono ora escluse se la distanza diretta dalla posizione corrente supera maxDetourKm, anche se risultavano "sul percorso" geometricamente (es. Obber in Imer inserita come sosta da Riva del Garda a 2h di distanza)

## v4.114 — 2026-06-14
- Nuovo: gap chiusura pranzo nelle tappe spezzate (mattina/pomeriggio) viene utilizzato produttivamente:
  se il gap è abbastanza lungo cerca un ristorante raggiungibile (andata+pranzo+ritorno entro il gap,
  con distanza max = (gapMin − lunchBreakMin) / 2 × 50km/h); altrimenti inserisce una sosta breve;
  logica: pranzo non ancora fatto → priorità ristorante; pranzo già fatto → sosta se gap ≥ 20min

## v4.113 — 2026-06-14
- Fix: scheduleStop — arrivo nel gap pranzo (es. 13:03 con chiusura 13:00–14:00): l'intervento ora attende l'apertura pomeridiana (14:00) invece di lavorare durante la chiusura
- Fix: scheduleStop — lavoro supera la chiusura mattutina senza split possibile: l'intervento viene spostato al pomeriggio (14:00) invece di sforare
- Debug log insertBreaks: aggiunto stopPart e openingHours per riga per diagnostica split

## v4.112 — 2026-06-14
- Nuovo: icona/riga meteo cliccabile in ogni tappa — apre direttamente MeteoTrentino (per tappe in Trentino) o Suedtirol.info/meteo (per tappe in Alto Adige); link passa il sourceUrl dall'API server

## v4.111 — 2026-06-14
- Fix: ricalcolo da vista risultato non preservava l'ordine del giro caricato — aggiunto manualOrder=true in replanFromResult(); l'ordine originale non viene più rimescolato dall'ottimizzatore
- Fix: timeout fetch meteo aumentato da 2.5s a 6s — MeteoTrentino e Open Data Hub Bolzano non vanno più in timeout e non scatenano il fallback Open-Meteo
- Fix: Open-Meteo 429 su chiamate parallele — aggiunta deduplicazione in-flight (openMeteoInflight Map): più tappe con stesse coordinate condividono un'unica richiesta HTTP

## v4.110 — 2026-06-14
- Fix: Open-Meteo 429 "too many requests" — aggiunta cache in-memory (openMeteoCache) in weatherService.js: stessa combinazione lat/lng/data/mode non ripete la chiamata HTTP
- Fix: sosta salvata (es. Bar Caffè Obber) inserita due volte allo stesso beforeIndex — tryInsert ora salta le soste già presenti in insertions con stessa lat/lng

## v4.109 — 2026-06-14
- Feature: meteo tappe in Provincia di Bolzano/Alto Adige usa Open Data Hub South Tyrol (14 comuni, da Bolzano a San Candido); fallback automatico su Open-Meteo se API non disponibile

## v4.108 — 2026-06-14
- Fix: centro ricerca ristorante pranzo durante la guida ora calcolato in base al tempo disponibile (LUNCH_CLOSE − durata − partenza), non fisso a 20 min; retry con raggio esteso se il primo candidato è scartato

## v4.107 — 2026-06-14
- Fix: retry 25km non scattava quando il posto trovato era oltre maxDetour (ex: Restel De Fer 8.6km > 8.3km); ora il retry avviene anche in questo caso, non solo quando Places API restituisce null

## v4.106 — 2026-06-14
- Fix: pausa pranzo durante la guida cercava il ristorante alla tappa di partenza invece che lungo il percorso; ora usa un centro di ricerca ~20 min avanti sul segmento (proporzionale alla distanza); le tappe spezzate (split) restano vicino alla tappa. Cache ristorante include il raggio nella chiave.

## v4.105 — 2026-06-14
- Fix: post-work break cercava la sosta esattamente alla tappa appena finita — ora cerca ~20 min lungo il prossimo segmento di guida; stessa logica per la sosta post-loop (tratta verso casa) con coordinate di casa passate a insertBreaks

## v4.104 — 2026-06-14
- Fix: filtro keyword soste rimoveva "ristorante", "pizzeria", "trattoria" — tra Bolzano e Arco tutti i bar hanno "ristorante" nel nome e venivano scartati; ora si escludono solo alloggi puri (hotel, albergo, b&b, hostel, agriturismo, resort, spa)

## v4.103 — 2026-06-14
- Info app: sezione "Riepilogo v4.001–v4.100" con 10 punti tematici che riassumono i primi 100 fix; rimossi i blocchi "Novità v4.083" e "v4.090" ora coperti dal riepilogo; da v4.110 in poi riprende il riassunto ogni 10 fix

## v4.102 — 2026-06-14
- Fix: cache sosta includeva solo lat/lng, quindi la retry con raggio 25km colpiva la stessa chiave e restituiva null senza chiamare l'API; ora la chiave include anche il raggio

## v4.101 — 2026-06-14
- Feature: se la ricerca sosta (15km) non trova nulla, retry automatico con raggio esteso 25km e maxDetour ×1.5 — vale per tutte le soste, non solo l'ultima

## v4.100 — 2026-06-14
- Fix: nessuna sosta veniva tentata nell'ultima tratta verso casa anche con cumulative >= REST_MIN; ora dopo il loop principale si tenta un'ultima sosta se l'orario è valido (non nell'ultima ora prima di arrivare)

## v4.099 — 2026-06-14
- Fix: quando il ristorante salvato viene scartato perché l'arrivo supera LUNCH_CLOSE, ora si tenta comunque la Places API per trovare un ristorante più vicino alla posizione attuale

## v4.098 — 2026-06-14
- Fix: pausa pranzo su ristorante "sul percorso" calcolava travelKm=0 anche quando il ristorante era vicino alla fine di un lungo segmento (es. Bolzano dopo 1h19min di guida da San Candido) → orario pranzo irrealistico; ora travelKm = t × segKm dove t è la proiezione del ristorante lungo il segmento (0=inizio, 1=fine)

## v4.097 — 2026-06-14
- Feature: auto-split tappa quando il lavoro sfora la chiusura mattutina senza openAfternoon configurato — il pomeriggio viene inferito da lunchClose (14:00 default), inserendo automaticamente la pausa pranzo

## v4.096 — 2026-06-14
- Fix: sosta salvata "sul percorso" (perp ≤ 2km) aveva travelMin calcolato come haversine dall'inizio del segmento (fino a 57 min fittizi) → orario sosta nel display era sbagliato; ora travelMin=0 per soste on-route (stesso fix già applicato ai ristoranti)

## v4.095 — 2026-06-14
- Fix: backend ora usa GOOGLE_MAPS_SERVER_KEY (senza restrizioni referrer) per Places API e Directions; fallback su GOOGLE_MAPS_API_KEY se non impostata

## v4.094 — 2026-06-14
- Debug: Places API sosta ora logga il motivo di ogni scarto nel log soste (status API, totale risultati, motivo per candidato: no rating, keyword esclusa, distanza > max, tutti chiusi)

## v4.093 — 2026-06-14
- Fix: rimosso else-if residuo che dimezzava cumulative a REST_MAX/2 anche dopo sosta non trovata; fix precedente (v4.092) era incompleto — il dimezzamento ora avviene SOLO dentro tryInsert al momento dell'inserzione effettiva

## v4.092 — 2026-06-14
- Fix: cumulative dimezzato a REST_MAX/2 anche quando la sosta post-lavoro falliva (nessun posto trovato); il dimezzamento ora avviene solo se la sosta viene effettivamente inserita — evita perdita del conteggio ore accumulate

## v4.091 — 2026-06-14
- Fix: ristorante "sul percorso" (perp ≤ 2km) scartato erroneamente perché travelKm misurato dall'inizio del segmento (potenzialmente 100+ km); ora travelMin=0 per ristoranti sul percorso

## v4.090 — 2026-06-14
- Fix: crash "addedMinutes is not defined" nell'ultima riga del log di insertBreaks — variabile corretta è timeShift; il crash impediva il popolamento di debugLog

## v4.089 — 2026-06-14
- Fix: pulsante "Log" sempre visibile nel risultato (non condizionale al debugLog); se il giro non è stato ricalcolato mostra "Ricalcola per generare il log"

## v4.088 — 2026-06-14
- Feature: pulsante "Log" nel risultato — copia negli appunti il log dettagliato di ogni decisione del planner (trigger soste, posti trovati/scartati con motivo, finestra pranzo, orari bloccati)

## v4.087 — 2026-06-14
- Fix: `needed` nel loop mid-leg poteva diventare negativo quando cumulative > REST_MIN → posizione interpolata e orario sosta errati; ora `Math.max(0, ...)`
- Fix: soglia Fix D (30 min prossima tappa) rimossa — bloccava break post-Bolzano quando la tappa successiva era breve; il check post-work ora è sempre tentato
- Fix: ristorante pranzo "sul percorso" ma irraggiungibile entro la finestra — aggiunto controllo `lunchTimeMin + travelMin > LUNCH_CLOSE` → scarta il ristorante e usa "Pausa pranzo" senza luogo

## v4.086 — 2026-06-13
- Fix A: ristorante/sosta "sul percorso" (perp ≤ 2km) accettato senza limite di distanza; il limite maxDetourKm si applica solo a posti fuori percorso
- Fix B: quando tryInsert fallisce per mancanza di posto, cumulative non viene bruciato dall'intero tratto rimanente — la prossima finestra rimane puntuale
- Fix C: rimosso vincolo `cumulative > 0` dal loop mid-leg — soste ora possibili anche con cumulative=0 (es. subito dopo il pranzo)
- Fix D: no sosta post-tappa se la prossima dura < 30 min (lavoro breve → aspetta di finire)
- Fix E: prevServiceEnd dopo il pranzo include anche travelMinutes verso il ristorante

## v4.085 — 2026-06-13
- Fix: ristorante/sosta salvata selezionata anche se a ore di distanza — aggiunto check haversine dalla posizione attuale (non solo distanza perpendicolare al segmento); se la distanza diretta supera maxDetourKm il posto salvato viene ignorato e si usa l'API
- Fix: tempo di viaggio verso sosta/ristorante cappato a 10 min — rimosso Math.min(..., maxDetourMin); per le soste, se il viaggio supera maxDetourKm il posto viene scartato e si cerca il successivo

## v4.084 — 2026-06-13
- Fix: soste e pause pranzo non rispettavano la deviazione effettiva dal percorso — findNearestRestStop() restituiva la prima sosta salvata senza valutare le coordinate; travelKm/travelMin ora calcolati separatamente per ogni sosta/ristorante e inseriti nel percorso come tratto di guida dedicato (driveMinutes, km) anziché sommarsi alla durata della pausa; timeShift include il viaggio verso la sosta

## v4.083 — 2026-06-13
- Feature: ricerca avanzata nei giri salvati — per nome, intervallo di date (Da/A), tappa (cliente/indirizzo, riusa fuzzy-match `rankAddressMatches`) e stato di condivisione; criteri combinabili. La ricerca alla radice opera su tutti i giri, dentro una cartella si limita a quella cartella
- Feature: cartelle sincronizzate lato server — crea, rinomina, elimina; sposta un giro in una cartella o toglilo; eliminando una cartella i giri tornano "senza cartella" (con conferma). Persistenza DB (`folders` table + `planned_routes.folder_id`), sincronizzazione tra dispositivi tramite `/api/folders` e `/api/routes/:id/folder`
- Feature: statistiche per cartella — ore lavoro, km percorsi, ore guida e costo totale (da `total_cost` già presente per giro)

## v4.082 — 2026-06-13
- Fix: badge "Condiviso da [nickname]" non appariva sui giri importati — rowToRouteSummary() in db.js non esponeva il campo sharedBy (era sepolto solo in payload), quindi la lista giri ripiegava sempre su "Importato". Ora sharedBy viene letto da payload.sharedBy e incluso nel sommario. Aggiornati anche i testi della guida.

## v4.081 — 2026-06-13
- Fix: pulsante "Seleziona" non visibile su iPhone — aggiunto flex-wrap alla riga pulsanti header archivio

## v4.080 — 2026-06-13
- Fix: scroll-jump ricerca archivio eliminato definitivamente — il search handler ora aggiorna solo il div .archive-list senza mai distruggere/ricreare l'input (estratto buildArchiveListHTML()). Novità v4.080

## v4.079 — 2026-06-13
- Fix: pulsante "Seleziona" ora sempre visibile in archivio (non solo dopo ricerca/mostra tutti); al click carica automaticamente tutti i contatti se non già mostrati

## v4.078 — 2026-06-13
- Fix: ricerca archivio non saltava più la pagina a ogni lettera — rimosso state.archiveShowAll=Boolean(q) nel handler input; focus() con preventScroll:true; debounce ri-renderizza solo se i risultati cambiano
- Fix: crash eliminando contatti in modalità "mostra tutti" — renderVisitCalendar() ora è lazy: viene chiamato solo all'apertura del <details> tramite capture listener su toggle, non per tutti i contatti insieme durante il render

## v4.077 — 2026-06-12
- Fix: dopo un reload in background su iOS, l'app ripristina invisibilmente la tab e il giro aperti prima dell'interruzione (localStorage pl_nav)

## v4.076 — 2026-06-12
- Feature: calcolo costi multi-operatore — ogni operatore ha la propria tariffa €/h lavoro; ore guida moltiplicate per n. operatori × tariffa guida unica; €/km invariato; pulsante +/× per aggiungere/rimuovere operatori (max 8)

## v4.075 — 2026-06-12
- Feature: giri condivisi mostrano "Condiviso da [nickname]" invece di "Importato" — il nickname viene incluso nel link al momento della condivisione
- Fix: Google Maps in bianco su Safari desktop vecchio — aggiunto trigger resize dopo l'inizializzazione per forzare il rendering delle tile

## v4.074 — 2026-06-12
- Fix: eliminazione contatto crashava l'app su iOS — rimosso confirm() nativo, sostituito con conferma inline sulla card; aggiunto try/catch
- Feature: selezione multipla contatti — pulsante "Seleziona" in archivio attiva la modalità con checkbox; pulsante "Elimina (N)" elimina tutti i selezionati in parallelo

## v4.073 — 2026-06-11
- Feature: costi nascosti di default — toggle "Calcola costi" in fondo al giro attiva la sezione con tariffe modificabili per-giro (non impatta le impostazioni globali)
- Fix: costi rimossi dalle card giri salvati e dall'intestazione risultato (appaiono solo quando il toggle è attivo)
- Fix: PDF — sezione costi inclusa solo se il toggle "Calcola costi" era attivo; nel dialogo stampa l'opzione viene disabilitata se i costi non sono stati calcolati

## v4.072 — 2026-06-11
- Fix: giri salvati con nomi duplicati — il controllo unicità ora si applica anche quando il client invia un nome esplicito
- Fix: nuovo giro sempre nominato "Percorso giornaliero" — rimosso il fallback fisso; il server genera sempre il nome smart (sede/cliente + data)
- Fix: aggiungere tappe a un giro esistente creava un duplicato — planCurrentRoute passa ora l'id del risultato corrente se disponibile
- Fix: sezione "Novità" in Info app aggiornata a v4.070

## v4.071 — 2026-06-11
- Fix: pulsante "Salva impostazioni" sembrava bloccato se l'API restituiva errore — aggiunto try/catch con toast
- Fix: cambio tema nelle impostazioni veniva applicato anche senza salvare — ora l'anteprima è live ma si annulla chiudendo senza salvare
- Fix: errore di rete al riavvio (es. riapertura da background su iOS) mostrava il login screen — ora riprova dopo 2s prima di cedere

## v4.070 — 2026-06-11
- Feature: campi partenza/arrivo in "Modifica impostazioni giro" ora usano la barra di ricerca con archivio indirizzi e selettore su Maps (come nella creazione giro)

## v4.069 — 2026-06-11
- Fix: pausa pranzo non visibile sulla mappa — aggiunto marker arancione (🍽) e waypoint nel tracciato per le pause pranzo con lat/lng

## v4.068 — 2026-06-11
- Fix: tab bar iniziava a scorrere con il contenuto su iOS — overflow-x:hidden su .shell interrompe position:fixed; cambiato in overflow-x:clip
- Fix: "Prima tappa fissa" ora presente su tutte le tappe, non solo la prima
- Fix: aggiunta tappa in giro esistente — pannello "Aggiungi tappa" rimane aperto dopo l'aggiunta e mostra il pulsante Ricalcola
- Fix: checkbox "Pranzo alle" rimossa dai singoli stop (era un'impostazione globale del giro, non della tappa); rimane solo in "Modifica impostazioni giro"
- Fix: selettore disponibilità/fissa nella finestra oraria abilitato appena l'utente inserisce un orario, senza richiedere il ricalcolo
- Fix/Feature: punto di arrivo si aggiorna in tempo reale quando si modifica il punto di partenza e il flag "= partenza" è attivo
- Feature: "Deviazione max" in Impostazioni → Soste automatiche ora si imposta in minuti (non km); applicata anche alla ricerca ristoranti per pausa pranzo
- Feature: tempo di viaggio verso il ristorante incluso nella durata totale della pausa pranzo

## v4.067 — 2026-06-11
- Fix: pausa pranzo con orario fisso (es. 12:30) veniva inserita all'orario di partenza della tappa precedente (es. 11:58) invece che all'orario impostato — il caso "gap tra tappe" non impostava lunchForFixed/fixedLunchAt
- Fix: ricerca tappe (campo "Cerca e aggiungi tappa") e ricerca tappe nel risultato usavano plain .filter().includes() senza ranking — ora usano rankAddressMatches come la ricerca archivio

## v4.066 — 2026-06-11
- Fix: tema Aziendali non sostituiva il turchese di default in molte parti dell'app — applyBrandColor ora override anche --bg, --tab-bg, --tab-border, --tab-text, --card-corner, --btn-primary-text, --btn-primary-shine; in modalità chiara il background diventa una tinta pallida del colore aziendale, in modalità scura una versione quasi nera

## v4.065 — 2026-06-11
- Fix: link condivisi davano 404 NOT_FOUND — aggiunta route /share/(.*) → index.html in vercel.json e fallback SPA nel server Node
- Fix: elemento fantasma in basso a destra — il toast vuoto restava visibile (aggiunti opacity:0 e pointer-events:none nello stato nascosto)
- Fix: id sempre 0/null da SQLite — ogni runSql apre un nuovo processo sqlite3, quindi last_insert_rowid() in chiamata separata valeva 0: corretti saveRoute (id 0 al client), createAddress (rispondeva null) e createUser; ora INSERT+SELECT in unica invocazione
- Fix: giri duplicati da doppio click/retry — guard state.planning nel client e dedup server su /api/plan (richieste identiche entro 10s riusano lo stesso risultato)

## v4.064 — 2026-06-11
- Nuovo: integrazione Meteo Trentino — per le tappe in Trentino il meteo usa il bollettino ufficiale della Provincia (località più vicina tra 22 principali); temperatura all'orario di arrivo interpolata tra min/max del giorno; warning automatici per temporali/pioggia/neve/vento; fallback automatico a Open-Meteo fuori Trentino o in caso di errore

## v4.063 — 2026-06-11
- Nuovo: palette Aziendali con DUE colori — primario (tab, titoli, bottoni principali) e secondario (sottotitolo header, pill di stato, bottoni ghost, etichette metriche, linee decorative); anteprima live e swatch bicolore
- Fix: brandColor non veniva persistito dal server (updateSettings lo scartava) — il colore aziendale si perdeva al ricaricamento; aggiunte colonne brand_color/brand_color2 con validazione hex

## v4.062 — 2026-06-11
- Fix: ricerca archivio — ranking per pertinenza: con 1-3 lettere i contatti il cui nome inizia con la query emergono in cima invece di restare sepolti tra i match casuali in note/indirizzi (ordine: prefisso nome, prefisso parola, nome, città, indirizzo, note)

## v4.061 — 2026-06-09
- Nuovo: palette "Aziendali" — color picker nel menu impostazioni per scegliere il colore primario; tutti i bottoni, accenti, tab e decorazioni cambiano in tempo reale; salvato come brandColor nelle impostazioni

## v4.060 — 2026-06-09
- Fix bug v4.059: pranzo dynamic-split posizionato all'orario sbagliato (es. 09:00 invece di 12:30) — aggiunto lunchForFixed+fixedLunchAt sull'entry del pranzo
- Fix: indirizzo di casa dalle impostazioni non compariva nel form percorso — render() chiamato dopo salvataggio impostazioni
- Fix: lunchFixedTime non inviato al server dalla creazione nuovo giro (mancava nel payload /api/plan)
- Nuovo: pulsante matita su partenza/arrivo nel form percorso per modificare l'indirizzo con testo libero

## v4.059 — 2026-06-09
- Pranzo alle: toggle attiva/disattiva in form percorso, pannello impostazioni giro e card per-tappa
- Planner: se lunchFixedTime è attivo e una tappa attraversa quell'orario, viene spezzata esattamente all'orario del pranzo (stopPart morning/afternoon dinamico)

## v4.058 — 2026-06-09
- Fix logica messaggi: data passata → nessun messaggio; data odierna + orario passato → vuoto; data odierna + orario futuro → ETA; data futura → richiesta disponibilità
- Fix campo lunchFixedTime nel pannello risultato: default "12:30" invece di vuoto per giri pre-v4.051
- Nuovo: campo "Pranzo alle" visibile nella card di ogni tappa (solo per contatti senza orari di apertura/chiusura salvati) — aggiorna l'orario fisso pranzo del giro e attiva il pulsante Ricalcola

## v4.057 — 2026-06-09
- Template messaggio data futura: "...per l'intervento di (specificare) il [data] alle ore [ora]. Grazie, attendo conferma." — placeholder modificabile prima dell'invio

## v4.056 — 2026-06-09
- Nuovo template messaggio data futura: "Buongiorno, la contatto per chiedere disponibilità per un intervento del [data] alle ore [ora]. L'orario attualmente previsto è le [ora]."

## v4.055 — 2026-06-09
- Fix messaggi WhatsApp/mail: rimosso nome cliente dal saluto — entrambi i template usano solo "Buongiorno," senza nome

## v4.054 — 2026-06-09
- Fix ETA WhatsApp/mail per giri odierni: rimosso calcolo ritardo basato su serviceEndTime (produceva delta errati fino a ore). L'orario pianificato è l'ETA; se è già nel passato il messaggio rimane vuoto

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

- Diagnostica crash Vercel: aggiunto handler `uncaughtException`/`unhandledRejection` che logga l'errore esatto nei Vercel Function Logs prima che la funzione muoia. Aggiunto `export default server` per compatibilità con versioni recenti di `@vercel/node` ESM. Aggiunto error handler su `server.on('error')` per non crashare su EADDRINUSE.
