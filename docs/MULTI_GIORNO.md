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

## v5.118 — le tre correzioni dalla Diagnostica reale 2026-09-06 (5 giornate → 3)

> Giro di 17 tappe, casa Altopiano della Vigolana. L'utente: «può essere diviso in 3 giornate e
> 100 km in meno». Il motore ne produceva **5 e 997 km**, di cui tre quasi vuote (chiuse alle 08:59,
> 07:18 e 10:38, con 571/672/472 minuti di margine). Dopo le correzioni: **3 giornate e 940 km**.

### Prima di tutto: l'HARNESS DI REPLAY (usarlo SEMPRE per il multi-giorno)
Il vincolo storico «offline non c'è la chiave Google, quindi i test non riproducono la produzione»
è stato **superato**: si imposta `process.env.GOOGLE_MAPS_API_KEY` a un valore finto PRIMA
dell'import e si sostituisce `globalThis.fetch` con uno stub che intercetta
`maps.googleapis.com/maps/api/directions/json` e risponde con una matrice ricostruita. Così
`routeBetween` ritorna `source:"google"` e gira la pipeline VERA (buildLegTimeMatrix → assignZones →
growDays → fillPartial → fillDays → dissolveDays → planRoute/insertBreaks), con MATRICE 153/153 100%.
La matrice si costruisce da un grafo stradale sparso + Floyd-Warshall (disuguaglianza triangolare
garantita), ancorando ESATTAMENTE i valori del log (`valore_log = round(raw × 7/6)`: le righe
GEOMETRIA e VICINI stampano `legMin`, cioè minuti già bufferati).
**Col codice pre-fix l'harness riproduceva la Diagnostica reale: 20/20 fatti, 43/44 righe
byte-identiche, km per giornata a scarto 0,0% e fine giornata a scarto 0 minuti.** Solo con una
riproduzione fedele in mano si tocca il clustering. Ricostruirlo è la prima cosa da fare alla
prossima Diagnostica.

