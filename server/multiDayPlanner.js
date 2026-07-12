// Pianificazione multi-giorno (V5).
// Dato un insieme di tappe troppo grande per una sola giornata, le raggruppa in
// più giornate, ciascuna che parte e rientra a casa (base unica), rispettando la
// finestra oraria giornaliera (startTime → maxReturnTime) e cercando di minimizzare
// i chilometri totali. Il numero di giornate è automatico.
//
// Strategia: cluster-first "farthest seed + nearest accretion".
// 1. Si parte dalla tappa più lontana da casa (così le zone lontane vengono coperte
//    e raggruppate con le loro vicine, riducendo i km totali).
// 2. Si aggiungono via via le tappe non assegnate più vicine al cluster, finché la
//    stima di durata della giornata resta entro la finestra oraria.
// 3. Per ogni giornata finalizzata si lancia il planner reale (planRoute) che produce
//    ordine ottimale, orari, soste, pranzo e costi della singola giornata.
//
// La stima di durata (estimateDayMinutes) è volutamente leggera/approssimata e serve
// solo a decidere la capienza delle giornate; gli orari definitivi vengono da planRoute.

import { planRoute, parseTime, formatTime, evaluateDayTiming } from "./planner.js";
import { resolvePlace, routeBetween } from "./googleMapsService.js";

// Nome leggibile di una tappa per la Diagnostica: la LOCALITÀ (paese) distingue i clienti, mentre
// il campo customer è spesso identico (es. tutte le filiali "Intesa S. Paolo IOL").
function nameOf(s) { return s?.location || s?.customer || s?.label || "?"; }

function haversineKm(a, b) {
  if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null) return 0;
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

function addDaysISO(isoDate, n) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

function isWeekendISO(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const g = new Date(y, m - 1, d).getDay();
  return g === 0 || g === 6; // 0=Dom, 6=Sab
}

// Data dell'n-esimo GIORNO LAVORATIVO (n=0 → primo giorno lavorativo a partire da isoDate),
// saltando sabato e domenica. Le banche/clienti sono chiusi nel weekend: senza questo, i piani
// lunghi sconfinavano nel weekend con tappe servite a sede chiusa.
function addWorkdaysISO(isoDate, n) {
  let d = isoDate;
  while (isWeekendISO(d)) d = addDaysISO(d, 1);
  let added = 0;
  while (added < n) { d = addDaysISO(d, 1); if (!isWeekendISO(d)) added++; }
  return d;
}

function stopDuration(stop) {
  return Number(stop.durationMinutes || stop.defaultDuration || 45);
}

// Tempo di guida (min) tra due punti. Se opts.distMin è disponibile (matrice tempi reali
// su strada da Google), lo usa — essenziale in montagna dove la linea d'aria è fuorviante
// (es. la Val di Fassa sembra "sulla strada" Trento→San Candido, ma su strada è un vallone
// laterale). Altrimenti fallback alla stima haversine × roadFactor / velocità.
function legMin(a, b, opts = {}) {
  const buffer = 1 + (opts.bufferPerHour ?? 10) / 60;
  if (opts.distMin) {
    const raw = opts.distMin(a, b);
    if (raw != null) return raw * buffer;
  }
  const km = haversineKm(a, b) * (opts.roadFactor ?? 1.35);
  return (km / (opts.speedKmh ?? 50) * 60) * buffer;
}

// Ordine nearest-neighbor da un punto di partenza, in base ai tempi di guida (legMin).
function nearestNeighborOrder(points, start, opts = {}) {
  const remaining = [...points];
  const order = [];
  let cur = start;
  while (remaining.length) {
    let bestI = 0, bestD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = legMin(cur, remaining[i], opts);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    cur = remaining[bestI];
    order.push(cur);
    remaining.splice(bestI, 1);
  }
  return order;
}

// Stima della durata di una giornata (minuti): guida casa→tappe→casa (nearest-neighbor
// sui tempi reali) + lavoro + pranzo + soste stimate.
export function estimateDayMinutes(dayStops, home, opts = {}) {
  const { lunchMin = 0, restIntervalMin = 120, restDurationMin = 15 } = opts;
  const order = nearestNeighborOrder(dayStops, home, opts);
  const path = [home, ...order, home];
  let driveMin = 0;
  for (let i = 1; i < path.length; i++) driveMin += legMin(path[i - 1], path[i], opts);
  const workMin = dayStops.reduce((s, st) => s + stopDuration(st), 0);
  const restMin = restIntervalMin > 0 ? Math.floor(driveMin / restIntervalMin) * restDurationMin : 0;
  return {
    driveMin: Math.round(driveMin),
    workMin,
    lunchMin,
    restMin,
    total: Math.round(driveMin + workMin + lunchMin + restMin),
  };
}

// Tempo di guida stimato (min) tra due punti (alias di legMin per leggibilità).
function roadTimeMin(a, b, opts = {}) { return legMin(a, b, opts); }

// Matrice dei tempi di guida reali (min) tra casa e tutte le tappe, via routeBetween.
// Assegna un indice _mi a ogni nodo e restituisce distMin(a,b) → minuti (o null se ignoto,
// così legMin ricade sul fallback haversine). I tempi sono quelli "grezzi" di Google; il
// buffer traffico viene applicato in legMin.
async function buildLegTimeMatrix(home, stops) {
  const nodes = [home, ...stops];
  nodes.forEach((n, i) => { n._mi = i; });
  const time = new Map();
  const pairs = [];
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) pairs.push([i, j]);
  let cursor = 0, googlePairs = 0;
  const worker = async () => {
    while (cursor < pairs.length) {
      const [i, j] = pairs[cursor++];
      try {
        const leg = await routeBetween(nodes[i], nodes[j]);
        if (leg && Number.isFinite(leg.driveMinutes)) {
          time.set(`${i}_${j}`, leg.driveMinutes);   // memorizza sempre (google o stima locale)
          if (leg.source === "google") googlePairs++; // copertura = quanti tempi REALI Google
        }
      } catch { /* gestito dal fallback in distMin */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, pairs.length) }, () => worker()));
  const distMin = (a, b) => {
    const i = a?._mi, j = b?._mi;
    if (i == null || j == null) return null;
    if (i === j) return 0;
    const v = time.get(i < j ? `${i}_${j}` : `${j}_${i}`);
    return v == null ? null : v;
  };
  return { distMin, realPairs: googlePairs, totalPairs: pairs.length };
}

// Risolve le finestre di apertura di una tappa per uno specifico giorno della settimana
// (0=Dom..6=Sab), gestendo weeklyHours, orario continuato, finestra utente e ignoreHours.
function resolveStopWindows(stop, dayOfWeek) {
  if (stop.ignoreHours) return { closedToday: false, wins: [] };
  let openMorning = stop.openMorning || "", closeMorning = stop.closeMorning || "";
  let openAfternoon = stop.openAfternoon || "", closeAfternoon = stop.closeAfternoon || "";
  let continuous = false, closedToday = false;
  const wh = stop.weeklyHours;
  if (wh && dayOfWeek != null) {
    const day = wh[String(dayOfWeek)] || wh[dayOfWeek];
    if (day) {
      closedToday = !!day.closed;
      continuous = !!day.continuous;
      openMorning = day.openMorning || "";
      closeMorning = continuous ? "" : (day.closeMorning || "");
      openAfternoon = continuous ? "" : (day.openAfternoon || "");
      closeAfternoon = day.closeAfternoon || day.closeMorning || "";
    }
  }
  if (closedToday) return { closedToday: true, wins: [] };
  if (stop.timeFrom && stop.timeTo) {
    const a = parseTime(stop.timeFrom), b = parseTime(stop.timeTo);
    if (a != null && b != null && b > a) return { closedToday: false, wins: [{ start: a, end: b }] };
  }
  const wins = [];
  if (continuous) {
    const a = parseTime(openMorning), b = parseTime(closeAfternoon);
    if (a != null && b != null && b > a) wins.push({ start: a, end: b });
  } else {
    const ms = parseTime(openMorning), me = parseTime(closeMorning);
    const as = parseTime(openAfternoon), ae = parseTime(closeAfternoon);
    if (ms != null && me != null && me > ms) wins.push({ start: ms, end: me });
    if (as != null && ae != null && ae > as) wins.push({ start: as, end: ae });
  }
  wins.sort((x, y) => x.start - y.start);
  return { closedToday: false, wins };
}

