import { resolvePlace } from "./mapService.js";
import { trackCall } from "./apiStats.js";

const WEATHER_CODES = new Map([
  [0, "Sereno"], [1, "Prevalentemente sereno"], [2, "Parzialmente nuvoloso"], [3, "Nuvoloso"],
  [45, "Nebbia"], [48, "Nebbia con brina"], [51, "Pioviggine leggera"], [53, "Pioviggine"],
  [55, "Pioviggine intensa"], [61, "Pioggia leggera"], [63, "Pioggia"], [65, "Pioggia intensa"],
  [71, "Neve leggera"], [73, "Neve"], [75, "Neve intensa"], [80, "Rovesci leggeri"],
  [81, "Rovesci"], [82, "Rovesci intensi"], [95, "Temporale"]
]);

const WEATHER_FETCH_TIMEOUT_MS = Number(process.env.WEATHER_FETCH_TIMEOUT_MS || 6000);
const WEATHER_ROW_TIMEOUT_MS = Number(process.env.WEATHER_ROW_TIMEOUT_MS || 8000);

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function timeoutAfter(ms, message) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

function fallbackWeather(row, scheduledDate, mode, reason, existingWeather = []) {
  const existing = existingWeather.find((item) => Number(item.stopNumber) === Number(row.stopNumber));
  if (existing) {
    return {
      ...existing,
      warnings: [...new Set([...(existing.warnings || []), "meteo non aggiornato in tempo"])]
    };
  }

  return {
    stopNumber: row.stopNumber,
    customer: row.customer,
    location: row.location,
    scheduledDate,
    time: row.arrivalTime,
    description: "Meteo non disponibile",
    temperatureC: null,
    precipitationMm: null,
    windKmh: null,
    source: "none",
    mode,
    warnings: [reason]
  };
}

function isPastDate(date) {
  return date && date < todayIso();
}

function normalizeHour(time) {
  const hour = Number(String(time || "12:00").slice(0, 2));
  return Number.isFinite(hour) ? Math.max(0, Math.min(23, hour)) : 12;
}

function nearestIndex(times, scheduledDate, time) {
  const targetHour = normalizeHour(time);
  let bestIndex = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let index = 0; index < times.length; index += 1) {
    const current = String(times[index]);
    const [datePart, timePart = "00:00"] = current.split("T");
    const hour = Number(timePart.slice(0, 2));
    const dayPenalty = datePart === scheduledDate ? 0 : 100;
    const score = dayPenalty + Math.abs(hour - targetHour);
    if (score < bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  }
  return bestIndex;
}

function weatherWarnings(weather) {
  const warnings = [];
  if (Number(weather.precipitationMm || 0) >= 5) warnings.push("pioggia significativa");
  if (Number(weather.windKmh || 0) >= 40) warnings.push("vento forte");
  if (Number(weather.temperatureC || 0) <= 0) warnings.push("possibile ghiaccio");
  if (Number(weather.temperatureC || 0) >= 34) warnings.push("caldo intenso");
  return warnings;
}

function fromOpenMeteo(payload, row, scheduledDate, mode, source) {
  const hourly = payload.hourly;
  if (!hourly?.time?.length) return null;
  const index = nearestIndex(hourly.time, scheduledDate, row.arrivalTime);
  const weather = {
    stopNumber: row.stopNumber,
    customer: row.customer,
    location: row.location,
    scheduledDate,
    time: row.arrivalTime,
    temperatureC: Number(hourly.temperature_2m?.[index] ?? 0),
    precipitationMm: Number(hourly.precipitation?.[index] ?? 0),
    windKmh: Number(hourly.wind_speed_10m?.[index] ?? 0),
    description: WEATHER_CODES.get(Number(hourly.weather_code?.[index])) || "Dato meteo",
    source,
    mode
  };
  weather.warnings = weatherWarnings(weather);
  const city = encodeURIComponent(row.location || row.customer || "");
  weather.sourceUrl = city ? `https://www.3bmeteo.com/meteo/${city}` : "https://www.3bmeteo.com/";
  return weather;
}

