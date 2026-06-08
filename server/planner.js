import { routeBetween, findNearbyRestStop, findNearbyRestaurant, resolvePlace, isOpenAtTime } from "./googleMapsService.js";

const MAX_EXACT_STOPS = 7;

export function parseTime(value) {
  if (!value) return null;
  const match = String(value).match(/(\d{1,2})[:.](\d{2})|^(\d{1,2})$/);
  if (!match) return null;
  const hours = Number(match[1] ?? match[3]);
  const minutes = Number(match[2] ?? 0);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function formatTime(totalMinutes) {
  if (totalMinutes === null || totalMinutes === undefined || Number.isNaN(totalMinutes)) return "";
  const minutes = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function minutesToHours(minutes) {
  return Math.round((minutes / 60) * 100) / 100;
}

function addDriveBuffer(baseMinutes, markupMinPerHour = 10) {
  const minutes = Number(baseMinutes || 0);
  return Math.max(1, Math.ceil(minutes + (minutes / 60) * markupMinPerHour));
}

function normalizeStop(stop, index, dayOfWeek = null) {
  // Resolve day-specific hours from weeklyHours when available
  let openMorning = stop.openMorning || "";
  let closeMorning = stop.closeMorning || "";
  let openAfternoon = stop.openAfternoon || "";
  let closeAfternoon = stop.closeAfternoon || "";
  let continuous = false;
  let closedToday = false;

  const wh = stop.weeklyHours;
  if (wh && dayOfWeek !== null) {
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

  return {
    uid: stop.uid || stop.stopUid || `stop-${index}`,
    id: stop.id ?? stop.addressId ?? `new-${index}`,
    addressId: stop.addressId ?? stop.id ?? null,
    customer: stop.customer || stop.label || `Tappa ${index + 1}`,
    location: stop.location || "",
    fullAddress: stop.fullAddress || stop.address || "",
    notes: stop.notes || "",
    durationMinutes: Number(stop.durationMinutes || stop.defaultDuration || 45),
    openMorning,
    closeMorning,
    openAfternoon,
    closeAfternoon,
    continuous,
    closedToday,
    weeklyHours: wh || null,
    lat: stop.lat ?? null,
    lng: stop.lng ?? null,
    ignoreHours: stop.ignoreHours === true,
    fixedFirst: stop.fixedFirst === true
  };
}

function getWindows(stop) {
  if (stop.closedToday) return [];
  const windows = [];

  if (stop.continuous) {
    // Single unbroken window: openMorning → closeAfternoon
    const start = parseTime(stop.openMorning);
    const end = parseTime(stop.closeAfternoon);
    if (start !== null && end !== null && end > start) {
      windows.push({ label: "Orario continuato", start, end });
    }
    return windows;
  }

  const morningStart = parseTime(stop.openMorning);
  const morningEnd = parseTime(stop.closeMorning);
  const afternoonStart = parseTime(stop.openAfternoon);
  const afternoonEnd = parseTime(stop.closeAfternoon);

  if (morningStart !== null && morningEnd !== null && morningEnd > morningStart) {
    windows.push({ label: "Mattina", start: morningStart, end: morningEnd });
  }
  if (afternoonStart !== null && afternoonEnd !== null && afternoonEnd > afternoonStart) {
    windows.push({ label: "Pomeriggio", start: afternoonStart, end: afternoonEnd });
  }
  return windows.sort((a, b) => a.start - b.start);
}

function openingLabel(stop) {
  if (stop.closedToday) return "Chiuso";
  const parts = [];
  if (stop.continuous) {
    if (stop.openMorning && stop.closeAfternoon) parts.push(`${stop.openMorning}-${stop.closeAfternoon} (continuato)`);
  } else {
    if (stop.openMorning && stop.closeMorning) parts.push(`${stop.openMorning}-${stop.closeMorning}`);
    if (stop.openAfternoon && stop.closeAfternoon) parts.push(`${stop.openAfternoon}-${stop.closeAfternoon}`);
  }
  return parts.join(" / ") || "Non indicato";
}

function scheduleStop(arrival, stop) {
  // ignoreHours: work starts at arrival regardless of opening hours
  if (stop.ignoreHours) {
    return { split: false, serviceStart: arrival, serviceEnd: arrival + stop.durationMinutes, waitMinutes: 0, warnings: [] };
  }

  const windows = getWindows(stop);
  const warnings = [];

  if (stop.closedToday) {
    return { split: false, serviceStart: arrival, serviceEnd: arrival + stop.durationMinutes, waitMinutes: 0,
      warnings: [{ msg: "sede chiusa in questo giorno", level: "error" }] };
  }

  if (windows.length === 0) {
    return { split: false, serviceStart: arrival, serviceEnd: arrival + stop.durationMinutes, waitMinutes: 0,
      warnings: [{ msg: "orari non indicati", level: "info" }] };
  }

  for (let wi = 0; wi < windows.length; wi++) {
    const win = windows[wi];
    if (arrival <= win.end) {
      const serviceStart = Math.max(arrival, win.start);
      const waitMinutes = Math.max(0, serviceStart - arrival);
      if (arrival < win.start) warnings.push({ msg: "arrivo prima dell'apertura", level: "warn" });

      if (serviceStart + stop.durationMinutes <= win.end) {
        return { split: false, serviceStart, serviceEnd: serviceStart + stop.durationMinutes, waitMinutes, warnings };
      }

      // Work overflows this window — try split across next window
      const nextWin = windows[wi + 1];
      if (nextWin && serviceStart < win.end) {
        const morningWork = win.end - serviceStart;
        const afternoonWork = stop.durationMinutes - morningWork;
        if (afternoonWork > 0 && nextWin.start + afternoonWork <= nextWin.end) {
          return {
            split: true,
            morningStart: serviceStart,
            morningEnd: win.end,
            morningWork,
            afternoonStart: nextWin.start,
            afternoonEnd: nextWin.start + afternoonWork,
            afternoonWork,
            waitMinutes,
            warnings
          };
        }
      }

      warnings.push({ msg: `intervento oltre chiusura ${win.label.toLowerCase()}`, level: "error" });
    }
  }

  return { split: false, serviceStart: arrival, serviceEnd: arrival + stop.durationMinutes, waitMinutes: 0,
    warnings: [...warnings, { msg: "arrivo dopo l'orario di chiusura", level: "error" }] };
}

function permute(items) {
  if (items.length <= 1) return [items];
  const result = [];
  for (let index = 0; index < items.length; index += 1) {
    const current = items[index];
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    for (const tail of permute(rest)) result.push([current, ...tail]);
  }
  return result;
}

async function buildLegMatrix(nodes, driveMarkupMinPerHour = 10) {
  const matrix = new Map();
  const pairs = [];
  for (let from = 0; from < nodes.length; from += 1) {
    for (let to = 0; to < nodes.length; to += 1) {
      if (from === to) continue;
      pairs.push({ from, to });
    }
  }

  const concurrency = Number(process.env.ROUTE_MATRIX_CONCURRENCY || 8);
  let cursor = 0;
  async function worker() {
    while (cursor < pairs.length) {
      const pair = pairs[cursor];
      cursor += 1;
      const leg = await routeBetween(nodes[pair.from], nodes[pair.to]);
      const adjustedDriveMinutes = addDriveBuffer(leg.driveMinutes, driveMarkupMinPerHour);
      matrix.set(`${pair.from}:${pair.to}`, {
        ...leg,
        baseDriveMinutes: leg.driveMinutes,
        driveBufferMinutes: adjustedDriveMinutes - leg.driveMinutes,
        driveMinutes: adjustedDriveMinutes
      });
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, pairs.length) }, () => worker())
  );
  return matrix;
}

function readLeg(matrix, from, to) {
  return matrix.get(`${from}:${to}`) || { km: 0, driveMinutes: 0, source: "none" };
}

function evaluateOrder(order, context) {
  const { nodes, matrix, startMinutes, firstArrivalRequired, rates, timingMode, arrivalLeadMinutes } = context;
  const rows = [];
  let currentNodeIndex = 0;
  let currentTime = startMinutes;
  let dayStart = startMinutes;
  let totalKm = 0;
  let totalDriveMinutes = 0;
  let totalWorkMinutes = 0;
  let totalWaitMinutes = 0;
  const allWarnings = [];

  let targetArrival = firstArrivalRequired;
  if ((timingMode === "first_open_minus" || timingMode === "first_open") && order.length > 0) {
    const firstWindowStart = getWindows(order[0])[0]?.start ?? null;
    if (firstWindowStart !== null) {
      targetArrival = timingMode === "first_open_minus"
        ? firstWindowStart - arrivalLeadMinutes
        : firstWindowStart;
    }
  }

  if (timingMode !== "depart_at" && targetArrival !== null && order.length > 0) {
    const firstNodeIndex = order[0].nodeIndex;
    const firstLeg = readLeg(matrix, 0, firstNodeIndex);
    // Use baseDriveMinutes (no traffic buffer) so departure is calculated
    // to arrive exactly at targetArrival, not N minutes early
    currentTime = targetArrival - (firstLeg.baseDriveMinutes ?? firstLeg.driveMinutes);
    dayStart = currentTime;
  }
  if (currentTime === null) {
    currentTime = parseTime("07:30");
    dayStart = currentTime;
  }

  for (let index = 0; index < order.length; index += 1) {
    const stop = order[index];
    const leg = readLeg(matrix, currentNodeIndex, stop.nodeIndex);
    const departure = currentTime;
    const arrival = departure + leg.driveMinutes;
    const warnings = [];

    if (index === 0 && targetArrival !== null) {
      if (arrival < targetArrival) warnings.push({ msg: "arrivo prima dell'orario target", level: "warn" });
      if (arrival > targetArrival) warnings.push({ msg: "arrivo dopo l'orario target", level: "warn" });
    }

    const scheduled = scheduleStop(
      index === 0 && targetArrival !== null ? Math.max(arrival, targetArrival) : arrival,
      stop
    );
    // Deduplicate by msg
    const seen = new Set();
    let rowWarnings = [...warnings, ...scheduled.warnings].filter(w => {
      const key = w.msg || w;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
    if (index === 0 && timingMode === "first_open_minus") {
      rowWarnings = rowWarnings.filter((w) => (w.msg || w) !== "arrivo prima dell'apertura");
    }

    const baseRow = {
      stopNumber: index + 1,
      stopUid: stop.uid,
      addressId: stop.addressId,
      customer: stop.customer,
      location: stop.location,
      address: stop.fullAddress,
      lat: stop.lat,
      lng: stop.lng,
      notes: stop.notes,
      openMorning: stop.openMorning,
      closeMorning: stop.closeMorning,
      openAfternoon: stop.openAfternoon,
      closeAfternoon: stop.closeAfternoon,
      continuous: stop.continuous || false,
      closedToday: stop.closedToday || false,
      weeklyHours: stop.weeklyHours || null,
      openingHours: openingLabel(stop),
      departureTime: formatTime(departure),
      driveMinutes: leg.driveMinutes,
      baseDriveMinutes: leg.baseDriveMinutes ?? leg.driveMinutes,
      driveBufferMinutes: leg.driveBufferMinutes ?? 0,
      km: Number(leg.km.toFixed(1)),
      arrivalTime: formatTime(arrival),
      targetArrivalTime: index === 0 && targetArrival !== null ? formatTime(targetArrival) : "",
      legSource: leg.source
    };

    if (scheduled.split) {
      rows.push({ ...baseRow, stopPart: "morning", serviceStartTime: formatTime(scheduled.morningStart), durationMinutes: scheduled.morningWork, serviceEndTime: formatTime(scheduled.morningEnd), warnings: rowWarnings });
      rows.push({ ...baseRow, stopPart: "afternoon", departureTime: formatTime(scheduled.morningEnd), driveMinutes: 0, baseDriveMinutes: 0, driveBufferMinutes: 0, km: 0, arrivalTime: formatTime(scheduled.afternoonStart), serviceStartTime: formatTime(scheduled.afternoonStart), durationMinutes: scheduled.afternoonWork, serviceEndTime: formatTime(scheduled.afternoonEnd), warnings: [], targetArrivalTime: "" });
      totalWaitMinutes += scheduled.waitMinutes + (scheduled.afternoonStart - scheduled.morningEnd);
      currentTime = scheduled.afternoonEnd;
    } else {
      rows.push({ ...baseRow, serviceStartTime: formatTime(scheduled.serviceStart), durationMinutes: stop.durationMinutes, serviceEndTime: formatTime(scheduled.serviceEnd), warnings: rowWarnings });
      totalWaitMinutes += scheduled.waitMinutes;
      currentTime = scheduled.serviceEnd;
    }

    totalKm += leg.km;
    totalDriveMinutes += leg.driveMinutes;
    totalWorkMinutes += stop.durationMinutes;
    allWarnings.push(...rowWarnings);
    currentNodeIndex = stop.nodeIndex;
  }

  const endNodeIndex = nodes.length - 1;
  const finalLeg = readLeg(matrix, currentNodeIndex, endNodeIndex);
  const finalDeparture = currentTime;
  const finalArrival = finalDeparture + finalLeg.driveMinutes;
  totalKm += finalLeg.km;
  totalDriveMinutes += finalLeg.driveMinutes;

  const costKm = totalKm * rates.kmRate;
  const costDrive = (totalDriveMinutes / 60) * rates.driveHourRate;
  const costWork = (totalWorkMinutes / 60) * rates.workHourRate;
  const totalCost = costKm + costDrive + costWork;
  const warningPenalty = allWarnings.filter((w) => (w.level || w) === "error" || /chiusa|dopo|oltre/.test(w.msg || w)).length * 500;
  const waitPenalty = totalWaitMinutes * 0.4;
  const score = totalDriveMinutes + totalKm * 1.2 + warningPenalty + waitPenalty;

  return {
    rows,
    finalLeg: {
      departureTime: formatTime(finalDeparture),
      arrivalTime: formatTime(finalArrival),
      driveMinutes: finalLeg.driveMinutes,
      baseDriveMinutes: finalLeg.baseDriveMinutes ?? finalLeg.driveMinutes,
      driveBufferMinutes: finalLeg.driveBufferMinutes ?? 0,
      km: Number(finalLeg.km.toFixed(1)),
      source: finalLeg.source
    },
    summary: {
      totalKm: Number(totalKm.toFixed(1)),
      totalDriveMinutes,
      totalDriveHours: minutesToHours(totalDriveMinutes),
      totalWorkMinutes,
      totalWorkHours: minutesToHours(totalWorkMinutes),
      totalWaitMinutes,
      totalDayMinutes: Math.max(0, finalArrival - dayStart),
      dayStart: formatTime(dayStart),
      dayEnd: formatTime(finalArrival),
      costKm: Number(costKm.toFixed(2)),
      costDrive: Number(costDrive.toFixed(2)),
      costWork: Number(costWork.toFixed(2)),
      totalCost: Number(totalCost.toFixed(2)),
      warnings: allWarnings.filter((w, i, arr) => arr.findIndex(x => (x.msg || x) === (w.msg || w)) === i)
    },
    score
  };
}

function nearestOrders(stops, context) {
  const remaining = [...stops];
  const order = [];
  let currentNodeIndex = 0;
  let currentTime = context.startMinutes ?? parseTime("07:30");

  while (remaining.length) {
    remaining.sort((a, b) => {
      const legA = readLeg(context.matrix, currentNodeIndex, a.nodeIndex);
      const legB = readLeg(context.matrix, currentNodeIndex, b.nodeIndex);
      const windowA = getWindows(a)[0]?.start ?? 0;
      const windowB = getWindows(b)[0]?.start ?? 0;
      return legA.driveMinutes + Math.max(0, windowA - currentTime) * 0.1 -
        (legB.driveMinutes + Math.max(0, windowB - currentTime) * 0.1);
    });
    const next = remaining.shift();
    order.push(next);
    const leg = readLeg(context.matrix, currentNodeIndex, next.nodeIndex);
    const scheduled = scheduleStop(currentTime + leg.driveMinutes, next);
    currentTime = scheduled.serviceEnd;
    currentNodeIndex = next.nodeIndex;
  }
  return [order];
}

// Perpendicular distance (km) from point P to segment A→B, plus t parameter.
function perpDistToSegment(pLat, pLng, aLat, aLng, bLat, bLng) {
  const dLat = bLat - aLat, dLng = bLng - aLng;
  const len2 = dLat * dLat + dLng * dLng;
  const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1,
    ((pLat - aLat) * dLat + (pLng - aLng) * dLng) / len2));
  const projLat = aLat + t * dLat, projLng = aLng + t * dLng;
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dlat = toRad(pLat - projLat), dlng = toRad(pLng - projLng);
  const a = Math.sin(dlat/2)**2 + Math.cos(toRad(projLat)) * Math.cos(toRad(pLat)) * Math.sin(dlng/2)**2;
  return { perpKm: R * 2 * Math.asin(Math.sqrt(a)), t };
}

// Find the nearest saved rest stop along the segment [from → to].
// maxPerpKm = max perpendicular distance from the route line (handles parallel valleys).
// Falls back to 15 km haversine if no destination is known.
function findNearestRestStop(restStops, fromLat, fromLng, toLat, toLng, maxPerpKm = 2.0, breakTimeMin = null, scheduledDate = null) {
  if (!restStops.length) return null;
  if (!fromLat || !fromLng) return restStops[0];
  const hasSegment = toLat != null && toLng != null;

  const targetDay = (breakTimeMin != null && scheduledDate)
    ? (() => { const [y, m, d] = scheduledDate.split("-").map(Number); return new Date(y, m - 1, d).getDay(); })()
    : null;

  const candidates = [];
  for (const s of restStops) {
    if (!s.lat || !s.lng) continue;
    let distKm;
    if (hasSegment) {
      const { perpKm, t } = perpDistToSegment(s.lat, s.lng, fromLat, fromLng, toLat, toLng);
      if (perpKm > maxPerpKm || t < -0.05) continue;
      distKm = perpKm;
    } else {
      const R = 6371, toRad = d => d * Math.PI / 180;
      const dlat = toRad(s.lat - fromLat), dlng = toRad(s.lng - fromLng);
      distKm = R * 2 * Math.asin(Math.sqrt(Math.sin(dlat/2)**2 + Math.cos(toRad(fromLat)) * Math.cos(toRad(s.lat)) * Math.sin(dlng/2)**2));
      if (distKm > 15) continue;
    }

    // Check opening hours if we have time info and the stop has weeklyHours or periods
    let openAtBreak = null;
    if (targetDay !== null && breakTimeMin != null) {
      if (s.weeklyHours) {
        // Use weeklyHours stored in DB (same format as normalizeStop)
        const day = s.weeklyHours[String(targetDay)] || s.weeklyHours[targetDay];
        if (day?.closed) openAtBreak = false;
        else if (day) {
          const normalized = normalizeStop(s, 0, targetDay);
          const windows = getWindows(normalized);
          openAtBreak = windows.length === 0 ? null
            : windows.some(w => breakTimeMin >= w.start && breakTimeMin < w.end) ? true : false;
        }
      } else if (s.periods) {
        openAtBreak = isOpenAtTime(s.periods, targetDay, breakTimeMin);
      }
    }

    candidates.push({ s, distKm, openAtBreak });
  }

  if (!candidates.length) return null;

  // Prefer open stops; fall back to unknown; skip definitively closed ones
  const open = candidates.filter(c => c.openAtBreak === true).sort((a, b) => a.distKm - b.distKm);
  if (open.length) return open[0].s;

  const unknown = candidates.filter(c => c.openAtBreak === null).sort((a, b) => a.distKm - b.distKm);
  if (unknown.length) return unknown[0].s;

  // All saved stops in range are closed at this time — return null, let caller try Places API
  return null;
}

function shiftRowTimes(row, minutes) {
  if (!minutes) return row;
  return {
    ...row,
    departureTime: formatTime(parseTime(row.departureTime) + minutes),
    arrivalTime: formatTime(parseTime(row.arrivalTime) + minutes),
    serviceStartTime: formatTime(parseTime(row.serviceStartTime) + minutes),
    serviceEndTime: formatTime(parseTime(row.serviceEndTime) + minutes)
  };
}

async function insertBreaks(rows, options) {
  const {
    lunchBreakEnabled, lunchBreakMinutes = 45,
    restStops = [], restaurantStops = [],
    dayStart = 7 * 60,
    finalArrival = 20 * 60,
    scheduledDate = null
  } = options;

  // ── constants ────────────────────────────────────────────────────────────────
  const _lunchOpen = options?.lunchOpenTime ? (typeof options.lunchOpenTime === "number" ? options.lunchOpenTime : (() => { const [h,m] = String(options.lunchOpenTime).split(":"); return Number(h)*60+Number(m||0); })()) : (11*60+30);
  const _lunchClose = options?.lunchCloseTime ? (typeof options.lunchCloseTime === "number" ? options.lunchCloseTime : (() => { const [h,m] = String(options.lunchCloseTime).split(":"); return Number(h)*60+Number(m||0); })()) : (14*60);
  const LUNCH_OPEN = _lunchOpen;
  const LUNCH_CLOSE = _lunchClose;
  const interval = Number(options?.restIntervalMin ?? 120);
  const deviation = Number(options?.restMaxDeviationMin ?? 40);
  const REST_MIN = interval - Math.floor(deviation / 4);
  const REST_MAX = interval + Math.floor(deviation * 3 / 4);
  const REST_DUR = Number(options?.restDurationMin ?? 15);
  const NO_BREAK_EARLY = Number(options?.noBreakEarlyMin ?? 120);
  const NO_BREAK_BEFORE_HOME = Number(options?.noBreakBeforeHomeMin ?? 60);
  const EARLIEST_BREAK = options?.earliestBreakTime ?? (8 * 60);
  const NO_BREAK_BEFORE_LUNCH = Number(options?.noBreakBeforeLunchMin ?? 60);
  const NO_BREAK_AFTER_LUNCH = Number(options?.noBreakAfterLunchMin ?? 120);
  const maxDetourKm = Number(options?.maxDetourKm ?? 1.5);

  // ── insertions list ──────────────────────────────────────────────────────────
  const insertions = [];

  // ── 1. Pausa pranzo ──────────────────────────────────────────────────────────
  const makeLunchEntry = async (beforeIndex, refRow, nextRow, lunchTimeMin) => {
    const fromRow = refRow || (beforeIndex > 0 ? rows[beforeIndex - 1] : null);
    const toRow = nextRow || (beforeIndex < rows.length ? rows[beforeIndex] : null);
    // Try saved restaurants first, then Places search
    const saved = findNearestRestStop(restaurantStops, fromRow?.lat, fromRow?.lng, toRow?.lat, toRow?.lng, 3.0, lunchTimeMin, scheduledDate);
    const spot = saved || (fromRow?.lat
      ? await findNearbyRestaurant(fromRow.lat, fromRow.lng, fromRow.lat, fromRow.lng, toRow?.lat, toRow?.lng, 8000, lunchTimeMin, scheduledDate).catch(() => null)
      : null);
    const label = spot?.rating ? `${spot.customer} · ⭐ ${spot.rating} (${spot.reviewCount})` : spot?.customer;
    return spot
      ? { beforeIndex, type: "lunch", duration: lunchBreakMinutes,
          customer: label, location: spot.location || "", address: spot.fullAddress || "",
          lat: spot.lat ?? null, lng: spot.lng ?? null, placeId: spot.placeId ?? null }
      : { beforeIndex, type: "lunch", duration: lunchBreakMinutes, customer: "Pausa pranzo" };
  };

  if (lunchBreakEnabled) {
    let placed = false;
    for (let i = 0; i < rows.length; i++) {
      const dep = parseTime(rows[i].departureTime);
      if (dep >= LUNCH_OPEN && dep <= LUNCH_CLOSE) {
        insertions.push(await makeLunchEntry(i, rows[i - 1] ?? null, rows[i], dep));
        placed = true;
        break;
      }
    }
    if (!placed && rows.length > 0) {
      const lastEnd = parseTime(rows[rows.length - 1].serviceEndTime);
      if (lastEnd >= LUNCH_OPEN && lastEnd <= LUNCH_CLOSE) {
        insertions.push(await makeLunchEntry(rows.length, rows[rows.length - 1], null, lastEnd));
      }
    }
  }

  // ── 2. Soste automatiche ─────────────────────────────────────────────────────

  // Orario effettivo della pausa pranzo (per le regole no-break ±pranzo)
  const lunchIns = insertions.find(ins => ins.type === "lunch");
  const lunchTime = lunchIns != null
    ? (parseTime(rows[lunchIns.beforeIndex]?.departureTime ?? "") ||
       parseTime(rows[lunchIns.beforeIndex - 1]?.serviceEndTime ?? "") ||
       null)
    : null;

  const isValidBreakTime = (t) => {
    if (t < EARLIEST_BREAK) return false;
    if (t < dayStart + NO_BREAK_EARLY) return false;
    if (t > finalArrival - NO_BREAK_BEFORE_HOME) return false;
    if (lunchTime != null) {
      // Block the window from 1h before lunch to 2h after lunch (range, not two thresholds)
      if (t >= lunchTime - NO_BREAK_BEFORE_LUNCH && t <= lunchTime + NO_BREAK_AFTER_LUNCH) return false;
    }
    return true;
  };

  let cumulative = 0;
  let lastLat = null, lastLng = null;
  // prevServiceEnd tracks wall-clock time at the end of the last activity (used for mid-leg timing)
  let prevServiceEnd = dayStart;

  // driveOffset: minutes into the drive-to-row-i where the break is inserted.
  // 0 = at the start of the leg (end of previous stop); >0 = mid-leg.
  const tryInsert = async (beforeIndex, refLat, refLng, fromLat, fromLng, toLat, toLng, driveOffset = 0, breakTimeMin = null) => {
    if (insertions.some(ins => ins.beforeIndex === beforeIndex && Math.abs((ins.driveOffset||0) - driveOffset) < 5)) {
      cumulative = 0;
      return true;
    }
    // Prefer saved stops near the route segment (perpendicular distance ≤ 2 km)
    let spot = findNearestRestStop(restStops, refLat, refLng, toLat, toLng, 2.0, breakTimeMin, scheduledDate);
    if (!spot && refLat && refLng) {
      spot = await findNearbyRestStop(refLat, refLng, fromLat, fromLng, toLat, toLng, 15000, breakTimeMin, scheduledDate, maxDetourKm).catch(() => null);
    }
    if (!spot) { return false; } // keep cumulative intact — retry at next opportunity
    const label = spot.rating
      ? `${spot.customer} · ⭐ ${spot.rating} (${spot.reviewCount})`
      : spot.customer;
    const warnings = spot.openAtBreak === false
      ? [{ msg: `La sosta "${spot.customer}" potrebbe essere chiusa all'orario previsto`, level: "warn" }]
      : [];
    insertions.push({
      beforeIndex, type: "rest", duration: REST_DUR,
      driveOffset,
      customer: label,
      location: spot.location || "",
      address: spot.fullAddress || "",
      lat: spot.lat ?? null,
      lng: spot.lng ?? null,
      placeId: spot.placeId ?? null,
      openAtBreak: spot.openAtBreak ?? null,
      warnings
    });
    cumulative = 0;
    return true;
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    let remainingDrive = row.driveMinutes || 0;
    const workMin = row.durationMinutes || 0;
    let driveConsumed = 0; // minutes of this leg already accounted for by mid-leg breaks

    // Mid-leg breaks: insert as many as needed while driving toward stop i
    while (cumulative > 0 && remainingDrive > 0 && cumulative + remainingDrive >= REST_MIN) {
      const needed = REST_MIN - cumulative; // minutes of driving until break triggers
      const fraction = needed / (row.driveMinutes || 1);
      // Interpolate position along the route at the break point
      const interpLat = (lastLat != null && row.lat != null) ? lastLat + (row.lat - lastLat) * fraction : (row.lat ?? lastLat);
      const interpLng = (lastLng != null && row.lng != null) ? lastLng + (row.lng - lastLng) * fraction : (row.lng ?? lastLng);
      const breakTime = prevServiceEnd + driveConsumed + needed;
      if (!isValidBreakTime(breakTime)) break;
      // Pass destination (row.lat/lng) so saved stops are checked against the segment
      const inserted = await tryInsert(i, interpLat, interpLng, lastLat, lastLng, row.lat, row.lng, driveConsumed + needed, breakTime);
      if (!inserted) break;
      driveConsumed += needed;
      remainingDrive -= needed;
      // cumulative was reset to 0 by tryInsert
    }

    cumulative += remainingDrive;
    if (cumulative >= REST_MAX) cumulative = Math.floor(REST_MAX / 2);

    // Post-work break: after finishing work at this stop
    cumulative += workMin;
    prevServiceEnd = parseTime(row.serviceEndTime) || prevServiceEnd;

    if (cumulative >= REST_MIN && i < rows.length - 1) {
      const breakTime = prevServiceEnd;
      const nextRow = rows[i + 1];
      if (isValidBreakTime(breakTime)) {
        await tryInsert(i + 1, row.lat, row.lng, row.lat, row.lng, nextRow?.lat, nextRow?.lng, 0, breakTime);
      }
    }
    if (cumulative >= REST_MAX) cumulative = Math.floor(REST_MAX / 2);

    lastLat = row.lat;
    lastLng = row.lng;
  }

  // ── 3. Applica inserzioni ────────────────────────────────────────────────────
  insertions.sort((a, b) => a.beforeIndex - b.beforeIndex || (a.driveOffset || 0) - (b.driveOffset || 0));

  const result = [];
  let timeShift = 0;
  let pending = [...insertions];

  for (let i = 0; i <= rows.length; i++) {
    while (pending.length && pending[0].beforeIndex === i) {
      const brk = pending.shift();
      const baseDep = i < rows.length
        ? parseTime(rows[i].departureTime) + timeShift
        : parseTime(rows[rows.length - 1].serviceEndTime) + timeShift;
      const refDep = baseDep + (brk.driveOffset || 0);
      const brkEnd = refDep + brk.duration;
      result.push({
        type: brk.type,
        stopNumber: null,
        customer: brk.customer || "",
        location: brk.location || "",
        address: brk.address || "",
        lat: brk.lat ?? null,
        lng: brk.lng ?? null,
        departureTime: formatTime(refDep),
        arrivalTime: formatTime(refDep),
        serviceStartTime: formatTime(refDep),
        serviceEndTime: formatTime(brkEnd),
        durationMinutes: brk.duration,
        warnings: [],
        driveMinutes: 0,
        baseDriveMinutes: 0,
        driveBufferMinutes: 0,
        km: 0,
        legSource: "break"
      });
      timeShift += brk.duration;
    }
    if (i < rows.length) result.push(shiftRowTimes(rows[i], timeShift));
  }

  return { rows: result, addedMinutes: timeShift };
}

export async function planRoute(payload, settings, restStops = []) {
  const scheduledDate = payload.scheduledDate || new Date().toISOString().slice(0, 10);
  // JS getDay(): 0=Sun,1=Mon,...,6=Sat — matches Google Places periods
  const dayOfWeek = new Date(scheduledDate + "T12:00:00").getDay();
  const stops = (payload.stops || []).map((s, i) => normalizeStop(s, i, dayOfWeek));
  if (!payload.start?.address && !payload.start?.fullAddress) {
    throw new Error("Inserisci un punto di partenza.");
  }
  if (!stops.length) {
    throw new Error("Aggiungi almeno una tappa.");
  }

  const end = payload.end?.sameAsStart
    ? payload.start
    : payload.end?.address || payload.end?.fullAddress
      ? payload.end
      : payload.start;

  const nodes = [
    {
      label: payload.start?.label || "Partenza",
      fullAddress: payload.start?.address || payload.start?.fullAddress,
      lat: payload.start?.lat ?? null,
      lng: payload.start?.lng ?? null
    },
    ...stops.map((stop) => ({
      label: `${stop.customer} ${stop.location}`.trim(),
      customer: stop.customer,
      location: stop.location,
      fullAddress: stop.fullAddress,
      lat: stop.lat,
      lng: stop.lng
    })),
    {
      label: end?.label || "Arrivo",
      fullAddress: end?.address || end?.fullAddress,
      lat: end?.lat ?? null,
      lng: end?.lng ?? null
    }
  ];

  const stopsWithNodeIndex = stops.map((stop, index) => ({ ...stop, nodeIndex: index + 1 }));

  // Ensure every stop has coordinates so Places API searches the right area.
  // resolvePlace geocodes from the stop's address when lat/lng are missing/zero.
  await Promise.all(stopsWithNodeIndex.map(async stop => {
    if (!stop.lat || !stop.lng) {
      try {
        const coord = await resolvePlace(stop);
        stop.lat = coord.lat;
        stop.lng = coord.lng;
      } catch { /* leave as null */ }
    }
  }));

  const matrix = await buildLegMatrix(nodes, settings?.driveMarkupMinPerHour ?? 10);
  const startMinutes = parseTime(payload.startTime || payload.start?.time || "");
  const timingMode = payload.timingMode || "first_open_minus";
  const arrivalLeadMinutes = Number(payload.arrivalLeadMinutes ?? 10);
  const firstArrivalRequired = parseTime(payload.firstArrivalTime || payload.firstArrivalRequired || "");
  const rates = {
    kmRate: Number(payload.rates?.kmRate ?? settings.kmRate),
    driveHourRate: Number(payload.rates?.driveHourRate ?? settings.driveHourRate),
    workHourRate: Number(payload.rates?.workHourRate ?? settings.workHourRate)
  };

  // Lock first stop when: firstArrivalRequired is set, OR stop has fixedFirst flag
  const firstStopFixed = stopsWithNodeIndex.length > 1 && (
    firstArrivalRequired !== null || stopsWithNodeIndex[0]?.fixedFirst === true
  );
  const lockedFirst = firstStopFixed ? stopsWithNodeIndex[0] : null;
  const reorderable = lockedFirst ? stopsWithNodeIndex.slice(1) : stopsWithNodeIndex;

  const context = { nodes, matrix, startMinutes, firstArrivalRequired, rates, timingMode, arrivalLeadMinutes };
  const manualOrder = Boolean(payload.manualOrder || payload.lockOrder);
  const candidateOrders = manualOrder
    ? [reorderable]
    : reorderable.length <= MAX_EXACT_STOPS
      ? permute(reorderable)
      : nearestOrders(reorderable, context);

  let best = null;
  for (const partial of candidateOrders) {
    const order = lockedFirst ? [lockedFirst, ...partial] : partial;
    const evaluated = evaluateOrder(order, context);
    if (!best || evaluated.score < best.score) best = evaluated;
  }

  // Insert lunch break and rest stops into the timeline
  const lunchBreakEnabled = payload.lunchBreak !== false && (payload.lunchBreak === true || settings.lunchBreakEnabled !== false);
  const lunchBreakMinutes = Number(payload.lunchBreakMinutes ?? settings.lunchBreakMinutes ?? 45);
  const activeRestStops = restStops.filter(s => s.addressType === "rest");
  const activeRestaurantStops = restStops.filter(s => s.addressType === "restaurant");
  const maxReturnTime = settings?.maxReturnTime ? parseTime(settings.maxReturnTime) : null;
  const actualFinalArrival = parseTime(best.finalLeg.arrivalTime);
  const { rows: enrichedRows, addedMinutes } = await insertBreaks(best.rows, {
    lunchBreakEnabled, lunchBreakMinutes,
    restStops: activeRestStops,
    restaurantStops: activeRestaurantStops,
    dayStart: parseTime(best.summary.dayStart),
    finalArrival: maxReturnTime != null ? Math.max(actualFinalArrival, maxReturnTime) : actualFinalArrival,
    restIntervalMin: settings?.restIntervalMin ?? 120,
    restMaxDeviationMin: settings?.restMaxDeviationMin ?? 40,
    restDurationMin: settings?.restDurationMin ?? 15,
    earliestBreakTime: settings?.earliestBreakTime != null ? parseTime(settings.earliestBreakTime) : (8 * 60),
    maxDetourKm: settings?.maxDetourKm ?? 1.5,
    lunchOpenTime: settings?.lunchOpenTime ?? "11:30",
    lunchCloseTime: settings?.lunchCloseTime ?? "14:00",
    noBreakEarlyMin: settings?.noBreakEarlyMin ?? 120,
    noBreakBeforeHomeMin: settings?.noBreakBeforeHomeMin ?? 60,
    noBreakBeforeLunchMin: settings?.noBreakBeforeLunchMin ?? 60,
    noBreakAfterLunchMin: settings?.noBreakAfterLunchMin ?? 120,
    scheduledDate
  });
  best = {
    ...best,
    rows: enrichedRows,
    finalLeg: {
      ...best.finalLeg,
      departureTime: formatTime(parseTime(best.finalLeg.departureTime) + addedMinutes),
      arrivalTime: formatTime(parseTime(best.finalLeg.arrivalTime) + addedMinutes)
    },
    summary: {
      ...best.summary,
      dayEnd: formatTime(parseTime(best.summary.dayEnd) + addedMinutes),
      totalDayMinutes: best.summary.totalDayMinutes + addedMinutes
    }
  };

  return {
    id: null,
    generatedAt: new Date().toISOString(),
    scheduledDate,
    start: payload.start,
    end,
    startTime: payload.startTime || payload.start?.time || "",
    timingMode,
    arrivalLeadMinutes,
    firstArrivalTime: payload.firstArrivalTime || payload.firstArrivalRequired || "",
    firstArrivalRequired: payload.firstArrivalRequired || "",
    manualOrder,
    rows: best.rows,
    plannedStops: best.rows.map((row) => ({
      uid: row.stopUid,
      addressId: row.addressId,
      customer: row.customer,
      location: row.location,
      fullAddress: row.address,
      notes: row.notes,
      durationMinutes: row.durationMinutes,
      openMorning: row.openMorning,
      closeMorning: row.closeMorning,
      openAfternoon: row.openAfternoon,
      closeAfternoon: row.closeAfternoon,
      weeklyHours: row.weeklyHours || null,
      lat: row.lat,
      lng: row.lng,
      recognized: Boolean(row.addressId)
    })),
    finalLeg: best.finalLeg,
    summary: best.summary,
    rates,
    mapMode: [...new Set(best.rows.map((row) => row.legSource).concat(best.finalLeg.source))].join(", ")
  };
}
