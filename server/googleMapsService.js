const API_KEY = () => process.env.GOOGLE_MAPS_API_KEY || "";
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