// Tolleranza: va bene finire fino a 10 min dopo la chiusura se si sta già lavorando.
export const CLOSURE_TOLERANCE_MIN = 10;

// Ordina le tappe di una giornata "far-first": prima il punto più lontano da casa, poi via
// via il più vicino al precedente (rientro verso casa). Così il lungo viaggio si fa presto,
// quando i negozi sono ancora chiusi, e si arriva alle tappe quando aprono — più tempo utile
// al lavoro. È l'ordine che verrà bloccato nel giro della giornata.
function orderDayFarFirst(dayStops, home, opts = {}) {
  if (dayStops.length <= 1) return [...dayStops];
  let fi = 0, fd = -1;
  dayStops.forEach((s, i) => { const d = legMin(home, s, opts); if (d > fd) { fd = d; fi = i; } });
  const order = [dayStops[fi]];
  const rest = dayStops.filter((_, i) => i !== fi);
  let cur = order[0];
  while (rest.length) {
    let bi = 0, bd = Infinity;
    rest.forEach((s, i) => { const d = legMin(cur, s, opts); if (d < bd) { bd = d; bi = i; } });
    cur = rest[bi]; order.push(cur); rest.splice(bi, 1);
  }
  return order;
}

// Fattibilità oraria della giornata, simulata NELL'ORDINE REALE far-first (lo stesso che verrà
// bloccato nel giro): nessuna tappa deve essere raggiunta dopo la chiusura né finire oltre la
// chiusura + tolleranza. Così una tappa che cadrebbe dopo la chiusura pomeridiana non viene
// assegnata a quella giornata (finirà in un altro giorno).
export function dayHoursFeasible(dayStops, home, opts = {}, dayOfWeek = null) {
  if (dayStops.some(s => resolveStopWindows(s, dayOfWeek).closedToday)) return false;
  const ordered = orderDayFarFirst(dayStops, home, opts);
  const startMin = opts.startMin ?? parseTime("08:00");
  const restInt = opts.restIntervalMin || 0, restDur = opts.restDurationMin || 0;
  let t = 0, prev = home, driveAccum = 0;
  for (let k = 0; k < ordered.length; k++) {
    const s = ordered[k];
    const work = stopDuration(s);
    const wins = resolveStopWindows(s, dayOfWeek).wins;
    if (k === 0) {
      // Prima tappa (la più lontana): nel far-first si parte presto per arrivare all'apertura
      // (calcolo a ritroso). Quindi inizia il servizio all'apertura, non a startMin + guida.
      t = (wins.length ? Math.max(wins[0].start, startMin) : startMin + legMin(home, s, opts)) + work;
    } else {
      const leg = legMin(prev, s, opts);
      let arrival = t + leg;
      driveAccum += leg;
      while (restInt > 0 && driveAccum >= restInt) { arrival += restDur; driveAccum -= restInt; }
      if (wins.length === 0) {
        t = arrival + work;
      } else {
        // Prima finestra in cui il lavoro CI STA davvero (se l'arrivo è a ridosso della
        // chiusura mattutina, si passa al pomeriggio — come fa il planner reale).
        let placed = false;
        for (const w of wins) {
          const serviceStart = Math.max(arrival, w.start);
          if (serviceStart + work <= w.end + CLOSURE_TOLERANCE_MIN) { t = serviceStart + work; placed = true; break; }
        }
        if (!placed) return false; // nessuna finestra utile → dopo la chiusura
      }
    }
    prev = s;
  }
  return true;
}

// Giorno della settimana (0=Dom..6=Sab) della giornata indice `idx` a partire da opts.baseDow.
function dowForCluster(opts, idx) {
  return opts.baseDow == null ? null : (((opts.baseDow + idx) % 7) + 7) % 7;
}

// Raggruppa in gruppi atomici le tappe co-locate: stesso paese (stessa località) OPPURE
// molto vicine per strada (entro CO_LOCATION_MIN minuti). Non verranno mai divise tra
// giornate diverse. Single-link.
const CO_LOCATION_MIN = 6;
function sameTown(a, b) {
  const la = (a.location || "").trim().toLowerCase();
  const lb = (b.location || "").trim().toLowerCase();
  return !!la && la === lb;
}
function groupColocated(stops, opts = {}) {
  const groups = [];
  for (const s of stops) {
    const g = groups.find(grp => grp.some(t => sameTown(t, s) || legMin(t, s, opts) <= CO_LOCATION_MIN));
    if (g) g.push(s); else groups.push([s]);
  }
  return groups;
}

// Partiziona i GRUPPI co-locati in ZONE (valli/corridoi). Modello dell'utente: prima si individuano
// gli ESTREMI delle varie zone, poi ogni tappa va nella zona del suo estremo. Un gruppo apre una
// NUOVA zona se è più vicino a CASA che a qualunque seme (estremo) già scelto — cioè è in una sua
// direzione, non "dietro" un estremo esistente sulla via di casa; altrimenti entra nella zona del
// seme più vicino su strada. Evita il partner-eating (Cles+Mezzolombardo restano una zona, non
// vengono assorbiti dal Nord) e tiene separate le valli. I semi si trovano dal più lontano da casa.
// Raggio (min di strada da casa) entro cui le tappe sono considerate "vicino casa" e accorpate in
// un'unica zona/giornata (hop brevi attorno a casa). Tarabile sulla Diagnostica.
const NEAR_HOME_RADIUS = 35;
export function assignZones(groups, home, opts = {}) {
  const homeT = g => Math.min(...g.map(s => legMin(home, s, opts)));
  const between = (g, k) => {
    let m = Infinity;
    for (const a of g) for (const b of k) { const t = legMin(a, b, opts); if (t < m) m = t; }
    return m;
  };
  const sorted = [...groups].sort((a, b) => homeT(b) - homeT(a));
  const zones = []; // { seed, members: [groups], seedHome }
  for (const g of sorted) {
    const gh = homeT(g);
    let bestK = -1, bestD = Infinity;
    zones.forEach((z, i) => { const d = between(g, z.seed); if (d < bestD) { bestD = d; bestK = i; } });
    if (bestK < 0 || bestD > gh) zones.push({ seed: g, members: [g], seedHome: gh });
    else zones[bestK].members.push(g);
  }
  // Le tappe VICINO CASA (entro NEAR_HOME_RADIUS) sono tutte raggiungibili in una giornata sola con
  // hop brevi attorno a casa: senza questo accorpamento ognuna diventerebbe una zona/giornata a sé
  // (Rovereto, Trento, Levico, Pergine...). Le uniamo in un'unica zona vicino-casa.
  const far = zones.filter(z => z.seedHome > NEAR_HOME_RADIUS);
  const near = zones.filter(z => z.seedHome <= NEAR_HOME_RADIUS);
  if (near.length) {
    const merged = { seed: near[0].seed, members: near.flatMap(z => z.members), seedHome: near[0].seedHome };
    far.push(merged);
  }
  return far; // zone lontane (estremi prima) + un'unica zona vicino-casa in coda
}

