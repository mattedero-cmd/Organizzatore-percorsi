import { trackCall } from "./apiStats.js";

const API_KEY = () => process.env.GOOGLE_MAPS_SERVER_KEY || process.env.GOOGLE_MAPS_API_KEY || "";
const BASE = "https://maps.googleapis.com/maps/api";

function toRad(deg) { return deg * Math.PI / 180; }

function haversineKm(a, b) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}

function localFallback(a, b) {
  const km = haversineKm(a, b) * 1.22;
  return { km: Math.round(km * 10) / 10, driveMinutes: Math.ceil(km / 52 * 60) + 4, source: "local-estimate" };
}

function addressQuery(place) {
  return [place.fullAddress || place.address || "", place.location || "", "Italia"]
    .filter(Boolean).join(", ");
}

const CITY_COORDS = {
  "riva del garda": [45.889, 10.843], "arco": [45.918, 10.886],
  "rovereto": [45.890, 11.040], "trento": [46.067, 11.122],
  "bolzano": [46.498, 11.354], "verona": [45.438, 10.992],
  "brescia": [45.541, 10.211], "milano": [45.464, 9.190],
  "padova": [45.407, 11.877], "vicenza": [45.546, 11.535],
  "venezia": [45.440, 12.315], "mantova": [45.156, 10.791],
  "altopiano della vigolana": [46.004, 11.196], "vigolana": [46.004, 11.196],
  "casa": [46.004, 11.196]
};

function localGeocode(place) {
  const text = [place.fullAddress, place.address, place.location, place.label, place.city].join(" ").toLowerCase();
  for (const [city, [lat, lng]] of Object.entries(CITY_COORDS)) {
    if (text.includes(city)) return { lat, lng, source: "local-city" };
  }
  return null;
}

export async function resolvePlace(place) {
  if (place.lat != null && place.lng != null && Number(place.lat) !== 0) {
    return { lat: Number(place.lat), lng: Number(place.lng), source: "saved" };
  }
  const key = API_KEY();
  if (key) {
    try {
      const query = addressQuery(place);
      const url = `${BASE}/geocode/json?address=${encodeURIComponent(query)}&region=it&key=${key}`;
      trackCall("google_maps", "geocode");
      const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
      const data = await res.json();
      if (data.status === "OK" && data.results?.[0]) {
        const loc = data.results[0].geometry.location;
        return { lat: loc.lat, lng: loc.lng, source: "google" };
      }
    } catch {
      // fallthrough to local
    }
  }
  const local = localGeocode(place);
  if (local) return local;
  return { lat: 46.004, lng: 11.196, source: "local-estimate" };
}

export async function routeBetween(a, b) {
  const coordA = await resolvePlace(a);
  const coordB = await resolvePlace(b);
  const key = API_KEY();
  if (key) {
    try {
      const origin = `${coordA.lat},${coordA.lng}`;
      const dest = `${coordB.lat},${coordB.lng}`;
      const url = `${BASE}/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}&region=it&language=it&key=${key}`;
      trackCall("google_maps", "directions");
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const data = await res.json();
      if (data.status === "OK" && data.routes?.[0]) {
        const leg = data.routes[0].legs[0];
        return {
          km: Math.round(leg.distance.value / 100) / 10,
          driveMinutes: Math.ceil(leg.duration.value / 60),
          source: "google"
        };
      }
    } catch {
      // fallthrough
    }
  }
  return localFallback(coordA, coordB);
}

function decodePolyline(encoded) {
  const coords = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    coords.push([lat / 1e5, lng / 1e5]);
  }
  return coords;
}

// Returns true/false/null (null = unknown/no periods data).
// periods: Google Places opening_hours.periods array.
// targetDay: 0=Sun … 6=Sat. targetMin: minutes from midnight (e.g. 10:30 → 630).
export function isOpenAtTime(periods, targetDay, targetMin) {
  if (!Array.isArray(periods) || !periods.length) return null;
  for (const p of periods) {
    if (!p.open) continue;
    const openDay = p.open.day;
    const openMin = parseInt(p.open.time.slice(0, 2)) * 60 + parseInt(p.open.time.slice(2));
    if (!p.close) {
      // Open 24 h (no close entry)
      if (openDay === targetDay) return true;
      continue;
    }
    const closeDay = p.close.day;
    const closeMin = parseInt(p.close.time.slice(0, 2)) * 60 + parseInt(p.close.time.slice(2));
    if (openDay === closeDay) {
      if (openDay === targetDay && targetMin >= openMin && targetMin < closeMin) return true;
    } else {
      // Overnight period
      if (openDay === targetDay && targetMin >= openMin) return true;
      if (closeDay === targetDay && targetMin < closeMin) return true;
    }
  }
  return false;
}

