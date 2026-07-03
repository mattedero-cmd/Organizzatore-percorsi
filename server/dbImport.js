// ─────────────────────────────────────────────────────────────────────────────
// Recupero dati da un DATABASE PRECEDENTE (v5.082).
// Storia: il 25/6, per aggirare il DB Prisma bloccato dal limite operazioni, al
// progetto è stato agganciato un database NUOVO (vuoto). Tutti i dati — utenti,
// giri, contatti — sono rimasti in quello VECCHIO, ancora raggiungibile tramite
// le env var residue (RouteOrg_*, POSTGRES_URL, ...). Questo modulo trova quei
// database "candidati", li ispeziona (sola lettura) e, su conferma dall'admin
// panel, ne COPIA i dati nel database attivo. Idempotente (ON CONFLICT DO
// NOTHING): rilanciabile senza doppioni. La sorgente non viene MAI modificata.
// ─────────────────────────────────────────────────────────────────────────────
import { postgresUrl, runSql, sqlValue, getDbMode } from "./db.js";

// Tabelle copiate, in ordine di dipendenza. ESCLUSE di proposito: settings
// (singleton già presente), sessions/shared_routes (stantie), schema_meta,
// api_calls (statistiche).
const TABLES = ["users", "user_settings", "addresses", "folders", "planned_routes", "multiday_plans"];
const SERIAL_TABLES = ["users", "addresses", "folders", "planned_routes", "multiday_plans"];

function maskHost(url) {
  try { return new URL(url.replace(/^postgres(ql)?:\/\//, "http://")).host; } catch { return "database"; }
}

// Candidati = ogni valore d'ambiente postgres:// DIVERSO dal database attivo,
// deduplicato. L'ordinamento per nome variabile rende l'indice stabile tra
// invocazioni serverless (GET di ispezione e POST di import possono capitare
// su istanze diverse).
export function listOldDbCandidates() {
  const active = postgresUrl();
  const byUrl = new Map();
  for (const [key, value] of Object.entries(process.env)) {
    const text = String(value || "");
    if (!text.startsWith("postgres://") && !text.startsWith("postgresql://")) continue;
    if (text === active) continue;
    if (!byUrl.has(text)) byUrl.set(text, []);
    byUrl.get(text).push(key);
  }
  return [...byUrl.entries()]
    .map(([url, envKeys]) => ({ url, envKeys: envKeys.sort() }))
    .sort((a, b) => a.envKeys[0].localeCompare(b.envKeys[0]));
}

async function withClient(url, fn) {
  const { Client } = await import("pg");
  const client = new Client({
    connectionString: url,
    ssl: url.includes("localhost") ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 6000,
    query_timeout: 15000
  });
  await client.connect();
  try { return await fn(client); } finally { client.end().catch(() => {}); }
}

async function srcTableExists(client, name) {
  const r = await client.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1", [name]);
  return r.rows.length > 0;
}

// Ispezione (SOLA LETTURA) di un candidato: conteggi + qualche username, così
// l'admin riconosce a colpo d'occhio il database giusto prima di importare.
export async function inspectOldDbs() {
  const candidates = listOldDbCandidates();
  const out = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const item = { index: i, host: maskHost(c.url), envKeys: c.envKeys, ok: false };
    try {
      await withClient(c.url, async (client) => {
        const counts = {};
        for (const t of TABLES) {
          counts[t] = (await srcTableExists(client, t))
            ? Number((await client.query(`SELECT COUNT(*)::int AS n FROM ${t}`)).rows[0].n)
            : 0;
        }
        item.counts = counts;
        if (counts.users > 0) {
          item.usernames = (await client.query("SELECT username FROM users ORDER BY id LIMIT 6")).rows.map(r => r.username);
        }
        item.ok = true;
      });
    } catch (e) {
      item.error = e?.message || String(e);
    }
    out.push(item);
  }
  return { activeHost: maskHost(postgresUrl() || ""), candidates: out };
}

// Colonne della tabella nel DB ATTIVO (per copiare solo l'intersezione: robusto
// a piccole differenze di schema tra vecchio e nuovo).
async function activeColumns(table) {
  if (getDbMode() === "postgres") {
    const rows = await runSql(`SELECT column_name AS name FROM information_schema.columns WHERE table_schema='public' AND table_name=${sqlValue(table)};`, true);
    return new Set(rows.map(r => r.name));
  }
  const rows = await runSql(`PRAGMA table_info(${table});`, true);
  return new Set(rows.map(r => r.name));
}

function toSqlLiteral(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "1" : "0";
  if (v instanceof Date) return sqlValue(v.toISOString());
  return sqlValue(String(v));
}

// COPIA un candidato nel database attivo. Sorgente in sola lettura; destinazione
// con INSERT ... ON CONFLICT DO NOTHING a blocchi. Ritorna il report per tabella.
export async function importOldDb(index) {
  const candidates = listOldDbCandidates();
  const c = candidates[Number(index)];
  if (!c) throw new Error("Candidato non trovato (ricarica la lista e riprova)");

  const report = {};
  await withClient(c.url, async (src) => {
    for (const table of TABLES) {
      if (!(await srcTableExists(src, table))) { report[table] = { source: 0, copied: 0 }; continue; }
      const { rows } = await src.query(`SELECT * FROM ${table}`);
      const before = Number((await runSql(`SELECT COUNT(*) AS n FROM ${table};`, true))[0]?.n ?? 0);
      if (rows.length) {
        const target = await activeColumns(table);
        const cols = Object.keys(rows[0]).filter(k => target.has(k));
        const colList = cols.map(k => `"${k}"`).join(", ");
        // Blocchi: i payload_json dei giri possono essere grossi → max 40 righe o ~400KB
        let batch = [];
        let batchLen = 0;
        const flush = async () => {
          if (!batch.length) return;
          await runSql(`INSERT INTO ${table} (${colList}) VALUES ${batch.join(", ")} ON CONFLICT DO NOTHING;`);
          batch = []; batchLen = 0;
        };
        for (const row of rows) {
          const tuple = `(${cols.map(k => toSqlLiteral(row[k])).join(", ")})`;
          batch.push(tuple); batchLen += tuple.length;
          if (batch.length >= 40 || batchLen > 400_000) await flush();
        }
        await flush();
      }
      const after = Number((await runSql(`SELECT COUNT(*) AS n FROM ${table};`, true))[0]?.n ?? 0);
      report[table] = { source: rows.length, copied: after - before };
    }
  });

  // Riallinea le sequenze id (solo Postgres): senza, i prossimi INSERT collidono.
  if (getDbMode() === "postgres") {
    for (const t of SERIAL_TABLES) {
      await runSql(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM ${t}), 1));`).catch(() => {});
    }
  }
  return { host: maskHost(c.url), report };
}
