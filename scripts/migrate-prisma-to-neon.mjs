#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Migrazione dati Postgres → Postgres (es. Prisma → Neon) per Organizzatore Percorsi.
//
// COSA FA:
//  • Legge SOLO dalla SORGENTE (Prisma) — non la modifica mai.
//  • Crea/aggiorna lo schema sulla DESTINAZIONE (Neon) riusando la logica dell'app
//    (server/db.js → initDb), quindi le tabelle combaciano di sicuro.
//  • Copia i dati tabella per tabella in modo IDEMPOTENTE (ON CONFLICT DO NOTHING):
//    puoi rilanciarlo senza creare duplicati.
//  • Reimposta le sequenze degli id e stampa i conteggi per verifica.
//
// USO (dalla cartella del progetto, dopo `npm install`):
//   SOURCE_URL="postgres://UTENTE:PASSWORD@HOST-PRISMA/DB" \
//   TARGET_URL="postgres://UTENTE:PASSWORD@HOST-NEON.neon.tech/DB?sslmode=require" \
//   node scripts/migrate-prisma-to-neon.mjs
//
//   Aggiungi --dry-run per vedere solo i conteggi della sorgente senza scrivere nulla:
//   ... node scripts/migrate-prisma-to-neon.mjs --dry-run
//
// IMPORTANTE:
//  • Usa le connection string DIRETTE (postgres://...), NON gli URL Prisma Accelerate
//    (prisma://...): pg non sa collegarsi a quelli. La stringa diretta è nel pannello Prisma.
//  • Le stringhe contengono la password: passale come variabili d'ambiente, non scriverle
//    nel codice e non condividerle.
//  • NON cancellare Prisma finché non hai verificato che nell'app i dati ci sono.
// ─────────────────────────────────────────────────────────────────────────────

import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const SOURCE_URL = process.env.SOURCE_URL;
const TARGET_URL = process.env.TARGET_URL;
const DRY = process.argv.includes("--dry-run");

if (!SOURCE_URL || !TARGET_URL) {
  console.error("Errore: imposta SOURCE_URL (Prisma) e TARGET_URL (Neon) come variabili d'ambiente.");
  process.exit(1);
}
for (const [name, url] of [["SOURCE_URL", SOURCE_URL], ["TARGET_URL", TARGET_URL]]) {
  if (url.startsWith("prisma://") || url.startsWith("prisma+")) {
    console.error(`Errore: ${name} è un URL Prisma Accelerate (prisma://...). Serve la connection string DIRETTA (postgres://...).`);
    process.exit(1);
  }
}

const sslFor = (url) => (url.includes("localhost") || url.includes("127.0.0.1")) ? false : { rejectUnauthorized: false };

// Tabelle da copiare, con la chiave primaria (per ON CONFLICT) e se hanno una sequenza id (SERIAL).
const TABLES = [
  { name: "users",          pk: "id",      serial: true  },
  { name: "user_settings",  pk: "user_id", serial: false },
  { name: "settings",       pk: "id",      serial: false },
  { name: "addresses",      pk: "id",      serial: true  },
  { name: "folders",        pk: "id",      serial: true  },
  { name: "planned_routes", pk: "id",      serial: true  },
  { name: "multiday_plans", pk: "id",      serial: true  },
  { name: "shared_routes",  pk: "token",   serial: false },
  { name: "sessions",       pk: "token",   serial: false },
];

async function ensureTargetSchema() {
  // Riusa lo schema dell'app: initDb crea TUTTE le tabelle + migrazioni sul TARGET.
  process.env.DATABASE_URL = TARGET_URL; // initDb legge questa variabile
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.resolve(__dirname, "..");
  const { initDb } = await import("../server/db.js");
  await initDb(rootDir);
  try { const { initApiStatsTable } = await import("../server/apiStats.js"); await initApiStatsTable(); } catch {}
}

async function tableExists(pool, name) {
  const { rows } = await pool.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1", [name]);
  return rows.length > 0;
}

async function columnsOf(pool, name) {
  const { rows } = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1", [name]);
  return new Set(rows.map(r => r.column_name));
}

async function copyTable(src, dst, t) {
  if (!(await tableExists(src, t.name))) return { table: t.name, srcRows: 0, copied: 0, note: "assente in sorgente" };
  const { rows } = await src.query(`SELECT * FROM ${t.name}`);
  if (DRY) return { table: t.name, srcRows: rows.length, copied: 0, note: "dry-run" };
  if (!rows.length) return { table: t.name, srcRows: 0, copied: 0 };
  // Copia solo le colonne presenti in ENTRAMBI (robusto a piccole differenze di schema).
  const targetCols = await columnsOf(dst, t.name);
  const cols = Object.keys(rows[0]).filter(c => targetCols.has(c));
  const colList = cols.map(c => `"${c}"`).join(", ");
  let copied = 0;
  for (const r of rows) {
    const vals = cols.map(c => r[c]);
    const ph = cols.map((_, i) => `$${i + 1}`).join(", ");
    await dst.query(`INSERT INTO ${t.name} (${colList}) VALUES (${ph}) ON CONFLICT (${t.pk}) DO NOTHING`, vals);
    copied++;
  }
  if (t.serial) {
    await dst.query(
      `SELECT setval(pg_get_serial_sequence('${t.name}', 'id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM ${t.name}), 1))`);
  }
  return { table: t.name, srcRows: rows.length, copied };
}

async function main() {
  console.log(DRY ? "— DRY RUN (nessuna scrittura sulla destinazione) —" : "— MIGRAZIONE Postgres → Postgres (Prisma → Neon) —");
  if (!DRY) { console.log("1) Creo/verifico lo schema sulla destinazione (Neon)…"); await ensureTargetSchema(); }

  const src = new Pool({ connectionString: SOURCE_URL, ssl: sslFor(SOURCE_URL), connectionTimeoutMillis: 30000, max: 3 });
  const dst = new Pool({ connectionString: TARGET_URL, ssl: sslFor(TARGET_URL), connectionTimeoutMillis: 30000, max: 3 });
  try {
    console.log(DRY ? "Conteggi sorgente:" : "2) Copio i dati:");
    for (const t of TABLES) {
      const res = await copyTable(src, dst, t);
      console.log(`   ${res.table.padEnd(16)} sorgente=${res.srcRows}  copiati=${res.copied}${res.note ? "  (" + res.note + ")" : ""}`);
    }
    if (!DRY) {
      console.log("\n3) Verifica conteggi sulla destinazione (Neon):");
      for (const t of TABLES) {
        if (!(await tableExists(dst, t.name))) continue;
        const { rows } = await dst.query(`SELECT COUNT(*)::int AS n FROM ${t.name}`);
        console.log(`   ${t.name.padEnd(16)} ${rows[0].n}`);
      }
      console.log("\n✓ Fatto. Se i conteggi tornano: imposta DATABASE_URL = <stringa Neon> su Vercel e ridistribuisci.");
      console.log("  NON cancellare Prisma finché non hai verificato tutto dentro l'app.");
    } else {
      console.log("\n(dry-run completato: nessun dato scritto)");
    }
  } finally {
    await src.end().catch(() => {});
    await dst.end().catch(() => {});
  }
  process.exit(0); // il pool di initDb resta aperto: usciamo esplicitamente
}

main().catch(e => { console.error("\nMigrazione fallita:", e.message); process.exit(1); });
