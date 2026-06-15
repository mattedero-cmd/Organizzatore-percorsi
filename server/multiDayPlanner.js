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
      for (const { i } of ranked) {
        const cand = unassigned[i];
        const est = estimateDayMinutes([...day, cand], home, opts);
        if (est.total <= budgetMin) {
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
          if (estimateDayMinutes([...clusters[b], stop], home, opts).total > budgetMin) continue;
          const delta = (aAfter - aBefore) + (dayRoadKm([...clusters[b], stop], home, opts) - dayRoadKm(clusters[b], home, opts));
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

  const rawStops = payload.stops || [];
  if (!rawStops.length) throw new Error("Aggiungi almeno una tappa.");

  // Geocodifica le tappe senza coordinate.
  const stops = await Promise.all(rawStops.map(async s => {
    if (s.lat && s.lng) return { ...s };
    try { const c = await resolvePlace(s); return { ...s, lat: c.lat, lng: c.lng }; }
    catch { return { ...s }; }
  }));
  const withCoords = stops.filter(s => s.lat && s.lng);
  const noCoords = stops.filter(s => !s.lat || !s.lng);

  const startMin = parseTime(payload.startTime || settings.startTime || "08:00") ?? parseTime("08:00");
  const endMin = parseTime(settings.maxReturnTime || payload.departureLatest || "18:30") ?? parseTime("18:30");
  const budgetMin = Math.max(60, endMin - startMin);

  const lunchEnabled = settings.lunchBreakEnabled !== false && payload.lunchBreak !== false;
  const opts = {
    driveMarkupMinPerHour: Number(settings.driveMarkupMinPerHour ?? 10),
    bufferPerHour: Number(settings.driveMarkupMinPerHour ?? 10),
    lunchMin: lunchEnabled ? Number(payload.lunchBreakMinutes ?? settings.lunchBreakMinutes ?? 45) : 0,
    restIntervalMin: Number(settings.restIntervalMin ?? 120),
    restDurationMin: Number(settings.restDurationMin ?? 15),
  };

  const clusters = buildDayClusters(withCoords, home, budgetMin, opts);
  const baseDate = payload.scheduledDate || new Date().toISOString().slice(0, 10);

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
      manualOrder: false,
      lockOrder: false,
    };
    const plan = await planRoute(dayPayload, settings, restStops);
    const dayEndMin = parseTime(plan.summary?.dayEnd);
    days.push({
      dayNumber: i + 1,
      scheduledDate: dayDate,
      stopCount: clusters[i].length,
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
      totalStops: withCoords.length,
      window: `${formatTime(startMin)}–${formatTime(endMin)}`,
      budgetMinutes: budgetMin,
      unassignedNoCoords: noCoords.map(s => s.customer || s.label || s.fullAddress || "tappa senza indirizzo"),
    },
    days,
  };
}
