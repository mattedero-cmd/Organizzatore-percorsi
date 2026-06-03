const CITY_COORDS = [
  ["riva del garda", 45.889, 10.843],
  ["arco", 45.918, 10.886],
  ["rovereto", 45.890, 11.040],
  ["trento", 46.067, 11.122],
  ["lavis", 46.140, 11.112],
  ["mezzolombardo", 46.214, 11.096],
  ["mezzocorona", 46.214, 11.119],
  ["cles", 46.365, 11.033],
  ["borgo valsugana", 46.053, 11.456],
  ["bressanone", 46.716, 11.657],
  ["brunico", 46.797, 11.936],
  ["bolzano", 46.498, 11.354],
  ["merano", 46.669, 11.163],
  ["verona", 45.438, 10.992],
  ["brescia", 45.541, 10.211],
  ["milano", 45.464, 9.190],
  ["padova", 45.407, 11.877],
  ["vicenza", 45.546, 11.535],
  ["venezia", 45.440, 12.315],
  ["mantova", 45.156, 10.791],
  ["via vittoria", 46.004, 11.196],
  ["vigolana", 46.004, 11.196],
  ["casa", 46.004, 11.196]
];

const GEOCODE_TIMEOUT_MS = Number(process.env.GEOCODE_TIMEOUT_MS || 2500);
const ROUTE_TIMEOUT_MS = Number(process.env.ROUTE_TIMEOUT_MS || 3000);
const USE_EXTERNAL_DISTANCE_API = process.env.USE_EXTERNAL_DISTANCE_API === "1";
const placeCache = new Map();
const routeCache = new Map();

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function hasValidSavedCoords(place) {
  const lat = Number(place?.lat);
  const lng = Number(place?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) > 1 && Math.abs(lng) > 1;
}

