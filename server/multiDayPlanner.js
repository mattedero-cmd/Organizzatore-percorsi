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
      if (restInt > 0 && driveAccum >= restInt) { arrival += restDur; driveAccum -= restInt; }
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

// Soglia "sul corridoio": una tappa entra nella giornata del seme F solo se la DEVIAZIONE DAL
// CORRIDOIO F→casa è piccola — `detour = legMin(F,tappa) + legMin(tappa,casa) − legMin(F,casa)`.
// ≈0 = esattamente sulla via; piccolo = diramazione breve; grande = un'altra valle (anche se vicino
// casa: es. Pergine da Ortisei ≈40' → fuori). Seminando SEMPRE il punto più lontano, le tappe del
// corridoio hanno detour basso (Bressanone da San Candido ≈21'). Verificato sui tempi reali del giro.
// Tarabile sulla Diagnostica.
const ON_CORRIDOR_DETOUR_MAX = 35;
// Margine di sicurezza (min) sul rientro: l'oracolo dei tempi è una stima (pranzo/soste come
// allowance), quindi accettiamo una tappa solo se il rientro resta sotto il limite massimo meno
// questo margine, così nel piano reale non si finisce per servire una tappa dopo la chiusura.
const MERGE_RETURN_MARGIN = 15;


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
  const allGroups = groupColocated(stops.map(s => ({ ...s })), opts); // gruppi co-locati (atomici)
  const days = [];
  const flat = arr => arr.flat();
  const maxHomeG = g => Math.max(...g.map(s => legMin(home, s, opts)));
  const corridorMax = opts.onCorridorDetourMax ?? ON_CORRIDOR_DETOUR_MAX;
  const endMin = opts.endMin;

  // Diagnostica: cluster per valle. NON vincola la costruzione (serve solo a leggere il piano).
  if (opts.log) {
    const zones = [...assignZones(allGroups, home, opts)].sort((a, b) => a.seedHome - b.seedHome);
    opts.log(`ZONE (${zones.length}, dal più vicino a casa): ` + zones.map((z, i) =>
      `Z${i + 1}[${nameOf(z.seed[0])} ${Math.round(z.seedHome)}']={${z.members.flat().map(nameOf).join(", ")}}`).join("  ·  "));
  }

  // growDays: riempie giornate da una lista di gruppi col criterio "più vicino fattibile", far-first,
  // SENZA limite di direzione (per gli ORFANI vicino casa — "accorpare necessariamente" — e per il
  // fallback offline). Riempie una giornata, sfora su una seconda solo al bisogno.
  const growDays = async (groupList, label) => {
    const unassigned = [...groupList];
    let guard = 0;
    while (unassigned.length && guard++ < 5000) {
      const dayIndex = days.length;
      let seedI = 0, seedD = -1;
      for (let i = 0; i < unassigned.length; i++) { const d = maxHomeG(unassigned[i]); if (d > seedD) { seedD = d; seedI = i; } }
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
          let ok;
          if (dayFeasible) { const f = await dayFeasible(orderDayFarFirst(tentative, home, opts), dayIndex); ok = f.ok; }
          else ok = estimateDayMinutes(tentative, home, opts).total <= budgetMin && dayHoursFeasible(tentative, home, opts, dowForCluster(opts, dayIndex));
          if (!ok) continue;
          bestDist = d; best = i;
        }
        if (best >= 0) { dayGroups.push(unassigned.splice(best, 1)[0]); added = true; }
      }
      days.push(flat(dayGroups));
      if (opts.log) opts.log(`Giorno ${days.length} chiuso: ${flat(dayGroups).length} tappe [${flat(dayGroups).map(nameOf).join(" → ")}]`);
    }
  };

  // ── FASE PRINCIPALE: greedy far-first con UNIONE PARZIALE "sulla via" ──────────────────────────
  // Solo col motore reale (serve driveMin per la deviazione-per-tappa). Ogni giornata parte dal seme
  // più lontano e tira dentro le tappe sulla via di rientro (deviazione-per-tappa minima ≤ soglia),
  // finché è piena (fattibilità reale). Le tappe in eccesso restano LIBERE per le giornate successive.
  if (dayFeasible) {
    const unassigned = [...allGroups];
    const isFar = g => maxHomeG(g) > NEAR_HOME_RADIUS;
    while (unassigned.some(isFar)) {
      const dayIndex = days.length;
      // Seme = gruppo col membro più lontano da casa.
      let seedI = 0, seedD = -1;
      for (let i = 0; i < unassigned.length; i++) { const d = maxHomeG(unassigned[i]); if (d > seedD) { seedD = d; seedI = i; } }
      const day = [...unassigned.splice(seedI, 1)[0]];
      if (opts.log) opts.log(`Giorno ${dayIndex + 1} — seme "${nameOf(day[0])}" (da casa ${Math.round(seedD)}min)`);
      // F = estremo del giorno (il seme, punto più lontano): definisce il corridoio F→casa. Resta il
      // seme perché si tirano dentro solo tappe sul corridoio (più vicine a casa).
      let F = day[0]; { let fd = -1; for (const s of day) { const d = legMin(home, s, opts); if (d > fd) { fd = d; F = s; } } }
      const fHome = legMin(F, home, opts);
      const detourOf = g => { let m = Infinity; for (const s of g) { const dt = legMin(F, s, opts) + legMin(s, home, opts) - fHome; if (dt < m) m = dt; } return m; };

      // Accrescimento "sul corridoio + contiguo": tra i gruppi SUL CORRIDOIO (detour-dal-seme ≤ soglia)
      // e fattibili, aggiunge il più VICINO alle tappe del giorno (gap minimo) → riempie il corridoio in
      // modo contiguo dal seme verso casa, senza saltare alle tappe vicino casa. Gli altri restano liberi.
      let added = true;
      while (added && unassigned.length) {
        added = false;
        let best = -1, bestGap = Infinity;
        for (let i = 0; i < unassigned.length; i++) {
          const g = unassigned[i];
          if (detourOf(g) > corridorMax) continue;                 // gate 1: sul corridoio
          let gap = Infinity;
          for (const cs of g) for (const ds of day) { const t = legMin(ds, cs, opts); if (t < gap) gap = t; }
          if (gap >= bestGap) continue;                            // più lontano del migliore → salta
          const f = await dayFeasible(orderDayFarFirst([...day, ...g], home, opts), dayIndex);
          if (!f.ok) continue;                                     // gate 2: fattibile
          if (endMin != null && f.dayEndWithBreaks != null && f.dayEndWithBreaks > endMin - MERGE_RETURN_MARGIN) continue;
          bestGap = gap; best = i;
        }
        if (best >= 0) { day.push(...unassigned.splice(best, 1)[0]); added = true; }
      }
      days.push(day);

      if (opts.log) {
        opts.log(`Giorno ${days.length} chiuso: ${day.length} tappe [${day.map(nameOf).join(" → ")}]`);
        // Candidati scartati col motivo (deviazione "altra direzione" / oltre orario / fuori chiusura).
        const ranked = unassigned.map(g => {
          let d = Infinity; for (const cs of g) for (const ds of day) { const t = legMin(ds, cs, opts); if (t < d) d = t; }
          return { g, d };
        }).sort((a, b) => a.d - b.d).slice(0, 6);
        for (const { g, d } of ranked) {
          const detour = Math.round(detourOf(g));
          let why;
          if (detour > corridorMax) {
            why = `ALTRA DIREZIONE (detour ${detour}min > ${corridorMax})`;
          } else {
            const f = await dayFeasible(orderDayFarFirst([...day, ...g], home, opts), dayIndex);
            why = `${f.dayEndWithBreaks != null ? `rientro ${formatTime(f.dayEndWithBreaks)}${endMin != null && f.dayEndWithBreaks > endMin - MERGE_RETURN_MARGIN ? " OLTRE ORARIO" : ""}` : "orari non ok"}${f.lateStops?.length ? `, FUORI CHIUSURA: ${f.lateStops.join(", ")}` : ""}`;
          }
          opts.log(`   ✗ "${nameOf(g[0])}" (+${Math.round(d)}min dal giorno, da casa ${Math.round(maxHomeG(g))}min): ${why}`);
        }
      }
    }

    // ── ORFANI VICINO CASA: i gruppi entro NEAR_HOME_RADIUS rimasti (non tirati nei corridoi) ──
    // Accorpati con growDays (far-first, per vicinanza, fattibile) SENZA gate di direzione: vicino casa
    // è tutto raggiungibile → "accorpare necessariamente". NB: gli estremi lontani che fossero rimasti
    // soli restano giornate proprie (NON impastati qui — era la causa di Primiero+Cles / Bressanone+Merano+Tione).
    if (unassigned.length) {
      if (opts.log) opts.log(`ORFANI/vicino casa: ${flat(unassigned).length} tappe da accorpare [${flat(unassigned).map(nameOf).join(", ")}]`);
      await growDays(unassigned, "orfani");
    }
  } else {
    // Offline / senza motore reale: growDays su tutto (approssimazione, non valida i raggruppamenti reali).
    await growDays(allGroups, "offline");
  }

  // Ordine finale delle giornate: dalla più vicina a casa alla più lontana (richiesta dell'utente).
  days.sort((a, b) => Math.max(...a.map(s => legMin(home, s, opts))) - Math.max(...b.map(s => legMin(home, s, opts))));

  if (opts.log) opts.log(`PIANO FINALE (${days.length} giornate): ` + days.map((d, i) => `G${i + 1}[${d.map(nameOf).join(", ")}]`).join("  ·  "));

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
