/**
 * Lightweight API call tracker.
 *
 * trackCall(service, endpoint) — call this every time an external API is used.
 * Counts are accumulated in-memory and flushed to the DB every FLUSH_INTERVAL_MS.
 *
 * Services tracked:
 *   "google_maps"   — Google Maps (Geocode, Routes, Places, Distance)
 *   "openai"        — OpenAI (chat completions, Whisper)
 *   "openroute"     — OpenRouteService (free routing fallback)
 *   "open_meteo"    — Open-Meteo weather (free)
 *   "internal"      — internal /api/* calls (route planning, archive, etc.)
 */

import { runSql, sqlValue, getDbMode } from "./db.js";

const FLUSH_INTERVAL_MS = 60_000; // flush to DB every minute

// in-memory buffer: "YYYY-MM-DD|service|endpoint" → count
const buffer = new Map();

export function trackCall(service, endpoint = "") {
  const day = new Date().toISOString().slice(0, 10);
  const key = `${day}|${service}|${endpoint}`;
  buffer.set(key, (buffer.get(key) ?? 0) + 1);
}

async function flush() {
  if (!buffer.size) return;
  const entries = [...buffer.entries()];
  buffer.clear();

  for (const [key, count] of entries) {
    const [day, service, endpoint] = key.split("|");
    try {
      if (getDbMode() === "postgres") {
        await runSql(`
          INSERT INTO api_calls (day, service, endpoint, count)
          VALUES (${sqlValue(day)}, ${sqlValue(service)}, ${sqlValue(endpoint)}, ${count})
          ON CONFLICT (day, service, endpoint) DO UPDATE SET count = api_calls.count + EXCLUDED.count;
        `);
      } else {
        await runSql(`
          INSERT INTO api_calls (day, service, endpoint, count)
          VALUES (${sqlValue(day)}, ${sqlValue(service)}, ${sqlValue(endpoint)}, ${count})
          ON CONFLICT (day, service, endpoint) DO UPDATE SET count = count + ${count};
        `);
      }
    } catch (err) {
      // Put back in buffer if flush failed, will retry next interval
      const existing = buffer.get(key) ?? 0;
      buffer.set(key, existing + count);
      console.error("apiStats flush error:", err.message);
    }
  }
}

export async function initApiStatsTable() {
  if (getDbMode() === "postgres") {
    await runSql(`
      CREATE TABLE IF NOT EXISTS api_calls (
        day TEXT NOT NULL,
        service TEXT NOT NULL,
        endpoint TEXT NOT NULL DEFAULT '',
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (day, service, endpoint)
      );
    `);
  } else {
    await runSql(`
      CREATE TABLE IF NOT EXISTS api_calls (
        day TEXT NOT NULL,
        service TEXT NOT NULL,
        endpoint TEXT NOT NULL DEFAULT '',
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (day, service, endpoint)
      );
    `);
  }
  // Flush every minute, also flush on SIGTERM
  setInterval(flush, FLUSH_INTERVAL_MS);
  process.once("SIGTERM", flush);
}

// ── Admin query ───────────────────────────────────────────────────────────────

/**
 * Returns daily totals grouped by service for the last N days.
 * Response: [{ day, service, total }]
 */
export async function getApiStats(days = 30) {
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const rows = await runSql(`
    SELECT day, service, SUM(count) AS total
    FROM api_calls
    WHERE day >= ${sqlValue(cutoff)}
    GROUP BY day, service
    ORDER BY day DESC, service ASC;
  `, true);
  return rows;
}

/**
 * Returns per-endpoint detail for a specific service and optional day range.
 */
export async function getApiStatsDetail(service, days = 30) {
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const rows = await runSql(`
    SELECT day, endpoint, SUM(count) AS total
    FROM api_calls
    WHERE service = ${sqlValue(service)} AND day >= ${sqlValue(cutoff)}
    GROUP BY day, endpoint
    ORDER BY day DESC, total DESC;
  `, true);
  return rows;
}