// Un'unione è ammessa se la DEVIAZIONE IN PIÙ PER TAPPA aggiunta è piccola: cioè quanto allunga il
// viaggio includere l'altra giornata, diviso il numero di tappe aggiunte. È scale-free (non scala con
// la distanza, a differenza di "2× estremo"): distingue le unioni "sulla via" (Tione/Riva+Rovereto
// ~7'/tappa, Primiero+Valsugana ~18'/tappa) dalle deviazioni in un'altra valle (San Candido+Cavalese
// ~27'/tappa, Sen Jan+Merano ~71'/tappa). Tarabile sulla Diagnostica.
const MERGE_DETOUR_PER_STOP = 22;
// Margine di sicurezza (min) sul rientro quando si UNISCONO due giornate: l'oracolo dei tempi è una
// stima (pranzo/soste come allowance), quindi per le unioni restiamo sotto il limite massimo, così
// nel piano reale non si finisce per servire una tappa dopo la chiusura.
const MERGE_RETURN_MARGIN = 15;

// ── UNIONE PARZIALE SUL CORRIDOIO (fillPartial) ───────────────────────────────────────────────
// Riempie le giornate lontane "povere" (che finiscono molto prima del limite) assorbendo singoli
// GRUPPI atomici "sulla via" da zone adiacenti, lasciando il resto LIBERO (unione PARZIALE, non
// tutto-o-niente come fillDays). È il pezzo che mancava a v5.029.
//
// METRICA: directness(seme, g) = legMin(seme,g) / (legMin(seme,casa) + legMin(g,casa)). È il savings
// di Clarke-Wright in forma adimensionale. Bassa = direttamente collegati (stesso corridoio); ~1 =
// per andare da seme a g passi da casa (direzioni diverse). ANCORATA AL SEME FISSO (estremo lontano
// della giornata ricevente), MAI alla frontiera mobile: è l'unico ancoraggio che l'hub vicino casa
// NON inganna. Reali: Ortisei→Pergine 0.85 (escluso, niente snake), San Candido→Trento 0.79 (escluso,
// niente salto), Tione→Riva 0.39 / Cavalese→SenJan 0.19 (inclusi). Vedi docs/MULTI_GIORNO.md.
const TAU_PARTIAL = 0.45;     // soglia directness per assorbire un gruppo cross-zona
const SLACK_MIN = 75;         // una giornata è "povera" se finisce > SLACK_MIN prima di maxReturnTime
const CORRIDOR_DETOUR = 25;   // detour max (min) del gruppo rispetto al corridoio seme→casa (pavimento)
// Il detour ammesso SCALA col corridoio: per un corridoio lungo (San Candido 169') una diramazione
// da ~50' (Ortisei) è legittima (modello utente: "brevi rami dell'asse → giornata del Nord"),
// mentre 25' fissi la escludevano. Per i corridoi corti resta il pavimento di 25'.
// detourMax = max(CORRIDOR_DETOUR, frazione × tempo(seme→casa)).
// TARATA sulla Diagnostica reale 2026-07-12: Ortisei→Nord det 53' (dentro con 0.35×169=59');
// restano esclusi Cavalese→Merano 70'>31', Bressanone→Fassa 89'>38', Riva→Rovereto 69'>25'.
const CORRIDOR_DETOUR_FRACTION = 0.35;

// ── DISSOLUZIONE GIORNATE (dissolveDays) ─────────────────────────────────────────────────────
// Dopo fillPartial/fillDays può sopravvivere una MEZZA GIORNATA (es. Cles+Mezzolombardo chiusa alle
// 10:52 con 458' di margine): fillPartial per progetto non svuota mai un donatore (gate anti-furto)
// e fillDays la respinge col gate per-tappa. Questa fase prova a SVUOTARE l'intera giornata
// distribuendo TUTTI i suoi gruppi nelle altre giornate (commit-or-rollback): si accetta solo se
// OGNI gruppo trova posto (oracolo reale + margine sul rientro) e la guida totale aggiunta ai
// riceventi è NETTAMENTE inferiore alla guida della giornata eliminata (guadagno km reale, non
// una soglia geometrica). La directness verso il seme ricevente resta come guardia anti-mescolanza
// (le valli in direzioni diverse hanno directness ≥ ~0.7 e restano escluse).
// TAU_DISSOLVE: backstop grossolano — le vere guardie sono la REGOLA DI ZONA e l'economia.
// La directness ancorata al seme lontano penalizza intrinsecamente i gruppi vicino casa
// (per una tappa SUL corridoio a detour zero vale t_seme/(t_seme+t_g) → alta se g è vicina):
// Diagnostica 2026-07-12: Cles→giornata Sen Jan dir 0.69 è il caso BUONO voluto dall'utente,
// mentre le direzioni davvero sbagliate stanno ≥ ~0.9 (passano da casa). 0.75 le separa.
const TAU_DISSOLVE = 0.75;          // guardia anti-mescolanza (backstop; decidono zona+economia)
const DISSOLVE_GROUP_DETOUR = 60;   // Δguida reale max (min) per singolo gruppo spostato
const DISSOLVE_MIN_GAIN = 30;       // guadagno minimo di guida (min) perché la dissoluzione convenga

const homeMinG = (g, home, opts) => Math.min(...g.map(s => legMin(home, s, opts)));
const groupGapMin = (a, b, opts) => { let m = Infinity; for (const x of a) for (const y of b) { const t = legMin(x, y, opts); if (t < m) m = t; } return m; };
function directnessGG(seedGroup, g, home, opts) {
  const denom = homeMinG(seedGroup, home, opts) + homeMinG(g, home, opts);
  return denom > 0 ? groupGapMin(seedGroup, g, opts) / denom : 1;
}
function savingsGG(seedGroup, g, home, opts) {
  return homeMinG(seedGroup, home, opts) + homeMinG(g, home, opts) - groupGapMin(seedGroup, g, opts);
}
function corridorDetourGG(seedGroup, g, home, opts) {
  return groupGapMin(seedGroup, g, opts) + homeMinG(g, home, opts) - homeMinG(seedGroup, home, opts);
}
// Gruppo atomico (in allGroups) che contiene la tappa più LONTANA da casa della giornata = il seme.
function seedGroupOf(dayStops, allGroups, home, opts) {
  let far = dayStops[0], fd = -1;
  for (const s of dayStops) { const d = legMin(home, s, opts); if (d > fd) { fd = d; far = s; } }
  return allGroups.find(grp => grp.includes(far)) || [far];
}

