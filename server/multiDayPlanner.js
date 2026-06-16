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

import { planRoute, parseTime, formatTime } from "./planner.js";
import { resolvePlace } from "./googleMapsService.js";

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

// Ordine nearest-neighbor da un punto di partenza (solo per la stima di guida).
function nearestNeighborOrder(points, start) {
  const remaining = [...points];
  const order = [];
  let cur = start;
  while (remaining.length) {
    let bestI = 0, bestD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(cur, remaining[i]);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    cur = remaining[bestI];
    order.push(cur);
    remaining.splice(bestI, 1);
  }
  return order;
}

function stopDuration(stop) {
  return Number(stop.durationMinutes || stop.defaultDuration || 45);
}

// Stima leggera della durata di una giornata (minuti): guida casa→tappe→casa
// (nearest-neighbor, distanza stradale ≈ haversine × roadFactor, + buffer traffico)
// + lavoro + pranzo + soste stimate.
export function estimateDayMinutes(dayStops, home, opts = {}) {
  const {
    roadFactor = 1.35,
    speedKmh = 50,
    bufferPerHour = 10,
    lunchMin = 0,
    restIntervalMin = 120,
    restDurationMin = 15,
  } = opts;

  const order = nearestNeighborOrder(dayStops, home);
  const path = [home, ...order, home];
  let straightKm = 0;
  for (let i = 1; i < path.length; i++) straightKm += haversineKm(path[i - 1], path[i]);

  const roadKm = straightKm * roadFactor;
  const driveMin = (roadKm / speedKmh * 60) * (1 + bufferPerHour / 60);
  const workMin = dayStops.reduce((s, st) => s + stopDuration(st), 0);
  const restMin = restIntervalMin > 0 ? Math.floor(driveMin / restIntervalMin) * restDurationMin : 0;

  return {
    roadKm: Number(roadKm.toFixed(1)),
    driveMin: Math.round(driveMin),
    workMin,
    lunchMin,
    restMin,
    total: Math.round(driveMin + workMin + lunchMin + restMin),
  };
}