function fallbackCoords(label) {
  const normalized = String(label || "").toLowerCase();
  const known = CITY_COORDS.find(([city]) => normalized.includes(city));
  if (known) return { lat: known[1], lng: known[2], source: "local-city" };

  const hash = hashString(normalized || "default");
  const lat = 45.7 + ((hash % 900) / 1000);
  const lng = 10.5 + (((hash / 1000) % 1200) / 1000);
  return { lat, lng, source: "local-estimate" };
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineKm(a, b) {
  const earthKm = 6371;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthKm * Math.asin(Math.sqrt(h));
}

async function orsGeocode(query) {
  const key = process.env.OPENROUTESERVICE_API_KEY;
  if (!key || !query) return null;

  const url = new URL("https://api.openrouteservice.org/geocode/search");
  url.searchParams.set("api_key", key);
  url.searchParams.set("text", query);
  url.searchParams.set("boundary.country", "IT");
  url.searchParams.set("size", "1");

  const response = await fetch(url, { signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Geocoding non riuscito (${response.status})`);
  const payload = await response.json();
  const feature = payload.features?.[0];
  if (!feature) return null;
  const [lng, lat] = feature.geometry.coordinates;
  return { lat, lng, source: "openrouteservice" };
}

async function mapQuestGeocode(query) {
  const key = process.env.MAPQUEST_API_KEY;
  if (!key || !query) return null;

  const url = new URL("https://www.mapquestapi.com/geocoding/v1/address");
  url.searchParams.set("key", key);
  url.searchParams.set("location", query);
  url.searchParams.set("maxResults", "1");
  url.searchParams.set("thumbMaps", "false");
  url.searchParams.set("outFormat", "json");

  const response = await fetch(url, { signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`MapQuest geocoding non riuscito (${response.status})`);
  const payload = await response.json();
  const location = payload.results?.[0]?.locations?.[0];
  const latLng = location?.latLng;
  if (!latLng || !Number.isFinite(Number(latLng.lat)) || !Number.isFinite(Number(latLng.lng))) {
    return null;
  }
  return { lat: Number(latLng.lat), lng: Number(latLng.lng), source: "mapquest" };
}

function addressQuery(place) {
  const structuredParts = [
    place?.street,
    [place?.postalCode || place?.postal_code, place?.city].filter(Boolean).join(" "),
    place?.province
  ].filter(Boolean);
  const structured = structuredParts.length
    ? [...structuredParts, place?.country || "Italia"].filter(Boolean).join(", ")
    : "";

  const direct = place?.fullAddress || place?.address;
  const label = [place?.label, place?.customer, place?.location].filter(Boolean).join(" ");
  return structured || direct || label;
}

async function orsRoute(a, b) {
  const key = process.env.OPENROUTESERVICE_API_KEY;
  if (!key) return null;

  const response = await fetch("https://api.openrouteservice.org/v2/directions/driving-car/json", {
    method: "POST",
    signal: AbortSignal.timeout(ROUTE_TIMEOUT_MS),
    headers: {
      "Authorization": key,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      coordinates: [
        [a.lng, a.lat],
        [b.lng, b.lat]
      ]
    })
  });

  if (!response.ok) throw new Error(`Distanza non riuscita (${response.status})`);
  const payload = await response.json();
  const summary = payload.routes?.[0]?.summary;
  if (!summary) return null;
  return {
    km: summary.distance / 1000,
    driveMinutes: Math.ceil(summary.duration / 60),
    source: "openrouteservice"
  };
}

async function mapQuestRoute(a, b) {
  const key = process.env.MAPQUEST_API_KEY;
  if (!key) return null;

  const url = new URL("https://www.mapquestapi.com/directions/v2/route");
  url.searchParams.set("key", key);
  url.searchParams.set("unit", "k");
  url.searchParams.set("outFormat", "json");

  const response = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(ROUTE_TIMEOUT_MS),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      locations: [
        { latLng: { lat: a.lat, lng: a.lng } },
        { latLng: { lat: b.lat, lng: b.lng } }
      ],
      options: {
        routeType: "fastest",
        unit: "k",
        locale: "it_IT"
      }
    })
  });

  if (!response.ok) throw new Error(`MapQuest distanza non riuscita (${response.status})`);
  const payload = await response.json();
  const route = payload.route;
  if (!route || route.routeError?.errorCode > 0) return null;
  return {
    km: Number(route.distance || 0),
    driveMinutes: Math.max(1, Math.ceil(Number(route.time || 0) / 60)),
    source: "mapquest"
  };
}

async function mapQuestRouteShape(points) {
  const key = process.env.MAPQUEST_API_KEY;
  if (!key || points.length < 2) return null;

  const url = new URL("https://www.mapquestapi.com/directions/v2/route");
  url.searchParams.set("key", key);
  url.searchParams.set("unit", "k");
  url.searchParams.set("outFormat", "json");

  const response = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(12000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      locations: points.map((point) => ({ latLng: { lat: point.lat, lng: point.lng } })),
      options: {
        routeType: "fastest",
        unit: "k",
        locale: "it_IT",
        fullShape: true,
        shapeFormat: "raw",
        generalize: 0
      }
    })
  });

  if (!response.ok) throw new Error(`MapQuest percorso non riuscito (${response.status})`);
  const payload = await response.json();
  const route = payload.route;
  const shapePoints = route?.shape?.shapePoints;
  if (!route || route.routeError?.errorCode > 0 || !Array.isArray(shapePoints)) return null;

  const coordinates = [];
  for (let index = 0; index < shapePoints.length - 1; index += 2) {
    const lat = Number(shapePoints[index]);
    const lng = Number(shapePoints[index + 1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) coordinates.push([lat, lng]);
  }

  return {
    source: "mapquest",
    coordinates,
    distanceKm: Number(route.distance || 0),
    driveMinutes: Math.max(1, Math.ceil(Number(route.time || 0) / 60))
  };
}

async function osrmRouteShape(points) {
  if (points.length < 2) return null;
  const coordinatePath = points
    .map((point) => `${Number(point.lng).toFixed(6)},${Number(point.lat).toFixed(6)}`)
    .join(";");
  const url = new URL(`https://router.project-osrm.org/route/v1/driving/${coordinatePath}`);
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("steps", "false");

  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`OSRM percorso non riuscito (${response.status})`);
  const payload = await response.json();
  const route = payload.routes?.[0];
  const coordinates = route?.geometry?.coordinates;
  if (!Array.isArray(coordinates)) return null;

  return {
    source: "osrm",
    coordinates: coordinates
      .map(([lng, lat]) => [Number(lat), Number(lng)])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng)),
    distanceKm: Number(route.distance || 0) / 1000,
    driveMinutes: Math.max(1, Math.ceil(Number(route.duration || 0) / 60))
  };
}