// Sposta gruppi-prefisso "sul corridoio" dalle zone adiacenti nelle giornate povere lontane.
// allGroups = groupColocated(stops); ogni giornata è un array PIATTO di tappe.
async function fillPartial(days, allGroups, home, opts, dayFeasible, endMin) {
  const groupsInDay = d => allGroups.filter(g => g.some(s => d.includes(s)));
  // ANTI-PING-PONG: un gruppo assorbito da una giornata povera non può essere ri-rubato da
  // un'altra povera nella stessa fase (Diagnostica reale: Egna faceva Merano→Fassa→Merano).
  const moved = new Set();
  // Ordine deterministico: giornate dal seme più LONTANO al più vicino (riempi prima le lontane).
  const order = days.map((d, i) => ({ i, far: Math.max(...d.map(s => legMin(home, s, opts))) }))
    .sort((a, b) => b.far - a.far).map(x => x.i);
  for (const i of order) {
    let P = days[i];
    if (!P || !P.length) continue;
    let f0 = await dayFeasible(orderDayFarFirst(P, home, opts), i);
    if (!f0.ok || f0.dayEndWithBreaks == null) continue;
    let slack = (endMin ?? f0.dayEndWithBreaks) - f0.dayEndWithBreaks;
    if (slack <= SLACK_MIN) continue;                 // giornata già piena
    const seedG = seedGroupOf(P, allGroups, home, opts);  // FISSO per tutta la fase
    const detourMax = Math.max(CORRIDOR_DETOUR, CORRIDOR_DETOUR_FRACTION * homeMinG(seedG, home, opts));
    // Candidati = gruppi NON-seme di OGNI altra giornata, sul corridoio del seme.
    const cand = [], rejected = [];
    for (let j = 0; j < days.length; j++) {
      if (j === i || !days[j].length) continue;
      const seedJ = seedGroupOf(days[j], allGroups, home, opts);
      for (const g of groupsInDay(days[j])) {
        if (g === seedJ) continue;                    // mai cedere il seme del donatore
        if (moved.has(g)) continue;                   // già assorbito da una povera: non si ri-ruba
        const dir = directnessGG(seedG, g, home, opts);
        if (dir > TAU_PARTIAL) continue;
        const det = corridorDetourGG(seedG, g, home, opts);
        if (det > detourMax) { rejected.push({ g, det }); continue; }
        cand.push({ g, j, dir, det, sav: savingsGG(seedG, g, home, opts) });
      }
    }
    cand.sort((a, b) => b.sav - a.sav);               // savings decrescente (Clarke-Wright)
    if (opts.log && (cand.length || rejected.length)) {
      opts.log(`UNIONE PARZIALE — giornata "${nameOf(seedG[0])}" povera (slack ${Math.round(slack)}min, detourMax ${Math.round(detourMax)}'), candidati: ${cand.map(c => `${nameOf(c.g[0])}(dir ${c.dir.toFixed(2)},det ${Math.round(c.det)}',sav ${Math.round(c.sav)})`).join(", ") || "nessuno"}`);
      for (const r of rejected) opts.log(`   · "${nameOf(r.g[0])}" fuori corridoio (det ${Math.round(r.det)}' > max ${Math.round(detourMax)}')`);
    }
    for (const c of cand) {
      if (!days[c.j].some(s => c.g.includes(s))) continue;   // già spostato altrove
      // GATE ANTI-FURTO: il donatore SENZA g deve restare non-vuoto e fattibile.
      const donorRest = days[c.j].filter(s => !c.g.includes(s));
      if (donorRest.length === 0) { if (opts.log) opts.log(`   ✗ "${nameOf(c.g[0])}": svuoterebbe il donatore → lasciato`); continue; }
      const fDonor = await dayFeasible(orderDayFarFirst(donorRest, home, opts), c.j);
      if (!fDonor.ok) { if (opts.log) opts.log(`   ✗ "${nameOf(c.g[0])}": donatore resterebbe infattibile → lasciato`); continue; }
      // Prova ad aggiungere g alla giornata povera.
      const fP = await dayFeasible(orderDayFarFirst([...P, ...c.g], home, opts), i);
      if (!fP.ok || (endMin != null && fP.dayEndWithBreaks != null && fP.dayEndWithBreaks > endMin - MERGE_RETURN_MARGIN)) {
        if (opts.log) opts.log(`   ✗ "${nameOf(c.g[0])}": non fattibile nella povera (${fP.dayEndWithBreaks != null ? `rientro ${formatTime(fP.dayEndWithBreaks)}` : "orari"}) → lasciato`);
        continue;
      }
      P = [...P, ...c.g]; days[i] = P; days[c.j] = donorRest;
      moved.add(c.g);   // bloccato: non può essere ri-rubato in questa fase
      if (opts.log) opts.log(`   ✓ "${nameOf(c.g[0])}" spostato da "${nameOf(seedGroupOf(days[c.j].length ? days[c.j] : c.g, allGroups, home, opts)[0])}" → "${nameOf(seedG[0])}"`);
      slack = endMin != null && fP.dayEndWithBreaks != null ? endMin - fP.dayEndWithBreaks : slack;
      if (slack <= SLACK_MIN) break;                  // povera ora piena
    }
  }
  return days.filter(d => d.length);
}

// FASE DI RIEMPIMENTO: le giornate per-zona finiscono presto (una valle = poche tappe). Si UNISCONO
// le GIORNATE INTERE adiacenti (mai singole tappe → le tappe dello stesso paese non si separano e le
// valli non si mescolano), purché l'unione resti FATTIBILE (motore reale, con margine) E la deviazione
// in più PER TAPPA aggiunta sia piccola (sulla via, non un'altra valle). Si procede dalla giornata più
// lontana, unendo la più vicina compatibile. Regola utente: «fare prima il seme più lontano e poi unire
// il più vicino; se necessario spezzare». Esempi: Tione/Riva+Rovereto sì, Primiero+Valsugana sì,
// San Candido+Cavalese no, Sen Jan+Merano no.
async function fillDays(daysIn, home, opts, dayFeasible, endMin) {
  const maxHome = d => Math.max(...d.map(s => legMin(home, s, opts)));
  let days = [...daysIn];
  let changed = true;
  while (changed) {
    changed = false;
    days.sort((a, b) => maxHome(b) - maxHome(a)); // dalla più lontana
    for (let i = 0; i < days.length && !changed; i++) {
      // guida del giorno i DA SOLO (per la deviazione marginale per tappa)
      const fCur = await dayFeasible(orderDayFarFirst(days[i], home, opts), i);
      const curDrive = fCur.driveMin;
      let bestJ = -1, bestGap = Infinity;
      for (let j = 0; j < days.length; j++) {
        if (j === i) continue;
        // gap (tempo-strada minimo) tra le due giornate: si preferisce unire la più vicina
        let gap = Infinity;
        for (const a of days[i]) for (const b of days[j]) { const t = legMin(a, b, opts); if (t < gap) gap = t; }
        if (gap >= bestGap) continue;
        const combined = orderDayFarFirst([...days[i], ...days[j]], home, opts);
        const f = await dayFeasible(combined, i);
        if (!f.ok) continue;
        // margine di sicurezza sul rientro (l'oracolo è una stima)
        if (endMin != null && f.dayEndWithBreaks != null && f.dayEndWithBreaks > endMin - MERGE_RETURN_MARGIN) continue;
        // deviazione in più PER TAPPA aggiunta: piccola ⇒ l'altra giornata è "sulla via"
        if (f.driveMin != null && curDrive != null && days[j].length > 0) {
          const perStop = (f.driveMin - curDrive) / days[j].length;
          if (perStop > MERGE_DETOUR_PER_STOP) continue;
        }
        bestGap = gap; bestJ = j;
      }
      if (bestJ >= 0) {
        days[i] = [...days[i], ...days[bestJ]];
        days.splice(bestJ, 1);
        changed = true;
      }
    }
  }
  return days;
}

// DISSOLUZIONE: prova a SVUOTARE le giornate marginali (mezze giornate sopravvissute a
// fillPartial/fillDays) distribuendo TUTTI i loro gruppi nelle altre giornate. Commit-or-rollback:
// la giornata sparisce solo se OGNI gruppo trova posto (oracolo reale, margine sul rientro,
// Δguida per gruppo contenuto, directness anti-mescolanza) E la guida totale aggiunta ai riceventi
// è nettamente minore della guida della giornata eliminata (guadagno reale ≥ DISSOLVE_MIN_GAIN).
// Es. Diagnostica 2026-07-11: Cles+Mezzolombardo (giornata da 135' di guida, chiusa alle 10:52)
// → assorbiti dalla giornata Merano/Bolzano sul corridoio A22 con ~55' di guida in più: −1 giornata.
// NB sulla data: come per fillPartial/fillDays, l'oracolo valida con l'indice-giornata corrente,
// che non coincide con la data finale (l'ordine near→far viene applicato DOPO). È un'approssimazione
// pre-esistente di tutte le fasi: il planRoute finale usa la data vera e la Diagnostica segnala
// eventuali FUORI CHIUSURA.
async function dissolveDays(daysIn, allGroups, home, opts, dayFeasible, endMin, zoneIdxOfStop) {
  let days = [...daysIn];
  const loggedFail = new Set();   // niente righe "NON svuotata" duplicate tra i passi
  let changed = true;
  while (changed && days.length > 1) {
    changed = false;
    // Solo le vere MEZZE GIORNATE sono candidate: povere (slack > SLACK_MIN) e piccole (≤3 gruppi).
    // Evita di smontare giornate sane e tiene basso il costo oracolo.
    const info = [];
    for (let i = 0; i < days.length; i++) {
      const f = await dayFeasible(orderDayFarFirst(days[i], home, opts), i);
      const slack = (f.ok && endMin != null && f.dayEndWithBreaks != null) ? endMin - f.dayEndWithBreaks : null;
      const nGroups = allGroups.filter(g => g.some(s => days[i].includes(s))).length;
      const marginal = f.ok && slack != null && slack > SLACK_MIN && nGroups > 0 && nGroups <= 3;
      info.push({ i, driveMin: f.ok ? f.driveMin : null, marginal });
    }
    const order = info.filter(x => x.marginal && x.driveMin != null)
      .sort((a, b) => a.driveMin - b.driveMin).map(x => x.i);
    for (const di of order) {
      const D = days[di];
      if (!D?.length) continue;
      const dDrive = info.find(x => x.i === di)?.driveMin;
      if (dDrive == null) continue;
      const dGroups = allGroups.filter(g => g.some(s => D.includes(s)));
      // REGOLA DI ZONA (anti-mescolanza, es. Cavalese NON può finire nella giornata del Nord):
      // un gruppo può andare SOLO in una giornata che contiene già gruppi della SUA zona (i suoi
      // partner naturali), OPPURE ovunque se la sua INTERA zona sta nella giornata che si dissolve
      // (una zona-resto intera che si aggancia al corridoio, es. Cles+Mezzolombardo → Merano).
      const zoneOf = (g) => zoneIdxOfStop ? zoneIdxOfStop.get(g[0]) : null;
      const wholeZoneInD = (g) => {
        const z = zoneOf(g);
        if (z == null) return true;
        for (const [s, zi] of zoneIdxOfStop) if (zi === z && !D.includes(s)) return false;
        return true;
      };
      // Prova (su copia) in DUE ordini di piazzamento: far-first (i lontani ancorano) e
      // near-first (il corridoio del ricevente si estende verso casa un gruppo alla volta —
      // Diagnostica 2026-07-12: Cles da solo costa Δ62' > 60, ma piazzando PRIMA Mezzolombardo
      // il corridoio arriva a Mezzolombardo e Cles diventa una diramazione da Δ49').
      const attempt = async (gOrder) => {
        const trial = days.map((d, k) => (k === di ? [] : [...d]));
        const trialDrive = new Map();   // driveMin di base per giornata (null = infattibile, NON ricalcolare)
        const moves = [];
        let totalDelta = 0, okAll = true, failWhy = "";
        for (const g of gOrder) {
          const freeZone = wholeZoneInD(g);
          const gz = zoneOf(g);
          let best = null;
          for (let j = 0; j < trial.length; j++) {
            if (j === di || !trial[j].length) continue;
            if (!freeZone && gz != null && !trial[j].some(s => zoneIdxOfStop.get(s) === gz)) continue; // zona diversa
            const seedJ = seedGroupOf(trial[j], allGroups, home, opts);
            if (directnessGG(seedJ, g, home, opts) > TAU_DISSOLVE) continue;   // altra valle
            let base;
            if (trialDrive.has(j)) base = trialDrive.get(j);
            else {
              const fb = await dayFeasible(orderDayFarFirst(trial[j], home, opts), j);
              base = fb.ok ? fb.driveMin : null;
              trialDrive.set(j, base);
            }
            if (base == null) continue;
            const f = await dayFeasible(orderDayFarFirst([...trial[j], ...g], home, opts), j);
            if (!f.ok || f.driveMin == null) continue;
            if (endMin != null && f.dayEndWithBreaks != null && f.dayEndWithBreaks > endMin - MERGE_RETURN_MARGIN) continue;
            const delta = f.driveMin - base;
            if (delta > DISSOLVE_GROUP_DETOUR) continue;
            if (!best || delta < best.delta) best = { j, delta, f };
          }
          if (!best) { okAll = false; failWhy = `"${nameOf(g[0])}" senza giornata ricevente`; break; }
          trial[best.j] = [...trial[best.j], ...g];
          trialDrive.set(best.j, best.f.driveMin);
          totalDelta += best.delta;
          moves.push({ g, j: best.j, delta: best.delta });
        }
        return { trial, moves, totalDelta, okAll, failWhy };
      };
      const farFirst = [...dGroups].sort((a, b) => homeMinG(b, home, opts) - homeMinG(a, home, opts));
      let att = await attempt(farFirst);
      if (!att.okAll || dDrive - att.totalDelta < DISSOLVE_MIN_GAIN) {
        const att2 = await attempt([...farFirst].reverse());   // near-first
        if (att2.okAll && dDrive - att2.totalDelta >= DISSOLVE_MIN_GAIN) att = att2;
      }
      const { trial, moves, totalDelta, okAll, failWhy } = att;
      const gain = dDrive - totalDelta;
      if (okAll && gain >= DISSOLVE_MIN_GAIN) {
        if (opts.log) opts.log(`DISSOLUZIONE — giornata "${nameOf(D[0])}" (guida ${Math.round(dDrive)}') svuotata: ${moves.map(m => `"${nameOf(m.g[0])}"→[${nameOf((days[m.j] || [])[0])}] (Δ${Math.round(m.delta)}')`).join(", ")} · guida risparmiata ~${Math.round(gain)}'`);
        days = trial.filter(d => d.length);
        changed = true;
        break;   // indici cambiati: ricomincia il giro
      } else {
        const sig = D.map(nameOf).join("|");
        if (opts.log && !loggedFail.has(sig)) {
          loggedFail.add(sig);
          opts.log(`DISSOLUZIONE — giornata "${nameOf(D[0])}" (guida ${Math.round(dDrive)}') NON svuotata: ${okAll ? `guadagno ${Math.round(gain)}' < ${DISSOLVE_MIN_GAIN}'` : failWhy}`);
        }
      }
    }
  }
  return days;
}


//
// FATTIBILITÀ = lo stesso motore della giornata singola. `dayFeasible(orderedStops, dow)` chiama
// `evaluateDayTiming` (planner.js): stessa logica di orari/chiusure/spezzare interventi, pranzo e
// soste come allowance di tempo. Niente più approssimazioni divergenti (estimateDayMinutes /
// dayHoursFeasible restano solo come fallback offline quando il motore reale non è disponibile).
// Una giornata è valida se rientra in maxReturnTime (pause incluse) e nessuna tappa è servita oltre
// la chiusura. Così il giorno multi-giorno si comporta ESATTAMENTE come la giornata singola.
//
// NB STORICO (docs/MULTI_GIORNO.md): l'accrescimento "sul corridoio/detour" (v5.014) FRAMMENTAVA in
// produzione; lo swap (≤v5.015) MESCOLAVA. Entrambi usavano gate approssimati. La vera causa era la
// divergenza dell'approssimazione dal motore reale (es. Bressanone esiliato per l'interazione col
// pranzo): ora il gate è il motore reale.
export async function buildDayClusters(stops, home, budgetMin, opts = {}, dayFeasible = null) {
  const allGroups = groupColocated(stops.map(s => ({ ...s })), opts); // array di gruppi
  const zones = assignZones(allGroups, home, opts);
  // Ordine dei giri: dall'estremo PIÙ VICINO a casa, allontanandosi (richiesta dell'utente).
  const orderedZones = [...zones].sort((a, b) => a.seedHome - b.seedHome);
  const days = [];
  const flat = arr => arr.flat();

  if (opts.log) {
    opts.log(`ZONE (${orderedZones.length}, dal più vicino a casa): ` + orderedZones.map((z, i) =>
      `Z${i + 1}[${nameOf(z.seed[0])} ${Math.round(z.seedHome)}']={${z.members.flat().map(nameOf).join(", ")}}`).join("  ·  "));
  }

  // Oracolo di fattibilità: motore reale se disponibile, altrimenti approssimazione (offline).
  // `dayIndex` = indice progressivo della giornata (per risolvere il giorno della settimana,
  // saltando i weekend, lato planMultiDay).
  const feasible = async (dayStops, dayIndex) => {
    if (dayFeasible) {
      const ordered = orderDayFarFirst(dayStops, home, opts);
      const f = await dayFeasible(ordered, dayIndex);
      return !!f.ok;
    }
    return estimateDayMinutes(dayStops, home, opts).total <= budgetMin
      && dayHoursFeasible(dayStops, home, opts, dowForCluster(opts, dayIndex));
  };

  // Costruisce le giornate da una lista di GRUPPI: seme = gruppo più LONTANO da casa, poi accresce
  // il più VICINO finché la giornata resta FATTIBILE (motore reale). Una lista troppo grande si
  // spezza in più giornate (estremo → casa). Aggiunge a `days`. Niente mescolanze: la lista è
  // già una zona/corridoio coerente (o i resti accorpati).
  const growDays = async (groupList, label) => {
    const unassigned = [...groupList];
    let guard = 0;
    while (unassigned.length && guard++ < 5000) {
      const dayIndex = days.length;
      let seedI = 0, seedD = -1;
      for (let i = 0; i < unassigned.length; i++) {
        const d = legMin(home, unassigned[i][0], opts);
        if (d > seedD) { seedD = d; seedI = i; }
      }
      const dayGroups = [unassigned.splice(seedI, 1)[0]];
      if (opts.log) opts.log(`Giorno ${dayIndex + 1} (${label}) — seme "${nameOf(dayGroups[0][0])}" (da casa ${Math.round(seedD)}min)`);

      let added = true;
      while (added && unassigned.length) {
        added = false;
        const dayStops = flat(dayGroups);
        let best = -1, bestDist = Infinity;
        for (let i = 0; i < unassigned.length; i++) {
          let d = Infinity;
          for (const cs of unassigned[i]) for (const ds of dayStops) { const t = legMin(ds, cs, opts); if (t < d) d = t; }
          if (d >= bestDist - 1e-6) continue;
          const tentative = [...dayStops, ...unassigned[i]];
          if (!(await feasible(tentative, dayIndex))) continue;
          bestDist = d; best = i;
        }
        if (best >= 0) { dayGroups.push(unassigned.splice(best, 1)[0]); added = true; }
      }

      const dayStops = flat(dayGroups);
      days.push(dayStops);

      if (opts.log) {
        opts.log(`Giorno ${days.length} chiuso: ${dayStops.length} tappe [${dayStops.map(nameOf).join(" → ")}]`);
        if (unassigned.length && dayFeasible) {
          const ranked = unassigned.map(g => {
            let d = Infinity;
            for (const cs of g) for (const ds of dayStops) { const t = legMin(ds, cs, opts); if (t < d) d = t; }
            return { g, d };
          }).sort((a, b) => a.d - b.d).slice(0, 6);
          for (const { g, d } of ranked) {
            const ordered = orderDayFarFirst([...dayStops, ...g], home, opts);
            const f = await dayFeasible(ordered, dayIndex);
            const why = f.ok ? "VALIDA ma non aggiunta (?)"
              : `${f.dayEndWithBreaks != null ? `rientro ${formatTime(f.dayEndWithBreaks)}${opts.endMin != null && f.dayEndWithBreaks > opts.endMin ? " OLTRE ORARIO" : ""}` : "orari non ok"}${f.lateStops?.length ? `, FUORI CHIUSURA: ${f.lateStops.join(", ")}` : ""}`;
            opts.log(`   ✗ "${nameOf(g[0])}" (+${Math.round(d)}min dal giorno, da casa ${Math.round(legMin(home, g[0], opts))}min): ${why}`);
          }
        }
      }
    }
  };

  // Una zona alla volta (niente mescolanze tra valli), dalla più vicina a casa alla più lontana.
  for (let zi = 0; zi < orderedZones.length; zi++) {
    await growDays(orderedZones[zi].members, `Z${zi + 1} ${nameOf(orderedZones[zi].seed[0])}`);
  }

  // UNIONE PARZIALE SUL CORRIDOIO: una giornata lontana POVERA assorbe singoli gruppi "sulla via" da
  // zone adiacenti (directness ancorata al seme + anti-furto), lasciando il resto libero. Additivo:
  // se nessuna giornata è povera è un no-op (output = v5.029). Vedi docs/MULTI_GIORNO.md.
  if (dayFeasible) {
    const before = days.length;
    const partial = await fillPartial(days, allGroups, home, opts, dayFeasible, opts.endMin);
    days.length = 0;
    for (const d of partial) days.push(d);
    if (opts.log && days.length !== before) {
      opts.log(`DOPO UNIONE PARZIALE (${days.length} giornate): ` +
        days.map((d, i) => `G${i + 1}[${d.map(nameOf).join(", ")}]`).join("  ·  "));
    }
  }

  // FASE DI RIEMPIMENTO: unisci le giornate adiacenti per sfruttarle appieno (dal seme più lontano,
  // assorbendo le più vicine, finché fattibile). Le valli opposte non si uniscono (gap + fattibilità).
  if (dayFeasible) {
    const filled = await fillDays(days, home, opts, dayFeasible, opts.endMin);
    days.length = 0;
    for (const d of filled) days.push(d);
    if (opts.log) {
      opts.log(`DOPO RIEMPIMENTO (${days.length} giornate): ` +
        days.map((d, i) => `G${i + 1}[${d.map(nameOf).join(", ")}]`).join("  ·  "));
    }
  }

  // DISSOLUZIONE delle giornate marginali: svuota le mezze giornate residue distribuendo i loro
  // gruppi nelle altre (solo se ogni gruppo trova posto e la guida totale risparmiata è reale).
  if (dayFeasible && days.length > 1) {
    // Mappa tappa→indice zona per la regola anti-mescolanza della dissoluzione.
    const zoneIdxOfStop = new Map();
    zones.forEach((z, zi) => { for (const g of z.members) for (const s of g) zoneIdxOfStop.set(s, zi); });
    const before = days.length;
    const dissolved = await dissolveDays(days, allGroups, home, opts, dayFeasible, opts.endMin, zoneIdxOfStop);
    days.length = 0;
    for (const d of dissolved) days.push(d);
    if (opts.log && days.length !== before) {
      opts.log(`DOPO DISSOLUZIONE (${days.length} giornate): ` +
        days.map((d, i) => `G${i + 1}[${d.map(nameOf).join(", ")}]`).join("  ·  "));
    }
  }

  // "Tappe rimaste indietro": le giornate da UNA sola tappa che NON si sono unite a nessuna (sono
  // isolate). Se ne restano ≥2 le riempio insieme in una giornata (al bisogno due); una tappa
  // davvero sola resta isolata (inevitabile). `growDays` riempie un giorno e sfora solo al bisogno.
  const singles = days.filter(d => d.length <= 1);
  if (singles.length > 1) {
    const solid = days.filter(d => d.length > 1);
    days.length = 0;
    for (const d of solid) days.push(d);
    if (opts.log) opts.log(`RESTI: ${singles.flat().length} tappe rimaste indietro, le riempio in una giornata (al bisogno due) [${singles.flat().map(nameOf).join(", ")}]`);
    await growDays(groupColocated(singles.flat(), opts), "resti accorpati");
  }

  // Ordine finale delle giornate: dalla più vicina a casa alla più lontana (richiesta dell'utente).
  days.sort((a, b) => Math.max(...a.map(s => legMin(home, s, opts))) - Math.max(...b.map(s => legMin(home, s, opts))));

  return days;
}

// Stima dei minuti di guida di una giornata (casa→tappe→casa, nearest-neighbor sui tempi).
function dayTourMin(dayStops, home, opts) {
  if (!dayStops.length) return 0;
  return estimateDayMinutes(dayStops, home, opts).driveMin;
}

// Ricerca locale: sposta una tappa in un'altra giornata se riduce i km totali e la
// giornata di destinazione resta entro il budget. Riduce le zone mischiate, elimina
// le giornate con poche tappe quando possibile, e abbassa i km complessivi.
export function improveClusters(days, home, budgetMin, opts = {}, rounds = 6) {
  let clusters = days.map(d => [...d]);
  for (let r = 0; r < rounds; r++) {
    let moved = false;
    for (let a = 0; a < clusters.length; a++) {
      for (let si = clusters[a].length - 1; si >= 0; si--) {
        const stop = clusters[a][si];
        const aBefore = dayTourMin(clusters[a], home, opts);
        const aAfter = dayTourMin(clusters[a].filter((_, k) => k !== si), home, opts);
        let bestB = -1, bestDelta = -0.5; // soglia minima di guadagno (km)
        for (let b = 0; b < clusters.length; b++) {
          if (b === a) continue;
          const tentativeB = [...clusters[b], stop];
          if (estimateDayMinutes(tentativeB, home, opts).total > budgetMin) continue;
          // Non spostare in una giornata dove la tappa (o le altre) sforerebbero gli orari.
          if (!dayHoursFeasible(tentativeB, home, opts, dowForCluster(opts, b))) continue;
          const delta = (aAfter - aBefore) + (dayTourMin(tentativeB, home, opts) - dayTourMin(clusters[b], home, opts));
          if (delta < bestDelta) { bestDelta = delta; bestB = b; }
        }
        if (bestB >= 0) {
          clusters[bestB].push(stop);
          clusters[a].splice(si, 1);
          moved = true;
        }
      }
    }
    clusters = clusters.filter(d => d.length > 0);
    if (!moved) break;
  }
  return clusters;
}

export async function planMultiDay(payload, settings = {}, restStops = []) {
  const home = { ...(payload.start || {}) };
  if (!home.lat || !home.lng) {
    try {
      const c = await resolvePlace({ fullAddress: home.address || home.fullAddress, ...home });
      home.lat = c.lat; home.lng = c.lng;
    } catch { /* lasciamo null: senza casa il clustering usa la prima tappa come riferimento */ }
  }
  if (!home.lat || !home.lng) {
    throw new Error("Imposta un punto di partenza (casa/ufficio) con indirizzo valido.");
  }

  const startMin = parseTime(payload.startTime || settings.startTime || "08:00") ?? parseTime("08:00");
  const endMin = parseTime(settings.maxReturnTime || payload.departureLatest || "18:30") ?? parseTime("18:30");
  const budgetMin = Math.max(60, endMin - startMin);

  const baseDate = payload.scheduledDate || new Date().toISOString().slice(0, 10);
  let baseDow = null;
  try { baseDow = new Date(baseDate + "T12:00:00").getDay(); } catch { baseDow = null; }

  const debugLog = [];
  const log = (m) => debugLog.push(m);

  const lunchEnabled = settings.lunchBreakEnabled !== false && payload.lunchBreak !== false;
  const opts = {
    driveMarkupMinPerHour: Number(settings.driveMarkupMinPerHour ?? 10),
    bufferPerHour: Number(settings.driveMarkupMinPerHour ?? 10),
    lunchMin: lunchEnabled ? Number(payload.lunchBreakMinutes ?? settings.lunchBreakMinutes ?? 45) : 0,
    restIntervalMin: Number(settings.restIntervalMin ?? 120),
    restDurationMin: Number(settings.restDurationMin ?? 15),
    startMin,
    endMin,
    baseDow,
    log,
  };
  log(`=== PIANO MULTI-GIORNO ${baseDate} ===`);
  log(`MOTORE: per-zona + fillPartial + dissoluzione (v5.105) — se NON vedi questa riga, il server è ancora vecchio`);
  log(`finestra ${formatTime(startMin)}–${formatTime(endMin)} (budget ${budgetMin}min) · pranzo ${opts.lunchMin}min`);

  const ensureCoords = async (s) => {
    if (s.lat && s.lng) return { ...s };
    try { const c = await resolvePlace(s); return { ...s, lat: c.lat, lng: c.lng }; }
    catch { return { ...s }; }
  };

  // Modalità manuale: l'utente ha riorganizzato le giornate sullo schermo. Rispettiamo
  // l'assegnazione e l'ordine forniti (niente clustering, ordine bloccato per giornata).
  const manualMode = Array.isArray(payload.manualDays) && payload.manualDays.length > 0;
  let clusters = [];
  const noCoords = [];
  if (manualMode) {
    for (const dayStops of payload.manualDays) {
      const geo = await Promise.all((dayStops || []).map(ensureCoords));
      noCoords.push(...geo.filter(s => !s.lat || !s.lng));
      const withC = geo.filter(s => s.lat && s.lng);
      if (withC.length) clusters.push(withC);
    }
  } else {
    const rawStops = payload.stops || [];
    if (!rawStops.length) throw new Error("Aggiungi almeno una tappa.");
    const stops = await Promise.all(rawStops.map(ensureCoords));
    noCoords.push(...stops.filter(s => !s.lat || !s.lng));
    const withCoords = stops.filter(s => s.lat && s.lng);
    // Matrice dei tempi di guida reali su strada (casa + tappe): essenziale in montagna,
    // dove la linea d'aria raggrupperebbe male. Calcolata una volta e usata dal clustering.
    try {
      const mtx = await buildLegTimeMatrix(home, withCoords);
      opts.distMin = mtx.distMin;
      const pct = mtx.totalPairs ? Math.round(mtx.realPairs / mtx.totalPairs * 100) : 0;
      log(`MATRICE tempi reali: ${mtx.realPairs}/${mtx.totalPairs} coppie (${pct}%)` +
        (pct < 90 ? ` — ATTENZIONE: ${100 - pct}% in linea d'aria (Google non ha risposto): raggruppamenti meno precisi` : ""));
    } catch (e) { opts.distMin = null; log(`MATRICE tempi reali: ERRORE (${e.message}) → tutto in linea d'aria`); }

    // GEOMETRIA reale (per diagnosticare i corridoi senza ricalcolarli): tempo-strada da casa a
    // ogni paese (estremi → vicini) e, per ogni paese, il vicino più prossimo su strada.
    const byHome = withCoords.map(s => ({ s, h: legMin(home, s, opts) })).sort((a, b) => b.h - a.h);
    log(`GEOMETRIA da casa (lontano→vicino): ${byHome.map(({ s, h }) => `${nameOf(s)} ${Math.round(h)}'`).join(", ")}`);
    const nnLines = withCoords.map(s => {
      let nn = null, nd = Infinity;
      for (const o of withCoords) { if (o === s) continue; const t = legMin(s, o, opts); if (t < nd) { nd = t; nn = o; } }
      return `${nameOf(s)}→${nn ? nameOf(nn) : "?"} ${Math.round(nd)}'`;
    });
    log(`VICINI più prossimi su strada: ${nnLines.join(", ")}`);

    // Oracolo di fattibilità = motore reale della giornata singola (evaluateDayTiming): stessa
    // logica di orari/chiusure/pranzo/soste/spezzare interventi. `dayIndex` → data dell'n-esimo
    // giorno lavorativo (salta i weekend), per risolvere correttamente gli orari di apertura.
    const dayFeasible = async (orderedStops, dayIndex) => {
      const t = await evaluateDayTiming({
        ...payload, id: null, stops: orderedStops, scheduledDate: addWorkdaysISO(baseDate, dayIndex),
        start: home, end: { sameAsStart: true }, manualOrder: true, lockOrder: true,
        departureLatest: formatTime(endMin),
      }, settings);
      const ok = t.dayEndWithBreaks != null && t.dayEndWithBreaks <= endMin && (t.lateStops?.length || 0) === 0;
      return { ok, dayEndWithBreaks: t.dayEndWithBreaks, lateStops: t.lateStops || [], driveMin: t.driveMin };
    };
    clusters = await buildDayClusters(withCoords, home, budgetMin, opts, dayFeasible);
  }
  if (!clusters.length) throw new Error("Aggiungi almeno una tappa con indirizzo valido.");
  const totalStopsCount = clusters.reduce((n, d) => n + d.length, 0);

  const days = [];
  for (let i = 0; i < clusters.length; i++) {
    // Date dei giorni lavorativi consecutivi (salta sabato/domenica) — anche in modalità manuale.
    const dayDate = addWorkdaysISO(baseDate, i);
    // Auto: ordine far-first bloccato (parti dal punto più lontano, rientra verso casa).
    // Manuale: rispetta l'ordine dato dall'utente. In entrambi i casi l'ordine è bloccato.
    const orderedStops = manualMode ? clusters[i] : orderDayFarFirst(clusters[i], home, opts);
    const dayPayload = {
      ...payload,
      id: null,
      stops: orderedStops,
      scheduledDate: dayDate,
      start: home,
      end: { sameAsStart: true },
      manualOrder: true,
      lockOrder: true,
    };
    const plan = await planRoute(dayPayload, settings, restStops);
    const dayEndMin = parseTime(plan.summary?.dayEnd);
    const overBudget = dayEndMin != null && dayEndMin > endMin;
    // Diagnostica: tappe servite fuori orario (warning di chiusura dal planner reale).
    const realRows = (plan.rows || []).filter(r => !r.type);
    const lateStops = realRows
      .filter(r => (r.warnings || []).some(w => /chius|dopo l'orario|finestra|sede chiusa/.test(w.msg || w)))
      .map(nameOf);
    log(`Giorno ${i + 1} (${dayDate}): ${orderedStops.length} tappe [${orderedStops.map(nameOf).join(" → ")}], ${plan.summary?.dayStart}–${plan.summary?.dayEnd}, ${Number(plan.summary?.totalKm || 0).toFixed(0)}km` +
      `${overBudget ? " · OLTRE ORARIO" : ""}${lateStops.length ? ` · FUORI CHIUSURA: ${[...new Set(lateStops)].join(", ")}` : ""}`);
    // Margine/attese/pranzo: distingue "giornata corta perché i clienti chiudono presto" da buchi.
    const waitMin = realRows.reduce((s, r) => s + (Number(r.waitMinutes) || 0), 0);
    const lunchRow = (plan.rows || []).find(r => r.type === "lunch");
    const slack = dayEndMin != null ? endMin - dayEndMin : null;
    log(`  → margine fino a max ${slack != null ? slack + "min" : "?"}, attesa totale ${Math.round(waitMin)}min` +
      `${lunchRow ? `, pranzo ~${lunchRow.arrivalTime || lunchRow.serviceStartTime || "?"}` : ", nessun pranzo inserito"}`);
    // Diagnostica timing 1ª tappa: spiega le partenze "tardi" (es. San Candido alle 9:50).
    const f = realRows[0];
    if (f) {
      const backCalc = f.targetArrivalTime ? `arrivo target ${f.targetArrivalTime}` : "NESSUN calcolo a ritroso (parte all'orario fisso)";
      log(`  → 1ª tappa "${nameOf(f)}": orari [${f.openingHours || "Non indicato"}], arrivo ${f.arrivalTime}, ${backCalc}`);
    }
    days.push({
      dayNumber: i + 1,
      scheduledDate: dayDate,
      stopCount: orderedStops.length,
      stops: orderedStops,
      overBudget,
      lateStops: [...new Set(lateStops)],
      plan,
    });
  }

  const totalKm = days.reduce((s, d) => s + (Number(d.plan.summary?.totalKm) || 0), 0);
  const totalDriveMinutes = days.reduce((s, d) => s + (Number(d.plan.summary?.totalDriveMinutes) || 0), 0);
  const totalWorkMinutes = days.reduce((s, d) => s + (Number(d.plan.summary?.totalWorkMinutes) || 0), 0);

  return {
    multiDay: true,
    generatedAt: new Date().toISOString(),
    baseDate,
    home,
    summary: {
      totalDays: days.length,
      totalKm: Number(totalKm.toFixed(1)),
      totalDriveMinutes,
      totalWorkMinutes,
      totalStops: totalStopsCount,
      window: `${formatTime(startMin)}–${formatTime(endMin)}`,
      budgetMinutes: budgetMin,
      unassignedNoCoords: noCoords.map(s => s.customer || s.label || s.fullAddress || "tappa senza indirizzo"),
    },
    days,
    debug: debugLog,
  };
}