// Tempo di guida stimato (min) tra due punti, coerente con estimateDayMinutes.
function roadTimeMin(a, b, opts = {}) {
  const { roadFactor = 1.35, speedKmh = 50, bufferPerHour = 10 } = opts;
  const km = haversineKm(a, b) * roadFactor;
  return (km / speedKmh * 60) * (1 + bufferPerHour / 60);
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

// Una giornata è fattibile rispetto agli orari se, visitando le tappe in ordine
// "earliest deadline first" (chi chiude prima viene servito prima), nessuna viene
// raggiunta dopo la chiusura né finisce oltre la chiusura + tolleranza. Stima leggera
// (tempi haversine): non sostituisce il planner, ma evita di assegnare a una giornata
// tappe che lì non potrebbero essere servite in orario.
export function dayHoursFeasible(dayStops, home, opts = {}, dayOfWeek = null) {
  const items = dayStops.map(s => ({ s, ...resolveStopWindows(s, dayOfWeek) }));
  if (items.some(it => it.closedToday)) return false; // chiusa quel giorno → non servibile
  const lastClose = it => it.wins.length ? Math.max(...it.wins.map(w => w.end)) : Infinity;
  items.sort((a, b) => lastClose(a) - lastClose(b));
  const startMin = opts.startMin ?? parseTime("08:00");
  let t = startMin, prev = home;
  for (const it of items) {
    const arrival = t + roadTimeMin(prev, it.s, opts);
    const work = stopDuration(it.s);
    if (it.wins.length === 0) {
      t = arrival + work;
    } else {
      const w = it.wins.find(win => arrival <= win.end);
      if (!w) return false;                                              // arrivo dopo la chiusura
      const serviceStart = Math.max(arrival, w.start);
      if (serviceStart + work > w.end + CLOSURE_TOLERANCE_MIN) return false; // finisce troppo tardi
      t = serviceStart + work;
    }
    prev = it.s;
  }
  return true;
}

// Giorno della settimana (0=Dom..6=Sab) della giornata indice `idx` a partire da opts.baseDow.
function dowForCluster(opts, idx) {
  return opts.baseDow == null ? null : (((opts.baseDow + idx) % 7) + 7) % 7;
}

// Raggruppa le tappe in giornate (ognuna parte/torna a casa) rispettando il budget
// di minuti. Funzione pura e testabile: usa solo le coordinate e la stima.
export function buildDayClusters(stops, home, budgetMin, opts = {}) {
  const unassigned = stops.map(s => ({ ...s }));
  const days = [];
  let guard = 0;

  while (unassigned.length && guard++ < 5000) {
    // Seme: tappa più lontana da casa tra quelle ancora libere.
    let seedI = 0, seedD = -1;
    for (let i = 0; i < unassigned.length; i++) {
      const d = haversineKm(home, unassigned[i]);
      if (d > seedD) { seedD = d; seedI = i; }
    }
    const day = [unassigned.splice(seedI, 1)[0]];

    let added = true;
    while (added && unassigned.length) {
      added = false;
      // Candidati ordinati per vicinanza al cluster (distanza minima da una tappa del giorno).
      const ranked = unassigned
        .map((s, i) => ({ i, d: Math.min(...day.map(ds => haversineKm(ds, s))) }))
        .sort((a, b) => a.d - b.d);
      const dow = dowForCluster(opts, days.length);
      for (const { i } of ranked) {
        const cand = unassigned[i];
        const tentative = [...day, cand];
        const est = estimateDayMinutes(tentative, home, opts);
        // Entra nella giornata solo se sta nel budget orario E può essere servita
        // entro gli orari di apertura (nessun arrivo/fine dopo la chiusura).
        if (est.total <= budgetMin && dayHoursFeasible(tentative, home, opts, dow)) {
          day.push(cand);
          unassigned.splice(i, 1);
          added = true;
          break;
        }
      }
    }
    days.push(day);
  }

  return improveClusters(days, home, budgetMin, opts);
}

// Stima dei km stradali di una giornata (casa→tappe→casa, nearest-neighbor).
function dayRoadKm(dayStops, home, opts) {
  if (!dayStops.length) return 0;
  return estimateDayMinutes(dayStops, home, opts).roadKm;
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
        const aBefore = dayRoadKm(clusters[a], home, opts);
        const aAfter = dayRoadKm(clusters[a].filter((_, k) => k !== si), home, opts);
        let bestB = -1, bestDelta = -0.5; // soglia minima di guadagno (km)
        for (let b = 0; b < clusters.length; b++) {
          if (b === a) continue;
          const tentativeB = [...clusters[b], stop];
          if (estimateDayMinutes(tentativeB, home, opts).total > budgetMin) continue;
          // Non spostare in una giornata dove la tappa (o le altre) sforerebbero gli orari.
          if (!dayHoursFeasible(tentativeB, home, opts, dowForCluster(opts, b))) continue;
          const delta = (aAfter - aBefore) + (dayRoadKm(tentativeB, home, opts) - dayRoadKm(clusters[b], home, opts));
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

  const lunchEnabled = settings.lunchBreakEnabled !== false && payload.lunchBreak !== false;
  const opts = {
    driveMarkupMinPerHour: Number(settings.driveMarkupMinPerHour ?? 10),
    bufferPerHour: Number(settings.driveMarkupMinPerHour ?? 10),
    lunchMin: lunchEnabled ? Number(payload.lunchBreakMinutes ?? settings.lunchBreakMinutes ?? 45) : 0,
    restIntervalMin: Number(settings.restIntervalMin ?? 120),
    restDurationMin: Number(settings.restDurationMin ?? 15),
    startMin,
    baseDow,
  };

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
    clusters = buildDayClusters(withCoords, home, budgetMin, opts);
  }
  if (!clusters.length) throw new Error("Aggiungi almeno una tappa con indirizzo valido.");
  const totalStopsCount = clusters.reduce((n, d) => n + d.length, 0);

  const days = [];
  for (let i = 0; i < clusters.length; i++) {
    const dayDate = addDaysISO(baseDate, i);
    const dayPayload = {
      ...payload,
      id: null,
      stops: clusters[i],
      scheduledDate: dayDate,
      start: home,
      end: { sameAsStart: true },
      manualOrder: manualMode,
      lockOrder: manualMode,
    };
    const plan = await planRoute(dayPayload, settings, restStops);
    const dayEndMin = parseTime(plan.summary?.dayEnd);
    days.push({
      dayNumber: i + 1,
      scheduledDate: dayDate,
      stopCount: clusters[i].length,
      stops: clusters[i],
      overBudget: dayEndMin != null && dayEndMin > endMin,
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
  };
}
