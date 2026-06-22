# Pianificazione multi-giorno — Specifica e diario (LEGGERE SEMPRE prima di toccare il multi-giorno)

> **Nota per Claude:** questo file è la fonte di verità per la funzione "Pianifica su più giorni".
> Va **letto all'inizio** prima di modificare `server/multiDayPlanner.js`, e **aggiornato** dopo
> ogni modifica (cosa si è cambiato, perché, esito). Serve a non rivivere sempre gli stessi
> problemi. File coinvolti: `server/multiDayPlanner.js`, endpoint `POST /api/plan-multiday` in
> `server/index.js`, UI `renderResultMultiDay`/`planMultiDayAction`/`mdPointerDown` in `public/app.js`.

## A cosa serve
Dato un insieme di tappe troppo grande per una sola giornata, suddividerle in più giornate.
Scelte concordate con l'utente (NON cambiare senza chiederlo):
- **Base unica**: ogni giornata parte e rientra a casa (Altopiano della Vigolana). Niente pernotti.
- **Capienza giornata**: finestra `startTime → maxReturnTime` (impostazioni), pranzo e soste incluse.
- **Numero di giornate**: automatico.

## Il modello mentale dell'utente (come ragiona DAVVERO — questo è l'obiettivo)
1. **Per zona/valle.** Una giornata copre una zona geografica coerente (una valle e il suo corridoio).
   NON si mescolano valli in direzioni diverse. Es. SBAGLIATO: dopo Bressanone (Val d'Isarco) andare
   a Cavalese (Val di Fiemme); oppure Tione+Riva+Bolzano nello stesso giorno.
2. **Prima gli estremi.** Si fanno prima i punti **più lontani** di ogni zona. La giornata parte dalla
   tappa più lontana e rientra verso casa facendo quelle "sulla via". Le tappe vicine a casa restano
   per gli ultimi giorni.
3. **Diramazioni di corridoio SÌ.** Una piccola deviazione dal corridoio è ammessa (es. Ortisei in Val
   Gardena o Merano sono brevi rami dell'asse A22 → vanno nella giornata del Nord). NON è un'altra valle.
4. **Collegare due valli adiacenti** è ammesso quando un **passo** le unisce con strada breve
   (Fiemme+Fassa; Predazzo↔Primiero via passo Rolle; Giudicarie↔Garda; Valsugana↔Fiemme via Manghen).
   Col tempo di guida reale il passo è "corto", quindi rientrano nello stesso corridoio.
5. **Spezzare una zona troppo grande**: dalla più lontana alla più vicina possibile; la metà vicina si
   abbina eventualmente ad altri resti vicini.
6. **Giorni di chiusura**: contano **marginalmente**, soprattutto per scegliere **quale giorno** fare una
   zona (il giorno in cui i negozi sono tutti aperti). NON ancora implementato.
7. Dentro la giornata: parti presto, vai **prima al punto più lontano** (guidi a negozi chiusi, arrivi
   all'apertura), poi rientri. Niente tappe servite **dopo la chiusura** (tolleranza 10 min).

### In una frase
**Ogni giornata = una valle/corridoio, fatta dall'estremo verso casa; le valli si fanno dalla più
lontana alla più vicina; i resti vicini si accorpano alla fine.**

## VINCOLO CRITICO sul testing (causa di tanti errori passati)
- Il clustering usa i **tempi di guida reali su strada di Google** (`buildLegTimeMatrix` → `routeBetween`).
  In montagna la **linea d'aria (haversine) è fuorviante** (una valle laterale sembra "vicina").
- **In locale NON c'è la chiave Google** → i test offline usano il fallback haversine, che **non
  riproduce** il comportamento di produzione. Quindi:
  - **NON fidarsi dei test offline** per validare i raggruppamenti reali.
  - **NON cambiare l'algoritmo "a tentativi"**. Ogni cambio va validato sul **giro vero** tramite la
    **Diagnostica** (vedi sotto). Storia: più volte un cambio passava i test offline ma peggiorava in
    produzione (es. v5.012).

## La Diagnostica (riquadro copiabile in fondo al risultato multi-giorno)
`planMultiDay` produce `debug[]`. Mostra:
- `MATRICE tempi reali: X/Y (Z%)` — quante coppie hanno il tempo REALE Google (`source === "google"`).
  Se basso → fallback haversine → raggruppamenti imprecisi.
- Per ogni giornata: motivo di chiusura (prossima tappa: OLTRE BUDGET / orari NON ok), tappe FUORI
  CHIUSURA, e timing della 1ª tappa (orari risolti + se è scattato il calcolo a ritroso).
- **Chiedere SEMPRE all'utente di incollare questo log** prima di toccare i raggruppamenti.

## Algoritmo attuale (passi) — v5.022 (per ZONE)
1. `buildLegTimeMatrix(home, stops)` → matrice tempi reali; `legMin(a,b)` usa la matrice (+buffer) o fallback.
2. `groupColocated` → tappe stesso paese (località) o entro ~6 min = gruppo atomico (mai divise).
3. `assignZones(groups, home)` → partiziona in ZONE (valli). Prima gli ESTREMI: ordina i gruppi per
   distanza da casa; un gruppo apre una nuova zona se è più vicino a CASA che a qualunque seme/estremo
   già scelto (direzione propria), altrimenti entra nella zona del seme più vicino su strada. Le tappe
   entro `NEAR_HOME_RADIUS` (35') sono accorpate in UN'unica zona vicino-casa (altrimenti ognuna farebbe
   giornata a sé). Modello dell'utente: «prima gli estremi delle varie zone, poi ogni tappa va nella sua».
4. `buildDayClusters` costruisce le giornate DENTRO ogni zona (niente mescolanze tra valli),
   processando le zone dalla più VICINA a casa alla più lontana (`orderedZones` per seedHome crescente —
   richiesta dell'utente: «parti dall'estremo più vicino a casa e allontanati»):
   - **Seme** = gruppo più LONTANO da casa NELLA ZONA.
   - **Accrescimento** = il gruppo più VICINO al giorno **purché la giornata resti FATTIBILE secondo il
     MOTORE REALE** (`dayFeasible(orderedStops, dayIndex)` → `evaluateDayTiming`).
   - **Fattibile** = rientro entro maxReturnTime (pause incluse) E nessuna tappa servita oltre la chiusura.
   - Una zona troppo grande → più giornate (estremo→casa). Quando il giorno non cresce più → chiude.
   - **Resti accorpati**: le giornate da UNA sola tappa ("rimaste indietro") vengono unite in un gruppo
     e ri-clusterizzate insieme alla fine (se ≥2; una tappa davvero isolata resta sola).
5. **FASE DI RIEMPIMENTO** (`fillDays`): le giornate per-zona finiscono presto (una valle = poche tappe).
   Si UNISCONO le GIORNATE INTERE adiacenti (mai singole tappe: così le tappe dello stesso paese non si
   separano e le tappe vicino casa non vengono appese a giorni di direzione sbagliata), procedendo dalla
   giornata più LONTANA e unendo la più vicina compatibile, purché l'unione resti FATTIBILE (motore reale,
   con margine `MERGE_RETURN_MARGIN` 15' sul rientro) E un CORRIDOIO: guida totale ≤ `CORRIDOR_FACTOR`
   (1.4) × 2 × distanza dell'estremo. Niente limite di gap fisso (corridoio + fattibilità sono i veri
   vincoli; così Primiero+Valsugana, gap 84' ma corridoio pulito, si unisce). Regola utente: «fare prima
   il seme più lontano e poi unire il più vicino, se necessario spezzare». Esempi: Tione/Riva+Rovereto sì,
   Primiero+Valsugana sì, Tione/Riva+Pergine no, Merano+Valsugana no. **`CORRIDOR_FACTOR`/`MERGE_RETURN_MARGIN` tarabili.**
   - STORICO: il riempimento tappa-per-tappa (≤v5.026) separava le co-locate (due Rovereto), appendeva le
     tappe vicino casa a giorni sbagliati (Trento→Merano = FUORI CHIUSURA) e col gap 60' lasciava Primiero solo.
6. Ordine finale delle giornate: dalla più vicina a casa alla più lontana.
7. Per ogni giornata: ordine **far-first** bloccato (`orderDayFarFirst`) → `planRoute` (orari/soste/pranzo reali).
8. **Date solo feriali**: `addWorkdaysISO` salta sabato/domenica (banche chiuse). `dayIndex` → data del
   giorno lavorativo, usata anche per risolvere gli orari di apertura nella fattibilità.

### Tarature (sulla Diagnostica, coi tempi reali)
- `NEAR_HOME_RADIUS` (35') — raggio "vicino casa" accorpato in un'unica zona/giornata.
- La QUALITÀ delle zone lontane dipende dai tempi reali di Google: **offline (linea d'aria) le mescola**
  (la "ZONA 2" Merano/Ortisei/Fassa/Cles è un artefatto haversine). Validare SEMPRE sul giro reale.

### L'oracolo di fattibilità = motore della giornata singola (il cuore, v5.017)
`evaluateDayTiming(payload, settings)` in `planner.js` riusa la STESSA pipeline del planner reale
(`normalizeStop` → `buildLegMatrix` con cache → `evaluateOrder`/`scheduleStop`): orari di apertura/
chiusura, tolleranza 10 min, **spezzare interventi**, finestra fissa, ecc. **Salta `insertBreaks`**
(niente lookup Places per ristoranti/soste) e conta **pranzo + soste come allowance di tempo** —
coerente col motore reale, dove le pause spostano in avanti la fine mentre le chiusure sono già
valutate da `scheduleStop` sul programma pre-pausa. Restituisce `dayEndWithBreaks` e le `lateStops`
(tappe oltre la chiusura). È economica (grazie alla **cache tragitti** v5.016 in `routeBetween`),
quindi usabile come gate ad ogni passo di accrescimento. **Così il giorno multi-giorno si comporta
ESATTAMENTE come la giornata singola** (richiesta esplicita dell'utente: «deve seguire il motore di
creazione della giornata singola, con tappe, pranzo ecc tutto uguale»).

### Criterio "sul corridoio" (il cuore — evita di mescolare valli)
Una tappa B entra nella giornata del seme F solo se è **sulla via da F a casa**:
`detour(B) = tempo(F→B) + tempo(B→casa) − tempo(F→casa)`.
- detour ≈ 0 → B è sul corridoio (entra).
- detour piccolo → B è una diramazione breve del corridoio (Ortisei, Merano) → entra.
- detour grande → B è in un'altra valle (Cavalese da Bressanone) → NON entra.
Soglia: `DETOUR_MAX = ON_CORRIDOR_FRACTION × tempo(F→casa)` (scala con la distanza). **Parametro da
tarare sul giro vero tramite Diagnostica.**

**IMPLEMENTATO in v5.014** (`buildDayClusters`): F = estremo del giorno (tappa più lontana da casa),
ricalcolato a ogni passo di accrescimento. Si aggiunge il gruppo col **detour minore** tra quelli
entro `DETOUR_MAX` (default `ON_CORRIDOR_FRACTION = 0.4`), entro budget e con orari ok (`dayHoursFeasible`).
La Diagnostica, a ogni giornata chiusa, logga il detour di ogni candidato scartato con il motivo
(`FUORI CORRIDOIO` / `OLTRE BUDGET` / `ORARI NON ok`) → serve a tarare la frazione sul giro reale.
Lo **swap pass-through/terminale è stato RIMOSSO** (era la causa principale del mescolamento).

## Cosa è stato provato e NON va (non ripetere)
- **`improveClusters` (ricerca locale km globale)** [v5.000–5.003]: rimescolava le giornate, rompeva il far-first. RIMOSSA.
- **Accrescimento "minimo costo verso casa"** [v5.004]: infilava le tappe vicino casa nel giro lontano (zigzag).
- **Accrescimento "tappa più vicina al gruppo"** [v5.006–5.011]: mescola valli, perché due valli a distanza
  simile da casa sono "vicine" passando da casa.
- **Swap pass-through/terminale** [v5.011]: CAUSA PRINCIPALE del mescolamento — tira dentro tappe "lontane da
  casa" senza guardare la direzione (Giorno 1 finiva con Cavalese; Tione+Riva+Bolzano insieme). RIMOSSO.
- **Insertion-cost + soglia 1.2×distHome** [v5.012]: nei test offline non mescolava, ma l'utente l'ha trovato
  peggiore in produzione (probabile soglia mal tarata sui tempi reali). REVERT in v5.013.
- **Vincolo direzionale `NEAR_HOME_FACTOR` (entra se distGruppo ≤ 1.3×distCasa)** [v5.020]: sul giro reale
  FRAMMENTAVA in 8 giornate. Le tappe vicino casa restavano senza giorno valido quando il partner naturale
  era già preso (Mezzolombardo nel Nord → Cles orfana) o cadevano in giorni di chiusura; le 8 giornate
  sconfinavano nel WEEKEND (banche chiuse) → giornate da 1 tappa servita FUORI CHIUSURA. REVERT in v5.021.
  Lezione: i due problemi VERI sono la scelta del giorno della settimana (chiusure) e il partner-eating,
  non un'altra soglia direzionale.
- **Accrescimento "sul corridoio" / detour** [v5.014]: B entra solo se `detour(B) ≤ 0.4×tempo(F→casa)`.
  Sul giro reale FRAMMENTA: con seme = tappa più lontana, ogni valle lontana di direzione diversa
  (Bressanone N, Cles NO, Primiero E) diventa un seme isolato in una giornata dedicata (9 giornate).
  È il fallimento OPPOSTO allo swap (corridoio troppo restrittivo / swap troppo permissivo). REVERT in v5.015.
  Lezione: il solo criterio geometrico seme→casa non basta; manca la nozione di **valli adiacenti
  collegate da un passo** (CSV H/G/F dell'utente) per accorpare estremi vicini che NON sono sullo stesso
  raggio da casa. Da introdurre PRIMA di ritentare un criterio direzionale, e solo con dati reali.

## Salva e ricalcola un giro (v5.028)
- Si salva solo l'INPUT (tappe + `baseReq`), non il risultato: tabella `multiday_plans` (`db.js`),
  endpoint `GET/POST /api/multiday-plans` + `DELETE /api/multiday-plans/:id` (`index.js`).
- UI (`app.js`): "Salva giro" in `renderResultMultiDay` (salva `state.mdStops`); elenco "Giri salvati
  (più giorni)" nel form (`renderMultiDayPlansList`) con **Ricalcola** (`recalcSavedMultiDay`: POST
  `/api/plan-multiday` con data odierna → vista giornate) ed elimina. `refreshMultiDayPlans` al boot.
- `state.mdStops` = tappe originali del giro corrente (settate in `planMultiDayAction` e `recalcSavedMultiDay`).

## Correzioni alla verifica oraria (queste sono buone, tenerle)
- `dayHoursFeasible` simula l'ordine far-first reale; la **1ª tappa inizia all'apertura** (riproduce il
  calcolo a ritroso) invece che a startMin+guida (prima era pessimista di ore).
- Se l'arrivo è a ridosso della chiusura mattutina, si prova la **finestra pomeridiana** (come il planner reale).
- Conteggia il tempo delle **soste** sui tragitti lunghi.
- `resolveStopWindows` gestisce weeklyHours per giorno, orario continuato, finestra utente, ignoreHours, closedToday.

## Da fare (in ordine, solo con dati reali)
- [ ] Tarare `ON_CORRIDOR_FRACTION` (ora 0.4) sul giro vero (Diagnostica): Ortisei/Merano dentro, Cavalese fuori.
      Se mescola ancora → abbassare; se spezza valli che dovrebbero stare insieme → alzare.
- [ ] Scelta del **giorno della settimana** per zona (negozi tutti aperti) — marginale.
- [ ] "Crea i giri" + cartella unica con nome (salvataggio del piano).
