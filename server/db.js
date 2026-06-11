import fs from "node:fs";
import path from "node:path";

let databasePath;
let pgPool;
let sqliteDb; // connessione better-sqlite3 persistente (una sola per processo)
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

// ── Query layer ───────────────────────────────────────────────────────────────
// Tutte le query passano da qui con placeholder `?` e parametri separati:
// niente più concatenazione di valori nelle stringhe SQL (ex sqlValue).
// In modalità Postgres i `?` vengono convertiti in $1..$n.

// Stessa semantica del vecchio sqlValue: "" e non-finiti diventano NULL,
// i boolean diventano 1/0 (le colonne *_enabled sono INTEGER).
function bindable(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return String(value);
}

function toPgPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// SELECT o INSERT/UPDATE ... RETURNING — restituisce le righe.
export async function dbAll(sql, params = []) {
  const bound = params.map(bindable);
  if (dbMode === "postgres") {
    const result = await pgPool.query(toPgPlaceholders(sql), bound);
    return result.rows;
  }
  return sqliteDb.prepare(sql).all(...bound);
}

// INSERT/UPDATE/DELETE senza RETURNING — restituisce { lastID, changes }.
export async function dbRun(sql, params = []) {
  const bound = params.map(bindable);
  if (dbMode === "postgres") {
    const result = await pgPool.query(toPgPlaceholders(sql), bound);
    return { lastID: null, changes: result.rowCount ?? 0 };
  }
  const info = sqliteDb.prepare(sql).run(...bound);
  return { lastID: Number(info.lastInsertRowid), changes: info.changes };
}

// DDL / script multi-statement senza parametri (CREATE TABLE, ALTER, INDEX).
export async function dbExec(sql) {
  if (dbMode === "postgres") {
    await pgPool.query(sql);
    return;
  }
  sqliteDb.exec(sql);
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
    notes: row.notes || ""
  };
}

