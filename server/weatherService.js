import { resolvePlace } from "./mapService.js";

const WEATHER_CODES = new Map([
  [0, "Sereno"], [1, "Prevalentemente sereno"], [2, "Parzialmente nuvoloso"], [3, "Nuvoloso"],
  [45, "Nebbia"], [48, "Nebbia con brina"], [51, "Pioviggine leggera"], [53, "Pioviggine"],
  [55, "Pioviggine intensa"], [61, "Pioggia leggera"], [63, "Pioggia"], [65, "Pioggia intensa"],
  [71, "Neve leggera"], [73, "Neve"], [75, "Neve intensa"], [80, "Rovesci leggeri"],
  [81, "Rovesci"], [82, "Rovesci intensi"], [95, "Temporale"]
]);

const WEATHER_FETCH_TIMEOUT_MS = Number(process.env.WEATHER_FETCH_TIMEOUT_MS || 2500);
const WEATHER_ROW_TIMEOUT_MS = Number(process.env.WEATHER_ROW_TIMEOUT_MS || 3000);

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
  return weather;
}

async function openMeteoWeather(coords, row, scheduledDate, mode) {
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
  const response = await fetch(url, { signal: AbortSignal.timeout(WEATHER_FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Meteo Open-Meteo non riuscito (${response.status})`);
  return fromOpenMeteo(await response.json(), row, scheduledDate, mode, "open-meteo");
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
