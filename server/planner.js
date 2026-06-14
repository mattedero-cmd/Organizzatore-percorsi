import { routeBetween, findNearbyRestStop, findNearbyRestaurant, resolvePlace, isOpenAtTime } from "./googleMapsService.js";

function haversineKm(a, b) {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

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
    fixedFirst: stop.fixedFirst === true,
    timeFrom: stop.timeFrom || "",
    timeTo: stop.timeTo || "",
    timeWindowMode: stop.timeWindowMode || "available"
  };
}

function getWindows(stop) {
  // User-defined time window: overrides opening hours for scheduling
  if (stop.timeFrom && stop.timeTo) {
    const start = parseTime(stop.timeFrom);
    const end = parseTime(stop.timeTo);
    if (start !== null && end !== null && end > start) {
      // For "fixed" mode the window is a single mandatory slot;
      // for "available" mode the window is the availability range.
      return [{ label: stop.timeWindowMode === "fixed" ? "Orario fisso" : "Disponibilità", start, end }];
    }
  }
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

function scheduleStop(arrival, stop, opts = {}) {
  const { lunchEnabled = false, lunchOpen = null, lunchDuration = 45 } = opts;
  // Fixed time window set by user (timeFrom/timeTo): overrides all opening hours
  if (stop.timeFrom && stop.timeTo) {
    const wStart = parseTime(stop.timeFrom);
    const wEnd = parseTime(stop.timeTo);
    const warnings = [];
    if (wStart !== null && wEnd !== null && wEnd > wStart) {
      if (stop.timeWindowMode === "fixed") {
        // Lavoro DEVE iniziare a wStart e finire a wEnd — durata implicita
        const waitMinutes = Math.max(0, wStart - arrival);
        if (arrival > wEnd) warnings.push({ msg: "arrivo dopo la finestra fissa impostata", level: "error" });

        // Lunch split: if the fixed window spans the lunch break
        if (lunchEnabled && lunchOpen !== null && wStart < lunchOpen && wEnd > lunchOpen + lunchDuration) {
          const morningWork = lunchOpen - wStart;
          const afternoonWork = wEnd - (lunchOpen + lunchDuration);
          return {
            split: true,
            morningStart: wStart, morningEnd: lunchOpen, morningWork,
            afternoonStart: lunchOpen + lunchDuration, afternoonEnd: wEnd, afternoonWork,
            waitMinutes, warnings,
            effectiveDuration: morningWork + afternoonWork,
            fixedWindow: true, lunchIncluded: true
          };
        }

        return {
          split: false, serviceStart: wStart, serviceEnd: wEnd, waitMinutes, warnings,
          effectiveDuration: wEnd - wStart, fixedWindow: true
        };
      } else {
        // Disponibilità: lavoro dura durationMinutes, può iniziare in qualsiasi momento in [wStart, wEnd]
        const serviceStart = Math.max(arrival, wStart);
        const waitMinutes = Math.max(0, serviceStart - arrival);
        if (arrival > wEnd) warnings.push({ msg: "arrivo dopo la finestra di disponibilità", level: "error" });
        else if (arrival < wStart) warnings.push({ msg: "arrivo prima della finestra disponibile", level: "info" });
        const serviceEnd = serviceStart + stop.durationMinutes;
        if (serviceEnd > wEnd) warnings.push({ msg: "intervento supera la finestra di disponibilità", level: "warn" });
        return { split: false, serviceStart, serviceEnd, waitMinutes, warnings };
      }
    }
  }

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
  const { nodes, matrix, startMinutes, firstArrivalRequired, rates, timingMode, arrivalLeadMinutes, departureLatestMinutes,
          lunchEnabled = false, lunchOpen = null, lunchDuration = 45 } = context;
  const lunchOpts = { lunchEnabled, lunchOpen, lunchDuration };
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
  // If the first stop has a user-defined fixed time window, back-calculate departure to arrive at wStart
  if (targetArrival === null && timingMode !== "depart_at" && order.length > 0) {
    const firstStop = order[0];
    if (firstStop.timeFrom && firstStop.timeWindowMode === "fixed") {
      const wStart = parseTime(firstStop.timeFrom);
      if (wStart !== null) targetArrival = wStart;
    }
  }

  if (timingMode !== "depart_at" && targetArrival !== null && order.length > 0) {
    const firstNodeIndex = order[0].nodeIndex;
    const firstLeg = readLeg(matrix, 0, firstNodeIndex);
    // Use buffered driveMinutes so departure accounts for traffic markup
    // and arrival lands exactly at targetArrival
    currentTime = targetArrival - (firstLeg.driveMinutes ?? firstLeg.baseDriveMinutes);
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
      stop,
      lunchOpts
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
      timeFrom: stop.timeFrom || null,
      timeTo: stop.timeTo || null,
      timeWindowMode: stop.timeWindowMode || null,
      fixedFirst: stop.fixedFirst || false,
      ignoreHours: stop.ignoreHours || false,
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
      const fwProps = scheduled.fixedWindow ? { fixedWindow: true, lunchIncluded: !!scheduled.lunchIncluded } : {};
      rows.push({ ...baseRow, ...fwProps, stopPart: "morning", serviceStartTime: formatTime(scheduled.morningStart), durationMinutes: scheduled.morningWork, serviceEndTime: formatTime(scheduled.morningEnd), warnings: rowWarnings });
      rows.push({ ...baseRow, ...fwProps, stopPart: "afternoon", departureTime: formatTime(scheduled.morningEnd), driveMinutes: 0, baseDriveMinutes: 0, driveBufferMinutes: 0, km: 0, arrivalTime: formatTime(scheduled.afternoonStart), serviceStartTime: formatTime(scheduled.afternoonStart), durationMinutes: scheduled.afternoonWork, serviceEndTime: formatTime(scheduled.afternoonEnd), warnings: [], targetArrivalTime: "" });
      totalWaitMinutes += scheduled.waitMinutes;
      if (!scheduled.lunchIncluded) {
        totalWaitMinutes += (scheduled.afternoonStart - scheduled.morningEnd);
      }
      currentTime = scheduled.afternoonEnd;
    } else {
      const effDur = scheduled.effectiveDuration ?? stop.durationMinutes;
      const fwProps = scheduled.fixedWindow ? { fixedWindow: true } : {};
      rows.push({ ...baseRow, ...fwProps, serviceStartTime: formatTime(scheduled.serviceStart), durationMinutes: effDur, serviceEndTime: formatTime(scheduled.serviceEnd), warnings: rowWarnings });
      totalWaitMinutes += scheduled.waitMinutes;
      currentTime = scheduled.serviceEnd;
    }

    totalKm += leg.km;
    totalDriveMinutes += leg.driveMinutes;
    totalWorkMinutes += scheduled.effectiveDuration ?? stop.durationMinutes;
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
  if (departureLatestMinutes != null && dayStart > departureLatestMinutes) {
    allWarnings.push({ msg: `partenza oltre la finestra (${formatTime(dayStart)} > ${formatTime(departureLatestMinutes)})`, level: "warn" });
  }
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
  // Senza coordinate correnti non possiamo valutare la distanza → nessuna sosta
  if (!fromLat || !fromLng) return null;
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
  // dynamicSplit rows are created inside insertBreaks and need full shifting like normal rows.
  if (row.fixedWindow && !row.dynamicSplit) {
    // Fixed-window stops have absolute service times.
    // Afternoon part: all times anchored to fixed anchors — no shift.
    if (row.stopPart === "afternoon") return row;
    // First/only part: shift only the travel leg (dep + arr), keep service times fixed.
    return {
      ...row,
      departureTime: formatTime(parseTime(row.departureTime) + minutes),
      arrivalTime: formatTime(parseTime(row.arrivalTime) + minutes)
    };
  }
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
    scheduledDate = null,
    lunchFixedTime = null
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
  // Converti deviazione max da minuti a km (velocità media 50 km/h)
  const maxDetourMin = Number(options?.maxDetourMin ?? options?.maxDetourKm ?? 10);
  const maxDetourKm = maxDetourMin / 60 * 50;

  // ── insertions list ──────────────────────────────────────────────────────────
  const insertions = [];

  // ── debug log ────────────────────────────────────────────────────────────────
  const debugLog = [];
  const L = (...parts) => debugLog.push(parts.join(" "));
  L(`=== PIANO SOSTE ${scheduledDate || "?"} ===`);
  L(`dayStart=${formatTime(dayStart)} finalArrival=${formatTime(finalArrival)}`);
  L(`REST_MIN=${REST_MIN}min REST_MAX=${REST_MAX}min maxDetourKm=${maxDetourKm.toFixed(1)}km`);
  L(`soste salvate=${restStops.length} ristoranti salvati=${restaurantStops.length}`);

  // ── 1. Pausa pranzo ──────────────────────────────────────────────────────────
  const makeLunchEntry = async (beforeIndex, refRow, nextRow, lunchTimeMin) => {
    const fromRow = refRow || (beforeIndex > 0 ? rows[beforeIndex - 1] : null);
    const toRow = nextRow || (beforeIndex < rows.length ? rows[beforeIndex] : null);
    L(`  pranzo: da "${fromRow?.customer||"?"}" (${fromRow?.lat?.toFixed(4)||"?"}) verso "${toRow?.customer||"?"}" ore=${formatTime(lunchTimeMin)}`);
    // Ristoranti salvati: se è "sul percorso" (perpendicolare ≤ 2 km) non c'è limite di distanza
    // lungo la strada (posso guidare 30 min se è sulla mia via). Se è "fuori percorso" si applica
    // il limite maxDetourKm come deviazione massima accettabile.
    const ON_ROUTE_PERP_KM = 2.0;
    let savedSpot = findNearestRestStop(restaurantStops, fromRow?.lat, fromRow?.lng, toRow?.lat, toRow?.lng, maxDetourKm, lunchTimeMin, scheduledDate);
    let savedSpotOnRoute = false;
    if (savedSpot && fromRow?.lat && fromRow?.lng && toRow?.lat && toRow?.lng) {
      const { perpKm } = perpDistToSegment(savedSpot.lat, savedSpot.lng, fromRow.lat, fromRow.lng, toRow.lat, toRow.lng);
      const isOnRoute = perpKm <= ON_ROUTE_PERP_KM;
      if (!isOnRoute) {
        const directKm = haversineKm({ lat: fromRow.lat, lng: fromRow.lng }, { lat: savedSpot.lat, lng: savedSpot.lng });
        if (directKm > maxDetourKm) { L(`    savedRist "${savedSpot.customer}" SCARTATO fuori-percorso perp=${perpKm.toFixed(1)}km direct=${directKm.toFixed(1)}km > max=${maxDetourKm.toFixed(1)}km`); savedSpot = null; }
        else L(`    savedRist "${savedSpot.customer}" fuori-percorso perp=${perpKm.toFixed(1)}km direct=${directKm.toFixed(1)}km OK`);
      } else {
        savedSpotOnRoute = true;
        L(`    savedRist "${savedSpot.customer}" SUL_PERCORSO perp=${perpKm.toFixed(1)}km OK`);
      }
    } else if (!savedSpot) {
      L(`    savedRist: nessuno entro maxDetourKm=${maxDetourKm.toFixed(1)}km`);
    }
    const spot = savedSpot || (fromRow?.lat
      ? await findNearbyRestaurant(fromRow.lat, fromRow.lng, fromRow.lat, fromRow.lng, toRow?.lat, toRow?.lng, Math.round(maxDetourKm * 1000 * 1.5), lunchTimeMin, scheduledDate, maxDetourKm)
          .then(r => { L(`    PlacesAPI ristorante: ${r ? `"${r.customer}" (${r.rating}⭐)` : "nessuno"}`); return r; })
          .catch(e => { L(`    PlacesAPI ristorante: errore ${e.message}`); return null; })
      : null);
    if (!spot) { L(`    → Pausa pranzo senza luogo`); return { beforeIndex, type: "lunch", duration: lunchBreakMinutes, customer: "Pausa pranzo" }; }
    // Per ristoranti sul percorso il detour è ~0 (ci si passa sopra); travelKm conta solo per fuori-percorso
    const spotOnRoute = savedSpotOnRoute || (() => {
      if (!fromRow?.lat || !fromRow?.lng || !toRow?.lat || !toRow?.lng || !spot.lat || !spot.lng) return false;
      const { perpKm } = perpDistToSegment(spot.lat, spot.lng, fromRow.lat, fromRow.lng, toRow.lat, toRow.lng);
      return perpKm <= ON_ROUTE_PERP_KM;
    })();
    const travelKm = spotOnRoute ? 0 : (fromRow?.lat && fromRow?.lng && spot.lat && spot.lng)
      ? haversineKm({ lat: fromRow.lat, lng: fromRow.lng }, { lat: spot.lat, lng: spot.lng })
      : 0;
    const travelMin = Math.round(travelKm / 50 * 60);
    if (lunchTimeMin + travelMin > LUNCH_CLOSE) {
      L(`    "${spot.customer}" SCARTATO arrivo=${formatTime(lunchTimeMin + travelMin)} > LUNCH_CLOSE=${formatTime(LUNCH_CLOSE)}`);
      return { beforeIndex, type: "lunch", duration: lunchBreakMinutes, customer: "Pausa pranzo" };
    }
    L(`    → PRANZO "${spot.customer}" travelMin=${travelMin} arrivo=${formatTime(lunchTimeMin + travelMin)}`);
    const label = spot.rating ? `${spot.customer} · ⭐ ${spot.rating} (${spot.reviewCount})` : spot.customer;
    return { beforeIndex, type: "lunch", duration: lunchBreakMinutes, travelMinutes: travelMin, travelKm,
      customer: label, location: spot.location || "", address: spot.fullAddress || "",
      lat: spot.lat ?? null, lng: spot.lng ?? null, placeId: spot.placeId ?? null };
  };

  if (lunchBreakEnabled) {
    let placed = false;

    // 1. Fixed-window stop spanning lunch: insert lunch at fixed time (no timeShift)
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].lunchIncluded && rows[i].stopPart === "morning") {
        const lunchAt = parseTime(rows[i].serviceEndTime);
        const lunchEntry = await makeLunchEntry(i + 1, rows[i], rows[i + 1] ?? null, lunchAt);
        lunchEntry.lunchForFixed = true;
        lunchEntry.fixedLunchAt = lunchAt;
        lunchEntry.noTimeShift = true;
        insertions.push(lunchEntry);
        placed = true;
        break;
      }
    }

    // 2. User-specified fixed lunch time
    if (!placed && lunchFixedTime != null) {
      const fixedMin = typeof lunchFixedTime === "number" ? lunchFixedTime
        : (() => { const [h, m] = String(lunchFixedTime).split(":"); return Number(h) * 60 + Number(m || 0); })();

      // Check if fixedMin falls within a stop's service time — split it
      let splitIdx = -1;
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].stopPart === "afternoon") continue;
        const svcStart = parseTime(rows[i].serviceStartTime ?? rows[i].arrivalTime);
        const svcEnd = parseTime(rows[i].serviceEndTime);
        if (svcStart != null && svcEnd != null && fixedMin > svcStart && fixedMin < svcEnd) {
          splitIdx = i;
          break;
        }
      }

      if (splitIdx >= 0) {
        const row = rows[splitIdx];
        const svcStart = parseTime(row.serviceStartTime ?? row.arrivalTime);
        const svcEnd = parseTime(row.serviceEndTime);
        const morningWork = fixedMin - svcStart;
        const afternoonWork = svcEnd - fixedMin;

        // Morning part: arrival → fixedMin (times are absolute; will be shifted by prior breaks via shiftRowTimes)
        const morningRow = {
          ...row,
          stopPart: "morning",
          dynamicSplit: true,
          lunchIncluded: true,
          durationMinutes: morningWork,
          serviceEndTime: formatTime(fixedMin),
          departureTime: formatTime(fixedMin),
        };
        // Afternoon part: base times start at fixedMin (will be shifted by timeShift = prior breaks + lunchBreakMinutes)
        const afternoonRow = {
          ...row,
          stopPart: "afternoon",
          dynamicSplit: true,
          lunchIncluded: true,
          durationMinutes: afternoonWork,
          arrivalTime: formatTime(fixedMin),
          serviceStartTime: formatTime(fixedMin),
          serviceEndTime: formatTime(svcEnd),
          departureTime: row.departureTime,
          driveMinutes: 0,
          baseDriveMinutes: 0,
          driveBufferMinutes: 0,
          km: 0,
        };

        rows.splice(splitIdx, 1, morningRow, afternoonRow);
        const lunchEntry = await makeLunchEntry(splitIdx + 1, morningRow, afternoonRow, fixedMin);
        // Use fixed-time placement so the lunch appears at exactly fixedMin, not at rows[i].departureTime
        lunchEntry.lunchForFixed = true;
        lunchEntry.fixedLunchAt = fixedMin;
        insertions.push(lunchEntry);
      } else {
        // fixedMin falls in a gap between stops
        let insertIdx = 0;
        for (let i = 0; i < rows.length; i++) {
          const end = parseTime(rows[i].serviceEndTime);
          if (end != null && end <= fixedMin) insertIdx = i + 1;
        }
        const lunchEntry = await makeLunchEntry(insertIdx, rows[insertIdx - 1] ?? null, rows[insertIdx] ?? null, fixedMin);
        lunchEntry.lunchForFixed = true;
        lunchEntry.fixedLunchAt = fixedMin;
        insertions.push(lunchEntry);
      }
      placed = true;
    }

    // 3. Normal window-based scanning (only if not already placed)
    if (!placed) {
      L(`--- PRANZO finestra [${formatTime(LUNCH_OPEN)}-${formatTime(LUNCH_CLOSE)}] ---`);
      for (let i = 0; i < rows.length; i++) {
        const dep = parseTime(rows[i].departureTime);
        L(`  row[${i}] "${rows[i].customer}" dep=${formatTime(dep)} ${dep >= LUNCH_OPEN && dep <= LUNCH_CLOSE ? "IN_FINESTRA ✓" : "fuori"}`);
        if (dep >= LUNCH_OPEN && dep <= LUNCH_CLOSE) {
          insertions.push(await makeLunchEntry(i, rows[i - 1] ?? null, rows[i], dep));
          placed = true;
          break;
        }
      }
      if (!placed && rows.length > 0) {
        const lastEnd = parseTime(rows[rows.length - 1].serviceEndTime);
        L(`  fallback: lastEnd=${formatTime(lastEnd)} ${lastEnd >= LUNCH_OPEN && lastEnd <= LUNCH_CLOSE ? "IN_FINESTRA" : "fuori → nessun pranzo"}`);
        if (lastEnd >= LUNCH_OPEN && lastEnd <= LUNCH_CLOSE) {
          insertions.push(await makeLunchEntry(rows.length, rows[rows.length - 1], null, lastEnd));
        }
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
    // Don't insert rest stops before a fixed-window afternoon continuation
    if (rows[beforeIndex]?.fixedWindow && rows[beforeIndex]?.stopPart === "afternoon") {
      return false;
    }
    // Soste salvate: perpendicolare ≤ 2 km = "sul percorso" (nessun limite distanza).
    // Se fuori percorso il limite haversine è maxDetourKm.
    let spot = findNearestRestStop(restStops, refLat, refLng, toLat, toLng, 2.0, breakTimeMin, scheduledDate);
    if (spot) { L(`    savedSosta "${spot.customer}" trovata`); }
    if (!spot && refLat && refLng) {
      spot = await findNearbyRestStop(refLat, refLng, fromLat, fromLng, toLat, toLng, 15000, breakTimeMin, scheduledDate, maxDetourKm, (msg) => L(`    ${msg}`))
        .then(r => { L(`    PlacesAPI sosta @ (${refLat?.toFixed(4)},${refLng?.toFixed(4)}): ${r ? `"${r.customer}"` : "nessuna"}`); return r; })
        .catch(e => { L(`    PlacesAPI sosta: errore ${e.message}`); return null; });
    }
    if (!spot) { L(`    → nessun posto trovato, cumulative preservato`); return false; }
    const label = spot.rating
      ? `${spot.customer} · ⭐ ${spot.rating} (${spot.reviewCount})`
      : spot.customer;
    const warnings = spot.openAtBreak === false
      ? [{ msg: `La sosta "${spot.customer}" potrebbe essere chiusa all'orario previsto`, level: "warn" }]
      : [];
    // Per soste sul percorso (perp ≤ 2km) il detour è ~0; travelKm conta solo fuori-percorso
    let travelKm = 0;
    if (refLat != null && refLng != null && spot.lat != null && spot.lng != null) {
      const rawKm = haversineKm({ lat: refLat, lng: refLng }, { lat: spot.lat, lng: spot.lng });
      if (toLat != null && toLng != null) {
        const { perpKm } = perpDistToSegment(spot.lat, spot.lng, refLat, refLng, toLat, toLng);
        if (perpKm > 2.0) {
          if (rawKm > maxDetourKm) { L(`    "${spot.customer}" SCARTATO fuori-percorso perp=${perpKm.toFixed(1)}km travel=${rawKm.toFixed(1)}km > max=${maxDetourKm.toFixed(1)}km`); return false; }
          travelKm = rawKm;
        }
        // Sul percorso (perp ≤ 2km): travelKm = 0, ci si passa già sopra
      } else {
        travelKm = rawKm;
      }
    }
    const travelMin = Math.round(travelKm / 50 * 60);
    insertions.push({
      beforeIndex, type: "rest", duration: REST_DUR,
      driveOffset, travelMinutes: travelMin, travelKm,
      customer: label,
      location: spot.location || "",
      address: spot.fullAddress || "",
      lat: spot.lat ?? null,
      lng: spot.lng ?? null,
      placeId: spot.placeId ?? null,
      openAtBreak: spot.openAtBreak ?? null,
      warnings
    });
    L(`    → SOSTA "${spot.customer}" travelMin=${Math.round(travelKm/50*60)} before[${beforeIndex}]`);
    cumulative = 0;
    return true;
  };

  for (let i = 0; i < rows.length; i++) {
    // If lunch is inserted before this row, reset cumulative — lunch resets the rest-stop clock
    if (lunchIns && lunchIns.beforeIndex === i) {
      cumulative = 0;
      // Advance prevServiceEnd past lunch duration + travel to restaurant (for accurate post-lunch timings)
      prevServiceEnd = prevServiceEnd + lunchBreakMinutes + (lunchIns.travelMinutes || 0);
    }

    const row = rows[i];
    let remainingDrive = row.driveMinutes || 0;
    const workMin = row.durationMinutes || 0;
    let driveConsumed = 0;
    let noSpotFound = false;
    L(`[i=${i}] "${row.customer}" drive=${remainingDrive}min work=${workMin}min cumul=${cumulative}`);

    // Mid-leg breaks
    while (remainingDrive > 0 && cumulative + remainingDrive >= REST_MIN) {
      const needed = Math.max(0, REST_MIN - cumulative);
      const fraction = needed / (row.driveMinutes || 1);
      const interpLat = (lastLat != null && row.lat != null) ? lastLat + (row.lat - lastLat) * fraction : (row.lat ?? lastLat);
      const interpLng = (lastLng != null && row.lng != null) ? lastLng + (row.lng - lastLng) * fraction : (row.lng ?? lastLng);
      const breakTime = prevServiceEnd + driveConsumed + needed;
      const valid = isValidBreakTime(breakTime);
      L(`  mid-leg needed=${needed}min breakTime=${formatTime(breakTime)} valid=${valid}`);
      if (!valid) break;
      const inserted = await tryInsert(i, interpLat, interpLng, lastLat, lastLng, row.lat, row.lng, driveConsumed + needed, breakTime);
      if (!inserted) { noSpotFound = true; break; }
      driveConsumed += needed;
      remainingDrive -= needed;
    }

    if (noSpotFound) {
      const minutesTried = Math.max(0, REST_MIN - cumulative);
      cumulative += Math.min(minutesTried, remainingDrive);
      L(`  noSpot: cumul→${cumulative}`);
    } else {
      cumulative += remainingDrive;
    }

    cumulative += workMin;
    prevServiceEnd = parseTime(row.serviceEndTime) || prevServiceEnd;
    L(`  post-work: cumul=${cumulative} prevEnd=${formatTime(prevServiceEnd)}`);

    if (cumulative >= REST_MIN && i < rows.length - 1) {
      const breakTime = prevServiceEnd;
      const nextRow = rows[i + 1];
      const valid = isValidBreakTime(breakTime);
      L(`  post-work break: breakTime=${formatTime(breakTime)} valid=${valid}`);
      if (valid) {
        await tryInsert(i + 1, row.lat, row.lng, row.lat, row.lng, nextRow?.lat, nextRow?.lng, 0, breakTime);
      }
    }

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
      let refDep, brkEnd;
      const travelMin = brk.lunchForFixed ? 0 : (brk.travelMinutes || 0);
      const travelKm = brk.lunchForFixed ? 0 : (brk.travelKm || 0);
      if (brk.lunchForFixed) {
        // Fixed-window lunch: use the exact baked-in time, no shift
        refDep = brk.fixedLunchAt;
        brkEnd = refDep + brk.duration;
      } else {
        const baseDep = i < rows.length
          ? parseTime(rows[i].departureTime) + timeShift
          : parseTime(rows[rows.length - 1].serviceEndTime) + timeShift;
        refDep = baseDep + (brk.driveOffset || 0);
        brkEnd = refDep + travelMin + brk.duration;
      }
      result.push({
        type: brk.type,
        stopNumber: null,
        customer: brk.customer || "",
        location: brk.location || "",
        address: brk.address || "",
        lat: brk.lat ?? null,
        lng: brk.lng ?? null,
        departureTime: formatTime(refDep),
        arrivalTime: formatTime(refDep + travelMin),
        serviceStartTime: formatTime(refDep + travelMin),
        serviceEndTime: formatTime(brkEnd),
        durationMinutes: brk.duration,
        warnings: brk.warnings || [],
        driveMinutes: travelMin,
        baseDriveMinutes: travelMin,
        driveBufferMinutes: 0,
        km: Number(travelKm.toFixed(1)),
        legSource: "break"
      });
      if (!brk.noTimeShift) timeShift += travelMin + brk.duration;
    }
    if (i < rows.length) {
      result.push(shiftRowTimes(rows[i], timeShift));
      // After the last part of a static fixed-window stop, reset timeShift.
      // Subsequent stops were planned from the fixed window's serviceEndTime (absolute),
      // so they must not be shifted by breaks inserted before the fixed window.
      // dynamicSplit rows are NOT static — their times are relative and should keep the shift.
      if (rows[i].fixedWindow && !rows[i].dynamicSplit && (!rows[i].stopPart || rows[i].stopPart === "afternoon")) {
        timeShift = 0;
      }
    }
  }

  L(`=== FINE: ${insertions.length} inserzioni timeShift=${timeShift}min ===`);
  return { rows: result, addedMinutes: timeShift, debugLog };
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

  // Lock first stop: if any stop has fixedFirst=true, move it to front and lock it
  const fixedFirstIdx = stopsWithNodeIndex.findIndex(s => s.fixedFirst === true);
  if (fixedFirstIdx > 0) {
    const [removed] = stopsWithNodeIndex.splice(fixedFirstIdx, 1);
    stopsWithNodeIndex.unshift(removed);
  }
  const firstStopFixed = stopsWithNodeIndex.length > 1 && (
    firstArrivalRequired !== null || stopsWithNodeIndex[0]?.fixedFirst === true
  );
  const lockedFirst = firstStopFixed ? stopsWithNodeIndex[0] : null;
  const reorderable = lockedFirst ? stopsWithNodeIndex.slice(1) : stopsWithNodeIndex;

  const departureLatestMinutes = payload.departureLatest ? parseTime(payload.departureLatest) : null;
  const _lb = payload.lunchBreak;
  const lunchBreakEnabled = (_lb === false || _lb === "false" || _lb === "off") ? false
    : (_lb === true || _lb === "true" || _lb === "on") ? true
    : settings.lunchBreakEnabled !== false;
  const lunchBreakMinutes = Number(payload.lunchBreakMinutes ?? settings.lunchBreakMinutes ?? 45);
  const _parseLunchT = v => { if (v == null) return null; if (typeof v === "number") return v; const [h, m] = String(v).split(":"); return Number(h) * 60 + Number(m || 0); };
  const lunchOpenMin = _parseLunchT(settings?.lunchOpenTime) ?? (11 * 60 + 30);
  const lunchCloseMin = _parseLunchT(settings?.lunchCloseTime) ?? (14 * 60);
  const lunchFixedTime = payload.lunchFixedTime && String(payload.lunchFixedTime).trim() ? payload.lunchFixedTime : null;
  const context = { nodes, matrix, startMinutes, firstArrivalRequired, rates, timingMode, arrivalLeadMinutes, departureLatestMinutes,
                    lunchEnabled: lunchBreakEnabled, lunchOpen: lunchOpenMin, lunchClose: lunchCloseMin, lunchDuration: lunchBreakMinutes };
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
  const activeRestStops = restStops.filter(s => s.addressType === "rest");
  const activeRestaurantStops = restStops.filter(s => s.addressType === "restaurant");
  const maxReturnTime = settings?.maxReturnTime ? parseTime(settings.maxReturnTime) : null;
  const actualFinalArrival = parseTime(best.finalLeg.arrivalTime);
  const { rows: enrichedRows, addedMinutes, debugLog } = await insertBreaks(best.rows, {
    lunchBreakEnabled, lunchBreakMinutes, lunchFixedTime,
    restStops: activeRestStops,
    restaurantStops: activeRestaurantStops,
    dayStart: parseTime(best.summary.dayStart),
    finalArrival: maxReturnTime != null ? Math.max(actualFinalArrival, maxReturnTime) : actualFinalArrival,
    restIntervalMin: settings?.restIntervalMin ?? 120,
    restMaxDeviationMin: settings?.restMaxDeviationMin ?? 40,
    restDurationMin: settings?.restDurationMin ?? 15,
    earliestBreakTime: settings?.earliestBreakTime != null ? parseTime(settings.earliestBreakTime) : (8 * 60),
    maxDetourMin: settings?.maxDetourMin ?? 10,
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
    summary: (() => {
      const breakDriveMin = enrichedRows
        .filter(r => r.type === "rest" || r.type === "lunch")
        .reduce((s, r) => s + (r.driveMinutes || 0), 0);
      const totalDriveMinutes = best.summary.totalDriveMinutes + breakDriveMin;
      return {
        ...best.summary,
        totalDriveMinutes,
        totalDriveHours: minutesToHours(totalDriveMinutes),
        dayEnd: formatTime(parseTime(best.summary.dayEnd) + addedMinutes),
        totalDayMinutes: best.summary.totalDayMinutes + addedMinutes
      };
    })()
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
    lunchBreak: lunchBreakEnabled,
    lunchBreakMinutes,
    lunchFixedTime: lunchFixedTime || "",
    maxReturnTime: payload.departureLatest || "",
    mapMode: [...new Set(best.rows.map((row) => row.legSource).concat(best.finalLeg.source))].join(", "),
    debugLog: debugLog || []
  };
}
