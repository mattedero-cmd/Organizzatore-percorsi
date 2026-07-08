import { routeBetween, resolvePlace } from "./googleMapsService.js";

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
    timeWindowMode: stop.timeWindowMode || "available",
    breakOrigin: stop.breakOrigin || null,
    userPicked: stop.userPicked === true
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
  const { lunchEnabled = false, lunchOpen = null, lunchDuration = 45, lunchClose = null } = opts;
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
      let nextWin = windows[wi + 1];
      // If no explicit next window but lunch is enabled, infer afternoon start after lunch
      if (!nextWin && lunchEnabled && lunchOpen !== null && win.end <= (lunchClose ?? lunchOpen + lunchDuration)) {
        const inferredAfternoonStart = lunchClose ?? lunchOpen + lunchDuration;
        nextWin = { start: inferredAfternoonStart, end: inferredAfternoonStart + 240, inferred: true };
      }
      if (nextWin && serviceStart < win.end) {
        const morningWork = win.end - serviceStart;
        const afternoonWork = stop.durationMinutes - morningWork;
        const splitFits = afternoonWork > 0 && nextWin.start + afternoonWork <= nextWin.end;
        const afternoonOnlyFits = nextWin.start + stop.durationMinutes <= nextWin.end;
        const buildSplit = () => ({
          split: true,
          morningStart: serviceStart,
          morningEnd: win.end,
          morningWork,
          afternoonStart: nextWin.start,
          afternoonEnd: nextWin.start + afternoonWork,
          afternoonWork,
          waitMinutes,
          warnings
        });
        // Substantial morning slice that fits across both windows → split.
        if (morningWork >= 45 && splitFits) return buildSplit();
        // Thin morning slice but the whole job fits after the closure → do it all there
        // (avoids leaving a useless sliver in the morning).
        if (afternoonOnlyFits) {
          return { split: false, serviceStart: nextWin.start, serviceEnd: nextWin.start + stop.durationMinutes,
            waitMinutes: nextWin.start - arrival, warnings: [...warnings, { msg: "intervento spostato al pomeriggio", level: "info" }] };
        }
        // The afternoon alone can't hold the whole job → split anyway, even with a thin
        // morning slice: it's the only way to respect the closing hours, and the closure
        // gap then becomes the natural lunch break.
        if (splitFits) return buildSplit();
      }

      warnings.push({ msg: `intervento oltre chiusura ${win.label.toLowerCase()}`, level: "error" });
    }
  }

  // Safety net: arrival falls in a gap between two windows (e.g. lunch closure after timeShift)
  for (let i = 0; i < windows.length - 1; i++) {
    const curr = windows[i];
    const next = windows[i + 1];
    if (arrival > curr.end && arrival < next.start) {
      const waitMin = next.start - arrival;
      warnings.push({ msg: "arrivo durante chiusura — spostato all'apertura pomeridiana", level: "info" });
      if (next.start + stop.durationMinutes <= next.end) {
        return { split: false, serviceStart: next.start, serviceEnd: next.start + stop.durationMinutes, waitMinutes: waitMin, warnings };
      }
      // Overflows next window too — schedule from next.start anyway with overflow warning
      warnings.push({ msg: "intervento supera la chiusura pomeridiana", level: "warn" });
      return { split: false, serviceStart: next.start, serviceEnd: next.start + stop.durationMinutes, waitMinutes: waitMin, warnings };
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
          lunchEnabled = false, lunchOpen = null, lunchClose = null, lunchDuration = 45 } = context;
  const lunchOpts = { lunchEnabled, lunchOpen, lunchClose, lunchDuration };
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
      breakOrigin: stop.breakOrigin || null,
      userPicked: stop.userPicked || false,
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

// Orario di chiusura (in minuti) del candidato d'archivio per scheduledDate, considerando
// la finestra che copre arrivalMin. null se sconosciuto. Usa weeklyHours o open/close.
function candidateCloseMin(candidate, scheduledDate, arrivalMin) {
  const targetDay = (scheduledDate && arrivalMin != null)
    ? (() => { const [y, m, d] = scheduledDate.split("-").map(Number); return new Date(y, m - 1, d).getDay(); })()
    : null;
  if (targetDay === null) return null;
  if (candidate.weeklyHours) {
    const day = candidate.weeklyHours[String(targetDay)] || candidate.weeklyHours[targetDay];
    if (!day || day.closed) return null;
    const normalized = normalizeStop(candidate, 0, targetDay);
    for (const w of getWindows(normalized)) {
      if (arrivalMin >= w.start && arrivalMin < w.end) return w.end;
    }
    return null;
  }
  if (candidate.openMorning || candidate.closeAfternoon || candidate.closeMorning) {
    const normalized = normalizeStop(candidate, 0, null);
    for (const w of getWindows(normalized)) {
      if (arrivalMin >= w.start && arrivalMin < w.end) return w.end;
    }
    return null;
  }
  return null;
}

// Soste/ristoranti salvati in archivio più vicini al segmento [from → to], ordinati per
// distanza, scartando quelli definitivamente chiusi all'orario della pausa.
function findNearestRestStop(restStops, fromLat, fromLng, toLat, toLng, maxPerpKm = 2.0, breakTimeMin = null, scheduledDate = null, maxDirectKm = null) {
  if (!restStops.length) return [];
  if (!fromLat || !fromLng) return [];
  const hasSegment = toLat != null && toLng != null;
  const targetDay = (breakTimeMin != null && scheduledDate)
    ? (() => { const [y, m, d] = scheduledDate.split("-").map(Number); return new Date(y, m - 1, d).getDay(); })()
    : null;

  const candidates = [];
  for (const s of restStops) {
    if (!s.lat || !s.lng) continue;
    if (maxDirectKm != null) {
      const directKm = haversineKm({ lat: fromLat, lng: fromLng }, { lat: s.lat, lng: s.lng });
      if (directKm > maxDirectKm) continue;
    }
    let distKm;
    if (hasSegment) {
      const { perpKm } = perpDistToSegment(s.lat, s.lng, fromLat, fromLng, toLat, toLng);
      if (perpKm > maxPerpKm) continue;
      distKm = perpKm;
    } else {
      distKm = haversineKm({ lat: fromLat, lng: fromLng }, { lat: s.lat, lng: s.lng });
      if (distKm > 15) continue;
    }
    let openAtBreak = null;
    if (targetDay !== null && breakTimeMin != null && s.weeklyHours) {
      const day = s.weeklyHours[String(targetDay)] || s.weeklyHours[targetDay];
      if (day?.closed) openAtBreak = false;
      else if (day) {
        const windows = getWindows(normalizeStop(s, 0, targetDay));
        openAtBreak = windows.length === 0 ? null
          : windows.some(w => breakTimeMin >= w.start && breakTimeMin < w.end);
      }
    }
    candidates.push({ s, distKm, openAtBreak });
  }
  if (!candidates.length) return [];
  const open = candidates.filter(c => c.openAtBreak === true).sort((a, b) => a.distKm - b.distKm);
  const unknown = candidates.filter(c => c.openAtBreak === null).sort((a, b) => a.distKm - b.distKm);
  return [...open, ...unknown].map(c => c.s);
}

// Latest closing minute applicable to a row (user window > afternoon > morning).
function rowCloseMinutes(row) {
  if (row.timeTo) { const t = parseTime(row.timeTo); if (t != null) return t; }
  const ca = parseTime(row.closeAfternoon);
  if (ca != null) return ca;
  const cm = parseTime(row.closeMorning);
  if (cm != null) return cm;
  return null;
}

function shiftRowTimes(row, minutes) {
  if (!minutes) return row;
  // Afternoon split parts have absolute service times — anchored to the shop's
  // afternoon opening (opening-hours split) or to a user fixed window. Any breaks
  // inserted before them sit inside the midday closure gap and are absorbed by it,
  // so these rows must NOT shift. (dynamicSplit afternoon parts use relative times.)
  if (row.stopPart === "afternoon" && !row.dynamicSplit) return row;
  // dynamicSplit rows are created inside insertBreaks and need full shifting like normal rows.
  if (row.fixedWindow && !row.dynamicSplit) {
    // First/only part of a fixed-window stop: shift only the travel leg (dep + arr), keep service times fixed.
    return {
      ...row,
      departureTime: formatTime(parseTime(row.departureTime) + minutes),
      arrivalTime: formatTime(parseTime(row.arrivalTime) + minutes)
    };
  }
  // Stops with opening-hour wait time: shift arrival but re-anchor service start to max(newArrival, origServiceStart).
  // This prevents breaks inserted before the stop from pushing the service into closed hours.
  const origArr = parseTime(row.arrivalTime);
  const origSvc = parseTime(row.serviceStartTime);
  if (origSvc != null && origArr != null && origSvc > origArr) {
    const newArr = origArr + minutes;
    const newSvc = Math.max(newArr, origSvc);
    const newEnd = newSvc + Number(row.durationMinutes);
    // Breaks before this stop can push the service start past the opening; if the
    // pushed-back service now ends after closing, warn instead of silently overrunning.
    const close = rowCloseMinutes(row);
    const overrunMsg = "intervento oltre l'orario di chiusura per soste accumulate";
    let warnings = row.warnings || [];
    if (close != null && newEnd > close && !warnings.some(w => (w.msg || w) === overrunMsg)) {
      warnings = [...warnings, { msg: overrunMsg, level: "warn" }];
    }
    // Se dopo lo spostamento l'arrivo cade comunque prima dell'apertura (attesa residua),
    // segnalalo: lo si vede solo qui, perché scheduleStop calcola il warning sull'orario
    // di arrivo precedente alle pause inserite (che possono averlo posticipato).
    const preOpenMsg = "arrivo prima dell'apertura";
    if (newSvc > newArr && !warnings.some(w => (w.msg || w) === preOpenMsg)) {
      warnings = [...warnings, { msg: preOpenMsg, level: "warn" }];
    }
    return {
      ...row,
      departureTime: formatTime(parseTime(row.departureTime) + minutes),
      arrivalTime: formatTime(newArr),
      serviceStartTime: formatTime(newSvc),
      serviceEndTime: formatTime(newEnd),
      warnings
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
    lunchFixedTime = null,
    lunchFixedSpot = null, // locale scelto a mano dall'utente: forza SOLO la posizione geografica del pranzo, non l'orario
    restBreaksEnabled = true, // false → nessuna sosta automatica (l'utente le ha disattivate/eliminate per questo giro)
    homeLat = null, homeLng = null
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

  // ── 1. Pausa pranzo ──────────────────────────────────────────────────────────
  // Cerca un ristorante salvato in ARCHIVIO vicino al punto del pranzo: se trovato, la pausa
  // diventa una vera tappa (dati + travel reale del detour). Altrimenti scheda neutra
  // (posizione stimata) che l'utente può riempire toccandola e scegliendo su Maps.
  const ON_ROUTE_PERP_KM = 2.0;
  const makeLunchEntry = async (beforeIndex, refRow, nextRow, lunchTimeMin, effectiveLunchClose = LUNCH_CLOSE, maxDetourKmOverride = null) => {
    const fromRow = refRow || (beforeIndex > 0 ? rows[beforeIndex - 1] : null);
    const toRow   = nextRow  || (beforeIndex < rows.length ? rows[beforeIndex] : null);
    const _maxDetourKmL = maxDetourKmOverride ?? maxDetourKm;
    // Posizione stimata (midpoint) — usata sia come fallback neutro sia come centro ricerca
    let estLat = null, estLng = null;
    if (fromRow?.lat && toRow?.lat) { estLat = (fromRow.lat + toRow.lat) / 2; estLng = (fromRow.lng + toRow.lng) / 2; }
    else if (fromRow?.lat) { estLat = fromRow.lat; estLng = fromRow.lng; }
    else if (toRow?.lat) { estLat = toRow.lat; estLng = toRow.lng; }

    const calcTravelMin = (cand, from, to) => {
      if (!from?.lat || !from?.lng || !cand.lat || !cand.lng) return 0;
      if (to?.lat && to?.lng) {
        const { perpKm, t } = perpDistToSegment(cand.lat, cand.lng, from.lat, from.lng, to.lat, to.lng);
        if (perpKm <= ON_ROUTE_PERP_KM) {
          const segKm = haversineKm({ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng });
          return Math.round(t * segKm / 50 * 60);
        }
        const rawKm = haversineKm({ lat: from.lat, lng: from.lng }, { lat: cand.lat, lng: cand.lng });
        return rawKm > _maxDetourKmL ? Infinity : Math.round(rawKm / 50 * 60);
      }
      return Math.round(haversineKm({ lat: from.lat, lng: from.lng }, { lat: cand.lat, lng: cand.lng }) / 50 * 60);
    };

    // Locale scelto a mano: usa QUESTO (posizione fissa), mantenendo la posizione temporale
    // calcolata dal planner. Niente ricerca in archivio, niente filtro deviazione: l'utente
    // ha scelto esplicitamente questo ristorante.
    if (lunchFixedSpot && lunchFixedSpot.lat != null && lunchFixedSpot.lng != null) {
      const tm = calcTravelMin(lunchFixedSpot, fromRow, toRow);
      // Locale fuori corridoio (calcTravelMin = Infinity): conta comunque il tragitto reale
      // (haversine dalla tappa precedente), non azzerarlo, così la giornata non è sottostimata.
      const travelMin = Number.isFinite(tm) ? tm
        : (fromRow?.lat != null && fromRow?.lng != null
            ? Math.round(haversineKm({ lat: fromRow.lat, lng: fromRow.lng }, { lat: lunchFixedSpot.lat, lng: lunchFixedSpot.lng }) / 50 * 60)
            : 0);
      L(`  → PRANZO scelto a mano "${lunchFixedSpot.customer || lunchFixedSpot.address || ""}" travelMin=${travelMin}`);
      return { beforeIndex, type: "lunch", duration: lunchBreakMinutes, travelMinutes: travelMin, travelKm: travelMin / 60 * 50,
        customer: lunchFixedSpot.customer || "Pausa pranzo", location: lunchFixedSpot.location || "",
        address: lunchFixedSpot.address || lunchFixedSpot.fullAddress || "",
        lat: lunchFixedSpot.lat, lng: lunchFixedSpot.lng, weeklyHours: lunchFixedSpot.weeklyHours || null,
        notes: lunchFixedSpot.notes || "", addressId: lunchFixedSpot.addressId ?? null,
        placeAssigned: true, userPicked: true };
    }

    const savedSpots = findNearestRestStop(restaurantStops, fromRow?.lat, fromRow?.lng, toRow?.lat, toRow?.lng, _maxDetourKmL, lunchTimeMin, scheduledDate);
    for (const spot of savedSpots) {
      const tm = calcTravelMin(spot, fromRow, toRow);
      if (tm === Infinity) continue;
      const arrivalMin = lunchTimeMin + tm;
      if (arrivalMin > effectiveLunchClose) continue;
      const spotClose = candidateCloseMin(spot, scheduledDate, arrivalMin);
      if (spotClose !== null && arrivalMin + lunchBreakMinutes > spotClose) continue;
      L(`  → PRANZO da archivio "${spot.customer}" travelMin=${tm}`);
      return { beforeIndex, type: "lunch", duration: lunchBreakMinutes, travelMinutes: tm, travelKm: tm / 60 * 50,
        customer: spot.customer, location: spot.location || "", address: spot.fullAddress || "",
        lat: spot.lat ?? null, lng: spot.lng ?? null, weeklyHours: spot.weeklyHours || null,
        notes: spot.notes || "", addressId: spot.id ?? spot.addressId ?? null, placeAssigned: true };
    }
    L(`  pranzo: nessun ristorante in archivio — scheda neutra (${estLat?.toFixed(4)||"?"},${estLng?.toFixed(4)||"?"})`);
    return { beforeIndex, type: "lunch", duration: lunchBreakMinutes, customer: "", travelMinutes: 0, travelKm: 0, lat: estLat, lng: estLng };
  };

  // Spezza la tappa in rows[splitIdx] a `lunchMin` (mattina: arrivo→lunchMin, pomeriggio:
  // lunchMin→fine) e inserisce il pranzo nel mezzo, all'orario esatto. Stessa logica
  // dell'orario fisso (sezione 2), riusabile anche dal fallback automatico.
  const splitStopForLunch = async (splitIdx, lunchMin) => {
    const row = rows[splitIdx];
    const svcStart = parseTime(row.serviceStartTime ?? row.arrivalTime);
    const svcEnd = parseTime(row.serviceEndTime);
    const morningRow = { ...row, stopPart: "morning", dynamicSplit: true, lunchIncluded: true,
      durationMinutes: lunchMin - svcStart, serviceEndTime: formatTime(lunchMin), departureTime: formatTime(lunchMin) };
    const afternoonRow = { ...row, stopPart: "afternoon", dynamicSplit: true, lunchIncluded: true,
      durationMinutes: svcEnd - lunchMin, arrivalTime: formatTime(lunchMin), serviceStartTime: formatTime(lunchMin),
      serviceEndTime: formatTime(svcEnd), departureTime: row.departureTime, driveMinutes: 0, baseDriveMinutes: 0, driveBufferMinutes: 0, km: 0 };
    rows.splice(splitIdx, 1, morningRow, afternoonRow);
    const lunchEntry = await makeLunchEntry(splitIdx + 1, morningRow, afternoonRow, lunchMin);
    lunchEntry.lunchForFixed = true;
    lunchEntry.fixedLunchAt = lunchMin;
    insertions.push(lunchEntry);
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
          const svcEnd = parseTime(rows[i].serviceEndTime);
          const nextRow = rows[i + 1];
          const isSplitPair = rows[i].stopPart === "morning"
            && nextRow?.stopPart === "afternoon" && nextRow.addressId === rows[i].addressId;
          const gapStart = isSplitPair ? parseTime(rows[i].serviceEndTime) : null;
          const gapEnd   = isSplitPair ? parseTime(nextRow.arrivalTime) : null;
          const gapMin   = (gapStart != null && gapEnd != null) ? gapEnd - gapStart : 0;
          if (isSplitPair && gapMin >= lunchBreakMinutes) {
            // Tappa spezzata per chiusura: il pranzo va nel GAP di chiusura (fra mattina e
            // pomeriggio), non prima della tappa — così si lavora il mattino, si mangia
            // durante la chiusura, e il pomeriggio riparte all'apertura. Limiti del gap
            // come nella Sezione 4 (andata+pranzo+ritorno devono stare nel gap).
            const maxTravelOneWay = Math.max(0, Math.floor((gapMin - lunchBreakMinutes) / 2));
            const gapMaxDetourKm  = Math.min(maxDetourKm, maxTravelOneWay / 60 * 50);
            const gapLunchClose   = gapStart + maxTravelOneWay;
            L(`  → tappa spezzata "${rows[i].customer}": pranzo nel gap chiusura ${formatTime(gapStart)}-${formatTime(gapEnd)} (${gapMin}min)`);
            insertions.push(await makeLunchEntry(i + 1, rows[i], nextRow, gapStart, gapLunchClose, gapMaxDetourKm));
          } else if (!rows[i].stopPart && svcEnd != null && svcEnd >= LUNCH_OPEN && svcEnd <= LUNCH_CLOSE) {
            // Tappa non spezzata che finisce in finestra: fai PRIMA l'intervento e mangia
            // DOPO (vicino alla tappa). Evita di deviare a mangiare per poi tornare a
            // lavorare e che le pause spingano la tappa nella sua chiusura.
            L(`  → pranzo DOPO "${rows[i].customer}" (fine intervento ${formatTime(svcEnd)} in finestra)`);
            insertions.push(await makeLunchEntry(i + 1, rows[i], rows[i], svcEnd));
          } else {
            // Tappa lunga (fine oltre la finestra) o caso generico: pranzo "in guida".
            insertions.push(await makeLunchEntry(i, rows[i - 1] ?? null, rows[i], dep));
          }
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

    // 3b. Fallback finestra: nessuno slot naturale, ma una tappa è in servizio a cavallo della
    //     finestra pranzo (es. tappa lunga che scavalca le 14:00). Senza questo, togliendo
    //     l'orario fisso il pranzo spariva del tutto.
    if (!placed && !insertions.some(ins => ins.type === "lunch")) {
      const idealMin = Math.round((LUNCH_OPEN + LUNCH_CLOSE) / 2); // ~12:45
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].stopPart === "afternoon" || rows[i].type) continue;
        const svcStart = parseTime(rows[i].serviceStartTime ?? rows[i].arrivalTime);
        const svcEnd = parseTime(rows[i].serviceEndTime);
        if (svcStart == null || svcEnd == null) continue;
        // Tappa in servizio A CAVALLO della finestra pranzo e abbastanza lunga → spezzala a
        // metà giornata (la mattina si lavora, si mangia, poi si riprende). Sceglie l'orario
        // "ideale" (~12:45) portato dentro il servizio della tappa e nella finestra.
        const overlaps = svcStart < LUNCH_CLOSE && svcEnd > LUNCH_OPEN;
        if (overlaps && (svcEnd - svcStart) > lunchBreakMinutes) {
          const lunchMin = Math.min(Math.max(idealMin, svcStart + 1), Math.min(svcEnd - 1, LUNCH_CLOSE));
          L(`  → PRANZO spezzando "${rows[i].customer}" a ${formatTime(lunchMin)} (tappa a cavallo della finestra, nessuno slot naturale)`);
          await splitStopForLunch(i, lunchMin);
          placed = true;
          break;
        }
      }
    }

    // 4. Gap split-stop: se c'è una tappa spezzata (mattina/pomeriggio) e il pranzo
    //    non è ancora stato piazzato, usa il gap tra chiusura mattina e apertura pomeridiana.
    if (!placed) {
      for (let i = 0; i < rows.length - 1; i++) {
        const morRow = rows[i];
        const aftRow = rows[i + 1];
        if (morRow.stopPart !== "morning") continue;
        if (aftRow.stopPart !== "afternoon") continue;
        if (morRow.addressId !== aftRow.addressId) continue;
        const gapStart = parseTime(morRow.serviceEndTime);
        const gapEnd   = parseTime(aftRow.arrivalTime);
        if (gapStart == null || gapEnd == null) continue;
        const gapMin = gapEnd - gapStart;
        L(`  gap split "${morRow.customer}": ${formatTime(gapStart)}-${formatTime(gapEnd)} (${gapMin}min disponibili)`);
        if (gapMin > lunchBreakMinutes + 10) {
          // Abbastanza tempo per pranzo: calcola distanza max raggiungibile
          const maxTravelOneWay = Math.floor((gapMin - lunchBreakMinutes) / 2);
          const gapMaxDetourKm = Math.min(maxDetourKm, maxTravelOneWay / 60 * 50);
          const gapLunchClose  = gapStart + maxTravelOneWay;
          L(`    travelMax=${maxTravelOneWay}min detourMax=${gapMaxDetourKm.toFixed(1)}km`);
          const entry = await makeLunchEntry(i + 1, morRow, aftRow, gapStart, gapLunchClose, gapMaxDetourKm);
          if (entry) { insertions.push(entry); placed = true; }
        } else {
          L(`    gap troppo breve per pranzo (${gapMin}min < ${lunchBreakMinutes + 10}min) — sosta nel gap gestita dalle soste automatiche`);
        }
        break; // gestisce solo il primo gap della giornata
      }
    }

    // ── Sezione 5: pranzo durante attesa prima dell'apertura ─────────────────
    // Quando una tappa ha wait time lungo (arrivo prima dell'apertura), usa quel tempo per il pranzo
    if (!placed) {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row.stopPart) continue; // gestisce solo righe non-split
        const arrMin = parseTime(row.arrivalTime);
        const svcMin = parseTime(row.serviceStartTime);
        if (arrMin == null || svcMin == null) continue;
        const waitMin = svcMin - arrMin;
        if (waitMin < lunchBreakMinutes + 10) continue;
        // L'attesa deve sovrapporsi alla finestra pranzo
        const lunchAt = Math.max(arrMin, LUNCH_OPEN);
        const lunchEnd = Math.min(svcMin, LUNCH_CLOSE);
        if (lunchAt + lunchBreakMinutes > lunchEnd) continue;
        const maxTravelOneWay = Math.floor((lunchEnd - lunchAt - lunchBreakMinutes) / 2);
        if (maxTravelOneWay < 0) continue;
        const gapMaxDetourKm = Math.min(maxDetourKm, maxTravelOneWay / 60 * 50);
        const gapLunchClose = lunchAt + maxTravelOneWay;
        // Il cliente è GIÀ arrivato alla tappa (row) e qui attende l'apertura: il pranzo
        // va cercato vicino alla tappa stessa, non lungo la tratta percorsa per arrivarci
        // (altrimenti finisce a metà strada, es. a Bolzano invece che a Riva del Garda).
        L(`  wait-time pranzo "${row.customer}": attesa=${waitMin}min lunchAt=${formatTime(lunchAt)} travelMax=${maxTravelOneWay}min`);
        const entry = await makeLunchEntry(i, row, row, lunchAt, gapLunchClose, gapMaxDetourKm);
        if (entry) {
          // Place the lunch at the right time within the drive-to-stop leg:
          // driveOffset = how many minutes after the previous stop's departure the lunch starts
          entry.driveOffset = lunchAt - parseTime(row.departureTime);
          insertions.push(entry);
          placed = true;
        }
        break;
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
    // Soste automatiche disattivate per questo giro → non inserire nessuna sosta
    if (!restBreaksEnabled) return false;
    // Skip if already have an insertion at this exact position
    if (insertions.some(ins => ins.beforeIndex === beforeIndex && Math.abs((ins.driveOffset||0) - driveOffset) < 5)) {
      cumulative = 0;
      return true;
    }
    // Don't insert rest stops before a fixed-window afternoon continuation
    if (rows[beforeIndex]?.fixedWindow && rows[beforeIndex]?.stopPart === "afternoon") {
      return false;
    }
    // Cerca una sosta salvata in ARCHIVIO sul percorso (perp ≤ 2km, entro maxDetourKm):
    // se trovata → vera tappa con dati + travel reale. Altrimenti scheda neutra tappabile.
    // findNearestRestStop restituisce un array ordinato per distanza: prendi la più vicina
    // non ancora usata in questa giornata (evita doppioni della stessa sosta).
    const spots = findNearestRestStop(restStops, refLat, refLng, toLat, toLng, 2.0, breakTimeMin, scheduledDate, maxDetourKm);
    const spot = spots.find(s => !insertions.some(ins => ins.lat === s.lat && ins.lng === s.lng)) || null;
    if (spot) {
      let travelKm = 0;
      if (refLat != null && refLng != null && spot.lat != null && spot.lng != null && toLat != null && toLng != null) {
        const { perpKm } = perpDistToSegment(spot.lat, spot.lng, refLat, refLng, toLat, toLng);
        if (perpKm > 2.0) travelKm = haversineKm({ lat: refLat, lng: refLng }, { lat: spot.lat, lng: spot.lng });
      }
      const travelMin = Math.round(travelKm / 50 * 60);
      const warnings = spot.openAtBreak === false
        ? [{ msg: `La sosta "${spot.customer}" potrebbe essere chiusa all'orario previsto`, level: "warn" }] : [];
      insertions.push({
        beforeIndex, type: "rest", duration: REST_DUR,
        driveOffset, travelMinutes: travelMin, travelKm,
        customer: spot.customer, location: spot.location || "", address: spot.fullAddress || "",
        lat: spot.lat ?? null, lng: spot.lng ?? null, weeklyHours: spot.weeklyHours || null,
        notes: spot.notes || "", addressId: spot.id ?? spot.addressId ?? null,
        placeAssigned: true, openAtBreak: spot.openAtBreak ?? null, warnings
      });
      L(`    → SOSTA da archivio "${spot.customer}" travelMin=${travelMin} before[${beforeIndex}]`);
      cumulative = 0;
      return true;
    }
    insertions.push({
      beforeIndex, type: "rest", duration: REST_DUR,
      driveOffset, travelMinutes: 0, travelKm: 0,
      customer: "", location: "", address: "",
      lat: refLat ?? null, lng: refLng ?? null
    });
    L(`    → SOSTA neutra before[${beforeIndex}] @ (${refLat?.toFixed(4)||"?"},${refLng?.toFixed(4)||"?"})`);
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

    // User-picked break embedded as a regular stop: treat as break already taken.
    // Reset cumulative, advance time, skip rest-stop logic for this row.
    if (row.breakOrigin) {
      cumulative = 0;
      prevServiceEnd = parseTime(row.serviceEndTime) || prevServiceEnd;
      lastLat = row.lat ?? lastLat;
      lastLng = row.lng ?? lastLng;
      continue;
    }

    let remainingDrive = row.driveMinutes || 0;
    const workMin = row.durationMinutes || 0;
    let driveConsumed = 0;
    let noSpotFound = false;
    L(`[i=${i}] "${row.customer}" part=${row.stopPart||"-"} hours="${row.openingHours||""}" drive=${remainingDrive}min work=${workMin}min cumul=${cumulative}`);

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

    // Gap tra mattina e pomeriggio (tappa spezzata per chiusura pranzo)
    // Se pranzo già piazzato oppure gap troppo breve per pranzo, usa il gap per una sosta
    const nextRow = rows[i + 1];
    if (row.stopPart === "morning" && nextRow?.stopPart === "afternoon" && nextRow.addressId === row.addressId) {
      const gapStart = parseTime(row.serviceEndTime);
      const gapEnd   = parseTime(nextRow.arrivalTime);
      const gapMin   = (gapStart != null && gapEnd != null) ? gapEnd - gapStart : 0;
      const lunchAlreadyPlaced = insertions.some(ins => ins.type === "lunch");
      const lunchPlannedInGap  = lunchAlreadyPlaced && insertions.find(ins => ins.type === "lunch")?.beforeIndex === i + 1;
      L(`  gap split: ${formatTime(gapStart)}-${formatTime(gapEnd)} (${gapMin}min) pranzo=${lunchAlreadyPlaced ? "già piazzato" : "non ancora"}`);
      if (!lunchPlannedInGap && gapMin >= REST_DUR + 5) {
        const breakTime = gapStart != null ? gapStart : prevServiceEnd;
        const valid = isValidBreakTime(breakTime);
        L(`  gap break: gapMin=${gapMin}min breakTime=${formatTime(breakTime)} valid=${valid}`);
        if (valid) {
          await tryInsert(i + 1, row.lat, row.lng, row.lat, row.lng, nextRow.lat, nextRow.lng, 0, breakTime);
        }
      }
    } else if (cumulative >= REST_MIN && i < rows.length - 1 && !nextRow?.breakOrigin) {
      const breakTime = prevServiceEnd;
      const valid = isValidBreakTime(breakTime);
      L(`  post-work break: breakTime=${formatTime(breakTime)} valid=${valid}`);
      if (valid) {
        // Cerca la sosta lungo il percorso verso la prossima tappa, non al punto di partenza.
        const nextDrive = nextRow?.driveMinutes || 60;
        const frac = Math.min(0.5, 20 / nextDrive);
        const searchLat = (row.lat != null && nextRow?.lat != null) ? row.lat + (nextRow.lat - row.lat) * frac : row.lat;
        const searchLng = (row.lng != null && nextRow?.lng != null) ? row.lng + (nextRow.lng - row.lng) * frac : row.lng;
        await tryInsert(i + 1, searchLat, searchLng, row.lat, row.lng, nextRow?.lat, nextRow?.lng, 0, breakTime);
      }
    }

    lastLat = row.lat;
    lastLng = row.lng;
  }

  // Ultima tratta verso casa: se cumulative >= REST_MIN e il momento è valido, prova una sosta
  if (cumulative >= REST_MIN) {
    const breakTime = prevServiceEnd;
    const valid = isValidBreakTime(breakTime);
    L(`  post-loop (finale): cumul=${cumulative} breakTime=${formatTime(breakTime)} valid=${valid}`);
    if (valid) {
      const lastRow = rows[rows.length - 1];
      // Cerca lungo la tratta verso casa, non al punto dell'ultima tappa
      const finalDrive = Math.max(30, finalArrival - prevServiceEnd);
      const frac = homeLat != null ? Math.min(0.5, 20 / finalDrive) : 0;
      const searchLat = (lastRow?.lat != null && homeLat != null) ? lastRow.lat + (homeLat - lastRow.lat) * frac : lastRow?.lat;
      const searchLng = (lastRow?.lng != null && homeLng != null) ? lastRow.lng + (homeLng - lastRow.lng) * frac : lastRow?.lng;
      await tryInsert(rows.length, searchLat, searchLng, lastRow?.lat, lastRow?.lng, homeLat, homeLng, 0, breakTime);
    }
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
        weeklyHours: brk.weeklyHours || null,
        notes: brk.notes || "",
        addressId: brk.addressId ?? null,
        placeAssigned: brk.placeAssigned === true,
        userPicked: brk.userPicked === true, // locale pranzo scelto a mano: persiste per il replan/riapertura
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
      const r = rows[i];
      if (r.breakOrigin) {
        // Emit user-picked break as a break row (type:"rest"/"lunch") with shifted times
        const s = shiftRowTimes(r, timeShift);
        result.push({
          type: r.breakOrigin,
          stopNumber: null,
          customer: r.customer || "",
          location: r.location || "",
          address: r.address || "",
          lat: r.lat ?? null,
          lng: r.lng ?? null,
          weeklyHours: r.weeklyHours || null,
          notes: r.notes || "",
          addressId: r.addressId ?? null,
          placeAssigned: true,
          userPicked: true,
          departureTime: s.departureTime,
          arrivalTime: s.arrivalTime,
          serviceStartTime: s.serviceStartTime,
          serviceEndTime: s.serviceEndTime,
          durationMinutes: r.durationMinutes,
          warnings: r.warnings || [],
          driveMinutes: r.driveMinutes,
          baseDriveMinutes: r.baseDriveMinutes ?? r.driveMinutes,
          driveBufferMinutes: r.driveBufferMinutes ?? 0,
          km: r.km,
          legSource: r.legSource
        });
      } else {
        result.push(shiftRowTimes(rows[i], timeShift));
      }
      // An afternoon split part (opening-hours or fixed-window) has absolute service
      // times, and subsequent stops were planned from its absolute end. Breaks before
      // it are absorbed by the midday closure gap → reset the shift. Same for a
      // non-split fixed-window stop.
      const absoluteAfternoon = r.stopPart === "afternoon" && !r.dynamicSplit;
      const fixedSingle = r.fixedWindow && !r.dynamicSplit && !r.stopPart;
      if (absoluteAfternoon || fixedSingle) {
        timeShift = 0;
      }
      // After a stop with opening-hour wait time, the wait absorbs part of the accumulated timeShift.
      // Reduce timeShift by the wait time so subsequent stops aren't over-shifted.
      else if (!r.fixedWindow) {
        const origArr = parseTime(r.arrivalTime);
        const origSvc = parseTime(r.serviceStartTime);
        if (origSvc != null && origArr != null && origSvc > origArr) {
          const waitMin = origSvc - origArr;
          timeShift = Math.max(0, timeShift - waitMin);
        }
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
  // In "partenza a orario fisso" non c'è orario di arrivo target: ignora un eventuale
  // firstArrivalTime residuo nel payload (es. giro nato in "arrivo a orario fisso"),
  // altrimenti comparirebbe l'avviso "arrivo oltre l'orario target" e la prima tappa
  // verrebbe bloccata nell'ottimizzazione dell'ordine.
  const firstArrivalRequired = timingMode === "depart_at"
    ? null
    : parseTime(payload.firstArrivalTime || payload.firstArrivalRequired || "");
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

  // Insert lunch break and rest stops into the timeline.
  // Soste/ristoranti salvati in archivio: usati per riempire le pause come vere tappe.
  const activeRestStops = restStops.filter(s => s.addressType === "rest" || s.isRestStop);
  const activeRestaurantStops = restStops.filter(s => s.addressType === "restaurant" || s.isLunchStop);
  const maxReturnTime = settings?.maxReturnTime ? parseTime(settings.maxReturnTime) : null;
  const actualFinalArrival = parseTime(best.finalLeg.arrivalTime);
  const { rows: enrichedRows, addedMinutes, debugLog } = await insertBreaks(best.rows, {
    lunchBreakEnabled, lunchBreakMinutes, lunchFixedTime,
    lunchFixedSpot: payload.lunchFixedSpot || null,
    restBreaksEnabled: payload.restBreaks !== false, // false → nessuna sosta automatica per questo giro

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
    scheduledDate,
    homeLat: end?.lat ?? null,
    homeLng: end?.lng ?? null
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
    // plannedStops rappresenta le tappe ORIGINALI del giro (una per tappa), non le
    // righe interne del programma: le tappe spezzate mattina/pomeriggio vanno riunite
    // in una sola voce con la durata TOTALE, altrimenti i percorsi che ricostruiscono
    // il giro da plannedStops (riprogramma data, cambio data) perderebbero la durata
    // personalizzata trattando i due tronconi come tappe separate.
    plannedStops: (() => {
      const byStop = new Map();
      const order = [];
      for (const row of best.rows) {
        if (row.type) continue; // salta pause/soste
        const key = row.stopUid || `idx-${order.length}`;
        if (!byStop.has(key)) {
          byStop.set(key, {
            uid: row.stopUid,
            addressId: row.addressId,
            customer: row.customer,
            location: row.location,
            fullAddress: row.address,
            notes: row.notes,
            durationMinutes: 0,
            openMorning: row.openMorning,
            closeMorning: row.closeMorning,
            openAfternoon: row.openAfternoon,
            closeAfternoon: row.closeAfternoon,
            weeklyHours: row.weeklyHours || null,
            lat: row.lat,
            lng: row.lng,
            recognized: Boolean(row.addressId)
          });
          order.push(key);
        }
        byStop.get(key).durationMinutes += Number(row.durationMinutes || 0);
      }
      return order.map((k) => {
        const s = byStop.get(k);
        if (!s.durationMinutes) s.durationMinutes = 45;
        return s;
      });
    })(),
    finalLeg: best.finalLeg,
    summary: best.summary,
    rates,
    lunchBreak: lunchBreakEnabled,
    lunchBreakMinutes,
    lunchFixedTime: lunchFixedTime || "",
    restBreaks: payload.restBreaks !== false, // stato soste automatiche del giro (persiste al salvataggio/riapertura)
    maxReturnTime: payload.departureLatest || "",
    mapMode: [...new Set(best.rows.map((row) => row.legSource).concat(best.finalLeg.source))].join(", "),
    debugLog: debugLog || []
  };
}

// Valutazione "solo tempi" di una giornata con ordine BLOCCATO, per il multi-giorno.
// Riusa la STESSA logica di scheduling del motore reale (normalizeStop → buildLegMatrix con cache
// → evaluateOrder → scheduleStop: orari di apertura, chiusure, tolleranza, spezzare interventi)
// ma SALTA insertBreaks: niente lookup Places per ristoranti/soste, così può essere chiamata molte
// volte come oracolo di fattibilità senza moltiplicare le chiamate. Pranzo e soste sono conteggiati
// come ALLOWANCE di tempo — coerente col motore reale, dove le pause spostano in avanti l'orario di
// fine mentre le chiusure sono già valutate da scheduleStop sul programma pre-pause.
// Restituisce: dayEndMin (fine pre-pause), dayEndWithBreaks (con allowance pause), driveMin e le
// tappe servite oltre la chiusura (stesse warning del motore reale). I tempi sono quelli reali (cache).
export async function evaluateDayTiming(payload, settings = {}) {
  const scheduledDate = payload.scheduledDate || new Date().toISOString().slice(0, 10);
  const dayOfWeek = new Date(scheduledDate + "T12:00:00").getDay();
  const stops = (payload.stops || []).map((s, i) => normalizeStop(s, i, dayOfWeek));
  if (!stops.length) return { ok: false, dayEndMin: null, dayEndWithBreaks: null, driveMin: 0, lateStops: [] };
  const start = payload.start || {};
  const end = payload.end?.sameAsStart ? start : (payload.end?.address || payload.end?.fullAddress ? payload.end : start);
  const nodes = [
    { label: "Partenza", fullAddress: start.address || start.fullAddress, lat: start.lat ?? null, lng: start.lng ?? null },
    ...stops.map((stop) => ({ label: `${stop.customer} ${stop.location}`.trim(), customer: stop.customer, location: stop.location, fullAddress: stop.fullAddress, lat: stop.lat, lng: stop.lng })),
    { label: "Arrivo", fullAddress: end.address || end.fullAddress, lat: end.lat ?? null, lng: end.lng ?? null }
  ];
  const stopsWithNodeIndex = stops.map((stop, index) => ({ ...stop, nodeIndex: index + 1 }));
  await Promise.all(stopsWithNodeIndex.map(async (stop) => {
    if (!stop.lat || !stop.lng) { try { const c = await resolvePlace(stop); stop.lat = c.lat; stop.lng = c.lng; } catch { /* leave null */ } }
  }));
  const matrix = await buildLegMatrix(nodes, settings?.driveMarkupMinPerHour ?? 10);
  const context = {
    nodes, matrix,
    startMinutes: parseTime(payload.startTime || payload.start?.time || ""),
    firstArrivalRequired: parseTime(payload.firstArrivalTime || payload.firstArrivalRequired || ""),
    rates: { kmRate: 0, driveHourRate: 0, workHourRate: 0 },
    timingMode: payload.timingMode || "first_open_minus",
    arrivalLeadMinutes: Number(payload.arrivalLeadMinutes ?? 10),
    departureLatestMinutes: payload.departureLatest ? parseTime(payload.departureLatest) : null,
    lunchEnabled: false, lunchOpen: 0, lunchClose: 0, lunchDuration: 0
  };
  // Ordine BLOCCATO: il multi-giorno passa già le tappe nell'ordine far-first da valutare.
  const evaluated = evaluateOrder(stopsWithNodeIndex, context);
  const dayEndMin = parseTime(evaluated.summary.dayEnd);

  // Allowance pause (come il motore reale): pranzo se abilitato + soste sui tragitti lunghi.
  const lunchEnabled = settings.lunchBreakEnabled !== false && payload.lunchBreak !== false;
  const lunchMin = lunchEnabled ? Number(payload.lunchBreakMinutes ?? settings.lunchBreakMinutes ?? 45) : 0;
  const restInterval = Number(settings.restIntervalMin ?? 120);
  const restDur = Number(settings.restDurationMin ?? 15);
  const restMin = restInterval > 0 ? Math.floor((evaluated.summary.totalDriveMinutes || 0) / restInterval) * restDur : 0;
  const breakAllowance = lunchMin + restMin;

  const lateStops = [...new Set(
    evaluated.rows
      .filter((r) => !r.type && (r.warnings || []).some((w) => /chius|dopo l'orario|finestra|sede chiusa/.test(w.msg || w)))
      .map((r) => r.location || r.customer || r.label)
  )];

  return {
    ok: true,
    dayEndMin,
    dayEndWithBreaks: dayEndMin != null ? dayEndMin + breakAllowance : null,
    breakAllowance,
    driveMin: evaluated.summary.totalDriveMinutes || 0,
    lateStops
  };
}