function rowToRoute(row) {
  return {
    ...rowToRouteSummary(row),
    payload: safeJson(row.payload_json, {})
  };
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

  const { default: Database } = await import("better-sqlite3");
  sqliteDb = new Database(databasePath);
  sqliteDb.pragma("journal_mode = WAL");

  await dbExec(`
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
  await dbExec(`
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
      max_detour_km DOUBLE PRECISION DEFAULT 1.7,
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
  // tableName è sempre una costante del codice, mai input utente
  if (dbMode === "postgres") {
    const rows = await dbAll(`
      SELECT column_name AS name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ?;
    `, [tableName]);
    return rows.map((row) => row.name);
  }
  return sqliteDb.pragma(`table_info(${tableName})`).map((row) => row.name);
}

async function migratePlannedRoutes() {
  const routeCols = await tableColumns("planned_routes");
  if (!routeCols.includes("scheduled_date")) {
    await dbExec("ALTER TABLE planned_routes ADD COLUMN scheduled_date TEXT DEFAULT '';");
  }
  if (!routeCols.includes("weather_captured_at")) {
    await dbExec("ALTER TABLE planned_routes ADD COLUMN weather_captured_at TEXT DEFAULT '';");
  }

  const addrCols = await tableColumns("addresses");
  if (!addrCols.includes("phone")) {
    await dbExec("ALTER TABLE addresses ADD COLUMN phone TEXT DEFAULT '';");
  }
  if (!addrCols.includes("email")) {
    await dbExec("ALTER TABLE addresses ADD COLUMN email TEXT DEFAULT '';");
  }
  if (!addrCols.includes("phone2")) {
    await dbExec("ALTER TABLE addresses ADD COLUMN phone2 TEXT DEFAULT '';");
  }
  if (!addrCols.includes("phone_type")) {
    await dbExec("ALTER TABLE addresses ADD COLUMN phone_type TEXT DEFAULT 'cell';");
  }
  if (!addrCols.includes("phone2_type")) {
    await dbExec("ALTER TABLE addresses ADD COLUMN phone2_type TEXT DEFAULT 'fisso';");
  }
  if (!addrCols.includes("phone_name")) {
    await dbExec("ALTER TABLE addresses ADD COLUMN phone_name TEXT DEFAULT '';");
  }
  if (!addrCols.includes("phone2_name")) {
    await dbExec("ALTER TABLE addresses ADD COLUMN phone2_name TEXT DEFAULT '';");
  }
  if (!addrCols.includes("phone_preferred")) {
    await dbExec("ALTER TABLE addresses ADD COLUMN phone_preferred TEXT DEFAULT 'phone';");
  }

  if (!addrCols.includes("address_type")) {
    await dbExec("ALTER TABLE addresses ADD COLUMN address_type TEXT DEFAULT 'customer';");
  }
  if (!addrCols.includes("weekly_hours")) {
    await dbExec("ALTER TABLE addresses ADD COLUMN weekly_hours TEXT DEFAULT NULL;");
  }

  const settingsCols = await tableColumns("settings");
  if (!settingsCols.includes("navigator_pref")) {
    await dbExec("ALTER TABLE settings ADD COLUMN navigator_pref TEXT DEFAULT 'google';");
  }
  if (!settingsCols.includes("theme_pref")) {
    await dbExec("ALTER TABLE settings ADD COLUMN theme_pref TEXT DEFAULT 'auto';");
  }
  if (!settingsCols.includes("lunch_break_minutes")) {
    await dbExec("ALTER TABLE settings ADD COLUMN lunch_break_minutes INTEGER DEFAULT 45;");
  }
  if (!settingsCols.includes("lunch_break_enabled")) {
    await dbExec("ALTER TABLE settings ADD COLUMN lunch_break_enabled INTEGER DEFAULT 1;");
  }
}


function isAlreadyExistsError(err) {
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("duplicate column") || msg.includes("already exists") || msg.includes("column") && msg.includes("exist");
}

export async function migrateSettingsColumns() {
  const cols = ["default_start_label TEXT DEFAULT ''", "default_start_address TEXT DEFAULT ''", "rest_interval_min INTEGER DEFAULT 120", "rest_max_deviation_min INTEGER DEFAULT 40", "rest_duration_min INTEGER DEFAULT 15", "drive_markup_min_per_hour INTEGER DEFAULT 10"];
  for (const col of cols) {
    try { await dbExec(`ALTER TABLE settings ADD COLUMN ${col};`); } catch (err) { if (!isAlreadyExistsError(err)) console.warn("migrateSettingsColumns:", err.message); }
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
    try { await dbExec(`ALTER TABLE settings ADD COLUMN ${col};`); } catch (err) { if (!isAlreadyExistsError(err)) console.warn("migrateSettingsColumns:", err.message); }
  }
  const addrCols = await tableColumns("addresses");
  if (!addrCols.includes("place_id")) {
    await dbExec("ALTER TABLE addresses ADD COLUMN place_id TEXT DEFAULT NULL;");
  }
  if (!addrCols.includes("activity")) {
    await dbExec("ALTER TABLE addresses ADD COLUMN activity TEXT DEFAULT '';");
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
      try { await dbExec(`ALTER TABLE user_settings ADD COLUMN ${col} ${def};`); } catch (e) { if (!isAlreadyExistsError(e)) console.warn("migrateUserSettingsCols:", e.message); }
    }
  }
}

async function migrateUserNickname() {
  const cols = await tableColumns("users");
  if (!cols.includes("nickname")) {
    try { await dbExec("ALTER TABLE users ADD COLUMN nickname TEXT DEFAULT NULL;"); } catch (e) { if (!isAlreadyExistsError(e)) console.warn("migrateUserNickname:", e.message); }
  }
}