// Cache per evitare chiamate doppie nella stessa area durante una pianificazione
const placesCache = new Map();

function placesCacheKey(lat, lng) {
  return `${Math.round(lat * 50) / 50},${Math.round(lng * 50) / 50}`;
}

function placesScore(place) {
  const rating = Number(place.rating || 0);
  const reviews = Number(place.user_ratings_total || 0);
  // Penalizza posti con poche recensioni: 4.3★ × 100 rec > 4.4★ × 10 rec
  return rating * Math.log10(reviews + 1);
}

// Perpendicular distance (km) from point P to segment A→B.
function perpKmToSegment(pLat, pLng, aLat, aLng, bLat, bLng) {
  const dLat = bLat - aLat, dLng = bLng - aLng;
  const len2 = dLat * dLat + dLng * dLng;
  const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1,
    ((pLat - aLat) * dLat + (pLng - aLng) * dLng) / len2));
  return haversineKm({ lat: pLat, lng: pLng }, { lat: aLat + t * dLat, lng: aLng + t * dLng });
}

async function fetchPlaceDetails(placeId, key) {
  try {
    const url = `${BASE}/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=opening_hours&key=${key}`;
    trackCall("google_maps", "place_details");
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    if (data.status === "OK") return data.result?.opening_hours || null;
  } catch {}
  return null;
}