// Cache in-memory per Open-Meteo: chiave = "lat,lng,date,mode"
const openMeteoCache = new Map();
const openMeteoInflight = new Map();

async function openMeteoWeather(coords, row, scheduledDate, mode) {
  const cacheKey = `${Math.round(coords.lat * 100) / 100},${Math.round(coords.lng * 100) / 100},${scheduledDate},${mode}`;
  if (openMeteoCache.has(cacheKey)) {
    return fromOpenMeteo(openMeteoCache.get(cacheKey), row, scheduledDate, mode, "open-meteo");
  }
  // Dedup: se stessa chiave è già in volo, aspetta quella promise invece di fare una nuova request
  if (openMeteoInflight.has(cacheKey)) {
    const data = await openMeteoInflight.get(cacheKey);
    return fromOpenMeteo(data, row, scheduledDate, mode, "open-meteo");
  }
  const baseUrl = mode === "historical"
    ? "https://archive-api.open-meteo.com/v1/archive"
    : "https://api.open-meteo.com/v1/forecast";
  const url = new URL(baseUrl);
  url.searchParams.set("latitude", coords.lat);
  url.searchParams.set("longitude", coords.lng);
  url.searchParams.set("hourly", "temperature_2m,precipitation,weather_code,wind_speed_10m");
  url.searchParams.set("timezone", "auto");
  if (mode === "historical") {
    url.searchParams.set("start_date", scheduledDate);
    url.searchParams.set("end_date", scheduledDate);
  } else {
    url.searchParams.set("forecast_days", "16");
  }
  trackCall("open_meteo", "forecast");
  const fetchPromise = fetch(url, { signal: AbortSignal.timeout(WEATHER_FETCH_TIMEOUT_MS) })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Meteo Open-Meteo non riuscito (${response.status})`);
      const data = await response.json();
      openMeteoCache.set(cacheKey, data);
      return data;
    })
    .finally(() => openMeteoInflight.delete(cacheKey));
  openMeteoInflight.set(cacheKey, fetchPromise);
  const data = await fetchPromise;
  return fromOpenMeteo(data, row, scheduledDate, mode, "open-meteo");
}

async function openWeatherForecast(coords, row, scheduledDate) {
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) return null;
  const url = new URL("https://api.openweathermap.org/data/2.5/forecast");
  url.searchParams.set("lat", coords.lat);
  url.searchParams.set("lon", coords.lng);
  url.searchParams.set("appid", key);
  url.searchParams.set("units", "metric");
  url.searchParams.set("lang", "it");
  trackCall("open_meteo", "forecast");
  const response = await fetch(url, { signal: AbortSignal.timeout(WEATHER_FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Meteo OpenWeather non riuscito (${response.status})`);
  const payload = await response.json();
  if (!payload.list?.length) return null;
  const index = nearestIndex(payload.list.map((item) => item.dt_txt.replace(" ", "T")), scheduledDate, row.arrivalTime);
  const item = payload.list[index];
  const weather = {
    stopNumber: row.stopNumber,
    customer: row.customer,
    location: row.location,
    scheduledDate,
    time: row.arrivalTime,
    temperatureC: Number(item.main?.temp ?? 0),
    precipitationMm: Number(item.rain?.["3h"] || item.snow?.["3h"] || 0),
    windKmh: Number(item.wind?.speed ? item.wind.speed * 3.6 : 0),
    description: item.weather?.[0]?.description || "Previsione",
    source: "openweather",
    mode: "forecast"
  };
  weather.warnings = weatherWarnings(weather);
  const owCity = encodeURIComponent(row.location || row.customer || "");
  weather.sourceUrl = owCity ? `https://www.3bmeteo.com/meteo/${owCity}` : "https://www.3bmeteo.com/";
  return weather;
}

