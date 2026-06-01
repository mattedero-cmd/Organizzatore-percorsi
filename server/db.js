import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

let databasePath;
let pgPool;
let dbMode = "sqlite";

function postgresUrl() {
  return process.env.DATABASE_URL
    || process.env.POSTGRES_URL
    || process.env.POSTGRES_PRISMA_URL
    || process.env.STORAGE_URL
    || "";
}

function sqlValue(value) {
  if (value === null || value === undefined || value === "") return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function rowToAddress(row) {
  return {
    id: row.id,
    customer: row.customer ?? "",
    location: row.location ?? "",
    fullAddress: row.full_address ?? "",
    notes: row.notes ?? "",
    openMorning: row.open_morning ?? "",
    closeMorning: row.close_morning ?? "",
    openAfternoon: row.open_afternoon ?? "",
    closeAfternoon: row.close_afternoon ?? "",
    defaultDuration: Number(row.default_duration ?? 45),
    lat: row.lat === null || row.lat === undefined ? null : Number(row.lat),
    lng: row.lng === null || row.lng === undefined ? null : Number(row.lng),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function rowToSettings(row) {
  return {
    kmRate: Number(row.km_rate ?? 0.65),
    driveHourRate: Number(row.drive_hour_rate ?? 22),
    workHourRate: Number(row.work_hour_rate ?? 60)
  };
}

function safeJson(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function rowToRouteSummary(row) {
  return {
    id: row.id,
    name: row.name || "Giro salvato",
    scheduledDate: row.scheduled_date || "",
    startLabel: row.start_label || "",
    startAddress: row.start_address || "",
    endLabel: row.end_label || "",
    endAddress: row.end_address || "",
    startTime: row.start_time || "",
    firstArrivalRequired: row.first_arrival_required || "",
    totalKm: Number(row.total_km || 0),
    totalDriveMinutes: Number(row.total_drive_minutes || 0),
    totalWorkMinutes: Number(row.total_work_minutes || 0),
    totalCost: Number(row.total_cost || 0),
    weatherCapturedAt: row.weather_captured_at || "",
    createdAt: row.created_at
  };
}

function rowToRoute(row) {
  return {
    ...rowToRouteSummary(row),
    payload: safeJson(row.payload_json, {})
  };
}

async function runSql(sql, json = false) {
  if (dbMode === "postgres") {
    const result = await pgPool.query(sql);
    return json ? result.rows : [];
  }
  const args = json ? ["-json", databasePath, sql] : ["-batch", databasePath, sql];
  const { stdout } = await execFileAsync("sqlite3", args, { maxBuffer: 1024 * 1024 * 10 });
  if (!json) return [];
  const trimmed = stdout.trim();
  return trimmed ? JSON.parse(trimmed) : [];
}

export async function initDb(rootDir) {
  const connectionString = postgresUrl();
  if (connectionString) {
    const { Pool } = await import("pg");
    dbMode = "postgres";
    pgPool = new Pool({
      connectionString,
      ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false }
    });
    await initPostgresDb();
    return "postgres";
  }

  databasePath = path.resolve(rootDir, process.env.DATABASE_PATH || "./data/work-routes.sqlite");
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  await runSql(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer TEXT NOT NULL,
      location TEXT DEFAULT '',
      full_address TEXT NOT NULL,
      notes TEXT DEFAULT '',
      open_morning TEXT DEFAULT '',
      close_morning TEXT DEFAULT '',
      open_afternoon TEXT DEFAULT '',
      close_afternoon TEXT DEFAULT '',
      default_duration INTEGER DEFAULT 45,
      lat REAL,
      lng REAL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      km_rate REAL NOT NULL DEFAULT 0.65,
      drive_hour_rate REAL NOT NULL DEFAULT 22,
      work_hour_rate REAL NOT NULL DEFAULT 60
    );
    CREATE TABLE IF NOT EXISTS planned_routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT DEFAULT '',
      scheduled_date TEXT DEFAULT '',
      start_label TEXT DEFAULT '',
      start_address TEXT DEFAULT '',
      end_label TEXT DEFAULT '',
      end_address TEXT DEFAULT '',
      start_time TEXT DEFAULT '',
      first_arrival_required TEXT DEFAULT '',
      total_km REAL DEFAULT 0,
      total_drive_minutes INTEGER DEFAULT 0,
      total_work_minutes INTEGER DEFAULT 0,
      total_cost REAL DEFAULT 0,
      weather_captured_at TEXT DEFAULT '',
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT OR IGNORE INTO settings (id, km_rate, drive_hour_rate, work_hour_rate)
    VALUES (1, 0.65, 22, 60);
  `);

  await migratePlannedRoutes();

  const count = await runSql("SELECT COUNT(*) AS count FROM addresses;", true);
  if (Number(count[0]?.count ?? 0) === 0) {
    await createAddress({
      customer: "Mediolanum",
      location: "Riva del Garda",
      fullAddress: "Viale Rovereto 44, 38066 Riva del Garda TN",
      notes: "Esempio modificabile",
      openMorning: "08:30",
      closeMorning: "12:30",
      openAfternoon: "14:30",
      closeAfternoon: "18:00",
      defaultDuration: 60,
      lat: 45.889,
      lng: 10.843
    });
    await createAddress({
      customer: "Intesa Sanpaolo",
      location: "Trento",
      fullAddress: "Via Mantova 19, 38122 Trento TN",
      notes: "Esempio modificabile",
      openMorning: "08:20",
      closeMorning: "13:20",
      openAfternoon: "14:30",
      closeAfternoon: "16:30",
      defaultDuration: 45,
      lat: 46.067,
      lng: 11.122
    });
    await createAddress({
      customer: "Fineco",
      location: "Rovereto",
      fullAddress: "Corso Rosmini 58, 38068 Rovereto TN",
      notes: "Esempio modificabile",
      openMorning: "08:30",
      closeMorning: "12:30",
      openAfternoon: "14:00",
      closeAfternoon: "17:30",
      defaultDuration: 90,
      lat: 45.890,
      lng: 11.040
    });
  }

  return databasePath;
}

async function initPostgresDb() {
  await runSql(`
    CREATE TABLE IF NOT EXISTS addresses (
      id SERIAL PRIMARY KEY,
      customer TEXT NOT NULL,
      location TEXT DEFAULT '',
      full_address TEXT NOT NULL,
      notes TEXT DEFAULT '',
      open_morning TEXT DEFAULT '',
      close_morning TEXT DEFAULT '',
      open_afternoon TEXT DEFAULT '',
      close_afternoon TEXT DEFAULT '',
      default_duration INTEGER DEFAULT 45,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      km_rate DOUBLE PRECISION NOT NULL DEFAULT 0.65,
      drive_hour_rate DOUBLE PRECISION NOT NULL DEFAULT 22,
      work_hour_rate DOUBLE PRECISION NOT NULL DEFAULT 60
    );
    CREATE TABLE IF NOT EXISTS planned_routes (
      id SERIAL PRIMARY KEY,
      name TEXT DEFAULT '',
      scheduled_date TEXT DEFAULT '',
      start_label TEXT DEFAULT '',
      start_address TEXT DEFAULT '',
      end_label TEXT DEFAULT '',
      end_address TEXT DEFAULT '',
      start_time TEXT DEFAULT '',
      first_arrival_required TEXT DEFAULT '',
      total_km DOUBLE PRECISION DEFAULT 0,
      total_drive_minutes INTEGER DEFAULT 0,
      total_work_minutes INTEGER DEFAULT 0,
      total_cost DOUBLE PRECISION DEFAULT 0,
      weather_captured_at TEXT DEFAULT '',
      payload_json TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    INSERT INTO settings (id, km_rate, drive_hour_rate, work_hour_rate)
    VALUES (1, 0.65, 22, 60)
    ON CONFLICT (id) DO NOTHING;
  `);

  await migratePlannedRoutes();

  const count = await runSql("SELECT COUNT(*) AS count FROM addresses;", true);
  if (Number(count[0]?.count ?? 0) === 0) {
    await createAddress({
      customer: "Mediolanum",
      location: "Riva del Garda",
      fullAddress: "Viale Rovereto 44, 38066 Riva del Garda TN",
      notes: "Esempio modificabile",
      openMorning: "08:30",
      closeMorning: "12:30",
      openAfternoon: "14:30",
      closeAfternoon: "18:00",
      defaultDuration: 60,
      lat: 45.889,
      lng: 10.843
    });
    await createAddress({
      customer: "Intesa Sanpaolo",
      location: "Trento",
      fullAddress: "Via Mantova 19, 38122 Trento TN",
      notes: "Esempio modificabile",
      openMorning: "08:20",
      closeMorning: "13:20",
      openAfternoon: "14:30",
      closeAfternoon: "16:30",
      defaultDuration: 45,
      lat: 46.067,
      lng: 11.122
    });
    await createAddress({
      customer: "Fineco",
      location: "Rovereto",
      fullAddress: "Corso Rosmini 58, 38068 Rovereto TN",
      notes: "Esempio modificabile",
      openMorning: "08:30",
      closeMorning: "12:30",
      openAfternoon: "14:00",
      closeAfternoon: "17:30",
      defaultDuration: 90,
      lat: 45.890,
      lng: 11.040
    });
  }
}

async function tableColumns(tableName) {
  if (dbMode === "postgres") {
    const rows = await runSql(`
      SELECT column_name AS name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${sqlValue(tableName)};
    `, true);
    return rows.map((row) => row.name);
  }
  const rows = await runSql(`PRAGMA table_info(${tableName});`, true);
  return rows.map((row) => row.name);
}

async function migratePlannedRoutes() {
  const columns = await tableColumns("planned_routes");
  if (!columns.includes("scheduled_date")) {
    await runSql("ALTER TABLE planned_routes ADD COLUMN scheduled_date TEXT DEFAULT '';");
  }
  if (!columns.includes("weather_captured_at")) {
    await runSql("ALTER TABLE planned_routes ADD COLUMN weather_captured_at TEXT DEFAULT '';");
  }
}

export async function listAddresses(search = "") {
  const term = String(search || "").trim().toLowerCase();
  if (dbMode === "postgres") {
    const where = term
      ? `WHERE lower(concat_ws(' ', customer, location, full_address, notes)) LIKE ${sqlValue(`%${term}%`)}`
      : "";
    const rows = await runSql(
      `SELECT * FROM addresses ${where} ORDER BY lower(customer), lower(location);`,
      true
    );
    return rows.map(rowToAddress);
  }
  const where = term
    ? `WHERE lower(customer || ' ' || location || ' ' || full_address || ' ' || notes) LIKE ${sqlValue(`%${term}%`)}`
    : "";
  const rows = await runSql(
    `SELECT * FROM addresses ${where} ORDER BY customer COLLATE NOCASE, location COLLATE NOCASE;`,
    true
  );
  return rows.map(rowToAddress);
}

export async function getAddress(id) {
  const rows = await runSql(`SELECT * FROM addresses WHERE id = ${sqlValue(Number(id))};`, true);
  return rows[0] ? rowToAddress(rows[0]) : null;
}

export async function createAddress(address) {
  if (dbMode === "postgres") {
    const rows = await runSql(`
      INSERT INTO addresses (
        customer, location, full_address, notes, open_morning, close_morning,
        open_afternoon, close_afternoon, default_duration, lat, lng
      ) VALUES (
        ${sqlValue(address.customer || "Senza nome")},
        ${sqlValue(address.location || "")},
        ${sqlValue(address.fullAddress || address.full_address || "")},
        ${sqlValue(address.notes || "")},
        ${sqlValue(address.openMorning || address.open_morning || "")},
        ${sqlValue(address.closeMorning || address.close_morning || "")},
        ${sqlValue(address.openAfternoon || address.open_afternoon || "")},
        ${sqlValue(address.closeAfternoon || address.close_afternoon || "")},
        ${sqlValue(Number(address.defaultDuration || address.default_duration || 45))},
        ${sqlValue(address.lat === undefined ? null : Number(address.lat))},
        ${sqlValue(address.lng === undefined ? null : Number(address.lng))}
      )
      RETURNING *;
    `, true);
    return rowToAddress(rows[0]);
  }
  await runSql(`
    INSERT INTO addresses (
      customer, location, full_address, notes, open_morning, close_morning,
      open_afternoon, close_afternoon, default_duration, lat, lng
    ) VALUES (
      ${sqlValue(address.customer || "Senza nome")},
      ${sqlValue(address.location || "")},
      ${sqlValue(address.fullAddress || address.full_address || "")},
      ${sqlValue(address.notes || "")},
      ${sqlValue(address.openMorning || address.open_morning || "")},
      ${sqlValue(address.closeMorning || address.close_morning || "")},
      ${sqlValue(address.openAfternoon || address.open_afternoon || "")},
      ${sqlValue(address.closeAfternoon || address.close_afternoon || "")},
      ${sqlValue(Number(address.defaultDuration || address.default_duration || 45))},
      ${sqlValue(address.lat === undefined ? null : Number(address.lat))},
      ${sqlValue(address.lng === undefined ? null : Number(address.lng))}
    );
  `);
  const rows = await runSql("SELECT * FROM addresses ORDER BY id DESC LIMIT 1;", true);
  return rowToAddress(rows[0]);
}

export async function updateAddress(id, address) {
  if (dbMode === "postgres") {
    const rows = await runSql(`
      UPDATE addresses SET
        customer = ${sqlValue(address.customer || "Senza nome")},
        location = ${sqlValue(address.location || "")},
        full_address = ${sqlValue(address.fullAddress || "")},
        notes = ${sqlValue(address.notes || "")},
        open_morning = ${sqlValue(address.openMorning || "")},
        close_morning = ${sqlValue(address.closeMorning || "")},
        open_afternoon = ${sqlValue(address.openAfternoon || "")},
        close_afternoon = ${sqlValue(address.closeAfternoon || "")},
        default_duration = ${sqlValue(Number(address.defaultDuration || 45))},
        lat = ${sqlValue(address.lat === undefined ? null : Number(address.lat))},
        lng = ${sqlValue(address.lng === undefined ? null : Number(address.lng))},
        updated_at = NOW()
      WHERE id = ${sqlValue(Number(id))}
      RETURNING *;
    `, true);
    return rows[0] ? rowToAddress(rows[0]) : null;
  }
  await runSql(`
    UPDATE addresses SET
      customer = ${sqlValue(address.customer || "Senza nome")},
      location = ${sqlValue(address.location || "")},
      full_address = ${sqlValue(address.fullAddress || "")},
      notes = ${sqlValue(address.notes || "")},
      open_morning = ${sqlValue(address.openMorning || "")},
      close_morning = ${sqlValue(address.closeMorning || "")},
      open_afternoon = ${sqlValue(address.openAfternoon || "")},
      close_afternoon = ${sqlValue(address.closeAfternoon || "")},
      default_duration = ${sqlValue(Number(address.defaultDuration || 45))},
      lat = ${sqlValue(address.lat === undefined ? null : Number(address.lat))},
      lng = ${sqlValue(address.lng === undefined ? null : Number(address.lng))},
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${sqlValue(Number(id))};
  `);
  return getAddress(id);
}

export async function deleteAddress(id) {
  await runSql(`DELETE FROM addresses WHERE id = ${sqlValue(Number(id))};`);
  return { ok: true };
}

export async function getSettings() {
  const rows = await runSql("SELECT * FROM settings WHERE id = 1;", true);
  return rowToSettings(rows[0] || {});
}

export async function updateSettings(settings) {
  if (dbMode === "postgres") {
    await runSql(`
      INSERT INTO settings (id, km_rate, drive_hour_rate, work_hour_rate)
      VALUES (
        1,
        ${sqlValue(Number(settings.kmRate ?? 0.65))},
        ${sqlValue(Number(settings.driveHourRate ?? 22))},
        ${sqlValue(Number(settings.workHourRate ?? 60))}
      )
      ON CONFLICT (id) DO UPDATE SET
        km_rate = EXCLUDED.km_rate,
        drive_hour_rate = EXCLUDED.drive_hour_rate,
        work_hour_rate = EXCLUDED.work_hour_rate;
    `);
    return getSettings();
  }
  await runSql(`
    UPDATE settings SET
      km_rate = ${sqlValue(Number(settings.kmRate ?? 0.65))},
      drive_hour_rate = ${sqlValue(Number(settings.driveHourRate ?? 22))},
      work_hour_rate = ${sqlValue(Number(settings.workHourRate ?? 60))}
    WHERE id = 1;
  `);
  return getSettings();
}

export async function saveRoute(route) {
  if (dbMode === "postgres") {
    const rows = await runSql(`
      INSERT INTO planned_routes (
        name, scheduled_date, start_label, start_address, end_label, end_address, start_time,
        first_arrival_required, total_km, total_drive_minutes, total_work_minutes,
        total_cost, weather_captured_at, payload_json
      ) VALUES (
        ${sqlValue(route.name || "")},
        ${sqlValue(route.scheduledDate || route.scheduled_date || "")},
        ${sqlValue(route.startLabel || "")},
        ${sqlValue(route.startAddress || "")},
        ${sqlValue(route.endLabel || "")},
        ${sqlValue(route.endAddress || "")},
        ${sqlValue(route.startTime || "")},
        ${sqlValue(route.firstArrivalRequired || "")},
        ${sqlValue(Number(route.summary?.totalKm || 0))},
        ${sqlValue(Number(route.summary?.totalDriveMinutes || 0))},
        ${sqlValue(Number(route.summary?.totalWorkMinutes || 0))},
        ${sqlValue(Number(route.summary?.totalCost || 0))},
        ${sqlValue(route.weatherCapturedAt || "")},
        ${sqlValue(JSON.stringify(route))}
      )
      RETURNING id;
    `, true);
    return { id: rows[0]?.id };
  }
  await runSql(`
    INSERT INTO planned_routes (
      name, scheduled_date, start_label, start_address, end_label, end_address, start_time,
      first_arrival_required, total_km, total_drive_minutes, total_work_minutes,
      total_cost, weather_captured_at, payload_json
    ) VALUES (
      ${sqlValue(route.name || "")},
      ${sqlValue(route.scheduledDate || route.scheduled_date || "")},
      ${sqlValue(route.startLabel || "")},
      ${sqlValue(route.startAddress || "")},
      ${sqlValue(route.endLabel || "")},
      ${sqlValue(route.endAddress || "")},
      ${sqlValue(route.startTime || "")},
      ${sqlValue(route.firstArrivalRequired || "")},
      ${sqlValue(Number(route.summary?.totalKm || 0))},
      ${sqlValue(Number(route.summary?.totalDriveMinutes || 0))},
      ${sqlValue(Number(route.summary?.totalWorkMinutes || 0))},
      ${sqlValue(Number(route.summary?.totalCost || 0))},
      ${sqlValue(route.weatherCapturedAt || "")},
      ${sqlValue(JSON.stringify(route))}
    );
  `);
  const rows = await runSql("SELECT id FROM planned_routes ORDER BY id DESC LIMIT 1;", true);
  return { id: rows[0]?.id };
}

export async function listRoutes() {
  const rows = await runSql(
    `SELECT * FROM planned_routes ORDER BY COALESCE(NULLIF(scheduled_date, ''), created_at) DESC, id DESC;`,
    true
  );
  return rows.map(rowToRouteSummary);
}

export async function getRoute(id) {
  const rows = await runSql(`SELECT * FROM planned_routes WHERE id = ${sqlValue(Number(id))};`, true);
  return rows[0] ? rowToRoute(rows[0]) : null;
}

export async function updateRoutePayload(id, route) {
  if (dbMode === "postgres") {
    await runSql(`
      UPDATE planned_routes SET
        scheduled_date = ${sqlValue(route.scheduledDate || "")},
        total_km = ${sqlValue(Number(route.summary?.totalKm || 0))},
        total_drive_minutes = ${sqlValue(Number(route.summary?.totalDriveMinutes || 0))},
        total_work_minutes = ${sqlValue(Number(route.summary?.totalWorkMinutes || 0))},
        total_cost = ${sqlValue(Number(route.summary?.totalCost || 0))},
        weather_captured_at = ${sqlValue(route.weatherCapturedAt || "")},
        payload_json = ${sqlValue(JSON.stringify(route))}
      WHERE id = ${sqlValue(Number(id))};
    `);
    return getRoute(id);
  }
  await runSql(`
    UPDATE planned_routes SET
      scheduled_date = ${sqlValue(route.scheduledDate || "")},
      total_km = ${sqlValue(Number(route.summary?.totalKm || 0))},
      total_drive_minutes = ${sqlValue(Number(route.summary?.totalDriveMinutes || 0))},
      total_work_minutes = ${sqlValue(Number(route.summary?.totalWorkMinutes || 0))},
      total_cost = ${sqlValue(Number(route.summary?.totalCost || 0))},
      weather_captured_at = ${sqlValue(route.weatherCapturedAt || "")},
      payload_json = ${sqlValue(JSON.stringify(route))}
    WHERE id = ${sqlValue(Number(id))};
  `);
  return getRoute(id);
}
