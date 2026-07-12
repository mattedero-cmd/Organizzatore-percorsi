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

## Algoritmo attuale (passi) — v5.103 (PER-ZONA + unione PARZIALE + DISSOLUZIONE)
> ATTENZIONE: il GREEDY GLOBALE (v5.030–v5.044) è stato ANNULLATO — sul giro reale faceva SNAKE e
> FRAMMENTAVA (vedi sotto "Cosa è stato provato e NON va"). Si costruisce SEMPRE per-zona.
1. `buildLegTimeMatrix(home, stops)` → matrice tempi reali; `legMin(a,b)` usa la matrice (+buffer) o fallback.
2. `groupColocated` → tappe stesso paese (località) o entro ~6 min = gruppo atomico (MAI separate).
3. `assignZones(groups, home)` → partiziona in ZONE (valli). CONFERMATE CORRETTE sui tempi reali.
4. `buildDayClusters` costruisce le giornate DENTRO ogni zona (`growDays` per-zona): seme = più lontano
   nella zona, accresce il più vicino fattibile (motore reale). Niente mescolanze tra valli.
5. **UNIONE PARZIALE sul corridoio** (`fillPartial`, NUOVA, TRA grow per-zona e `fillDays`): una giornata
   lontana POVERA (slack > `SLACK_MIN` 75' rispetto al rientro max) assorbe singoli GRUPPI atomici "sulla
   via" da zone adiacenti, lasciando il resto LIBERO. Candidato g ammesso se DIRECTNESS
   `legMin(seme,g)/(legMin(seme,casa)+legMin(g,casa))` ≤ `TAU_PARTIAL` (0.45) E detour-dal-corridoio ≤
   `CORRIDOR_DETOUR` (25'); si assorbe per **savings** (Clarke-Wright) decrescente; **GATE ANTI-FURTO**:
   g si sposta solo se la giornata donatrice resta non-vuota e FATTIBILE. La directness è **ancorata al
   SEME FISSO** (estremo lontano), MAI alla frontiera — l'unico ancoraggio che l'hub vicino casa non
   inganna: Ortisei→Pergine 0.85 ESCLUSO (niente snake), San Candido→Trento 0.79 ESCLUSO (niente salto),
   Tione→Riva 0.39 / Cavalese→SenJan 0.19 INCLUSI. È il savings di Clarke-Wright adimensionale. ADDITIVO:
   se nessuna giornata è povera → no-op (= comportamento v5.029). Sposta gruppi interi → co-locate mai
   separate. (Esito di un design-panel multi-agente; vedi CHANGELOG v5.070.)
6. **FASE DI RIEMPIMENTO** (`fillDays`): unisce le GIORNATE INTERE adiacenti compatibili residue
   (deviazione-per-tappa ≤ `MERGE_DETOUR_PER_STOP` 22' + fattibilità). Tione/Riva+Rovereto, Primiero+Valsugana.
7. **DISSOLUZIONE** (`dissolveDays`, v5.103): le MEZZE GIORNATE sopravvissute (es. Cles+Mezzolombardo
   chiusa alle 10:52 con 458' di margine — Diagnostica 2026-07-11) vengono SVUOTATE distribuendo TUTTI
   i loro gruppi atomici nelle altre giornate. Commit-or-rollback: si accetta solo se OGNI gruppo trova
   posto (oracolo reale + margine `MERGE_RETURN_MARGIN` sul rientro, Δguida per gruppo ≤
   `DISSOLVE_GROUP_DETOUR` 60', directness verso il seme ricevente ≤ `TAU_DISSOLVE` 0.65 anti-mescolanza)
   E la guida totale aggiunta ai riceventi è inferiore alla guida della giornata eliminata di almeno
   `DISSOLVE_MIN_GAIN` 30' (guadagno km REALE, non soglia geometrica). Motivazione: `fillPartial` per
   progetto non svuota mai un donatore (gate anti-furto) e `fillDays` respinge questi merge col gate
   per-tappa — serviva una fase dedicata con criterio economico. Richiesta esplicita dell'utente
   («vengono ancora 5,5 giornate, possono diventare 4,5 con 200km in meno»).
8. Orfani vicino casa accorpati; ordine finale near→far.
9. Per ogni giornata: ordine **far-first** bloccato (`orderDayFarFirst`) → `planRoute` (orari/soste/pranzo reali).
10. **Date solo feriali**: `addWorkdaysISO` salta sabato/domenica; `dayIndex` → data del giorno lavorativo.

### Tarature `fillPartial`: `TAU_PARTIAL` 0.45, `SLACK_MIN` 75', `CORRIDOR_DETOUR` 25' (pavimento).
- **v5.103/v5.104 — detour scalare**: il detour ammesso dal corridoio SCALA con la lunghezza:
  `detourMax = max(25', 0.35 × tempo(seme→casa))`. TARATO sulla Diagnostica reale 2026-07-12:
  Ortisei→Nord ha det 53' (dentro con 0.35×169=59'; con 0.20 restava fuori), mentre restano esclusi
  Cavalese→Merano 70'>31', Bressanone→Fassa 89'>38', Riva→Rovereto 69'>25'. Per corridoi corti
  vale il pavimento 25' (comportamento storico). La Diagnostica logga i candidati RESPINTI con
  `det`/`detMax`.
- **v5.103 — anti-ping-pong**: un gruppo assorbito da una giornata povera è BLOCCATO per il resto della
  fase (Diagnostica 2026-07-11: Egna faceva Merano→Fassa→Merano, spreco puro).

### Tarature `dissolveDays` (v5.104): `TAU_DISSOLVE` 0.75, `DISSOLVE_GROUP_DETOUR` 60', `DISSOLVE_MIN_GAIN` 30'.
- **v5.104**: `TAU_DISSOLVE` 0.65→0.75 — la directness ancorata al seme lontano penalizza
  intrinsecamente i gruppi vicino casa (una tappa SUL corridoio a detour zero vale
  t_seme/(t_seme+t_g), alta se g è vicina): Cles→giornata Sen Jan dir 0.69 è il caso BUONO chiesto
  dall'utente; le direzioni davvero sbagliate (via casa) stanno ≥~0.9. Le vere guardie anti-mescolanza
  sono la REGOLA DI ZONA + economia + oracolo, non questa soglia.
- **v5.104 — doppio ordine di piazzamento**: si tenta far-first e, se fallisce o non conviene,
  near-first: piazzando prima il gruppo vicino (Mezzolombardo) il corridoio del ricevente si estende
  verso casa e il gruppo dopo (Cles) diventa una diramazione economica (Δ49' invece di Δ62'>60).
Guardie aggiunte dopo review avversaria multi-agente:
- **Marginalità**: candidate SOLO le vere mezze giornate (slack > `SLACK_MIN` e ≤ 3 gruppi) — non si
  smontano giornate sane e il costo oracolo resta contenuto.
- **REGOLA DI ZONA** (il vero anti-mescolanza, `TAU_DISSOLVE` da solo NON basta — ammetterebbe
  Cavalese→giornata del Nord con dir ~0.62): un gruppo può andare solo in una giornata che contiene
  già gruppi della SUA zona (i partner naturali), OPPURE ovunque se la sua INTERA zona sta nella
  giornata che si dissolve (zona-resto intera che si aggancia al corridoio: Cles+Mezzolombardo→Merano).
- Commit-or-rollback: se anche UN gruppo non trova posto, la giornata resta intatta (protegge le
  giornate lontane: Fassa/Nord tentate e rifiutate correttamente nei test).
- NB data: come fillPartial/fillDays, l'oracolo valida con l'indice-giornata provvisorio (l'ordine
  near→far arriva dopo) — approssimazione pre-esistente comune a tutte le fasi; il planRoute finale
  usa la data vera e segnala FUORI CHIUSURA in Diagnostica.
Validate su simulazione offline con la MATRICE REALE del log 2026-07-11 (coppie esatte del log +
completamento shortest-path, script `md_real.mjs`): il vecchio motore riproduce ESATTAMENTE le 6
giornate reali; il nuovo dissolve Cles+Mezzolombardo nella giornata Merano/Bolzano/Egna → 5 giornate,
guida totale −45/75'. Sul giro generico offline (haversine): output IDENTICO al vecchio (nessuna
regressione). **Confermare sulla prossima Diagnostica reale.**

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
**v5.105 — pranzo nell'attesa**: l'allowance del pranzo NON si aggiunge se il programma valutato
contiene un'attesa ≥ pranzo che interseca la finestra pranzo (arrivo prima dell'apertura
pomeridiana): il motore reale ci mangia dentro senza spostare la fine. Senza questo l'oracolo
sovrastimava di ~1h e respingeva giornate valide (Diagnostica 2026-07-12: "rientro 18:50" vs
reale 17:20 su Nord+Ortisei → Ortisei restava fuori e si sprecavano ~85km).

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

## Riorganizzazione manuale e "Crea i giri" (v5.106)
- **Drag tappe tra giornate**: parte da TUTTA la riga (`mdPointerDown`): mouse subito; touch con
  pressione prolungata 350ms (slop 10px → se il dito si muove prima vince lo scroll; `touchmove`
  non-passivo con preventDefault solo a drag armato). `user-select:none` sulle righe (la selezione
  del testo vinceva sul drag), maniglia con hit-area ~44px per il drag touch immediato.
- **"Crea i giri"** (`mdCreateRoutes`, pulsante nella vista risultato quando le giornate sono
  calcolate): per ogni giornata POST `/api/routes` col piano reale (nome "Giorno N — data",
  scheduledDate della giornata) + `PUT /api/routes/:id/folder` verso una cartella creata al volo
  (`POST /api/folders`, nome scelto dall'utente, default "Più giorni <data>"). Alla fine si apre
  la cartella nei salvati. I giri creati sono giri VERI (navigabili/modificabili/ricalcolabili).

## Da fare (in ordine, solo con dati reali)
- [x] ~~Tarare la frazione corridoio~~ → fatta in v5.104 (0.35 sulla Diagnostica reale).
- [ ] Scelta del **giorno della settimana** per zona (negozi tutti aperti) — marginale.
- [x] ~~"Crea i giri" + cartella unica con nome~~ → fatta in v5.106.