// segFrom/segTo: route segment endpoints for perpendicular filtering.
// radiusM: how wide to cast the Places API net (default 15 km).
// MAX_DETOUR_KM: max perpendicular distance from the segment (≈ 2 min at 50 km/h).
// breakTimeMin: minutes from midnight for the planned break time (optional).
// scheduledDate: YYYY-MM-DD string (optional, to determine day of week).
export async function findNearbyRestStop(lat, lng, segFromLat, segFromLng, segToLat, segToLng, radiusM = 15000, breakTimeMin = null, scheduledDate = null, maxDetourKm = 1.7, debugCb = null) {
  if (!lat || !lng) return null;
  const key = API_KEY();
  if (!key) return null;

  const cacheKey = `${placesCacheKey(lat, lng)}_r${radiusM}`;
  if (placesCache.has(cacheKey)) {
    const cached = placesCache.get(cacheKey);
    debugCb?.(`[API cache] → ${cached ? `"${cached.customer}"` : "null"}`);
    return cached;
  }

  const EXCLUDE_KEYWORDS = /hotel|alberg|agritur|b&b|bed\s*&?\s*breakfast|hostel|ostello|resort|wellness|spa\b/i;
  const MAX_DETOUR_KM = maxDetourKm;

  const hasSegment = segFromLat != null && segToLat != null;
  const checkHours = breakTimeMin != null && scheduledDate != null;
  const targetDay = checkHours ? (() => {
    const [y, m, d] = scheduledDate.split("-").map(Number);
    return new Date(y, m - 1, d).getDay();
  })() : null;

  try {
    // rankby=distance restituisce i bar PIÙ VICINI al punto (ordinati per distanza)
    // invece dei più "prominenti" entro un raggio — così troviamo locali sul percorso
    // e non mete turistiche lontane. (radius è incompatibile con rankby=distance.)
    const url = `${BASE}/place/nearbysearch/json?location=${lat},${lng}&rankby=distance&type=bar&language=it&key=${key}`;
    trackCall("google_maps", "nearby_search");
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const data = await res.json();
    console.log("[Places]", lat.toFixed(4), lng.toFixed(4), "→ status:", data.status, "results:", data.results?.length ?? 0);
    debugCb?.(`[API] status=${data.status} totale=${data.results?.length ?? 0}`);
    if (data.status !== "OK" || !data.results?.length) {
      placesCache.set(cacheKey, null);
      return null;
    }

    const candidates = data.results
      .filter(p => {
        if (EXCLUDE_KEYWORDS.test(p.name)) { debugCb?.(`  scarto "${p.name}": keyword esclusa`); return false; }
        // Soglia qualità minima: almeno 4 stelle e 5 recensioni. Tra i locali che la
        // superano sceglieremo poi il più vicino al percorso (ordinamento più sotto).
        if (!p.rating || p.rating < 4 || !p.user_ratings_total || p.user_ratings_total < 5) {
          debugCb?.(`  scarto "${p.name}": qualità sotto soglia (${p.rating ?? "n/d"}★ / ${p.user_ratings_total ?? 0} recensioni)`);
          return false;
        }
        const pLat = p.geometry.location.lat, pLng = p.geometry.location.lng;
        const km = hasSegment
          ? perpKmToSegment(pLat, pLng, segFromLat, segFromLng, segToLat, segToLng)
          : haversineKm({ lat, lng }, { lat: pLat, lng: pLng });
        if (km > MAX_DETOUR_KM) { debugCb?.(`  scarto "${p.name}": dist=${km.toFixed(2)}km > max=${MAX_DETOUR_KM.toFixed(1)}km`); return false; }
        p._detourKm = km;
        return true;
      })
      // Preferisci i locali SUL percorso: ordina per distanza dal tragitto (a bucket di
      // 0.5km per evitare oscillazioni), usando il punteggio rating·log(recensioni) solo
      // come spareggio. Meglio un bar modesto sulla strada che un locale ottimo lontano.
      .sort((a, b) => {
        const da = Math.round(a._detourKm * 2) / 2, db = Math.round(b._detourKm * 2) / 2;
        if (da !== db) return da - db;
        return placesScore(b) - placesScore(a);
      })
      .slice(0, 5);

    if (!candidates.length) { placesCache.set(cacheKey, null); return null; }

    let chosen = candidates[0];
    let chosenOpenAtBreak = null;

    if (checkHours) {
      // Fetch opening hours for top candidates and prefer open ones
      const withHours = await Promise.all(candidates.map(async p => {
        const oh = await fetchPlaceDetails(p.place_id, key);
        const openAtBreak = isOpenAtTime(oh?.periods ?? null, targetDay, breakTimeMin);
        return { p, openAtBreak };
      }));

      const open = withHours.filter(x => x.openAtBreak === true);
      const unknown = withHours.filter(x => x.openAtBreak === null);

      if (open.length) {
        chosen = open[0].p;
        chosenOpenAtBreak = true;
      } else if (unknown.length) {
        chosen = unknown[0].p;
        chosenOpenAtBreak = null;
      } else {
        // All candidates definitively closed at break time — skip this location
        withHours.forEach(x => debugCb?.(`  chiuso "${x.p.name}" alle ${Math.floor(breakTimeMin/60)}:${String(breakTimeMin%60).padStart(2,"0")}`));
        placesCache.set(cacheKey, null);
        return null;
      }
    }

    const result = {
      customer: chosen.name,
      location: chosen.vicinity || "",
      fullAddress: chosen.vicinity || "",
      lat: chosen.geometry.location.lat,
      lng: chosen.geometry.location.lng,
      rating: chosen.rating,
      reviewCount: chosen.user_ratings_total,
      placeId: chosen.place_id || null,
      openAtBreak: chosenOpenAtBreak,
      addressType: "rest",
      fromPlaces: true
    };
    placesCache.set(cacheKey, result);
    return result;
  } catch {
    placesCache.set(cacheKey, null);
    return null;
  }
}

