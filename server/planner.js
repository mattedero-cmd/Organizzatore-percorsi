import { routeBetween } from "./googleMapsService.js";

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

function addDriveBuffer(baseMinutes) {
  const minutes = Number(baseMinutes || 0);
  return Math.max(1, Math.ceil(minutes + (minutes / 60) * 10));
}

function normalizeStop(stop, index) {
  return {
    uid: stop.uid || stop.stopUid || `stop-${index}`,
    id: stop.id ?? stop.addressId ?? `new-${index}`,
    addressId: stop.addressId ?? stop.id ?? null,
    customer: stop.customer || stop.label || `Tappa ${index + 1}`,
    location: stop.location || "",
    fullAddress: stop.fullAddress || stop.address || "",
    notes: stop.notes || "",
    durationMinutes: Number(stop.durationMinutes || stop.defaultDuration || 45),
    openMorning: stop.openMorning || "",
    closeMorning: stop.closeMorning || "",
    openAfternoon: stop.openAfternoon || "",
    closeAfternoon: stop.closeAfternoon || "",
    lat: stop.lat ?? null,
    lng: stop.lng ?? null
  };
}

function getWindows(stop) {
  const windows = [];
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
  const parts = [];
  if (stop.openMorning && stop.closeMorning) parts.push(`${stop.openMorning}-${stop.closeMorning}`);
  if (stop.openAfternoon && stop.closeAfternoon) parts.push(`${stop.openAfternoon}-${stop.closeAfternoon}`);
  return parts.join(" / ") || "Non indicato";
}

function scheduleStop(arrival, stop) {
  const windows = getWindows(stop);
  const warnings = [];

  if (windows.length === 0) {
    return {
      serviceStart: arrival,
      serviceEnd: arrival + stop.durationMinutes,
      waitMinutes: 0,
      warnings: ["orari non indicati"]
    };
  }

  for (const window of windows) {
    if (arrival <= window.end) {
      const serviceStart = Math.max(arrival, window.start);
      if (arrival < window.start) warnings.push("arrivo prima dell'apertura");
      if (serviceStart + stop.durationMinutes <= window.end) {
        return {
          serviceStart,
          serviceEnd: serviceStart + stop.durationMinutes,
          waitMinutes: Math.max(0, serviceStart - arrival),
          warnings
        };
      }
      if (arrival <= window.end) {
        warnings.push(`intervento oltre chiusura ${window.label.toLowerCase()}`);
      }
    }
  }

  return {
    serviceStart: arrival,
    serviceEnd: arrival + stop.durationMinutes,
    waitMinutes: 0,
    warnings: [...new Set([...warnings, "sede chiusa o orario incompatibile"])]
  };
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

async function buildLegMatrix(nodes) {
  const matrix = new Map();
  for (let from = 0; from < nodes.length; from += 1) {
    for (let to = 0; to < nodes.length; to += 1) {
      if (from === to) continue;
      const leg = await routeBetween(nodes[from], nodes[to]);
      const adjustedDriveMinutes = addDriveBuffer(leg.driveMinutes);
      matrix.set(`${from}:${to}`, {
        ...leg,
        baseDriveMinutes: leg.driveMinutes,
        driveBufferMinutes: adjustedDriveMinutes - leg.driveMinutes,
        driveMinutes: adjustedDriveMinutes
      });
    }
  }
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
    currentTime = targetArrival - firstLeg.driveMinutes;
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
      if (arrival < targetArrival) warnings.push("arrivo prima dell'orario target");
      if (arrival > targetArrival) warnings.push("arrivo dopo l'orario target");
    }

    const scheduled = scheduleStop(
      index === 0 && targetArrival !== null ? Math.max(arrival, targetArrival) : arrival,
      stop
    );
    let rowWarnings = [...new Set([...warnings, ...scheduled.warnings])];
    if (index === 0 && timingMode === "first_open_minus") {
      rowWarnings = rowWarnings.filter((warning) => warning !== "arrivo prima dell'apertura");
    }

    rows.push({
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
      departureTime: formatTime(departure),
      driveMinutes: leg.driveMinutes,
      baseDriveMinutes: leg.baseDriveMinutes ?? leg.driveMinutes,
      driveBufferMinutes: leg.driveBufferMinutes ?? 0,
      km: Number(leg.km.toFixed(1)),
      arrivalTime: formatTime(arrival),
      serviceStartTime: formatTime(scheduled.serviceStart),
      openingHours: openingLabel(stop),
      durationMinutes: stop.durationMinutes,
      serviceEndTime: formatTime(scheduled.serviceEnd),
      warnings: rowWarnings,
      targetArrivalTime: index === 0 && targetArrival !== null ? formatTime(targetArrival) : "",
      legSource: leg.source
    });

    totalKm += leg.km;
    totalDriveMinutes += leg.driveMinutes;
    totalWorkMinutes += stop.durationMinutes;
    totalWaitMinutes += scheduled.waitMinutes;
    allWarnings.push(...rowWarnings);
    currentTime = scheduled.serviceEnd;
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
  const warningPenalty = allWarnings.filter((warning) => /chiusa|dopo|oltre/.test(warning)).length * 500;
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
      warnings: [...new Set(allWarnings)]
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

export async function planRoute(payload, settings) {
  const stops = (payload.stops || []).map(normalizeStop);
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
  const matrix = await buildLegMatrix(nodes);
  const startMinutes = parseTime(payload.startTime || payload.start?.time || "");
  const timingMode = payload.timingMode || "first_open_minus";
  const arrivalLeadMinutes = Number(payload.arrivalLeadMinutes ?? 10);
  const firstArrivalRequired = parseTime(payload.firstArrivalTime || payload.firstArrivalRequired || "");
  const rates = {
    kmRate: Number(payload.rates?.kmRate ?? settings.kmRate),
    driveHourRate: Number(payload.rates?.driveHourRate ?? settings.driveHourRate),
    workHourRate: Number(payload.rates?.workHourRate ?? settings.workHourRate)
  };

  const lockedFirst = firstArrivalRequired !== null && stopsWithNodeIndex.length > 1
    ? stopsWithNodeIndex[0]
    : null;
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

  return {
    id: null,
    generatedAt: new Date().toISOString(),
    scheduledDate: payload.scheduledDate || new Date().toISOString().slice(0, 10),
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