async function weatherbitForecast(coords, row, scheduledDate) {
  const key = process.env.WEATHERBIT_API_KEY;
  if (!key) return null;
  const url = new URL("https://api.weatherbit.io/v2.0/forecast/hourly");
  url.searchParams.set("lat", coords.lat);
  url.searchParams.set("lon", coords.lng);
  url.searchParams.set("key", key);
  url.searchParams.set("hours", "240");
  url.searchParams.set("lang", "it");
  trackCall("open_meteo", "forecast");
  const response = await fetch(url, { signal: AbortSignal.timeout(WEATHER_FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Meteo Weatherbit non riuscito (${response.status})`);
  const payload = await response.json();
  if (!payload.data?.length) return null;
  const index = nearestIndex(payload.data.map((item) => item.timestamp_local), scheduledDate, row.arrivalTime);
  const item = payload.data[index];
  const weather = {
    stopNumber: row.stopNumber,
    customer: row.customer,
    location: row.location,
    scheduledDate,
    time: row.arrivalTime,
    temperatureC: Number(item.temp ?? 0),
    precipitationMm: Number(item.precip ?? 0),
    windKmh: Number(item.wind_spd ? item.wind_spd * 3.6 : 0),
    description: item.weather?.description || "Previsione",
    source: "weatherbit",
    mode: "forecast"
  };
  weather.warnings = weatherWarnings(weather);
  const wbCity = encodeURIComponent(row.location || row.customer || "");
  weather.sourceUrl = wbCity ? `https://www.3bmeteo.com/meteo/${wbCity}` : "https://www.3bmeteo.com/";
  return weather;
}

// ── Meteo Trentino (bollettino open data Provincia Autonoma di Trento) ────────
// Per le tappe in Trentino usa il bollettino ufficiale; il bollettino è
// giornaliero per località, quindi la temperatura all'ora di arrivo viene
// interpolata tra minima e massima del giorno.

const MT_BBOX = { latMin: 45.65, latMax: 46.55, lngMin: 10.40, lngMax: 12.00 };

// Provincia Autonoma di Bolzano — bounding box e comuni principali
// API: Open Data Hub South Tyrol (pubblica, no auth)
const BZ_BBOX = { latMin: 46.37, latMax: 47.10, lngMin: 10.38, lngMax: 12.48 };

// Codici ISTAT dei principali comuni (usati come mun{code} nell'ODH API)
const BZ_LOCALITIES = [
  { code: "021008", name: "Bolzano",        lat: 46.4981, lng: 11.3548 },
  { code: "021049", name: "Merano",          lat: 46.6688, lng: 11.1597 },
  { code: "021013", name: "Bressanone",      lat: 46.7154, lng: 11.6567 },
  { code: "021015", name: "Brunico",         lat: 46.7958, lng: 11.9358 },
  { code: "021035", name: "San Candido",     lat: 46.7333, lng: 12.2831 },
  { code: "021108", name: "Vipiteno",        lat: 46.8969, lng: 11.4336 },
  { code: "021093", name: "Silandro",        lat: 46.6278, lng: 10.7739 },
  { code: "021043", name: "Laives",          lat: 46.4314, lng: 11.3378 },
  { code: "021002", name: "Appiano",         lat: 46.5533, lng: 11.2644 },
  { code: "021016", name: "Caldaro",         lat: 46.4158, lng: 11.2456 },
  { code: "021036", name: "Sarentino",       lat: 46.6342, lng: 11.3564 },
  { code: "021070", name: "Ortisei",         lat: 46.5747, lng: 11.6719 },
  { code: "021027", name: "Dobbiaco",        lat: 46.7356, lng: 12.2206 },
  { code: "021095", name: "Sluderno",        lat: 46.6547, lng: 10.5814 },
];

const MT_LOCALITIES = [
  { code: "TRENTO", lat: 46.0667, lng: 11.1167 },
  { code: "ROVERETO", lat: 45.8903, lng: 11.0397 },
  { code: "PERGINE VALSUGANA", lat: 46.0622, lng: 11.2364 },
  { code: "BORGO VALSUGANA", lat: 46.0514, lng: 11.4558 },
  { code: "LEVICO TERME", lat: 46.0119, lng: 11.3008 },
  { code: "CLES", lat: 46.3625, lng: 11.0339 },
  { code: "MALE", lat: 46.3531, lng: 10.9117 },
  { code: "CAVALESE", lat: 46.2911, lng: 11.4608 },
  { code: "PREDAZZO", lat: 46.3119, lng: 11.6019 },
  { code: "MOENA", lat: 46.3764, lng: 11.6597 },
  { code: "POZZA DI FASSA", lat: 46.4275, lng: 11.6869 },
  { code: "TIONE DI TRENTO", lat: 46.0353, lng: 10.7269 },
  { code: "PINZOLO", lat: 46.1592, lng: 10.7653 },
  { code: "MADONNA DI CAMPIGLIO", lat: 46.2308, lng: 10.8264 },
  { code: "RIVA DEL GARDA", lat: 45.8867, lng: 10.8408 },
  { code: "ARCO", lat: 45.9183, lng: 10.8867 },
  { code: "MEZZOLOMBARDO", lat: 46.2147, lng: 11.0931 },
  { code: "ALA", lat: 45.7572, lng: 11.0058 },
  { code: "FOLGARIA", lat: 45.9164, lng: 11.1697 },
  { code: "PRIMIERO", lat: 46.1769, lng: 11.8281 },
  { code: "CANAZEI", lat: 46.4769, lng: 11.7714 },
  { code: "ANDALO", lat: 46.1664, lng: 11.0053 }
];

function mtInTrentino(coords) {
  const lat = Number(coords?.lat), lng = Number(coords?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= MT_BBOX.latMin && lat <= MT_BBOX.latMax
    && lng >= MT_BBOX.lngMin && lng <= MT_BBOX.lngMax;
}

function bzInBolzano(coords) {
  const lat = Number(coords?.lat), lng = Number(coords?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= BZ_BBOX.latMin && lat <= BZ_BBOX.latMax
    && lng >= BZ_BBOX.lngMin && lng <= BZ_BBOX.lngMax
    && !mtInTrentino(coords); // evita sovrapposizione con Trentino
}

function bzNearestLocality(coords) {
  const toRad = (d) => d * Math.PI / 180;
  let best = null, bestKm = Infinity;
  for (const loc of BZ_LOCALITIES) {
    const dLat = toRad(loc.lat - coords.lat);
    const dLng = toRad(loc.lng - coords.lng);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(coords.lat)) * Math.cos(toRad(loc.lat)) * Math.sin(dLng / 2) ** 2;
    const km = 6371 * 2 * Math.asin(Math.sqrt(a));
    if (km < bestKm) { bestKm = km; best = loc; }
  }
  return best;
}

function mtNearestLocality(coords) {
  const toRad = (d) => d * Math.PI / 180;
  let best = null, bestKm = Infinity;
  for (const loc of MT_LOCALITIES) {
    const dLat = toRad(loc.lat - coords.lat);
    const dLng = toRad(loc.lng - coords.lng);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(coords.lat)) * Math.cos(toRad(loc.lat)) * Math.sin(dLng / 2) ** 2;
    const km = 6371 * 2 * Math.asin(Math.sqrt(a));
    if (km < bestKm) { bestKm = km; best = loc; }
  }
  return best;
}

// Stima della temperatura all'ora richiesta: minima alle 06, massima alle 15
function mtTempAtHour(tMin, tMax, hour) {
  if (!Number.isFinite(tMin) || !Number.isFinite(tMax)) return tMax ?? tMin ?? null;
  const h = Math.max(0, Math.min(23, hour));
  const factor = h <= 6 ? 0.15
    : h <= 15 ? 0.15 + 0.85 * ((h - 6) / 9)
    : 1 - 0.6 * ((h - 15) / 9);
  return Math.round((tMin + (tMax - tMin) * factor) * 10) / 10;
}

function mtWarningsFromDescription(desc) {
  const d = String(desc || "").toLowerCase();
  const warnings = [];
  if (/temporal/.test(d)) warnings.push("possibili temporali");
  else if (/pioggia|rovesci|precipitaz/.test(d)) warnings.push("pioggia prevista");
  if (/neve|nevicat|nevos/.test(d)) warnings.push("neve prevista");
  if (/vento|raffiche/.test(d)) warnings.push("vento forte");
  return warnings;
}

// ── Meteo Bolzano (Open Data Hub South Tyrol) ────────────────────────────────
async function meteoBolzanoForecast(coords, row, scheduledDate) {
  if (!bzInBolzano(coords)) return null;
  const loc = bzNearestLocality(coords);
  if (!loc) return null;
  // Open Data Hub: GET /v1/Weather?locfilter=mun{ISTAT}&language=it
  const url = new URL("https://tourism.opendatahub.com/v1/Weather");
  url.searchParams.set("locfilter", `mun${loc.code}`);
  url.searchParams.set("language", "it");
  const response = await fetch(url, {
    signal: AbortSignal.timeout(WEATHER_FETCH_TIMEOUT_MS),
    headers: { "Accept": "application/json" }
  });
  if (!response.ok) throw new Error(`Meteo Bolzano ODH non riuscito (${response.status})`);
  const payload = await response.json();
  // Schema ODH: payload.BezirksForecast[].Zeiten[].date + .WeatherCode + .TempMaxim + .TempMinim
  // oppure payload[0].BezirksForecast[] a seconda della versione
  const forecasts = (Array.isArray(payload) ? payload[0] : payload)?.BezirksForecast ?? [];
  if (!forecasts.length) return null;
  // Cerca il giorno corrispondente tra tutti i distretti (primo che ha il giorno)
  let dayData = null;
  for (const district of forecasts) {
    const zeiten = district?.Zeiten ?? [];
    const found = zeiten.find((z) => String(z?.date || "").slice(0, 10) === scheduledDate);
    if (found) { dayData = found; break; }
  }
  if (!dayData) return null;
  const tMin = Number(dayData.TempMinim ?? dayData.tempMinim ?? NaN);
  const tMax = Number(dayData.TempMaxim ?? dayData.tempMaxim ?? NaN);
  const desc = String(dayData.WeatherDesc || dayData.weatherDesc || dayData.WeatherCode || "Previsione Alto Adige").trim();
  const weather = {
    stopNumber: row.stopNumber,
    customer: row.customer,
    location: row.location,
    scheduledDate,
    time: row.arrivalTime,
    temperatureC: mtTempAtHour(tMin, tMax, normalizeHour(row.arrivalTime)),
    precipitationMm: null,
    windKmh: null,
    description: `${desc} (${loc.name})`,
    source: "meteobz",
    mode: "forecast"
  };
  weather.warnings = mtWarningsFromDescription(desc);
  weather.sourceUrl = `https://www.3bmeteo.com/meteo/${encodeURIComponent(loc.name)}`;
  return weather;
}

async function meteoTrentinoForecast(coords, row, scheduledDate) {
  if (!mtInTrentino(coords)) return null;
  const loc = mtNearestLocality(coords);
  if (!loc) return null;
  const url = new URL("https://www.meteotrentino.it/protcivtn-meteo/api/fronte/previsioneOpenDataLocalita");
  url.searchParams.set("localita", loc.code);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(WEATHER_FETCH_TIMEOUT_MS),
    headers: { "Accept": "application/json" }
  });
  if (!response.ok) throw new Error(`Meteo Trentino non riuscito (${response.status})`);
  const payload = await response.json();
  // Schema tollerante: previsione[].giorni[] con giorno/data, tMinGiorno/tmin,
  // tMaxGiorno/tmax, descIcona/descrizione/testo
  const giorni = (payload?.previsione || []).flatMap((p) => p?.giorni || []);
  const day = giorni.find((g) => String(g?.giorno || g?.data || "").slice(0, 10) === scheduledDate);
  if (!day) return null;
  const tMin = Number(day.tMinGiorno ?? day.tmin ?? day.temperaturaMin ?? NaN);
  const tMax = Number(day.tMaxGiorno ?? day.tmax ?? day.temperaturaMax ?? NaN);
  const description = String(day.descIcona || day.descrizione || day.testo || "Bollettino Meteo Trentino").trim();
  const weather = {
    stopNumber: row.stopNumber,
    customer: row.customer,
    location: row.location,
    scheduledDate,
    time: row.arrivalTime,
    temperatureC: mtTempAtHour(tMin, tMax, normalizeHour(row.arrivalTime)),
    precipitationMm: null,
    windKmh: null,
    description: `${description} (${loc.code.charAt(0)}${loc.code.slice(1).toLowerCase()})`,
    source: "meteotrentino",
    mode: "forecast"
  };
  weather.warnings = mtWarningsFromDescription(description);
  weather.sourceUrl = `https://www.meteotrentino.it/previsioni-meteo/localita/${loc.code.toLowerCase().replace(/ /g, '-')}`;
  return weather;
}

async function weatherForRow(row, scheduledDate, forceHistorical) {
  const coords = await resolvePlace({
    label: `${row.customer} ${row.location}`,
    fullAddress: row.address,
    lat: row.lat,
    lng: row.lng
  });
  const mode = forceHistorical || isPastDate(scheduledDate) ? "historical" : "forecast";
  if (mode === "forecast") {
    try {
      const bolzano = await meteoBolzanoForecast(coords, row, scheduledDate);
      if (bolzano) return bolzano;
    } catch (error) {
      console.warn("[meteobz]", error.message);
    }
    try {
      const trentino = await meteoTrentinoForecast(coords, row, scheduledDate);
      if (trentino) return trentino;
    } catch (error) {
      console.warn(error.message);
    }
    try {
      const openWeather = await openWeatherForecast(coords, row, scheduledDate);
      if (openWeather) return openWeather;
    } catch (error) {
      console.warn(error.message);
    }
    try {
      const weatherbit = await weatherbitForecast(coords, row, scheduledDate);
      if (weatherbit) return weatherbit;
    } catch (error) {
      console.warn(error.message);
    }
  }
  return openMeteoWeather(coords, row, scheduledDate, mode);
}

export function shouldRefreshWeather(route) {
  const scheduledDate = route.scheduledDate || todayIso();
  if (!route.weather?.length) return true;
  if (isPastDate(scheduledDate)) return route.weatherMode !== "historical";
  return true;
}

export async function attachWeather(route, options = {}) {
  const scheduledDate = route.scheduledDate || todayIso();
  const forceHistorical = options.forceHistorical || isPastDate(scheduledDate);
  const mode = forceHistorical ? "historical" : "forecast";
  const existingWeather = Array.isArray(options.existingWeather)
    ? options.existingWeather
    : Array.isArray(route.weather)
      ? route.weather
      : [];
  const rows = route.rows || [];
  const weather = await Promise.all(rows.map(async (row) => {
    try {
      return await Promise.race([
        weatherForRow(row, scheduledDate, forceHistorical),
        timeoutAfter(Number(options.rowTimeoutMs || WEATHER_ROW_TIMEOUT_MS), "meteo non aggiornato in tempo")
      ]);
    } catch (error) {
      return fallbackWeather(row, scheduledDate, mode, error.message, existingWeather);
    }
  }));

  return {
    ...route,
    weather,
    weatherCapturedAt: new Date().toISOString(),
    weatherMode: mode
  };
}