async function migrateAuth() {
  // try/catch su tutte le ALTER: due cold start serverless concorrenti possono
  // entrambi vedere la colonna assente e tentare l'ALTER — uno dei due fallirebbe
  // Add user_id to addresses
  const addrCols = await tableColumns("addresses");
  if (!addrCols.includes("user_id")) {
    try { await dbExec("ALTER TABLE addresses ADD COLUMN user_id INTEGER;"); } catch (e) { if (!isAlreadyExistsError(e)) console.warn(e.message); }
  }
  // Add user_id to planned_routes
  const routeCols = await tableColumns("planned_routes");
  if (!routeCols.includes("user_id")) {
    try { await dbExec("ALTER TABLE planned_routes ADD COLUMN user_id INTEGER;"); } catch (e) { if (!isAlreadyExistsError(e)) console.warn(e.message); }
  }
  if (!routeCols.includes("source")) {
    try { await dbExec("ALTER TABLE planned_routes ADD COLUMN source TEXT DEFAULT NULL;"); } catch (e) { if (!isAlreadyExistsError(e)) console.warn(e.message); }
  }
  if (!routeCols.includes("notes")) {
    try { await dbExec("ALTER TABLE planned_routes ADD COLUMN notes TEXT DEFAULT NULL;"); } catch (e) { if (!isAlreadyExistsError(e)) console.warn(e.message); }
  }
  await initSharedRoutesTable();
  await createIndexes();
}

// Indici sulle colonne usate da tutte le query filtrate per utente/scadenza.
// CREATE INDEX IF NOT EXISTS è supportato sia da SQLite che da PostgreSQL.
async function createIndexes() {
  const indexes = [
    "CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses (user_id);",
    "CREATE INDEX IF NOT EXISTS idx_routes_user ON planned_routes (user_id);",
    "CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);",
    "CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);",
    "CREATE INDEX IF NOT EXISTS idx_shared_routes_expires ON shared_routes (expires_at);"
  ];
  for (const sql of indexes) {
    try { await dbExec(sql); } catch (e) { console.warn("createIndexes:", e.message); }
  }
}

async function migrateWeeklyHours() {
  // One-shot: convert old open_morning/close_morning/open_afternoon/close_afternoon
  // into weekly_hours for addresses that don't have it yet.
  // Applies the same hours to Mon–Fri (1–5); Sat (6) and Sun (0) default to closed.
  const rows = await dbAll("SELECT id, open_morning, close_morning, open_afternoon, close_afternoon FROM addresses WHERE weekly_hours IS NULL;");
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
    await dbRun("UPDATE addresses SET weekly_hours = ? WHERE id = ?;", [JSON.stringify(wh), Number(row.id)]);
  }
}

