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

## Algoritmo attuale (passi) — v5.030 (GREEDY far-first con unione PARZIALE)
1. `buildLegTimeMatrix(home, stops)` → matrice tempi reali; `legMin(a,b)` usa la matrice (+buffer) o fallback.
2. `groupColocated` → tappe stesso paese (località) o entro ~6 min = gruppo atomico (MAI separate).
3. `assignZones(groups, home)` → SOLO per la Diagnostica (riga `ZONE`); NON vincola più la costruzione.
4. `buildDayClusters` = un unico GREEDY far-first con unione PARZIALE (sostituisce per-zona + `fillDays`):
   - Finché restano gruppi LONTANI (`maxHome(group) > NEAR_HOME_RADIUS` 35'):
     - **Seme** = gruppo col membro più LONTANO da casa (tra tutti i non assegnati).
     - **Accrescimento "sulla via"** = aggiunge il gruppo con la **minima deviazione-per-tappa**
       `(driveMin(giorno+g) − driveMin(giorno)) / nTappe(g)` che sia ≤ `MERGE_DETOUR_PER_STOP` (22') E
       FATTIBILE (motore reale: rientro ≤ maxReturnTime − `MERGE_RETURN_MARGIN` 15', nessuna tappa oltre
       chiusura). Riempie la giornata; le tappe in eccesso restano LIBERE per le giornate successive
       (unione PARZIALE — non tutto-o-niente). Così San Candido tira Bressanone/Ortisei/Bolzano finché
       piena, lasciando liberi Egna/Sen Jan/Merano; Tione tira Riva+Rovereto; Primiero tira Levico/Pergine;
       le valli opposte hanno deviazione-per-tappa alta → escluse.
   - **Orfani** (gruppi vicino casa rimasti + eventuali giornate-singolo dissolte): accorpati con
     `growDays` = far-first, riempi una giornata e sfora solo al bisogno, SENZA limite di direzione
     (vicino casa è tutto raggiungibile → «accorpare necessariamente»; una tappa davvero sola resta sola).
   - Ordine finale near→far. La costruzione è far-first; il calendario è dalla più vicina alla più lontana.
   - Fallback offline (`!dayFeasible`): `growDays` su tutto con `estimateDayMinutes`/`dayHoursFeasible`.
5. Per ogni giornata: ordine **far-first** bloccato (`orderDayFarFirst`) → `planRoute` (orari/soste/pranzo reali).
6. **Date solo feriali**: `addWorkdaysISO` salta sabato/domenica; `dayIndex` → data del giorno lavorativo.

### STORICO (approcci superati su questo punto)
- Per-zona + `fillDays` (unione a GIORNATE INTERE, ≤v5.029): lasciava le giornate lontane corte quando il
  cluster adiacente era grande (non poteva prenderne solo una parte). Sostituito dal greedy con unione PARZIALE.
- Riempimento tappa-per-tappa SENZA criterio (≤v5.026): separava le co-locate / mescolava le valli.
- Corridoio-ratio `1.4×2×estremo` (v5.026): scalava con la distanza (troppo lasco per i semi lontani,
  troppo stretto per le zone a "V"). Sostituito dalla deviazione-per-tappa (scale-free).
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