### ⚠️ v5.120 — la Causa 1 è stata FALSIFICATA nella giustificazione (leggere prima di toccarla)
Una revisione avversaria (5 agenti, worktree isolati, ~400 esecuzioni) ha eseguito tre confutazioni:
1. **«Sovra-accorpare vicino casa è sicuro per costruzione, growDays rispezza da solo» è FALSO.**
   `growDays` spezza per **fattibilità oraria**, mai per direzione né per economia — il criterio di
   corridoio di v5.014 è stato revertito e non è mai tornato. La partizione in ZONE è l'**unica**
   guardia anti-mescolanza a quello stadio: indebolirla si paga in giornate che mescolano valli
   opposte, e nessuna fase a valle sa smontare una giornata vicino-casa già compatta (fillDays unisce
   giornate INTERE, fillPartial sposta solo verso giornate POVERE, dissolveDays guarda solo le
   marginali). Misurato: su geometrie "a stella" (valli che si toccano solo passando da casa — il
   modello dell'utente) v5.118 regrediva in **21 casi su 180**, fino a +81 km e a una giornata in più.
2. **`NEAR_HOME_DIAMETER = 70` era VACUA.** Per disuguaglianza triangolare un gruppo entra nella zona
   di un seme solo se `d(g,seme) ≤ d(g,casa)`, e i semi sono i più lontani: quindi
   `seedHome ≤ d(seme,g) + d(g,casa) ≤ 2·d(g,casa) ≤ 2·nearHomeT`. Con `nearHomeT ≤ 35` si ha sempre
   `seedHome ≤ 70`. Verificato su **4000 matrici metriche casuali: 0 attivazioni**, rapporto massimo
   1,989 contro il limite teorico 2. **Non reintrodurre una guardia di questa forma**: qualunque
   soglia ≥ 2×NEAR_HOME_RADIUS è per costruzione inerte. Una guardia vera dovrebbe misurare il
   diametro dell'**unione** (max fra coppie di membri), non un raggio da casa.
3. **Il gate di economia di `fillPartial` non era il motore del risultato**: la sola Causa 1 dà già
   3 giornate/940 km sul giro reale. Peggio, Causa 1 + Causa 2 **senza** Causa 3 fa 4 giornate/974 km
   — un accoppiamento fra le tre correzioni che il commit non dichiarava.

**Come è stato risolto (v5.120): non si sceglie, si confrontano.** `buildDayClusters` costruisce
**quattro piani** — accorpamento vicino-casa `"seed"` (storico) o `"nearest"` (v5.118) × gate di
economia acceso/spento — e tiene quello con **meno giornate**; a parità, meno guida; a parità di tutto
vince il comportamento storico (primo nella lista). Poiché una delle varianti *è* l'algoritmo di prima,
**il risultato non può mai essere peggiore di prima** per numero di giornate. La Diagnostica stampa una
riga `VARIANTE …: N giornate, guida M'` per ciascuna, con `<<< SCELTA` sulla vincente: è lì che si
verifica la decisione sul giro vero. Costo: nessuna chiamata Google in più (la matrice è già in cache),
0,14 s sul giro reale. Misura su 180 geometrie a stella: **−21 giornate a +150 km totali su 60.750
(+0,25%), e ZERO casi con più giornate di prima** (erano 21).

> Se un giorno servisse una terza modalità di zonizzazione, aggiungerla alla lista `variants` è
> sufficiente: il confronto la rende automaticamente non-regressiva.

### ⚠️ Effetto collaterale AMPLIFICATO da tenere d'occhio: lo slittamento dei giorni della settimana
L'oracolo valida ogni giornata con l'indice PROVVISORIO (`addWorkdaysISO(baseDate, dayIndex)`), ma le
date definitive si assegnano dopo il `days.sort` finale. **Eliminare una giornata sposta di un giorno
feriale tutte le successive**: una giornata composta in modo identico può passare da martedì a lunedì e
trovare il cliente chiuso. È una lacuna PRE-ESISTENTE (il commento «NB sulla data» la dichiara), ma
v5.118/v5.120 la fanno mordere di più perché tolgono giornate più spesso. Misurato su 20 scenari con
`weeklyHours` casuali: 4 con più tappe servite fuori chiusura.
**Mitigazione applicata (v5.120)**: le `lateStops` di ogni giornata, che il server calcolava già ma che
**nessuna vista mostrava**, ora compaiono nel piano su più giorni con il badge "chiuso".
**Non risolto**: la soluzione vera sarebbe ri-validare dopo il sort finale con la DATA VERA e permutare
l'assegnazione giornata→data minimizzando le chiusure (con 3-6 giornate lo spazio è banale). NON è stata
fatta perché l'ordine near→far delle giornate è una **richiesta esplicita dell'utente** e permutare le
date lo violerebbe: è una scelta da concordare con lui, non da prendere in autonomia.

### Causa 1 (DECISIVA) — `assignZones`: il merge vicino-casa testava il membro SBAGLIATO
`seedHome` è il tempo-casa del **seme**, che per costruzione è il gruppo **più LONTANO** della zona
(`sorted` è decrescente). Usarlo per il test `<= NEAR_HOME_RADIUS` significava: una zona è "vicino
casa" solo se il suo membro più lontano sta entro il raggio. Sul giro reale, la zona seminata da
San Michele a/A (37', **due minuti** oltre il raggio) trascinava fuori dal vicinato Trento 26' e
Trento 27'; quella seminata da Ala (54') trascinava fuori Rovereto 33' e Rovereto 40'. Nove tappe
tutte entro un'ora da casa finivano in TRE zone.
E **il numero di zone è un PAVIMENTO sul numero di giornate**, perché `growDays` gira una zona alla
volta: 6 zone → 6 giornate, decise senza mai chiedere all'oracolo se le 9 tappe stessero insieme
(ci stanno, con 418 minuti di margine).
**Fix (v5.118, poi corretto in v5.120)**: si testa il membro più VICINO
(`nearHomeT(z) <= NEAR_HOME_RADIUS`) invece del seme. La guardia di diametro aggiunta insieme si è
rivelata VACUA ed è stata rimossa, e l'affermazione «sovra-accorpare è sicuro per costruzione» è stata
FALSIFICATA: vedi la sezione v5.120 qui sopra. Oggi la modalità non è cablata — si confrontano quella
storica e quella nuova e vince il piano migliore.
> NB unità: `NEAR_HOME_RADIUS` è confrontato con `legMin`, cioè minuti **bufferati** (×7/6). Il
> raggio effettivo è ~30 minuti Google reali. Qualunque nuova soglia in minuti va scritta con l'unità.

### Causa 2 — `fillPartial`: il gate anti-furto non guardava il PREZZO
Verificava solo che il donatore restasse non-vuoto e fattibile, mai quanto gli costasse la cessione.
Sul giro reale la giornata di Canazei si è presa ENIMOOV+Bolzano (det 22') ed Eni Station (det 35')
da quella di Silandro, mentre il donatore risparmiava **5' e 9'** — Bolzano è letteralmente sulla via
di casa da Eni Station (1'). Silandro è rimasta SOLA con 242' di guida per una tappa ed è finita
accoppiata a Malé in una giornata da 357 km: la fase nata per riempire le giornate povere ne creava
una più povera.
**Fix**: **GATE DI ECONOMIA GLOBALE** — la mossa è respinta se costa al ricevente più di quanto fa
risparmiare al donatore, oltre `PARTIAL_GLOBAL_TOLERANCE` (10'). La tolleranza esiste perché riempire
una giornata povera ha valore anche a costo leggermente negativo (abilita le fasi successive).
La Diagnostica ora logga il conto: `✗ "X": antieconomico (costa N' al ricevente, ne fa risparmiare M' al donatore)`.

### Causa 3 — `dissolveDays`: il tetto piatto scavalcava il criterio economico
`DISSOLVE_GROUP_DETOUR = 60'` è assoluto, mentre `gain = dDrive - totalDelta >= DISSOLVE_MIN_GAIN`
scala con la giornata. Il tetto morde per primo quando `dDrive > 60·k + 30`. Sul giro reale la
giornata di Malé costa 203' di guida ed è **un solo gruppo**: l'economia avrebbe concesso fino a
173' di Δ, il tetto ne concedeva 60 → serviva un guadagno di 143' invece dei 30 voluti, **4,8 volte
più severo**. Da qui `"Malé" senza giornata ricevente`.
**Fix**: budget **residuo** invece di tetto piatto —
`Math.max(DISSOLVE_GROUP_DETOUR, dDrive - DISSOLVE_MIN_GAIN - totalDelta)`. `DISSOLVE_GROUP_DETOUR`
resta come **pavimento** (una giornata poco costosa concede comunque i 60' storici). Il criterio
economico aggregato resta l'unico giudice: il cambio non può accettare nulla che l'economia non
accetterebbe già. Esito: `giornata "Malé" (guida 203') svuotata: "Malé"→[Silandro] (Δ137') · guida risparmiata ~66'`.

### Causa 4 (NON corretta, ma DIMOSTRATA — leggere prima di ritoccare TAU_PARTIAL/TAU_DISSOLVE)
La directness `dir(seme,g) = t(seme,g) / (t(seme,casa) + t(g,casa))` è **strutturalmente cieca vicino
casa**. Per un gruppo perfettamente sul corridoio (detour 0) vale `t(seme,g) = t(seme,casa) − t(g,casa)`,
quindi il **minimo possibile** è `(S−g)/(S+g)`. Imporre `dir <= TAU` equivale a imporre
**`g >= S·(1−TAU)/(1+TAU)`**: con TAU_PARTIAL 0.45 e seme a 127' (Canazei), **nessun gruppo a meno
di 48' da casa può mai passare, nemmeno a detour ZERO**. Sul giro reale erano 8 tappe su 17
(Ravina 21', Civezzano 25', Trento 26'/27', Borgo 32', Rovereto 33'/40', San Michele 37'), escluse
in silenzio: non compaiono nemmeno fra i "respinti", perché il log dei respinti riguarda solo il
detour dal corridoio. È l'esatto contrario del modello dell'utente («si rientra facendo quelle sulla
via»). La formula è verificata sui numeri del log: ENIMOOV dir 0.41 → det 22' ✓, Eni Station
0.43 → 35' ✓, Ravina 0.38 → 6' ✓.
Con TAU_DISSOLVE 0.75 la soglia è `g >= 0.143·S`, meno brutale ma nella stessa direzione; il bump
0.65→0.75 di v5.104 era un cerotto su questo difetto strutturale.
**Non è stata toccata in v5.118** perché il test giusto (detour dal corridoio, che scala) è già lì
accanto e le tre correzioni sopra bastavano a raggiungere le 3 giornate. Se in futuro serve:
sospendere la directness per i gruppi vicino casa e affidarsi a REGOLA DI ZONA + economia + oracolo,
come la documentazione stessa dichiara. **Da validare solo su Diagnostica reale.**

### Un difetto separato, NON corretto: partenza prima dell'orario impostato
`server/planner.js` (blocco `first_open_minus`) calcola `currentTime = targetArrival − primaTratta`
**senza pavimento a `startMinutes`**. Con Ala aperta 05:30 la giornata partiva alle **04:26**, pur
avendo `startTime` 07:00. Non è solo cosmetico: gonfia lo slack che decide "giornata povera" e
"giornata marginale". Il fix sarebbe `Math.max(startMinutes ?? currentTime, ...)`, ma tocca il motore
della **giornata singola** (tutti i giri esistenti), quindi va deciso con l'utente.

### Cosa NON ha funzionato in v5.118 (provato e rimosso)
- **Scelta dell'estremo di partenza fra i k più lontani** (`orderDayFarFirst`): sembrava valere 78'
  (~68 km) sulla giornata Fassa/Isarco, sulla stima che Canazei→Cavalese→Vipiteno (434') fosse molto
  peggio dell'inverso (356'). **Sull'harness i due giri costano entrambi 393'**: la stima era una
  congettura geografica (Canazei→Vipiteno diretto via Sella/Gardena) non supportata dai dati del log.
  Rimosso: non si tiene un cambiamento che non guadagna nulla sull'unico giro validabile.

### Margine residuo noto
Con le tre correzioni: G1[9 tappe vicino casa] 187 km · G2[Silandro, Eni Station, ENIMOOV, Bolzano,
Malé] 386 km · G3[Canazei, Cavalese, Vipiteno] 366 km = **940 km**. Il margine teorico rimasto
(~44 km) è San Michele a/A, che starebbe meglio nella giornata di Silandro/Malé che nel vicinato:
oggi lo blocca esattamente la Causa 4 (dir 0.70 > 0.45, mentre il detour dal corridoio sarebbe 27' ≤ 42').

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

## La "giornata ESTREMI" — il caso ENI 202609 (2026-09-06), RISOLTA in v5.123 (vedi in fondo alla sezione)
Giro reale di 17 tappe. **Piano dell'utente (a mano): 903 km, 3 giornate, 7/4/4 tappe.
Piano dell'app: 939 km, 3 giornate, 1/13/3** — una giornata con UNA tappa (Malé, 472' di margine,
rientro 10:38) e una con TREDICI (05:22–17:38, 52' di margine). **I km sono quasi uguali (+4%): il
difetto è lo SQUILIBRIO**, non la lunghezza.

La mossa dell'utente è una giornata che lui chiama **"Estremi"**: Malé + San Michele a/A + Cavalese +
Canazei, cioè i punti TERMINALI di **quattro valli diverse** (Sole, Adige, Fiemme, Fassa) raccolti in
un **anello** da 319 km, invece di dedicare una giornata a ciascun punto isolato. È un'eccezione
legittima al principio "una giornata = una valle": non è mescolare valli a caso, è chiudere gli
estremi in un giro solo.

**Il piano dell'utente è FATTIBILE e MIGLIORE — verificato**: quattro verifiche indipendenti
(ricostruzione della matrice + `evaluateDayTiming` + `planRoute`) concordano: 17/17 tappe una sola
volta, nessuna fuori chiusura, rientri entro le 18:30, **guida 992–1002' contro i 1052' dell'app**.
Quindi il motore *può* eseguirlo, ma il suo clustering non lo *trova*.

### Perché il motore non ci arriva (diagnosi misurata)
1. **`assignZones` è il gate decisivo**: un gruppo apre una zona nuova se è più vicino a CASA che a
   qualunque SEME già scelto. Malé (100' da casa, 179' dal seme più vicino) apre Z2 da sola — e **il
   numero di zone è un pavimento sul numero di giornate**, perché `growDays` gira una zona alla volta.
   La giornata da 1 tappa nasce lì, senza che l'oracolo venga mai interpellato.
2. Le tre fasi di recupero (`fillPartial`, `fillDays`, `dissolveDays`) sanno fare solo **mosse a UN
   tempo**: spostare un gruppo in una giornata che ha già spazio. La "giornata Estremi" richiede una
   mossa a **DUE tempi** — liberare posto spostando altrove ciò che in quella giornata c'entra meno —
   che nel motore non esiste.
3. Per Malé, nel piano reale: l'unica giornata la cui *directness* la ammetterebbe è quella da 13
   tappe, ma lì **l'oracolo la rifiuta** (finisce già alle 17:38); l'unica con margine è quella di
   Canazei, dove la respinge la directness (0.79 > `TAU_DISSOLVE` 0.75) e comunque l'oracolo.

### Quattro rimedi TENTATI e FALSIFICATI (2026-09-06) — non ripeterli così
Analisi a 4 lenti + verifica avversaria indipendente, tutto **eseguito** su fixture di 80–120
geometrie "a stella" (il modello dell'utente) oltre che sui due log reali. Nessuno è sopravvissuto:
- **Fase "estremi" con SCAMBIO** (giornata isolata assorbita cedendo un gruppo a una terza): su
  stella **pura** fonde due valli diverse con **guadagno consegnato ZERO** (dichiarato ~54', reale 0';
  km invariati). L'argomento "su stella il gain è identicamente zero, quindi non scatta" è falso.
- **Ricerca locale (move+swap) sulla guida totale**: è `improveClusters` sotto altro nome. Misurato su
  100 geometrie a stella: **7 nuovi snake, 13 nuove giornate da 1 tappa, 14 distribuzioni più
  squilibrate**, comprati per 0,9–1,0 km. Sul giro ENI a DUR 40 raddoppia le giornate da 1 tappa.
- **Termine di equilibrio nell'obiettivo**: sui dati reali **non contribuisce nulla** — con
  `lambda = 0` (pura discesa sulla guida) si ottiene lo stesso identico piano. Ciò che resta è la
  ricerca locale sui km, cioè il fallimento storico.
- **Pavimento sulla partenza** (vietare di partire prima di `startTime`): sull'ALTRO log reale
  (19 tappe) fa **5 → 6 giornate, +138 km (+12,4%)**, perché la giornata di San Candido perde la
  partenza alle 05:30. Rompe l'invariante di v5.120 ("zero casi con più giornate di prima").

### Prototipo della fase "estremi": provato sul replay fedele → NO-OP (v5.122)
Il prototipo prodotto dall'analisi (fase con mossa a due tempi/scambio) è stato eseguito con
`scripts/replay-multiday-eni.mjs` contro il motore attuale: **risultato identico, 1/13/3**, la fase
non scatta nemmeno (nessuna riga "GIORNATA ESTREMI" in Diagnostica). Quindi non è solo rischiosa
come dicevano i verificatori: sul giro reale **non risolve**. Non è stata integrata.

### Cosa resta valido per il prossimo tentativo
- Il criterio di scelta fra varianti è `meno giornate, poi meno guida`: **cieco all'equilibrio**. Ma
  aggiungerlo all'obiettivo, da solo, non basta (vedi sopra) e cambia i risultati altrove.
- La strada meno rischiosa resta **una VARIANTE aggiuntiva** (non una fase sempre attiva): il
  confronto di v5.120 garantisce che una variante peggiore non venga mai scelta. Attenzione però: a
  **parità** vince la variante storica, quindi una variante che pareggia non porta benefici — ed è
  esattamente ciò che succede su stella pura.
- **Serve prima una riproduzione offline fedele**: in questa analisi i verificatori hanno prodotto
  ricostruzioni della matrice in disaccordo fra loro (una riproduce ZONE/1-13-3 del log, un'altra dà
  4 giornate 9/1/4/3). Senza replay fedele, ogni taratura è una scommessa — vedi il VINCOLO CRITICO.
- Nel frattempo l'utente ha la strada manuale: riordino tappe fra giornate (v5.106) + "Crea i giri".

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

## Il REPLAY FEDELE — `scripts/replay-multiday-eni.mjs` (v5.122) ⭐ USARLO SEMPRE
Chiude il buco del VINCOLO CRITICO: prima non esisteva un modo di provare offline una modifica al
clustering, e ogni taratura era una scommessa. Lo script ricostruisce i tempi REALI dal log ENI
202609 (tempi da casa + vicini stampati + **ancoraggi** imposti dai fatti del log, Floyd-Warshall),
sostituisce Google con uno stub su quella matrice e fa girare il **motore vero**.

```bash
node scripts/replay-multiday-eni.mjs                    # motore attuale
node scripts/replay-multiday-eni.mjs /percorso/alt.js   # confronta una variante
```
Fedeltà verificata (default `DUR=10`): **4 zone identiche**, **composizione 1/13/3**, Malé isolata
07:00–10:32 (log 10:38), e **partenza della giornata da 13 tappe alle 05:22 identica al log** — firma
forte, significa che casa→Silandro e il calcolo a ritroso combaciano. Km 886 contro 939 (−5,6%): lo
scarto viene dalla conversione tempo→km dello stub e **non tocca le decisioni di clustering**, che
usano i tempi.
- `DUR` (durata intervento) **va tenuto a 10**: è il valore che riproduce il log (sono stazioni di
  servizio, visite rapide). Con `DUR ≥ 15` il motore dà 4 giornate 9/1/4/3 e il confronto non vale più.
- Regola: **una modifica al clustering si prova qui PRIMA di toccare il motore**, e va confrontata
  anche sull'altro log reale (19 tappe) e sulle geometrie a stella.

### SOLUZIONE (v5.123): la variante "ESTREMI" in `assignZones`
Terza dimensione delle varianti a confronto (`extremes` × `partialGate` × `nearHomeMode`, 8 corse).
Con `extremes:true`, dopo la partizione in zone le zone **LONTANE** (non vicino-casa) con **al
massimo 3 gruppi** si fondono in un'unica zona (seme = il gruppo più lontano da casa). È la mossa
dell'utente: i terminali di valli diverse in un anello solo. `growDays` interroga poi l'oracolo reale
e spezza la zona se non ci sta in una giornata, quindi la fusione **non crea mai giornate
infattibili**; il confronto "meno giornate, poi meno guida" garantisce che se non conviene non
viene scelta (le varianti ESTREMI stanno in coda: a parità vince il piano storico).
- Replay ENI (DUR=10): **1/13/3 con 1078' → 3/6/8 con 1023'** (Borgo/Civezzano/Ravina ·
  Vipiteno/ENIMOOV/Bolzano×2/Silandro/Malé · Canazei/Cavalese/San Michele/Trento×2/Rovereto×2/Ala).
  Non è il 7/4/4 dell'utente alla lettera ma ha la stessa struttura (una giornata "Nord" con
  Vipiteno+Bolzano+Silandro, una con Canazei+Cavalese+San Michele) e meno guida.
- Log 19 tappe (DUR=15): **5 → 3 giornate**, km 1111 → 1115, zero fuori chiusura.
- 40 stelle (DUR=20): 38 con meno giornate, 0 con più, 0 fuori chiusura, km +5% (pagati per le
  giornate in meno).
- **Vicolo cieco provato**: far confrontare il gruppo col MEMBRO più vicino della zona anziché col
  seme (idea: Vipiteno è a 67' da Bolzano ma 115' da Canazei). Incatena l'intera regione in una zona
  sola (Canazei→Cavalese→San Michele→Trento→…) e produce 5/2/10 a 1117'. Il seme resta il riferimento.
- Soglia 2 gruppi non basta: la zona di Canazei ne ha 3 (Canazei, Vipiteno, Cavalese) e la fusione
  non scattava (identico 1/13/3).

## Da fare (in ordine, solo con dati reali)
- [x] ~~replay offline FEDELE del giro reale~~ → fatto in v5.122 (`scripts/replay-multiday-eni.mjs`).
- [x] ~~Giornata "ESTREMI"~~ → fatta in v5.123 (variante `extremes` in `assignZones`, replay 3/6/8).
- [ ] Scelta del **giorno della settimana** per zona (negozi tutti aperti) — marginale.
- [x] ~~Tarare la frazione corridoio~~ → fatta in v5.104 (0.35 sulla Diagnostica reale).
- [x] ~~"Crea i giri" + cartella unica con nome~~ → fatta in v5.106.