export async function listAddresses(search = "", userId = null) {
  const term = String(search || "").trim().toLowerCase();
  const conds = [];
  const params = [];
  if (term) {
    if (dbMode === "postgres") {
      conds.push("lower(concat_ws(' ', customer, activity, location, full_address, notes)) LIKE ?");
    } else {
      // coalesce su tutto: un solo campo NULL annullerebbe l'intera concatenazione
      conds.push("lower(coalesce(customer,'') || ' ' || coalesce(activity,'') || ' ' || coalesce(location,'') || ' ' || coalesce(full_address,'') || ' ' || coalesce(notes,'')) LIKE ?");
    }
    params.push(`%${term}%`);
  }
  if (userId != null) {
    conds.push("user_id = ?");
    params.push(Number(userId));
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const orderBy = dbMode === "postgres"
    ? "ORDER BY lower(nullif(trim(coalesce(activity,'')), '')) NULLS LAST, lower(nullif(trim(coalesce(customer,'')), '')) NULLS LAST, lower(coalesce(location,'')), id ASC"
    : "ORDER BY nullif(trim(coalesce(activity,'')), '') COLLATE NOCASE, nullif(trim(coalesce(customer,'')), '') COLLATE NOCASE, location COLLATE NOCASE, id ASC";
  const rows = await dbAll(`SELECT * FROM addresses ${where} ${orderBy};`, params);
  return rows.map(rowToAddress);
}

export async function getAddress(id, userId = null) {
  const sql = `SELECT * FROM addresses WHERE id = ?${userId != null ? " AND user_id = ?" : ""};`;
  const params = userId != null ? [Number(id), Number(userId)] : [Number(id)];
  const rows = await dbAll(sql, params);
  return rows[0] ? rowToAddress(rows[0]) : null;
}

function addressValues(address) {
  return [
    address.customer || "Senza nome",
    address.activity || "",
    address.location || "",
    address.fullAddress || address.full_address || "",
    address.addressType || "customer",
    address.phone || "",
    address.phoneType || "cell",
    address.phoneName || "",
    address.phone2 || "",
    address.phone2Type || "fisso",
    address.phone2Name || "",
    address.phonePreferred || "phone",
    address.email || "",
    address.notes || "",
    address.openMorning || address.open_morning || "",
    address.closeMorning || address.close_morning || "",
    address.openAfternoon || address.open_afternoon || "",
    address.closeAfternoon || address.close_afternoon || "",
    Number(address.defaultDuration || address.default_duration || 45),
    address.weeklyHours ? JSON.stringify(address.weeklyHours) : null,
    address.lat === undefined ? null : Number(address.lat),
    address.lng === undefined ? null : Number(address.lng),
    address.placeId !== undefined ? address.placeId : (address.place_id ?? null)
  ];
}

const ADDRESS_COLS = "customer, activity, location, full_address, address_type, phone, phone_type, phone_name, phone2, phone2_type, phone2_name, phone_preferred, email, notes, open_morning, close_morning, open_afternoon, close_afternoon, default_duration, weekly_hours, lat, lng, place_id";

export async function createAddress(address, userId = null) {
  const placeholders = ADDRESS_COLS.split(",").map(() => "?").join(", ");
  const rows = await dbAll(
    `INSERT INTO addresses (${ADDRESS_COLS}, user_id) VALUES (${placeholders}, ?) RETURNING *;`,
    [...addressValues(address), userId != null ? Number(userId) : null]
  );
  return rows[0] ? rowToAddress(rows[0]) : null;
}

export async function updateAddress(id, address, userId = null) {
  const setClause = ADDRESS_COLS.split(",").map((col) => `${col.trim()} = ?`).join(", ");
  const userFilter = userId != null ? " AND user_id = ?" : "";
  const params = [...addressValues(address), Number(id)];
  if (userId != null) params.push(Number(userId));
  const nowFn = dbMode === "postgres" ? "NOW()" : "CURRENT_TIMESTAMP";
  const rows = await dbAll(
    `UPDATE addresses SET ${setClause}, updated_at = ${nowFn} WHERE id = ?${userFilter} RETURNING *;`,
    params
  );
  return rows[0] ? rowToAddress(rows[0]) : null;
}

export async function deleteAddress(id, userId = null) {
  const sql = `DELETE FROM addresses WHERE id = ?${userId != null ? " AND user_id = ?" : ""};`;
  const params = userId != null ? [Number(id), Number(userId)] : [Number(id)];
  await dbRun(sql, params);
  return { ok: true };
}

export async function getSettings(userId) {
  const rows = await dbAll("SELECT * FROM user_settings WHERE user_id = ?;", [Number(userId)]);
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
  // le chiavi sono costanti del codice — solo i valori sono parametrizzati
  const cols = Object.keys(vals).join(", ");
  const placeholders = Object.keys(vals).map(() => "?").join(", ");
  const params = [Number(userId), ...Object.values(vals)];
  if (dbMode === "postgres") {
    const updates = Object.keys(vals).map((k) => `${k} = EXCLUDED.${k}`).join(", ");
    await dbRun(`INSERT INTO user_settings (user_id, ${cols}) VALUES (?, ${placeholders}) ON CONFLICT (user_id) DO UPDATE SET ${updates};`, params);
  } else {
    await dbRun(`INSERT OR REPLACE INTO user_settings (user_id, ${cols}) VALUES (?, ${placeholders});`, params);
  }
  return getSettings(userId);
}

export async function saveRoute(route, userId = null, source = null) {
  const params = [
    route.name || "",
    route.scheduledDate || route.scheduled_date || "",
    route.startLabel || "",
    route.startAddress || "",
    route.endLabel || "",
    route.endAddress || "",
    route.startTime || "",
    route.firstArrivalRequired || "",
    Number(route.summary?.totalKm || 0),
    Number(route.summary?.totalDriveMinutes || 0),
    Number(route.summary?.totalWorkMinutes || 0),
    Number(route.summary?.totalCost || 0),
    route.weatherCapturedAt || "",
    JSON.stringify(route),
    userId != null ? Number(userId) : null,
    source || null,
    route.notes || null
  ];
  const rows = await dbAll(`
    INSERT INTO planned_routes (name, scheduled_date, start_label, start_address, end_label, end_address, start_time, first_arrival_required, total_km, total_drive_minutes, total_work_minutes, total_cost, weather_captured_at, payload_json, user_id, source, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id;
  `, params);
  return { id: rows[0]?.id };
}

export async function updateRouteNotes(id, notes, userId = null) {
  const sql = `UPDATE planned_routes SET notes = ? WHERE id = ?${userId != null ? " AND user_id = ?" : ""};`;
  const params = [notes || "", Number(id)];
  if (userId != null) params.push(Number(userId));
  await dbRun(sql, params);
}

export async function countRoutesByDate(date, userId = null) {
  const sql = `SELECT COUNT(*) as n FROM planned_routes WHERE scheduled_date = ?${userId != null ? " AND user_id = ?" : ""};`;
  const params = userId != null ? [date, Number(userId)] : [date];
  const rows = await dbAll(sql, params);
  return Number(rows[0]?.n ?? rows[0]?.count ?? 0);
}

export async function listRoutes(userId = null) {
  const userFilter = userId != null ? "WHERE user_id = ?" : "";
  const params = userId != null ? [Number(userId)] : [];
  const orderBy = dbMode === "postgres"
    ? "ORDER BY COALESCE(NULLIF(scheduled_date, ''), created_at::date::text) DESC, id DESC"
    : "ORDER BY COALESCE(NULLIF(scheduled_date, ''), created_at) DESC, id DESC";
  const rows = await dbAll(`SELECT * FROM planned_routes ${userFilter} ${orderBy};`, params);
  return rows.map(rowToRouteSummary);
}

export async function getRoute(id, userId = null) {
  const sql = `SELECT * FROM planned_routes WHERE id = ?${userId != null ? " AND user_id = ?" : ""};`;
  const params = userId != null ? [Number(id), Number(userId)] : [Number(id)];
  const rows = await dbAll(sql, params);
  return rows[0] ? rowToRoute(rows[0]) : null;
}

export async function updateRoutePayload(id, route, userId = null) {
  const params = [
    route.scheduledDate || "",
    Number(route.summary?.totalKm || 0),
    Number(route.summary?.totalDriveMinutes || 0),
    Number(route.summary?.totalWorkMinutes || 0),
    Number(route.summary?.totalCost || 0),
    route.weatherCapturedAt || "",
    JSON.stringify(route),
    Number(id)
  ];
  let sql = `UPDATE planned_routes SET scheduled_date = ?, total_km = ?, total_drive_minutes = ?, total_work_minutes = ?, total_cost = ?, weather_captured_at = ?, payload_json = ? WHERE id = ?`;
  if (userId != null) {
    sql += " AND user_id = ?";
    params.push(Number(userId));
  }
  await dbRun(`${sql};`, params);
  return getRoute(id, userId);
}

export async function routeNameExists(name, userId, excludeId = null) {
  let sql = "SELECT COUNT(*) as n FROM planned_routes WHERE name = ?";
  const params = [String(name).trim()];
  if (userId != null) {
    sql += " AND user_id = ?";
    params.push(Number(userId));
  }
  if (excludeId != null) {
    sql += " AND id != ?";
    params.push(Number(excludeId));
  }
  const rows = await dbAll(`${sql};`, params);
  return Number(rows[0]?.n ?? rows[0]?.count ?? 0) > 0;
}

export async function renameRoute(id, name, userId = null) {
  const nextName = String(name || "").trim() || "Giro salvato";
  const stored = await getRoute(id, userId);
  if (!stored) return null;
  const payload = { ...(stored.payload || {}), name: nextName };

  let sql = "UPDATE planned_routes SET name = ?, payload_json = ? WHERE id = ?";
  const params = [nextName, JSON.stringify(payload), Number(id)];
  if (userId != null) {
    sql += " AND user_id = ?";
    params.push(Number(userId));
  }
  await dbRun(`${sql};`, params);
  return getRoute(id, userId);
}

export async function deleteRoute(id, userId = null) {
  const sql = `DELETE FROM planned_routes WHERE id = ?${userId != null ? " AND user_id = ?" : ""};`;
  const params = userId != null ? [Number(id), Number(userId)] : [Number(id)];
  await dbRun(sql, params);
  return { ok: true };
}

// ── auth DB functions ─────────────────────────────────────────────────────────

export async function createUser(username, passwordHash) {
  const rows = await dbAll("INSERT INTO users (username, password_hash) VALUES (?, ?) RETURNING id, username;", [username, passwordHash]);
  return rows[0] ? { id: rows[0].id, username: rows[0].username } : null;
}

export async function findUserByUsername(username) {
  const rows = await dbAll("SELECT * FROM users WHERE lower(username) = lower(?);", [username]);
  return rows[0] || null;
}

export async function findUserById(id) {
  const rows = await dbAll("SELECT id, username FROM users WHERE id = ?;", [Number(id)]);
  return rows[0] || null;
}

export async function updateUserPassword(userId, newHash) {
  await dbRun("UPDATE users SET password_hash = ? WHERE id = ?;", [newHash, Number(userId)]);
}

export async function updateUserNickname(userId, nickname) {
  await dbRun("UPDATE users SET nickname = ? WHERE id = ?;", [nickname || null, Number(userId)]);
}

export async function getUserById(id) {
  const rows = await dbAll("SELECT id, username, nickname FROM users WHERE id = ?;", [Number(id)]);
  return rows[0] || null;
}

export async function createSession(token, userId) {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await dbRun("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?);", [token, Number(userId), expiresAt]);
}

export async function getSession(token) {
  if (!token) return null;
  const rows = await dbAll("SELECT user_id, expires_at FROM sessions WHERE token = ?;", [token]);
  if (!rows[0]) return null;
  if (new Date(rows[0].expires_at) < new Date()) {
    await dbRun("DELETE FROM sessions WHERE token = ?;", [token]);
    return null;
  }
  return Number(rows[0].user_id);
}

export async function extendSession(token) {
  if (!token) return;
  const newExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await dbRun("UPDATE sessions SET expires_at = ? WHERE token = ?;", [newExpiry, token]);
}

export async function deleteSession(token) {
  if (!token) return;
  await dbRun("DELETE FROM sessions WHERE token = ?;", [token]);
}

export async function purgeExpiredSessions() {
  await dbRun("DELETE FROM sessions WHERE expires_at < ?;", [new Date().toISOString()]);
}

// ── Shared routes ─────────────────────────────────────────────────────────────

export async function initSharedRoutesTable() {
  if (dbMode === "postgres") {
    await dbExec(`
      CREATE TABLE IF NOT EXISTS shared_routes (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        route_json TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  } else {
    await dbExec(`
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

export async function createSharedRoute(token, userId, routeJson) {
  const expiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
  await dbRun("INSERT INTO shared_routes (token, user_id, route_json, expires_at) VALUES (?, ?, ?, ?);", [token, Number(userId), routeJson, expiresAt]);
  return { token, expiresAt };
}

export async function getSharedRoute(token) {
  if (!token) return null;
  const rows = await dbAll("SELECT * FROM shared_routes WHERE token = ?;", [token]);
  if (!rows[0]) return null;
  if (new Date(rows[0].expires_at) < new Date()) {
    await dbRun("DELETE FROM shared_routes WHERE token = ?;", [token]);
    return null;
  }
  try { return JSON.parse(rows[0].route_json); } catch { return null; }
}

export async function purgeExpiredSharedRoutes() {
  await dbRun("DELETE FROM shared_routes WHERE expires_at < ?;", [new Date().toISOString()]);
}

export async function hasAnyUser() {
  const rows = await dbAll("SELECT COUNT(*) AS count FROM users;");
  return Number(rows[0]?.count ?? 0) > 0;
}

export async function adminListUsers() {
  // expires_at è salvato come ISO con T/Z (toISOString); CURRENT_TIMESTAMP di
  // SQLite è "YYYY-MM-DD HH:MM:SS" → confronto stringa errato. Usa ISO da JS.
  return dbAll(`
    SELECT u.id, u.username, u.created_at,
      (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?) AS active_sessions,
      (SELECT COUNT(*) FROM planned_routes r WHERE r.user_id = u.id) AS route_count,
      (SELECT COUNT(*) FROM addresses a WHERE a.user_id = u.id) AS address_count
    FROM users u ORDER BY u.created_at DESC;
  `, [new Date().toISOString()]);
}

export async function adminListSessions() {
  return dbAll(`
    SELECT s.token, s.user_id, s.created_at, s.expires_at, u.username
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.expires_at > ?
    ORDER BY s.created_at DESC;
  `, [new Date().toISOString()]);
}

export async function adminDeleteUserSessions(userId) {
  await dbRun("DELETE FROM sessions WHERE user_id = ?;", [Number(userId)]);
}

export async function adminDeleteUser(userId) {
  await dbRun("DELETE FROM sessions WHERE user_id = ?;", [Number(userId)]);
  await dbRun("DELETE FROM planned_routes WHERE user_id = ?;", [Number(userId)]);
  await dbRun("DELETE FROM addresses WHERE user_id = ?;", [Number(userId)]);
  await dbRun("DELETE FROM user_settings WHERE user_id = ?;", [Number(userId)]);
  await dbRun("DELETE FROM users WHERE id = ?;", [Number(userId)]);
}

export async function adminGetStats() {
  const [users] = await dbAll("SELECT COUNT(*) AS c FROM users;");
  const [routes] = await dbAll("SELECT COUNT(*) AS c FROM planned_routes;");
  const [addresses] = await dbAll("SELECT COUNT(*) AS c FROM addresses;");
  const [sessions] = await dbAll("SELECT COUNT(*) AS c FROM sessions WHERE expires_at > ?;", [new Date().toISOString()]);
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
  await dbRun("UPDATE addresses SET user_id = ? WHERE user_id IS NULL;", [Number(userId)]);
  await dbRun("UPDATE planned_routes SET user_id = ? WHERE user_id IS NULL;", [Number(userId)]);
  // Migrate old settings to user_settings if not yet done
  const existing = await dbAll("SELECT user_id FROM user_settings WHERE user_id = ?;", [Number(userId)]);
  if (!existing.length) {
    const oldRows = await dbAll("SELECT * FROM settings WHERE id = 1;");
    const s = oldRows[0] || {};
    const cols = "user_id, km_rate, drive_hour_rate, work_hour_rate, navigator_pref, theme_pref, lunch_break_minutes, lunch_break_enabled, default_start_label, default_start_address, rest_interval_min, rest_max_deviation_min, rest_duration_min, drive_markup_min_per_hour, earliest_break_time, max_detour_km, max_return_time";
    const params = [
      Number(userId),
      s.km_rate ?? 0.65,
      s.drive_hour_rate ?? 22,
      s.work_hour_rate ?? 60,
      s.navigator_pref ?? "google",
      s.theme_pref ?? "auto",
      s.lunch_break_minutes ?? 45,
      s.lunch_break_enabled ?? 1,
      s.default_start_label ?? "",
      s.default_start_address ?? "",
      s.rest_interval_min ?? 120,
      s.rest_max_deviation_min ?? 40,
      s.rest_duration_min ?? 15,
      s.drive_markup_min_per_hour ?? 10,
      s.earliest_break_time ?? "08:00",
      s.max_detour_km ?? 1.7,
      s.max_return_time ?? ""
    ];
    const placeholders = params.map(() => "?").join(", ");
    if (dbMode === "postgres") {
      await dbRun(`INSERT INTO user_settings (${cols}) VALUES (${placeholders}) ON CONFLICT (user_id) DO NOTHING;`, params);
    } else {
      await dbRun(`INSERT OR IGNORE INTO user_settings (${cols}) VALUES (${placeholders});`, params);
    }
  }
}