export async function findNearbyRestaurant(lat, lng, segFromLat, segFromLng, segToLat, segToLng, radiusM = 8000, lunchTimeMin = null, scheduledDate = null, maxDetourKm = 2.5) {
  if (!lat || !lng) return null;
  const key = API_KEY();
  if (!key) return null;

  const cacheKey = `restaurant_${placesCacheKey(lat, lng)}_r${radiusM}`;
  if (placesCache.has(cacheKey)) return placesCache.get(cacheKey);

  const EXCLUDE_KEYWORDS = /hotel|alberg|catering|banquet|spa|resort/i;
  const MAX_DETOUR_KM = maxDetourKm;

  const hasSegment = segFromLat != null && segToLat != null;
  const checkHours = lunchTimeMin != null && scheduledDate != null;
  const targetDay = checkHours ? (() => {
    const [y, m, d] = scheduledDate.split("-").map(Number);
    return new Date(y, m - 1, d).getDay();
  })() : null;

  try {
    const url = `${BASE}/place/nearbysearch/json?location=${lat},${lng}&radius=${radiusM}&type=restaurant&language=it&keyword=mensa+trattoria+osteria+ristorante+pizzeria&key=${key}`;
    trackCall("google_maps", "nearby_search");
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const data = await res.json();
    console.log("[Places/restaurant]", lat.toFixed(4), lng.toFixed(4), "→ status:", data.status, "results:", data.results?.length ?? 0);
    if (data.status !== "OK" || !data.results?.length) {
      placesCache.set(cacheKey, null);
      return null;
    }

    const candidates = data.results
      .filter(p => {
        // Pranzi: qualità più alta delle soste — almeno 4.3 stelle e 20 recensioni.
        if (!p.rating || p.rating < 4.3 || p.user_ratings_total < 20) return false;
        if (EXCLUDE_KEYWORDS.test(p.name)) return false;
        // Fascia prezzo ≤ ~25€/persona: Google price_level 2 = "Moderato"; oltre (3-4) = escluso.
        if (p.price_level != null && p.price_level > 2) return false;
        const pLat = p.geometry.location.lat, pLng = p.geometry.location.lng;
        const km = hasSegment
          ? perpKmToSegment(pLat, pLng, segFromLat, segFromLng, segToLat, segToLng)
          : haversineKm({ lat, lng }, { lat: pLat, lng: pLng });
        return km <= MAX_DETOUR_KM;
      })
      .sort((a, b) => placesScore(b) - placesScore(a))
      .slice(0, 5);

    if (!candidates.length) { placesCache.set(cacheKey, null); return null; }

    let chosen = candidates[0];
    let chosenOpenAtBreak = null;

    if (checkHours) {
      const withHours = await Promise.all(candidates.map(async p => {
        const oh = await fetchPlaceDetails(p.place_id, key);
        const openAtBreak = isOpenAtTime(oh?.periods ?? null, targetDay, lunchTimeMin);
        return { p, openAtBreak };
      }));
      const open = withHours.filter(x => x.openAtBreak === true);
      const unknown = withHours.filter(x => x.openAtBreak === null);
      if (open.length) { chosen = open[0].p; chosenOpenAtBreak = true; }
      else if (unknown.length) { chosen = unknown[0].p; chosenOpenAtBreak = null; }
      else { placesCache.set(cacheKey, null); return null; }
    }

    const result = {
      customer: chosen.name,
      location: chosen.vicinity || "",
      fullAddress: chosen.vicinity || "",
      lat: chosen.geometry.location.lat,
      lng: chosen.geometry.location.lng,
      rating: chosen.rating,
      reviewCount: chosen.user_ratings_total,
      placeId: chosen.place_id || null,
      openAtBreak: chosenOpenAtBreak,
      addressType: "restaurant",
      fromPlaces: true
    };
    placesCache.set(cacheKey, result);
    return result;
  } catch {
    placesCache.set(cacheKey, null);
    return null;
  }
}

export async function routeShape(points) {
  if (points.length < 2) return { source: "none", coordinates: [] };
  const resolved = await Promise.all(points.map(resolvePlace));
  const key = API_KEY();
  if (key) {
    try {
      const origin = `${resolved[0].lat},${resolved[0].lng}`;
      const dest = `${resolved[resolved.length - 1].lat},${resolved[resolved.length - 1].lng}`;
      const waypoints = resolved.slice(1, -1).map(p => `${p.lat},${p.lng}`).join("|");
      let url = `${BASE}/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}&region=it&language=it&key=${key}`;
      if (waypoints) url += `&waypoints=${encodeURIComponent(waypoints)}`;
      trackCall("google_maps", "directions");
      const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
      const data = await res.json();
      if (data.status === "OK" && data.routes?.[0]) {
        const encoded = data.routes[0].overview_polyline.points;
        return { source: "google", coordinates: decodePolyline(encoded) };
      }
    } catch {
      // fallthrough
    }
  }
  return { source: "straight-line", coordinates: resolved.map(p => [p.lat, p.lng]) };
}
