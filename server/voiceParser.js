import { parseTime } from "./planner.js";

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s:.']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MONTH_MAP = {
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6,
  luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12
};

function parseItalianDate(text) {
  const v = normalize(text);

  // domani
  if (v.includes("domani")) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  // "il 10 giugno" / "per il 5 luglio"
  for (const [name, num] of Object.entries(MONTH_MAP)) {
    const m = v.match(new RegExp(`(\\d{1,2})\\s+${name}`));
    if (m) {
      const day = m[1].padStart(2, "0");
      const month = String(num).padStart(2, "0");
      const year = new Date().getFullYear();
      return `${year}-${month}-${day}`;
    }
  }

  // "10/6" or "10-6"
  const slashMatch = v.match(/\b(\d{1,2})[\/\-](\d{1,2})\b/);
  if (slashMatch) {
    const day = slashMatch[1].padStart(2, "0");
    const month = slashMatch[2].padStart(2, "0");
    const year = new Date().getFullYear();
    return `${year}-${month}-${day}`;
  }

  return "";
}

function parseItalianTime(fragment) {
  const v = normalize(fragment);
  const m = v.match(/(\d{1,2})(?:[:.,e](\d{0,2}))?/);
  if (!m) return "";
  const h = m[1].padStart(2, "0");
  const min = (m[2] || "00").padStart(2, "0");
  const raw = `${h}:${min}`;
  return parseTime(raw) !== null ? raw : "";
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

function buildStop(address, duration) {
  return {
    addressId: address.id,
    customer: address.customer,
    location: address.location,
    fullAddress: address.fullAddress,
    openMorning: address.openMorning,
    closeMorning: address.closeMorning,
    openAfternoon: address.openAfternoon,
    closeAfternoon: address.closeAfternoon,
    durationMinutes: duration || address.defaultDuration || 45,
    lat: address.lat,
    lng: address.lng,
    recognized: true,
    confidence: address.confidence || 1
  };
}

export function parseVoiceCommand(text, addresses) {
  const normalized = normalize(text);
  const result = {
    transcript: text,
    action: "update",
    start: null,
    end: null,
    startTime: "",
    firstArrivalTime: "",
    arrivalLeadMinutes: null,
    scheduledDate: "",
    stops: [],
    removeStops: [],
    needsConfirmation: []
  };

  // ── action ────────────────────────────────────────────────────────────────
  if (/ottimizza|salva e vai|calcola percorso|calcola il percorso/.test(normalized)) {
    result.action = "optimize";
  }

  // ── date ──────────────────────────────────────────────────────────────────
  const dateKw = normalized.match(/(?:per il|per|data|giorno)\s+(.{3,20}?)(?:\s+alle|\s+partenza|$)/);
  if (dateKw) {
    const parsed = parseItalianDate(dateKw[1]);
    if (parsed) result.scheduledDate = parsed;
  } else {
    const parsed = parseItalianDate(normalized);
    if (parsed) result.scheduledDate = parsed;
  }

  // ── partenza alle ─────────────────────────────────────────────────────────
  const startTimeMatch = normalized.match(/partenza\s+alle?\s+(.{2,8}?)(?:\s|$)/);
  if (startTimeMatch) result.startTime = parseItalianTime(startTimeMatch[1]);

  // ── primo arrivo alle / arrivo alle ───────────────────────────────────────
  const firstArrMatch = normalized.match(/(?:primo\s+)?arrivo\s+alle?\s+(.{2,8}?)(?:\s|$)/);
  if (firstArrMatch) result.firstArrivalTime = parseItalianTime(firstArrMatch[1]);

  // ── in anticipo di N minuti ───────────────────────────────────────────────
  const leadMatch = normalized.match(/in\s+anticipo\s+di\s+(\d+)/);
  if (leadMatch) result.arrivalLeadMinutes = Number(leadMatch[1]);

  // ── parto da ──────────────────────────────────────────────────────────────
  const startMatch = normalized.match(/parto da\s+(.+?)(?:\s+alle|$)/);
  if (startMatch) {
    const rawStart = startMatch[1].trim();
    const knownStart = matchAddress(rawStart, addresses);
    if (!result.startTime) result.startTime = "";
    result.start = knownStart
      ? { label: `${knownStart.customer} ${knownStart.location}`.trim(), address: knownStart.fullAddress, lat: knownStart.lat, lng: knownStart.lng }
      : { label: rawStart, address: rawStart };
    if (!knownStart) result.needsConfirmation.push(`Partenza: ${rawStart}`);
  }

  // ── arrivo finale ─────────────────────────────────────────────────────────
  const endMatch = normalized.match(/(?:punto finale|arrivo finale|finale)\s+(?:e|e|a)?\s*(.+)$/);
  if (endMatch) {
    const rawEnd = endMatch[1].trim();
    const knownEnd = matchAddress(rawEnd, addresses);
    result.end = knownEnd
      ? { label: `${knownEnd.customer} ${knownEnd.location}`.trim(), address: knownEnd.fullAddress, lat: knownEnd.lat, lng: knownEnd.lng }
      : { label: rawEnd, address: rawEnd };
    if (!knownEnd) result.needsConfirmation.push(`Arrivo: ${rawEnd}`);
  }

  // ── aggiungi (one or more) ────────────────────────────────────────────────
  const duration = parseDuration(normalized);
  // Split on "aggiungi" / "e aggiungi" to find multiple stops in one command
  const addParts = normalized.split(/\baggiungi(?:\s+anche)?\s+/).slice(1);
  for (const part of addParts) {
    // Take text up to next keyword
    const stopName = part.replace(/\s+(?:intervento|lavoro|per|dalle|alle|e aggiungi|ottimizza|salva e vai).*$/, "").trim();
    if (!stopName) continue;
    const known = matchAddress(stopName, addresses);
    if (known) {
      result.stops.push(buildStop(known, duration));
    } else {
      result.stops.push({ customer: stopName, location: "", fullAddress: stopName, durationMinutes: duration || 45, recognized: false });
      result.needsConfirmation.push(`Tappa: ${stopName}`);
    }
  }

  // fallback: "arrivare da" / "da X alle"
  if (!addParts.length) {
    const legacyPatterns = [
      /arrivare da\s+(.+?)(?:\s+alle|$)/,
      /^da\s+(.+?)(?:\s+alle|$)/
    ];
    for (const pat of legacyPatterns) {
      const m = normalized.match(pat);
      if (m) {
        const stopName = m[1].trim();
        const known = matchAddress(stopName, addresses);
        if (known) {
          result.stops.push(buildStop(known, duration));
        } else {
          result.stops.push({ customer: stopName, location: "", fullAddress: stopName, durationMinutes: duration || 45, recognized: false });
          result.needsConfirmation.push(`Tappa: ${stopName}`);
        }
        break;
      }
    }
  }

  // ── rimuovi ───────────────────────────────────────────────────────────────
  const removeMatch = normalized.match(/(?:rimuovi|elimina|togli)\s+(.+?)(?:\s+dal percorso|\s+dalla lista|$)/);
  if (removeMatch) {
    if (result.action !== "optimize") result.action = "remove";
    const removeName = removeMatch[1].trim();
    const found = matchAddress(removeName, addresses);
    if (found) {
      result.removeStops.push(found);
    } else {
      result.needsConfirmation.push(`Non trovato: ${removeName}`);
    }
  }

  return result;
}
