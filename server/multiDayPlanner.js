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

// Raggruppa le tappe in giornate (ognuna parte/torna a casa). Lavora su GRUPPI co-locati (atomici)
// e costruisce ogni giornata come zona compatta attorno al punto più lontano (seme), aggiungendo i
// gruppi più vicini finché la giornata RESTA FATTIBILE.
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
// Una tappa entra in una giornata solo se la sua distanza-strada dal gruppo è ≤ NEAR_HOME_FACTOR ×
// la sua distanza da casa. Sopra questa soglia è "molto più vicina a casa che al gruppo" → è una
// tappa di un'altra direzione, comoda solo perché vicina al rientro: va rimandata a un giorno
// vicino-casa. Tarabile sulla Diagnostica (geometria reale). Vedi docs/MULTI_GIORNO.md.
const NEAR_HOME_FACTOR = 1.3;

export async function buildDayClusters(stops, home, budgetMin, opts = {}, dayFeasible = null) {
  const unassigned = groupColocated(stops.map(s => ({ ...s })), opts); // array di gruppi
  const days = [];
  let guard = 0;
  const flat = arr => arr.flat();

  // Oracolo di fattibilità: motore reale se disponibile, altrimenti approssimazione (offline).
  const feasible = async (dayStops, dow) => {
    if (dayFeasible) {
      const ordered = orderDayFarFirst(dayStops, home, opts);
      const f = await dayFeasible(ordered, dow);
      return !!f.ok;
    }
    return estimateDayMinutes(dayStops, home, opts).total <= budgetMin
      && dayHoursFeasible(dayStops, home, opts, dow);
  };

  while (unassigned.length && guard++ < 5000) {
    // Seme: gruppo col membro più LONTANO da casa. Le zone lontane vengono consumate per
    // prime e il "fronte" massimo si accorcia ogni giorno.
    let seedI = 0, seedD = -1;
    for (let i = 0; i < unassigned.length; i++) {
      const d = legMin(home, unassigned[i][0], opts);
      if (d > seedD) { seedD = d; seedI = i; }
    }
    const dayGroups = [unassigned.splice(seedI, 1)[0]];
    const dow = dowForCluster(opts, days.length);
    if (opts.log) opts.log(`Giorno ${days.length + 1} — seme "${nameOf(dayGroups[0][0])}" (da casa ${Math.round(seedD)}min)`);

    // Accrescimento: aggiunge il gruppo più VICINO alla zona del giorno (minor tempo di strada),
    // finché la giornata resta FATTIBILE secondo il motore reale (orari, chiusure, pranzo, soste,
    // spezzare interventi). La giornata cresce compatta attorno al punto lontano; le tappe vicine
    // a casa restano lontane dal gruppo → rimandate ai giorni successivi.
    let added = true;
    while (added && unassigned.length) {
      added = false;
      const dayStops = flat(dayGroups);
      let best = -1, bestDist = Infinity;
      for (let i = 0; i < unassigned.length; i++) {
        // Pre-filtro veloce per distanza (evita chiamate inutili all'oracolo): considera solo i
        // candidati ragionevolmente vicini al gruppo, poi valida col motore reale.
        let d = Infinity;
        for (const cs of unassigned[i]) for (const ds of dayStops) { const t = legMin(ds, cs, opts); if (t < d) d = t; }
        if (d >= bestDist - 1e-6) continue; // non migliora il migliore già trovato
        // Vincolo direzionale (rete a stella): una tappa vicino casa è "comoda" da appendere a
        // qualsiasi giornata perché è vicina al rientro, anche se è in un'altra valle (es. Pergine
        // 22' da casa finiva nel giorno di San Candido e spingeva fuori Ortisei). Una tappa entra
        // solo se è più vicina al GRUPPO che a CASA (con margine NEAR_HOME_FACTOR): le tappe
        // vicino casa restano per un giorno vicino-casa dedicato, dove si raggruppano tra loro.
        let homeT = Infinity;
        for (const cs of unassigned[i]) { const t = legMin(home, cs, opts); if (t < homeT) homeT = t; }
        if (d > NEAR_HOME_FACTOR * homeT) continue;
        const tentative = [...dayStops, ...unassigned[i]];
        if (!(await feasible(tentative, dow))) continue;
        bestDist = d; best = i;
      }
      if (best >= 0) { dayGroups.push(unassigned.splice(best, 1)[0]); added = true; }
    }

    const dayStops = flat(dayGroups);
    days.push(dayStops);

    if (opts.log) {
      opts.log(`Giorno ${days.length} chiuso: ${dayStops.length} tappe [${dayStops.map(nameOf).join(" → ")}]`);
      // Perché ogni tappa NON è entrata: i candidati più vicini al giorno (per tempo-strada) col
      // verdetto del motore reale. Distingue "fuori chiusura" / "oltre orario" da "altra direzione".
      if (unassigned.length && dayFeasible) {
        const ranked = unassigned.map(g => {
          let d = Infinity;
          for (const cs of g) for (const ds of dayStops) { const t = legMin(ds, cs, opts); if (t < d) d = t; }
          return { g, d };
        }).sort((a, b) => a.d - b.d).slice(0, 6);
        for (const { g, d } of ranked) {
          let homeT = Infinity;
          for (const cs of g) { const t = legMin(home, cs, opts); if (t < homeT) homeT = t; }
          let why;
          if (d > NEAR_HOME_FACTOR * homeT) {
            why = `ALTRA DIREZIONE (gruppo ${Math.round(d)}min > ${NEAR_HOME_FACTOR}×casa ${Math.round(homeT)}min) → giorno vicino-casa`;
          } else {
            const ordered = orderDayFarFirst([...dayStops, ...g], home, opts);
            const f = await dayFeasible(ordered, dow);
            why = f.ok ? "VALIDA ma non aggiunta (?)"
              : `${f.dayEndWithBreaks != null ? `rientro ${formatTime(f.dayEndWithBreaks)}${opts.endMin != null && f.dayEndWithBreaks > opts.endMin ? " OLTRE ORARIO" : ""}` : "orari non ok"}${f.lateStops?.length ? `, FUORI CHIUSURA: ${f.lateStops.join(", ")}` : ""}`;
          }
          opts.log(`   ✗ "${nameOf(g[0])}" (+${Math.round(d)}min dal giorno, da casa ${Math.round(legMin(home, g[0], opts))}min): ${why}`);
        }
      }
    }
  }

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
    // logica di orari/chiusure/pranzo/soste/spezzare interventi. Il dow serve a risolvere gli orari
    // di apertura per quel giorno della settimana (data fittizia con lo stesso weekday).
    const dateForDow = (dow) => (dow == null || baseDow == null)
      ? baseDate : addDaysISO(baseDate, ((dow - baseDow) % 7 + 7) % 7);
    const dayFeasible = async (orderedStops, dow) => {
      const t = await evaluateDayTiming({
        ...payload, id: null, stops: orderedStops, scheduledDate: dateForDow(dow),
        start: home, end: { sameAsStart: true }, manualOrder: true, lockOrder: true,
        departureLatest: formatTime(endMin),
      }, settings);
      const ok = t.dayEndWithBreaks != null && t.dayEndWithBreaks <= endMin && (t.lateStops?.length || 0) === 0;
      return { ok, dayEndWithBreaks: t.dayEndWithBreaks, lateStops: t.lateStops || [] };
    };
    clusters = await buildDayClusters(withCoords, home, budgetMin, opts, dayFeasible);
  }
  if (!clusters.length) throw new Error("Aggiungi almeno una tappa con indirizzo valido.");
  const totalStopsCount = clusters.reduce((n, d) => n + d.length, 0);

  const days = [];
  for (let i = 0; i < clusters.length; i++) {
    const dayDate = addDaysISO(baseDate, i);
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
