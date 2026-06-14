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
