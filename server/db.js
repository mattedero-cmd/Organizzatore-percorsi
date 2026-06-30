import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

let databasePath;
let pgPool;
let dbMode = "sqlite";

function postgresUrl() {
  const namedUrl = process.env.DATABASE_URL
    || process.env.POSTGRES_URL
    || process.env.POSTGRES_PRISMA_URL
    || process.env.STORAGE_URL
    || process.env.RouteOrg_DATABASE_URL
    || process.env.RouteOrg_POSTGRES_URL
    || process.env.RouteOrg_PRISMA_DATABASE_URL
    || "";
  if (namedUrl) return namedUrl;
  return Object.values(process.env).find((value) => {
    const text = String(value || "");
    return text.startsWith("postgres://") || text.startsWith("postgresql://");
  }) || "";
}

export function sqlValue(value) {
  if (value === null || value === undefined || value === "") return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function rowToAddress(row) {
  return {
    id: row.id,
    customer: row.customer ?? "",
    activity: row.activity ?? "",
    location: row.location ?? "",
    fullAddress: row.full_address ?? "",
    addressType: row.address_type ?? "customer",
    phone: row.phone ?? "",
    phoneType: row.phone_type ?? "cell",
    phoneName: row.phone_name ?? "",
    phone2: row.phone2 ?? "",
    phone2Type: row.phone2_type ?? "fisso",
    phone2Name: row.phone2_name ?? "",
    phonePreferred: row.phone_preferred ?? "phone",
    email: row.email ?? "",
    notes: row.notes ?? "",
    openMorning: row.open_morning ?? "",
    closeMorning: row.close_morning ?? "",
    openAfternoon: row.open_afternoon ?? "",
    closeAfternoon: row.close_afternoon ?? "",
    defaultDuration: Number(row.default_duration ?? 45),
    weeklyHours: safeJson(row.weekly_hours, null),
    lat: row.lat === null || row.lat === undefined ? null : Number(row.lat),
    lng: row.lng === null || row.lng === undefined ? null : Number(row.lng),
    placeId: row.place_id ?? null,
    isRestStop: Boolean(Number(row.is_rest_stop ?? 0)),
    isLunchStop: Boolean(Number(row.is_lunch_stop ?? 0)),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function rowToSettings(row) {
  return {
    kmRate: Number(row.km_rate ?? 0.65),
    driveHourRate: Number(row.drive_hour_rate ?? 22),
    workHourRate: Number(row.work_hour_rate ?? 60),
    navigatorPref: row.navigator_pref ?? "google",
    themePref: row.theme_pref ?? "auto",
    themeMode: row.theme_mode ?? "auto",
    themePalette: row.theme_palette ?? "default",
    lunchBreakMinutes: Number(row.lunch_break_minutes ?? 45),
    lunchBreakEnabled: row.lunch_break_enabled === undefined || row.lunch_break_enabled === null ? true : Boolean(Number(row.lunch_break_enabled)),
    defaultStartLabel: row.default_start_label ?? "",
    defaultStartAddress: row.default_start_address ?? "",
    restIntervalMin: Number(row.rest_interval_min ?? 120),
    restMaxDeviationMin: Number(row.rest_max_deviation_min ?? 40),
    restDurationMin: Number(row.rest_duration_min ?? 15),
    driveMarkupMinPerHour: Number(row.drive_markup_min_per_hour ?? 10),
    earliestBreakTime: row.earliest_break_time ?? "08:00",
    maxDetourMin: Number(row.max_detour_min ?? 10),
    maxReturnTime: row.max_return_time ?? "",
    iconStyle: row.icon_style ?? "color",
    lunchOpenTime: row.lunch_open_time ?? "11:30",
    lunchCloseTime: row.lunch_close_time ?? "14:00",
    noBreakEarlyMin: Number(row.no_break_early_min ?? 120),
    noBreakBeforeHomeMin: Number(row.no_break_before_home_min ?? 60),
    noBreakBeforeLunchMin: Number(row.no_break_before_lunch_min ?? 60),
    noBreakAfterLunchMin: Number(row.no_break_after_lunch_min ?? 120),
    brandColor: row.brand_color ?? "",
    brandColor2: row.brand_color2 ?? ""
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
  const payload = safeJson(row.payload_json, {});
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
    createdAt: row.created_at,
    plannedStops: (payload.plannedStops || payload.rows || []).filter(s => !s.type).map(s => ({ customer: s.customer || "", location: s.location || "", addressId: s.addressId, stopUid: s.uid || s.stopUid, stopPart: s.stopPart })),
    source: row.source || null,
    sharedBy: payload.sharedBy || null,
    folderId: row.folder_id ?? null,
    notes: row.notes || ""
  };
}

function rowToRoute(row) {
  return {
    ...rowToRouteSummary(row),
    payload: safeJson(row.payload_json, {})
  };
}

export async function runSql(sql, json = false) {
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
      ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
      // Fail fast su Vercel: senza timeout il pool aspetta 30s+ e Vercel
      // uccide la funzione serverless prima che il catch possa girare.
      connectionTimeoutMillis: 8000,
      idleTimeoutMillis: 20000,
      max: 3
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
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER PRIMARY KEY,
      km_rate REAL NOT NULL DEFAULT 0.65,
      drive_hour_rate REAL NOT NULL DEFAULT 22,
      work_hour_rate REAL NOT NULL DEFAULT 60,
      navigator_pref TEXT DEFAULT 'google',
      theme_pref TEXT DEFAULT 'auto',
      lunch_break_minutes INTEGER DEFAULT 45,
      lunch_break_enabled INTEGER DEFAULT 1,
      default_start_label TEXT DEFAULT '',
      default_start_address TEXT DEFAULT '',
      rest_interval_min INTEGER DEFAULT 120,
      rest_max_deviation_min INTEGER DEFAULT 40,
      rest_duration_min INTEGER DEFAULT 15,
      drive_markup_min_per_hour REAL DEFAULT 10,
      earliest_break_time TEXT DEFAULT '08:00',
      max_detour_km REAL DEFAULT 1.5,
      max_return_time TEXT DEFAULT '',
      theme_mode TEXT DEFAULT 'auto',
      theme_palette TEXT DEFAULT 'default'
    );
    INSERT OR IGNORE INTO settings (id, km_rate, drive_hour_rate, work_hour_rate)
    VALUES (1, 0.65, 22, 60);
  `);

  await migratePlannedRoutes();
  await migrateWeeklyHours();

  await migrateSettingsColumns();
  await migrateUserSettingsCols();
  await migrateUserNickname();
  await migrateAuth();

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
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER PRIMARY KEY,
      km_rate DOUBLE PRECISION NOT NULL DEFAULT 0.65,
      drive_hour_rate DOUBLE PRECISION NOT NULL DEFAULT 22,
      work_hour_rate DOUBLE PRECISION NOT NULL DEFAULT 60,
      navigator_pref TEXT DEFAULT 'google',
      theme_pref TEXT DEFAULT 'auto',
      lunch_break_minutes INTEGER DEFAULT 45,
      lunch_break_enabled INTEGER DEFAULT 1,
      default_start_label TEXT DEFAULT '',
      default_start_address TEXT DEFAULT '',
      rest_interval_min INTEGER DEFAULT 120,
      rest_max_deviation_min INTEGER DEFAULT 40,
      rest_duration_min INTEGER DEFAULT 15,
      drive_markup_min_per_hour DOUBLE PRECISION DEFAULT 10,
      earliest_break_time TEXT DEFAULT '08:00',
      max_detour_km DOUBLE PRECISION DEFAULT 1.5,
      max_return_time TEXT DEFAULT ''
    );
    INSERT INTO settings (id, km_rate, drive_hour_rate, work_hour_rate)
    VALUES (1, 0.65, 22, 60)
    ON CONFLICT (id) DO NOTHING;
  `);

  await migratePlannedRoutes();
  await migrateWeeklyHours();

  await migrateSettingsColumns();
  await migrateUserSettingsCols();
  await migrateUserNickname();
  await migrateAuth();
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
  const routeCols = await tableColumns("planned_routes");
  if (!routeCols.includes("scheduled_date")) {
    await runSql("ALTER TABLE planned_routes ADD COLUMN scheduled_date TEXT DEFAULT '';");
  }
  if (!routeCols.includes("weather_captured_at")) {
    await runSql("ALTER TABLE planned_routes ADD COLUMN weather_captured_at TEXT DEFAULT '';");
  }

  const addrCols = await tableColumns("addresses");
  if (!addrCols.includes("phone")) {
    await runSql("ALTER TABLE addresses ADD COLUMN phone TEXT DEFAULT '';");
  }
  if (!addrCols.includes("email")) {
    await runSql("ALTER TABLE addresses ADD COLUMN email TEXT DEFAULT '';");
  }
  if (!addrCols.includes("phone2")) {
    await runSql("ALTER TABLE addresses ADD COLUMN phone2 TEXT DEFAULT '';");
  }
  if (!addrCols.includes("phone_type")) {
    await runSql("ALTER TABLE addresses ADD COLUMN phone_type TEXT DEFAULT 'cell';");
  }
  if (!addrCols.includes("phone2_type")) {
    await runSql("ALTER TABLE addresses ADD COLUMN phone2_type TEXT DEFAULT 'fisso';");
  }
  if (!addrCols.includes("phone_name")) {
    await runSql("ALTER TABLE addresses ADD COLUMN phone_name TEXT DEFAULT '';");
  }
  if (!addrCols.includes("phone2_name")) {
    await runSql("ALTER TABLE addresses ADD COLUMN phone2_name TEXT DEFAULT '';");
  }
  if (!addrCols.includes("phone_preferred")) {
    await runSql("ALTER TABLE addresses ADD COLUMN phone_preferred TEXT DEFAULT 'phone';");
  }

  if (!addrCols.includes("address_type")) {
    await runSql("ALTER TABLE addresses ADD COLUMN address_type TEXT DEFAULT 'customer';");
  }
  if (!addrCols.includes("weekly_hours")) {
    await runSql("ALTER TABLE addresses ADD COLUMN weekly_hours TEXT DEFAULT NULL;");
  }
  if (!addrCols.includes("is_rest_stop")) {
    await runSql("ALTER TABLE addresses ADD COLUMN is_rest_stop INTEGER DEFAULT 0;");
  }
  if (!addrCols.includes("is_lunch_stop")) {
    await runSql("ALTER TABLE addresses ADD COLUMN is_lunch_stop INTEGER DEFAULT 0;");
  }

  const settingsCols = await tableColumns("settings");
  if (!settingsCols.includes("navigator_pref")) {
    await runSql("ALTER TABLE settings ADD COLUMN navigator_pref TEXT DEFAULT 'google';");
  }
  if (!settingsCols.includes("theme_pref")) {
    await runSql("ALTER TABLE settings ADD COLUMN theme_pref TEXT DEFAULT 'auto';");
  }
  if (!settingsCols.includes("lunch_break_minutes")) {
    await runSql("ALTER TABLE settings ADD COLUMN lunch_break_minutes INTEGER DEFAULT 45;");
  }
  if (!settingsCols.includes("lunch_break_enabled")) {
    await runSql("ALTER TABLE settings ADD COLUMN lunch_break_enabled INTEGER DEFAULT 1;");
  }
}


function isAlreadyExistsError(err) {
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("duplicate column") || msg.includes("already exists") || msg.includes("column") && msg.includes("exist");
}

export async function migrateSettingsColumns() {
  const cols = ["default_start_label TEXT DEFAULT ''", "default_start_address TEXT DEFAULT ''", "rest_interval_min INTEGER DEFAULT 120", "rest_max_deviation_min INTEGER DEFAULT 40", "rest_duration_min INTEGER DEFAULT 15", "drive_markup_min_per_hour INTEGER DEFAULT 10"];
  for (const col of cols) {
    try { await runSql(`ALTER TABLE settings ADD COLUMN ${col};`); } catch (err) { if (!isAlreadyExistsError(err)) console.warn("migrateSettingsColumns:", err.message); }
  }
  const newSettingsCols = [
    "earliest_break_time TEXT DEFAULT '08:00'",
    "max_detour_km REAL DEFAULT 1.5",
    "max_detour_min REAL DEFAULT 10",
    "max_return_time TEXT DEFAULT ''",
    "theme_mode TEXT DEFAULT 'auto'",
    "theme_palette TEXT DEFAULT 'default'"
  ];
  for (const col of newSettingsCols) {
    try { await runSql(`ALTER TABLE settings ADD COLUMN ${col};`); } catch (err) { if (!isAlreadyExistsError(err)) console.warn("migrateSettingsColumns:", err.message); }
  }
  const addrCols = await tableColumns("addresses");
  if (!addrCols.includes("place_id")) {
    await runSql("ALTER TABLE addresses ADD COLUMN place_id TEXT DEFAULT NULL;");
  }
  if (!addrCols.includes("activity")) {
    await runSql("ALTER TABLE addresses ADD COLUMN activity TEXT DEFAULT '';");
  }
}

async function migrateUserSettingsCols() {
  const cols = await tableColumns("user_settings");
  const toAdd = [
    ["theme_mode", "TEXT DEFAULT 'auto'"],
    ["theme_palette", "TEXT DEFAULT 'default'"],
    ["icon_style", "TEXT DEFAULT 'color'"],
    ["lunch_open_time", "TEXT DEFAULT '11:30'"],
    ["lunch_close_time", "TEXT DEFAULT '14:00'"],
    ["no_break_early_min", "INTEGER DEFAULT 120"],
    ["no_break_before_home_min", "INTEGER DEFAULT 60"],
    ["no_break_before_lunch_min", "INTEGER DEFAULT 60"],
    ["no_break_after_lunch_min", "INTEGER DEFAULT 120"],
    ["brand_color", "TEXT DEFAULT ''"],
    ["brand_color2", "TEXT DEFAULT ''"],
    ["max_detour_min", "REAL DEFAULT 10"],
  ];
  for (const [col, def] of toAdd) {
    if (!cols.includes(col)) {
      try { await runSql(`ALTER TABLE user_settings ADD COLUMN ${col} ${def};`); } catch (e) { if (!isAlreadyExistsError(e)) console.warn("migrateUserSettingsCols:", e.message); }
    }
  }
}

async function migrateUserNickname() {
  const cols = await tableColumns("users");
  if (!cols.includes("nickname")) {
    try { await runSql("ALTER TABLE users ADD COLUMN nickname TEXT DEFAULT NULL;"); } catch (e) { if (!isAlreadyExistsError(e)) console.warn("migrateUserNickname:", e.message); }
  }
}

async function migrateAuth() {
  // Add user_id to addresses
  const addrCols = await tableColumns("addresses");
  if (!addrCols.includes("user_id")) {
    await runSql("ALTER TABLE addresses ADD COLUMN user_id INTEGER;");
  }
  // Add user_id to planned_routes
  const routeCols = await tableColumns("planned_routes");
  if (!routeCols.includes("user_id")) {
    await runSql("ALTER TABLE planned_routes ADD COLUMN user_id INTEGER;");
  }
  if (!routeCols.includes("source")) {
    try { await runSql("ALTER TABLE planned_routes ADD COLUMN source TEXT DEFAULT NULL;"); } catch (e) { if (!isAlreadyExistsError(e)) console.warn(e.message); }
  }
  if (!routeCols.includes("notes")) {
    try { await runSql("ALTER TABLE planned_routes ADD COLUMN notes TEXT DEFAULT NULL;"); } catch (e) { if (!isAlreadyExistsError(e)) console.warn(e.message); }
  }
  if (!routeCols.includes("folder_id")) {
    try { await runSql("ALTER TABLE planned_routes ADD COLUMN folder_id INTEGER;"); } catch (e) { if (!isAlreadyExistsError(e)) console.warn(e.message); }
  }
  await initFoldersTable();
  await initSharedRoutesTable();
  await initMultiDayPlansTable();
}

// Giri multi-giorno salvati: solo l'INPUT (tappe + parametri base), per ricalcolare la suddivisione
// in giornate senza re-inserire tutto. payload_json = { baseReq, stops }.
async function initMultiDayPlansTable() {
  if (dbMode === "postgres") {
    await runSql(`CREATE TABLE IF NOT EXISTS multiday_plans (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      name TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`);
  } else {
    await runSql(`CREATE TABLE IF NOT EXISTS multiday_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`);
  }
}

export async function listMultiDayPlans(userId = null) {
  const userFilter = userId != null ? `WHERE user_id = ${sqlValue(Number(userId))}` : "";
  const rows = await runSql(`SELECT id, name, payload_json, created_at FROM multiday_plans ${userFilter} ORDER BY lower(name), id;`, true);
  return rows.map(r => {
    let payload = {};
    try { payload = JSON.parse(r.payload_json || "{}"); } catch { payload = {}; }
    const stops = Array.isArray(payload.stops) ? payload.stops : [];
    return { id: r.id, name: r.name || "", stopCount: stops.length, createdAt: r.created_at, payload };
  });
}

export async function saveMultiDayPlan(name, payload, userId = null) {
  const userIdVal = userId != null ? sqlValue(Number(userId)) : "NULL";
  const nameVal = sqlValue(String(name || "").trim() || "Giro");
  const json = sqlValue(JSON.stringify(payload || {}));
  if (dbMode === "postgres") {
    const rows = await runSql(`INSERT INTO multiday_plans (user_id, name, payload_json) VALUES (${userIdVal}, ${nameVal}, ${json}) RETURNING id;`, true);
    return { id: rows[0]?.id };
  }
  const rows = await runSql(`INSERT INTO multiday_plans (user_id, name, payload_json) VALUES (${userIdVal}, ${nameVal}, ${json});
    SELECT last_insert_rowid() AS id;`, true);
  return { id: rows[0]?.id };
}

export async function deleteMultiDayPlan(id, userId = null) {
  const userFilter = userId != null ? ` AND user_id = ${sqlValue(Number(userId))}` : "";
  await runSql(`DELETE FROM multiday_plans WHERE id = ${sqlValue(Number(id))}${userFilter};`);
  return { ok: true };
}

async function initFoldersTable() {
  if (dbMode === "postgres") {
    await runSql(`CREATE TABLE IF NOT EXISTS folders (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`);
  } else {
    await runSql(`CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`);
  }
}

async function migrateWeeklyHours() {
  // One-shot: convert old open_morning/close_morning/open_afternoon/close_afternoon
  // into weekly_hours for addresses that don't have it yet.
  // Applies the same hours to Mon–Fri (1–5); Sat (6) and Sun (0) default to closed.
  const rows = await runSql("SELECT id, open_morning, close_morning, open_afternoon, close_afternoon FROM addresses WHERE weekly_hours IS NULL;", true);
  for (const row of rows) {
    const om = row.open_morning || "";
    const cm = row.close_morning || "";
    const oa = row.open_afternoon || "";
    const ca = row.close_afternoon || "";
    if (!om && !cm && !oa && !ca) continue; // no hours at all — leave NULL
    const hasTwoSlots = (om || cm) && (oa || ca);
    const continuous = !hasTwoSlots && !!(om || cm);
    const dayEntry = continuous
      ? { closed: false, continuous: true, openMorning: om, closeMorning: "", openAfternoon: "", closeAfternoon: cm || ca }
      : { closed: false, continuous: false, openMorning: om, closeMorning: cm, openAfternoon: oa, closeAfternoon: ca };
    const wh = {
      1: { ...dayEntry }, 2: { ...dayEntry }, 3: { ...dayEntry },
      4: { ...dayEntry }, 5: { ...dayEntry },
      6: { closed: true, continuous: false, openMorning: "", closeMorning: "", openAfternoon: "", closeAfternoon: "" },
      0: { closed: true, continuous: false, openMorning: "", closeMorning: "", openAfternoon: "", closeAfternoon: "" }
    };
    await runSql(`UPDATE addresses SET weekly_hours = ${sqlValue(JSON.stringify(wh))} WHERE id = ${sqlValue(Number(row.id))};`);
  }
}

export async function listAddresses(search = "", userId = null) {
  const term = String(search || "").trim().toLowerCase();
  const userFilter = userId != null ? ` AND user_id = ${sqlValue(Number(userId))}` : "";
  if (dbMode === "postgres") {
    const where = term ? `WHERE lower(concat_ws(' ', customer, activity, location, full_address, notes)) LIKE ${sqlValue(`%${term}%`)}${userFilter}` : (userFilter ? `WHERE 1=1${userFilter}` : "");
    const rows = await runSql(`SELECT * FROM addresses ${where} ORDER BY lower(nullif(trim(coalesce(activity,'')), '')) NULLS LAST, lower(nullif(trim(coalesce(customer,'')), '')) NULLS LAST, lower(coalesce(location,'')), id ASC;`, true);
    return rows.map(rowToAddress);
  }
  const where = term ? `WHERE lower(customer || ' ' || coalesce(activity,'') || ' ' || location || ' ' || full_address || ' ' || notes) LIKE ${sqlValue(`%${term}%`)}${userFilter}` : (userFilter ? `WHERE 1=1${userFilter}` : "");
  const rows = await runSql(`SELECT * FROM addresses ${where} ORDER BY nullif(trim(coalesce(activity,'')), '') COLLATE NOCASE, nullif(trim(coalesce(customer,'')), '') COLLATE NOCASE, location COLLATE NOCASE, id ASC;`, true);
  return rows.map(rowToAddress);
}

export async function getAddress(id, userId = null) {
  const userFilter = userId != null ? ` AND user_id = ${sqlValue(Number(userId))}` : "";
  const rows = await runSql(`SELECT * FROM addresses WHERE id = ${sqlValue(Number(id))}${userFilter};`, true);
  return rows[0] ? rowToAddress(rows[0]) : null;
}

export async function createAddress(address, userId = null) {
  const userIdVal = userId != null ? sqlValue(Number(userId)) : "NULL";
  const cols = `customer, activity, location, full_address, address_type, phone, phone_type, phone_name, phone2, phone2_type, phone2_name, phone_preferred, email, notes, open_morning, close_morning, open_afternoon, close_afternoon, default_duration, weekly_hours, lat, lng, place_id, is_rest_stop, is_lunch_stop, user_id`;
  const vals = `${sqlValue(address.customer || "Senza nome")}, ${sqlValue(address.activity || "")}, ${sqlValue(address.location || "")}, ${sqlValue(address.fullAddress || address.full_address || "")}, ${sqlValue(address.addressType || "customer")}, ${sqlValue(address.phone || "")}, ${sqlValue(address.phoneType || "cell")}, ${sqlValue(address.phoneName || "")}, ${sqlValue(address.phone2 || "")}, ${sqlValue(address.phone2Type || "fisso")}, ${sqlValue(address.phone2Name || "")}, ${sqlValue(address.phonePreferred || "phone")}, ${sqlValue(address.email || "")}, ${sqlValue(address.notes || "")}, ${sqlValue(address.openMorning || address.open_morning || "")}, ${sqlValue(address.closeMorning || address.close_morning || "")}, ${sqlValue(address.openAfternoon || address.open_afternoon || "")}, ${sqlValue(address.closeAfternoon || address.close_afternoon || "")}, ${sqlValue(Number(address.defaultDuration || address.default_duration || 45))}, ${sqlValue(address.weeklyHours ? JSON.stringify(address.weeklyHours) : null)}, ${sqlValue(address.lat === undefined ? null : Number(address.lat))}, ${sqlValue(address.lng === undefined ? null : Number(address.lng))}, ${sqlValue(address.placeId || address.place_id || null)}, ${sqlValue(address.isRestStop ? 1 : 0)}, ${sqlValue(address.isLunchStop ? 1 : 0)}, ${userIdVal}`;
  if (dbMode === "postgres") {
    const rows = await runSql(`INSERT INTO addresses (${cols}) VALUES (${vals}) RETURNING *;`, true);
    return rowToAddress(rows[0]);
  }
  // INSERT+SELECT in unica invocazione: ogni runSql apre un nuovo processo
  // sqlite3, quindi last_insert_rowid() in chiamata separata vale sempre 0
  const rows = await runSql(`INSERT INTO addresses (${cols}) VALUES (${vals}); SELECT * FROM addresses WHERE id = last_insert_rowid();`, true);
  return rows[0] ? rowToAddress(rows[0]) : null;
}

export async function updateAddress(id, address, userId = null) {
  const userFilter = userId != null ? ` AND user_id = ${sqlValue(Number(userId))}` : "";
  const setClause = `customer = ${sqlValue(address.customer || "Senza nome")}, activity = ${sqlValue(address.activity || "")}, location = ${sqlValue(address.location || "")}, full_address = ${sqlValue(address.fullAddress || "")}, address_type = ${sqlValue(address.addressType || "customer")}, phone = ${sqlValue(address.phone || "")}, phone_type = ${sqlValue(address.phoneType || "cell")}, phone_name = ${sqlValue(address.phoneName || "")}, phone2 = ${sqlValue(address.phone2 || "")}, phone2_type = ${sqlValue(address.phone2Type || "fisso")}, phone2_name = ${sqlValue(address.phone2Name || "")}, phone_preferred = ${sqlValue(address.phonePreferred || "phone")}, email = ${sqlValue(address.email || "")}, notes = ${sqlValue(address.notes || "")}, open_morning = ${sqlValue(address.openMorning || "")}, close_morning = ${sqlValue(address.closeMorning || "")}, open_afternoon = ${sqlValue(address.openAfternoon || "")}, close_afternoon = ${sqlValue(address.closeAfternoon || "")}, default_duration = ${sqlValue(Number(address.defaultDuration || 45))}, weekly_hours = ${sqlValue(address.weeklyHours ? JSON.stringify(address.weeklyHours) : null)}, lat = ${sqlValue(address.lat === undefined ? null : Number(address.lat))}, lng = ${sqlValue(address.lng === undefined ? null : Number(address.lng))}, place_id = ${sqlValue(address.placeId !== undefined ? address.placeId : (address.place_id ?? null))}, is_rest_stop = ${sqlValue(address.isRestStop ? 1 : 0)}, is_lunch_stop = ${sqlValue(address.isLunchStop ? 1 : 0)}`;
  if (dbMode === "postgres") {
    const rows = await runSql(`UPDATE addresses SET ${setClause}, updated_at = NOW() WHERE id = ${sqlValue(Number(id))}${userFilter} RETURNING *;`, true);
    return rows[0] ? rowToAddress(rows[0]) : null;
  }
  await runSql(`UPDATE addresses SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ${sqlValue(Number(id))}${userFilter};`);
  return getAddress(id, userId);
}

export async function deleteAddress(id, userId = null) {
  const userFilter = userId != null ? ` AND user_id = ${sqlValue(Number(userId))}` : "";
  await runSql(`DELETE FROM addresses WHERE id = ${sqlValue(Number(id))}${userFilter};`);
  return { ok: true };
}

export async function getSettings(userId) {
  const rows = await runSql(`SELECT * FROM user_settings WHERE user_id = ${sqlValue(Number(userId))};`, true);
  return rowToSettings(rows[0] || {});
}

export async function updateSettings(userId, settings) {
  const vals = {
    km_rate: Number(settings.kmRate ?? 0.65),
    drive_hour_rate: Number(settings.driveHourRate ?? 22),
    work_hour_rate: Number(settings.workHourRate ?? 60),
    navigator_pref: settings.navigatorPref || "google",
    theme_pref: settings.themePref || "auto",
    theme_mode: settings.themeMode || "auto",
    theme_palette: settings.themePalette || "default",
    lunch_break_minutes: Number(settings.lunchBreakMinutes ?? 45),
    lunch_break_enabled: settings.lunchBreakEnabled === false ? 0 : 1,
    default_start_label: settings.defaultStartLabel || "",
    default_start_address: settings.defaultStartAddress || "",
    rest_interval_min: Number(settings.restIntervalMin ?? 120),
    rest_max_deviation_min: Number(settings.restMaxDeviationMin ?? 40),
    rest_duration_min: Number(settings.restDurationMin ?? 15),
    drive_markup_min_per_hour: Number(settings.driveMarkupMinPerHour ?? 10),
    earliest_break_time: settings.earliestBreakTime || "08:00",
    max_detour_min: Number(settings.maxDetourMin ?? 10),
    max_return_time: settings.maxReturnTime || "",
    icon_style: settings.iconStyle || "color",
    lunch_open_time: settings.lunchOpenTime || "11:30",
    lunch_close_time: settings.lunchCloseTime || "14:00",
    no_break_early_min: Number(settings.noBreakEarlyMin ?? 120),
    no_break_before_home_min: Number(settings.noBreakBeforeHomeMin ?? 60),
    no_break_before_lunch_min: Number(settings.noBreakBeforeLunchMin ?? 60),
    no_break_after_lunch_min: Number(settings.noBreakAfterLunchMin ?? 120),
    brand_color: /^#[0-9a-fA-F]{6}$/.test(settings.brandColor || "") ? settings.brandColor : "",
    brand_color2: /^#[0-9a-fA-F]{6}$/.test(settings.brandColor2 || "") ? settings.brandColor2 : ""
  };
  const cols = Object.keys(vals).join(", ");
  const sqlVals = Object.values(vals).map(v => typeof v === "string" ? sqlValue(v) : String(v)).join(", ");
  const updates = Object.entries(vals).map(([k, v]) => `${k} = ${typeof v === "string" ? sqlValue(v) : String(v)}`).join(", ");
  if (dbMode === "postgres") {
    await runSql(`INSERT INTO user_settings (user_id, ${cols}) VALUES (${sqlValue(Number(userId))}, ${sqlVals}) ON CONFLICT (user_id) DO UPDATE SET ${updates};`);
  } else {
    await runSql(`INSERT OR REPLACE INTO user_settings (user_id, ${cols}) VALUES (${sqlValue(Number(userId))}, ${sqlVals});`);
  }
  return getSettings(userId);
}

export async function saveRoute(route, userId = null, source = null) {
  const userIdVal = userId != null ? sqlValue(Number(userId)) : "NULL";
  const sourceVal = source ? sqlValue(source) : "NULL";
  const notesVal = route.notes ? sqlValue(route.notes) : "NULL";
  if (dbMode === "postgres") {
    const rows = await runSql(`
      INSERT INTO planned_routes (name, scheduled_date, start_label, start_address, end_label, end_address, start_time, first_arrival_required, total_km, total_drive_minutes, total_work_minutes, total_cost, weather_captured_at, payload_json, user_id, source, notes)
      VALUES (${sqlValue(route.name || "")}, ${sqlValue(route.scheduledDate || route.scheduled_date || "")}, ${sqlValue(route.startLabel || "")}, ${sqlValue(route.startAddress || "")}, ${sqlValue(route.endLabel || "")}, ${sqlValue(route.endAddress || "")}, ${sqlValue(route.startTime || "")}, ${sqlValue(route.firstArrivalRequired || "")}, ${sqlValue(Number(route.summary?.totalKm || 0))}, ${sqlValue(Number(route.summary?.totalDriveMinutes || 0))}, ${sqlValue(Number(route.summary?.totalWorkMinutes || 0))}, ${sqlValue(Number(route.summary?.totalCost || 0))}, ${sqlValue(route.weatherCapturedAt || "")}, ${sqlValue(JSON.stringify(route))}, ${userIdVal}, ${sourceVal}, ${notesVal})
      RETURNING id;
    `, true);
    return { id: rows[0]?.id };
  }
  const rows = await runSql(`
    INSERT INTO planned_routes (name, scheduled_date, start_label, start_address, end_label, end_address, start_time, first_arrival_required, total_km, total_drive_minutes, total_work_minutes, total_cost, weather_captured_at, payload_json, user_id, source, notes)
    VALUES (${sqlValue(route.name || "")}, ${sqlValue(route.scheduledDate || route.scheduled_date || "")}, ${sqlValue(route.startLabel || "")}, ${sqlValue(route.startAddress || "")}, ${sqlValue(route.endLabel || "")}, ${sqlValue(route.endAddress || "")}, ${sqlValue(route.startTime || "")}, ${sqlValue(route.firstArrivalRequired || "")}, ${sqlValue(Number(route.summary?.totalKm || 0))}, ${sqlValue(Number(route.summary?.totalDriveMinutes || 0))}, ${sqlValue(Number(route.summary?.totalWorkMinutes || 0))}, ${sqlValue(Number(route.summary?.totalCost || 0))}, ${sqlValue(route.weatherCapturedAt || "")}, ${sqlValue(JSON.stringify(route))}, ${userIdVal}, ${sourceVal}, ${notesVal});
  
    SELECT last_insert_rowid() AS id;
  `, true);
  return { id: rows[0]?.id };
}

export async function updateRouteNotes(id, notes, userId = null) {
  const userFilter = userId != null ? ` AND user_id = ${sqlValue(Number(userId))}` : "";
  await runSql(`UPDATE planned_routes SET notes = ${sqlValue(notes || "")} WHERE id = ${sqlValue(Number(id))}${userFilter};`);
}

export async function countRoutesByDate(date, userId = null) {
  const userFilter = userId != null ? ` AND user_id = ${sqlValue(Number(userId))}` : "";
  const rows = await runSql(`SELECT COUNT(*) as n FROM planned_routes WHERE scheduled_date = ${sqlValue(date)}${userFilter};`, true);
  return Number(rows[0]?.n ?? rows[0]?.count ?? 0);
}

export async function listRoutes(userId = null, full = false) {
  const userFilter = userId != null ? `WHERE user_id = ${sqlValue(Number(userId))}` : "";
  // full=true → mappa con rowToRoute (include il payload completo) dalla STESSA query, niente N+1
  const map = full ? rowToRoute : rowToRouteSummary;
  if (dbMode === "postgres") {
    const rows = await runSql(`SELECT * FROM planned_routes ${userFilter} ORDER BY COALESCE(NULLIF(scheduled_date, ''), created_at::date::text) DESC, id DESC;`, true);
    return rows.map(map);
  }
  const rows = await runSql(`SELECT * FROM planned_routes ${userFilter} ORDER BY COALESCE(NULLIF(scheduled_date, ''), created_at) DESC, id DESC;`, true);
  return rows.map(map);
}

export async function getRoute(id, userId = null) {
  const userFilter = userId != null ? ` AND user_id = ${sqlValue(Number(userId))}` : "";
  const rows = await runSql(`SELECT * FROM planned_routes WHERE id = ${sqlValue(Number(id))}${userFilter};`, true);
  return rows[0] ? rowToRoute(rows[0]) : null;
}

export async function updateRoutePayload(id, route, userId = null) {
  const userFilter = userId != null ? ` AND user_id = ${sqlValue(Number(userId))}` : "";
  await runSql(`
    UPDATE planned_routes SET scheduled_date = ${sqlValue(route.scheduledDate || "")}, total_km = ${sqlValue(Number(route.summary?.totalKm || 0))}, total_drive_minutes = ${sqlValue(Number(route.summary?.totalDriveMinutes || 0))}, total_work_minutes = ${sqlValue(Number(route.summary?.totalWorkMinutes || 0))}, total_cost = ${sqlValue(Number(route.summary?.totalCost || 0))}, weather_captured_at = ${sqlValue(route.weatherCapturedAt || "")}, payload_json = ${sqlValue(JSON.stringify(route))}
    WHERE id = ${sqlValue(Number(id))}${userFilter};
  `);
  return getRoute(id, userId);
}

export async function routeNameExists(name, userId, excludeId = null) {
  const userFilter = userId != null ? ` AND user_id = ${sqlValue(Number(userId))}` : "";
  const excludeFilter = excludeId != null ? ` AND id != ${sqlValue(Number(excludeId))}` : "";
  const rows = await runSql(`SELECT COUNT(*) as n FROM planned_routes WHERE name = ${sqlValue(String(name).trim())}${userFilter}${excludeFilter};`, true);
  return Number(rows[0]?.n ?? rows[0]?.count ?? 0) > 0;
}

export async function renameRoute(id, name, userId = null) {
  const nextName = String(name || "").trim() || "Giro salvato";
  const stored = await getRoute(id, userId);
  if (!stored) return null;
  const payload = { ...(stored.payload || {}), name: nextName };
  const userFilter = userId != null ? ` AND user_id = ${sqlValue(Number(userId))}` : "";

  await runSql(`
    UPDATE planned_routes SET name = ${sqlValue(nextName)}, payload_json = ${sqlValue(JSON.stringify(payload))}
    WHERE id = ${sqlValue(Number(id))}${userFilter};
  `);
  return getRoute(id, userId);
}

export async function deleteRoute(id, userId = null) {
  const userFilter = userId != null ? ` AND user_id = ${sqlValue(Number(userId))}` : "";
  await runSql(`DELETE FROM planned_routes WHERE id = ${sqlValue(Number(id))}${userFilter};`);
  return { ok: true };
}

// ── cartelle (organizzazione giri) ─────────────────────────────────────────────
export async function listFolders(userId = null) {
  const userFilter = userId != null ? `WHERE user_id = ${sqlValue(Number(userId))}` : "";
  const rows = await runSql(`SELECT * FROM folders ${userFilter} ORDER BY lower(name), id;`, true);
  return rows.map(r => ({ id: r.id, name: r.name || "", createdAt: r.created_at }));
}

export async function createFolder(name, userId = null) {
  const nm = String(name || "").trim() || "Cartella";
  const userVal = userId != null ? Number(userId) : null;
  if (dbMode === "postgres") {
    const rows = await runSql(`INSERT INTO folders (name, user_id) VALUES (${sqlValue(nm)}, ${sqlValue(userVal)}) RETURNING id, name, created_at;`, true);
    return rows[0] ? { id: rows[0].id, name: rows[0].name, createdAt: rows[0].created_at } : null;
  }
  const rows = await runSql(`INSERT INTO folders (name, user_id) VALUES (${sqlValue(nm)}, ${sqlValue(userVal)}); SELECT id, name, created_at FROM folders WHERE id = last_insert_rowid();`, true);
  return rows[0] ? { id: rows[0].id, name: rows[0].name, createdAt: rows[0].created_at } : null;
}

export async function renameFolder(id, name, userId = null) {
  const nm = String(name || "").trim() || "Cartella";
  const userFilter = userId != null ? ` AND user_id = ${sqlValue(Number(userId))}` : "";
  await runSql(`UPDATE folders SET name = ${sqlValue(nm)} WHERE id = ${sqlValue(Number(id))}${userFilter};`);
  return { id: Number(id), name: nm };
}

export async function deleteFolder(id, userId = null) {
  const userFilter = userId != null ? ` AND user_id = ${sqlValue(Number(userId))}` : "";
  // I giri NON vengono cancellati: tornano "senza cartella".
  await runSql(`UPDATE planned_routes SET folder_id = NULL WHERE folder_id = ${sqlValue(Number(id))}${userFilter};`);
  await runSql(`DELETE FROM folders WHERE id = ${sqlValue(Number(id))}${userFilter};`);
  return { ok: true };
}

export async function setRouteFolder(routeId, folderId, userId = null) {
  const userFilter = userId != null ? ` AND user_id = ${sqlValue(Number(userId))}` : "";
  const fid = (folderId == null || folderId === "") ? "NULL" : sqlValue(Number(folderId));
  await runSql(`UPDATE planned_routes SET folder_id = ${fid} WHERE id = ${sqlValue(Number(routeId))}${userFilter};`);
  return getRoute(routeId, userId);
}

// ── auth DB functions ─────────────────────────────────────────────────────────

export async function createUser(username, passwordHash) {
  if (dbMode === "postgres") {
    const rows = await runSql(`INSERT INTO users (username, password_hash) VALUES (${sqlValue(username)}, ${sqlValue(passwordHash)}) RETURNING id, username, created_at;`, true);
    return rows[0] ? { id: rows[0].id, username: rows[0].username } : null;
  }
  const rows = await runSql(`INSERT INTO users (username, password_hash) VALUES (${sqlValue(username)}, ${sqlValue(passwordHash)}); SELECT id, username FROM users WHERE id = last_insert_rowid();`, true);
  return rows[0] ? { id: rows[0].id, username: rows[0].username } : null;
}

export async function findUserByUsername(username) {
  const rows = await runSql(`SELECT * FROM users WHERE lower(username) = lower(${sqlValue(username)});`, true);
  return rows[0] || null;
}

export async function findUserById(id) {
  const rows = await runSql(`SELECT id, username FROM users WHERE id = ${sqlValue(Number(id))};`, true);
  return rows[0] || null;
}

export async function updateUserPassword(userId, newHash) {
  await runSql(`UPDATE users SET password_hash = ${sqlValue(newHash)} WHERE id = ${sqlValue(Number(userId))};`);
}

export async function updateUserNickname(userId, nickname) {
  await runSql(`UPDATE users SET nickname = ${sqlValue(nickname || null)} WHERE id = ${sqlValue(Number(userId))};`);
}

export async function getUserById(id) {
  const rows = await runSql(`SELECT id, username, nickname FROM users WHERE id = ${sqlValue(Number(id))};`, true);
  return rows[0] || null;
}

export async function createSession(token, userId) {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await runSql(`INSERT INTO sessions (token, user_id, expires_at) VALUES (${sqlValue(token)}, ${sqlValue(Number(userId))}, ${sqlValue(expiresAt)});`);
}

export async function getSession(token) {
  if (!token) return null;
  const rows = await runSql(`SELECT user_id, expires_at FROM sessions WHERE token = ${sqlValue(token)};`, true);
  if (!rows[0]) return null;
  if (new Date(rows[0].expires_at) < new Date()) {
    await runSql(`DELETE FROM sessions WHERE token = ${sqlValue(token)};`);
    return null;
  }
  return Number(rows[0].user_id);
}

export async function extendSession(token) {
  if (!token) return;
  const newExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await runSql(`UPDATE sessions SET expires_at = ${sqlValue(newExpiry)} WHERE token = ${sqlValue(token)};`);
}

export async function deleteSession(token) {
  if (!token) return;
  await runSql(`DELETE FROM sessions WHERE token = ${sqlValue(token)};`);
}

export async function purgeExpiredSessions() {
  await runSql(`DELETE FROM sessions WHERE expires_at < ${sqlValue(new Date().toISOString())};`);
}

// ── Shared routes ─────────────────────────────────────────────────────────────

export async function initSharedRoutesTable() {
  if (dbMode === "postgres") {
    await runSql(`
      CREATE TABLE IF NOT EXISTS shared_routes (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        route_json TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  } else {
    await runSql(`
      CREATE TABLE IF NOT EXISTS shared_routes (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        route_json TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }
}

// Durata del link di condivisione: il link è importabile per 7 giorni, poi scade.
// La scadenza blocca solo NUOVI import; le copie già importate restano permanenti.
export const SHARE_LINK_TTL_DAYS = 7;

export async function createSharedRoute(token, userId, routeJson) {
  const expiresAt = new Date(Date.now() + SHARE_LINK_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await runSql(`
    INSERT INTO shared_routes (token, user_id, route_json, expires_at)
    VALUES (${sqlValue(token)}, ${sqlValue(Number(userId))}, ${sqlValue(routeJson)}, ${sqlValue(expiresAt)});
  `);
  return { token, expiresAt };
}

export async function getSharedRoute(token) {
  if (!token) return null;
  const rows = await runSql(`SELECT * FROM shared_routes WHERE token = ${sqlValue(token)};`, true);
  if (!rows[0]) return null;
  if (new Date(rows[0].expires_at) < new Date()) {
    await runSql(`DELETE FROM shared_routes WHERE token = ${sqlValue(token)};`);
    return null;
  }
  try { return JSON.parse(rows[0].route_json); } catch { return null; }
}

export async function purgeExpiredSharedRoutes() {
  await runSql(`DELETE FROM shared_routes WHERE expires_at < ${sqlValue(new Date().toISOString())};`);
}

export async function hasAnyUser() {
  const rows = await runSql("SELECT COUNT(*) AS count FROM users;", true);
  return Number(rows[0]?.count ?? 0) > 0;
}

export async function adminListUsers() {
  return runSql(`
    SELECT u.id, u.username, u.created_at,
      (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > CURRENT_TIMESTAMP) AS active_sessions,
      (SELECT COUNT(*) FROM planned_routes r WHERE r.user_id = u.id) AS route_count,
      (SELECT COUNT(*) FROM addresses a WHERE a.user_id = u.id) AS address_count
    FROM users u ORDER BY u.created_at DESC;
  `, true);
}

export async function adminListSessions() {
  return runSql(`
    SELECT s.token, s.user_id, s.created_at, s.expires_at, u.username
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.expires_at > CURRENT_TIMESTAMP
    ORDER BY s.created_at DESC;
  `, true);
}

export async function adminDeleteUserSessions(userId) {
  await runSql(`DELETE FROM sessions WHERE user_id = ${sqlValue(Number(userId))};`);
}

export async function adminDeleteUser(userId) {
  await runSql(`DELETE FROM sessions WHERE user_id = ${sqlValue(Number(userId))};`);
  await runSql(`DELETE FROM planned_routes WHERE user_id = ${sqlValue(Number(userId))};`);
  await runSql(`DELETE FROM addresses WHERE user_id = ${sqlValue(Number(userId))};`);
  await runSql(`DELETE FROM user_settings WHERE user_id = ${sqlValue(Number(userId))};`);
  await runSql(`DELETE FROM users WHERE id = ${sqlValue(Number(userId))};`);
}

export async function adminGetStats() {
  const [users] = await runSql(`SELECT COUNT(*) AS c FROM users;`, true);
  const [routes] = await runSql(`SELECT COUNT(*) AS c FROM planned_routes;`, true);
  const [addresses] = await runSql(`SELECT COUNT(*) AS c FROM addresses;`, true);
  const [sessions] = await runSql(`SELECT COUNT(*) AS c FROM sessions WHERE expires_at > CURRENT_TIMESTAMP;`, true);
  return {
    users: Number(users?.c || 0),
    routes: Number(routes?.c || 0),
    addresses: Number(addresses?.c || 0),
    activeSessions: Number(sessions?.c || 0)
  };
}

export function getDbMode() { return dbMode; }
export function getDbPath() { return databasePath || null; }

export async function assignOrphanedData(userId) {
  await runSql(`UPDATE addresses SET user_id = ${sqlValue(Number(userId))} WHERE user_id IS NULL;`);
  await runSql(`UPDATE planned_routes SET user_id = ${sqlValue(Number(userId))} WHERE user_id IS NULL;`);
  // Migrate old settings to user_settings if not yet done
  const existing = await runSql(`SELECT user_id FROM user_settings WHERE user_id = ${sqlValue(Number(userId))};`, true);
  if (!existing.length) {
    const oldRows = await runSql("SELECT * FROM settings WHERE id = 1;", true);
    const s = oldRows[0] || {};
    if (dbMode === "postgres") {
      await runSql(`INSERT INTO user_settings (user_id, km_rate, drive_hour_rate, work_hour_rate, navigator_pref, theme_pref, lunch_break_minutes, lunch_break_enabled, default_start_label, default_start_address, rest_interval_min, rest_max_deviation_min, rest_duration_min, drive_markup_min_per_hour, earliest_break_time, max_detour_km, max_return_time)
        VALUES (${sqlValue(Number(userId))}, ${s.km_rate ?? 0.65}, ${s.drive_hour_rate ?? 22}, ${s.work_hour_rate ?? 60}, ${sqlValue(s.navigator_pref ?? 'google')}, ${sqlValue(s.theme_pref ?? 'auto')}, ${s.lunch_break_minutes ?? 45}, ${s.lunch_break_enabled ?? 1}, ${sqlValue(s.default_start_label ?? '')}, ${sqlValue(s.default_start_address ?? '')}, ${s.rest_interval_min ?? 120}, ${s.rest_max_deviation_min ?? 40}, ${s.rest_duration_min ?? 15}, ${s.drive_markup_min_per_hour ?? 10}, ${sqlValue(s.earliest_break_time ?? '08:00')}, ${s.max_detour_km ?? 1.7}, ${sqlValue(s.max_return_time ?? '')})
        ON CONFLICT (user_id) DO NOTHING;`);
    } else {
      await runSql(`INSERT OR IGNORE INTO user_settings (user_id, km_rate, drive_hour_rate, work_hour_rate, navigator_pref, theme_pref, lunch_break_minutes, lunch_break_enabled, default_start_label, default_start_address, rest_interval_min, rest_max_deviation_min, rest_duration_min, drive_markup_min_per_hour, earliest_break_time, max_detour_km, max_return_time)
        VALUES (${sqlValue(Number(userId))}, ${s.km_rate ?? 0.65}, ${s.drive_hour_rate ?? 22}, ${s.work_hour_rate ?? 60}, ${sqlValue(s.navigator_pref ?? 'google')}, ${sqlValue(s.theme_pref ?? 'auto')}, ${s.lunch_break_minutes ?? 45}, ${s.lunch_break_enabled ?? 1}, ${sqlValue(s.default_start_label ?? '')}, ${sqlValue(s.default_start_address ?? '')}, ${s.rest_interval_min ?? 120}, ${s.rest_max_deviation_min ?? 40}, ${s.rest_duration_min ?? 15}, ${s.drive_markup_min_per_hour ?? 10}, ${sqlValue(s.earliest_break_time ?? '08:00')}, ${s.max_detour_km ?? 1.7}, ${sqlValue(s.max_return_time ?? '')});`);
    }
  }
}
