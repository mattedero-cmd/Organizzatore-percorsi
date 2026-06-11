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

import { dbAll, dbRun, dbExec, getDbMode } from "./db.js";

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
      // endpoint può essere "" → la colonna ha DEFAULT '' ma fa parte della PK:
      // usare COALESCE-like esplicito per non inserire NULL (bindable mappa ""→NULL)
      const params = [day, service, endpoint || "-", count];
      if (getDbMode() === "postgres") {
        await dbRun(`
          INSERT INTO api_calls (day, service, endpoint, count)
          VALUES (?, ?, ?, ?)
          ON CONFLICT (day, service, endpoint) DO UPDATE SET count = api_calls.count + EXCLUDED.count;
        `, params);
      } else {
        await dbRun(`
          INSERT INTO api_calls (day, service, endpoint, count)
          VALUES (?, ?, ?, ?)
          ON CONFLICT (day, service, endpoint) DO UPDATE SET count = count + excluded.count;
        `, params);
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
  // stesso DDL per SQLite e PostgreSQL
  await dbExec(`
    CREATE TABLE IF NOT EXISTS api_calls (
      day TEXT NOT NULL,
      service TEXT NOT NULL,
      endpoint TEXT NOT NULL DEFAULT '',
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day, service, endpoint)
    );
  `);
  // Flush every minute, also flush on SIGTERM.
  // unref(): il timer non deve tenere vivo il processo.
  // Registrare un handler SIGTERM sostituisce la terminazione di default,
  // quindi dopo il flush bisogna uscire esplicitamente.
  setInterval(flush, FLUSH_INTERVAL_MS).unref();
  process.once("SIGTERM", async () => {
    try { await flush(); } catch {}
    process.exit(0);
  });
}

// ── Admin query ───────────────────────────────────────────────────────────────

/**
 * Returns daily totals grouped by service for the last N days.
 * Response: [{ day, service, total }]
 */
export async function getApiStats(days = 30) {
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const rows = await dbAll(`
    SELECT day, service, SUM(count) AS total
    FROM api_calls
    WHERE day >= ?
    GROUP BY day, service
    ORDER BY day DESC, service ASC;
  `, [cutoff]);
  return rows;
}

/**
 * Returns per-endpoint detail for a specific service and optional day range.
 */
export async function getApiStatsDetail(service, days = 30) {
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const rows = await dbAll(`
    SELECT day, endpoint, SUM(count) AS total
    FROM api_calls
    WHERE service = ? AND day >= ?
    GROUP BY day, endpoint
    ORDER BY day DESC, total DESC;
  `, [service, cutoff]);
  return rows;
}
