import { parseTime } from "./planner.js";

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s:.']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDuration(text) {
  const value = normalize(text);
  const minuteMatch = value.match(/(\d+)\s*(minuto|minuti|min)/);
  const hourMatch = value.match(/(\d+)\s*(ora|ore|h)/);
  if (value.includes("un ora e mezza") || value.includes("un'ora e mezza")) return 90;
  if (value.includes("mezz ora") || value.includes("mezz'ora")) return 30;
  let minutes = 0;
  if (hourMatch) minutes += Number(hourMatch[1]) * 60;
  if (minuteMatch) minutes += Number(minuteMatch[1]);
  if (!minutes && value.includes("un ora")) minutes = 60;
  return minutes || null;
}

function findTimeAfter(text, marker) {
  const value = normalize(text);
  const index = value.indexOf(marker);
  if (index === -1) return "";
  const tail = value.slice(index + marker.length);
  const match = tail.match(/(?:alle|all|a)\s+(\d{1,2}(?::|\.)?\d{0,2})/);
  if (!match) return "";
  const raw = match[1].includes(":") || match[1].includes(".") ? match[1] : `${match[1]}:00`;
  return parseTime(raw) !== null ? raw.replace(".", ":") : "";
}

function addressLabel(address) {
  return normalize(`${address.customer} ${address.location}`);
}

function matchAddress(fragment, addresses) {
  const target = normalize(fragment);
  if (!target) return null;
  let best = null;
  let bestScore = 0;
  for (const address of addresses) {
    const label = addressLabel(address);
    const words = label.split(" ").filter(Boolean);
    const hits = words.filter((word) => target.includes(word)).length;
    const score = hits / Math.max(1, words.length);
    if (target.includes(label)) return { ...address, confidence: 1 };
    if (score > bestScore) {
      best = address;
      bestScore = score;
    }
  }
  return bestScore >= 0.5 ? { ...best, confidence: bestScore } : null;
}

function extractStopName(text) {
  const value = normalize(text);
  const patterns = [
    /aggiungi(?: anche)?\s+(.+?)(?:\s+intervento|\s+lavoro|$)/,
    /arrivare da\s+(.+?)(?:\s+alle|$)/,
    /da\s+(.+?)(?:\s+alle|$)/
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

export function parseVoiceCommand(text, addresses) {
  const normalized = normalize(text);
  const result = {
    transcript: text,
    action: normalized.includes("ottimizza") ? "optimize" : "update",
    start: null,
    end: null,
    startTime: "",
    firstArrivalRequired: "",
    stops: [],
    needsConfirmation: []
  };

  const startMatch = normalized.match(/parto da\s+(.+?)(?:\s+alle|$)/);
  if (startMatch) {
    const rawStart = startMatch[1].trim();
    const knownStart = matchAddress(rawStart, addresses);
    result.startTime = findTimeAfter(normalized, "parto da") || "";
    result.start = knownStart
      ? {
          label: `${knownStart.customer} ${knownStart.location}`.trim(),
          address: knownStart.fullAddress,
          lat: knownStart.lat,
          lng: knownStart.lng
        }
      : { label: rawStart, address: rawStart };
    if (!knownStart) result.needsConfirmation.push(`Partenza: ${rawStart}`);
  }

  const endMatch = normalized.match(/(?:punto finale|arrivo finale|finale)\s+(?:e|è|a)?\s*(.+)$/);
  if (endMatch) {
    const rawEnd = endMatch[1].replace("casa", "casa").trim();
    const knownEnd = matchAddress(rawEnd, addresses);
    result.end = knownEnd
      ? {
          label: `${knownEnd.customer} ${knownEnd.location}`.trim(),
          address: knownEnd.fullAddress,
          lat: knownEnd.lat,
          lng: knownEnd.lng
        }
      : { label: rawEnd, address: rawEnd };
    if (!knownEnd) result.needsConfirmation.push(`Arrivo: ${rawEnd}`);
  }

  if (normalized.includes("arrivare da")) {
    result.firstArrivalRequired = findTimeAfter(normalized, "arrivare da") || "";
  }

  const stopName = extractStopName(normalized);
  if (stopName) {
    const duration = parseDuration(normalized);
    const knownStop = matchAddress(stopName, addresses);
    if (knownStop) {
      result.stops.push({
        addressId: knownStop.id,
        customer: knownStop.customer,
        location: knownStop.location,
        fullAddress: knownStop.fullAddress,
        openMorning: knownStop.openMorning,
        closeMorning: knownStop.closeMorning,
        openAfternoon: knownStop.openAfternoon,
        closeAfternoon: knownStop.closeAfternoon,
        durationMinutes: duration || knownStop.defaultDuration,
        lat: knownStop.lat,
        lng: knownStop.lng,
        recognized: true,
        confidence: knownStop.confidence
      });
    } else {
      result.stops.push({
        customer: stopName,
        location: "",
        fullAddress: stopName,
        durationMinutes: duration || 45,
        recognized: false
      });
      result.needsConfirmation.push(`Tappa: ${stopName}`);
    }
  }

  return result;
}