export async function resolvePlace(place) {
  if (hasValidSavedCoords(place)) {
    return { lat: Number(place.lat), lng: Number(place.lng), source: "saved" };
  }

  const label = addressQuery(place);
  const cacheKey = String(label || "").toLowerCase().trim();
  if (placeCache.has(cacheKey)) return placeCache.get(cacheKey);

  const local = fallbackCoords(label);
  if (local.source === "local-city") {
    placeCache.set(cacheKey, local);
    return local;
  }

  try {
    const mapQuest = await mapQuestGeocode(label);
    if (mapQuest) {
      placeCache.set(cacheKey, mapQuest);
      return mapQuest;
    }
  } catch (error) {
    console.warn(error.message);
  }

  try {
    const geocoded = await orsGeocode(label);
    if (geocoded) {
      placeCache.set(cacheKey, geocoded);
      return geocoded;
    }
  } catch (error) {
    console.warn(error.message);
  }

  placeCache.set(cacheKey, local);
  return local;
}

export async function routeBetween(a, b) {
  const from = await resolvePlace(a);
  const to = await resolvePlace(b);
  const cacheKey = [
    from.lat.toFixed(5),
    from.lng.toFixed(5),
    to.lat.toFixed(5),
    to.lng.toFixed(5)
  ].join(":");
  if (routeCache.has(cacheKey)) return routeCache.get(cacheKey);

  const roadFactor = Number(process.env.FALLBACK_ROAD_FACTOR || 1.22);
  const speed = Number(process.env.FALLBACK_AVERAGE_SPEED_KMH || 52);
  const fallback = {
    km: Math.max(0.2, haversineKm(from, to) * roadFactor),
    driveMinutes: Math.max(4, Math.ceil((Math.max(0.2, haversineKm(from, to) * roadFactor) / speed) * 60 + 4)),
    source: "local-estimate"
  };

  if (!USE_EXTERNAL_DISTANCE_API) {
    routeCache.set(cacheKey, fallback);
    return fallback;
  }

  try {
    const mapQuest = await mapQuestRoute(from, to);
    if (mapQuest) {
      routeCache.set(cacheKey, mapQuest);
      return mapQuest;
    }
  } catch (error) {
    console.warn(error.message);
  }

  try {
    const routed = await orsRoute(from, to);
    if (routed) {
      routeCache.set(cacheKey, routed);
      return routed;
    }
  } catch (error) {
    console.warn(error.message);
  }

  routeCache.set(cacheKey, fallback);
  return fallback;
}

export async function routeShape(points) {
  const resolved = [];
  for (const point of points || []) {
    const place = await resolvePlace(point);
    resolved.push({
      label: point.label || "",
      address: point.address || point.fullAddress || "",
      street: point.street || "",
      city: point.city || "",
      province: point.province || "",
      postalCode: point.postalCode || point.postal_code || "",
      country: point.country || "Italia",
      lat: place.lat,
      lng: place.lng,
      source: place.source
    });
  }

  const valid = resolved.filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  if (valid.length < 2) {
    return { source: "none", points: valid, coordinates: [] };
  }

  try {
    const routed = await mapQuestRouteShape(valid);
    if (routed?.coordinates?.length) {
      return { ...routed, points: valid };
    }
  } catch (error) {
    console.warn(error.message);
  }

  try {
    const routed = await osrmRouteShape(valid);
    if (routed?.coordinates?.length) {
      return { ...routed, points: valid };
    }
  } catch (error) {
    console.warn(error.message);
  }

  return {
    source: "straight-line",
    points: valid,
    coordinates: valid.map((point) => [point.lat, point.lng])
  };
}
