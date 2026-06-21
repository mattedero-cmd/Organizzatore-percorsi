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

## Algoritmo attuale (passi)
1. `buildLegTimeMatrix(home, stops)` → matrice tempi reali; `legMin(a,b)` usa la matrice (+buffer) o fallback.
2. `groupColocated` → tappe stesso paese (località) o entro ~6 min = gruppo atomico (mai divise).
3. `buildDayClusters` (una giornata alla volta):
   - **Seme** = gruppo col membro più LONTANO da casa.
   - **Accrescimento** = aggiunge i gruppi che sono **"sul corridoio" seme→casa** (vedi criterio sotto),
     rispettando budget e orari (`dayHoursFeasible` simula l'ordine far-first reale, 1ª tappa all'apertura).
   - Quando non c'è più nulla "sul corridoio" o non si rientra negli orari → chiude la giornata.
4. Per ogni giornata: ordine **far-first** bloccato (`orderDayFarFirst`) → `planRoute` (orari/soste/pranzo reali).
5. Date consecutive da `scheduledDate`.

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
