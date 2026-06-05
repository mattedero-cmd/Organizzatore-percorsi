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

function sqlValue(value) {
  if (value === null || value === undefined || value === "") return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function safeJsonInline(value, fallback = null) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function rowToAddress(row) {
  return {
    id: row.id,
    customer: row.customer ?? "",
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
    weeklyHours: safeJsonInline(row.weekly_hours, null),
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
    workHourRate: Number(row.work_hour_rate ?? 60),
    navigatorPref: row.navigator_pref ?? "google",
    themePref: row.theme_pref ?? "auto",
    lunchBreakMinutes: Number(row.lunch_break_minutes ?? 45),
    lunchBreakEnabled: row.lunch_break_enabled === undefined || row.lunch_break_enabled === null ? true : Boolean(Number(row.lunch_break_enabled)),
    defaultStartLabel: row.default_start_label ?? "",
    defaultStartAddress: row.default_start_address ?? "",
    restIntervalMin: Number(row.rest_interval_min ?? 120),
    restMaxDeviationMin: Number(row.rest_max_deviation_min ?? 40),
    restDurationMin: Number(row.rest_duration_min ?? 15),
    driveMarkupMinPerHour: Number(row.drive_markup_min_per_hour ?? 10)
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
    plannedStops: (payload.plannedStops || payload.rows || []).filter(s => !s.type).map(s => ({ customer: s.customer || "", location: s.location || "", addressId: s.addressId, stopUid: s.uid || s.stopUid, stopPart: s.stopPart }))
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
  await migrateWeeklyHours();
  await migrateIntesaFriday();
  await migrateSettingsColumns();

  const count = await runSql("SELECT COUNT(*) AS count FROM addresses;", true);
  if (Number(count[0]?.count ?? 0) === 0) {
    await createAddress({ customer: "Mediolanum", location: "Riva del Garda", fullAddress: "Viale Rovereto 44, 38066 Riva del Garda TN", notes: "Esempio modificabile", openMorning: "08:30", closeMorning: "12:30", openAfternoon: "14:30", closeAfternoon: "18:00", defaultDuration: 60, lat: 45.889, lng: 10.843 });
    await createAddress({ customer: "Intesa Sanpaolo", location: "Trento", fullAddress: "Via Mantova 19, 38122 Trento TN", notes: "Esempio modificabile", openMorning: "08:20", closeMorning: "13:20", openAfternoon: "14:30", closeAfternoon: "16:30", defaultDuration: 45, lat: 46.067, lng: 11.122 });
    await createAddress({ customer: "Fineco", location: "Rovereto", fullAddress: "Corso Rosmini 58, 38068 Rovereto TN", notes: "Esempio modificabile", openMorning: "08:30", closeMorning: "12:30", openAfternoon: "14:00", closeAfternoon: "17:30", defaultDuration: 90, lat: 45.890, lng: 11.040 });
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
  await migrateWeeklyHours();
  await migrateIntesaFriday();
  await migrateSettingsColumns();

  const count = await runSql("SELECT COUNT(*) AS count FROM addresses;", true);
  if (Number(count[0]?.count ?? 0) === 0) {
    await createAddress({ customer: "Mediolanum", location: "Riva del Garda", fullAddress: "Viale Rovereto 44, 38066 Riva del Garda TN", notes: "Esempio modificabile", openMorning: "08:30", closeMorning: "12:30", openAfternoon: "14:30", closeAfternoon: "18:00", defaultDuration: 60, lat: 45.889, lng: 10.843 });
    await createAddress({ customer: "Intesa Sanpaolo", location: "Trento", fullAddress: "Via Mantova 19, 38122 Trento TN", notes: "Esempio modificabile", openMorning: "08:20", closeMorning: "13:20", openAfternoon: "14:30", closeAfternoon: "16:30", defaultDuration: 45, lat: 46.067, lng: 11.122 });
    await createAddress({ customer: "Fineco", location: "Rovereto", fullAddress: "Corso Rosmini 58, 38068 Rovereto TN", notes: "Esempio modificabile", openMorning: "08:30", closeMorning: "12:30", openAfternoon: "14:00", closeAfternoon: "17:30", defaultDuration: 90, lat: 45.890, lng: 11.040 });
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

async function migrateIntesaFriday() {
  // Intesa San Paolo: venerdì (day=5) chiude alle 16:25 invece dell'orario standard
  const rows = await runSql("SELECT id, weekly_hours FROM addresses WHERE lower(customer) LIKE '%intesa%' AND weekly_hours IS NOT NULL;", true);
  for (const row of rows) {
    let wh;
    try { wh = JSON.parse(row.weekly_hours); } catch { continue; }
    const fri = wh[5] || wh["5"];
    if (!fri || fri.closed) continue;
    // Only patch if Friday closeAfternoon is not already 16:25
    if (fri.closeAfternoon === "16:25") continue;
    fri.closeAfternoon = "16:25";
    if (fri.closeMorning && !fri.continuous) {} // leave morning unchanged
    wh[5] = fri; wh["5"] = fri;
    await runSql(`UPDATE addresses SET weekly_hours = ${sqlValue(JSON.stringify(wh))} WHERE id = ${sqlValue(Number(row.id))};`);
  }
}

export async function migrateSettingsColumns() {
  const cols = ["default_start_label TEXT DEFAULT ''", "default_start_address TEXT DEFAULT ''", "rest_interval_min INTEGER DEFAULT 120", "rest_max_deviation_min INTEGER DEFAULT 40", "rest_duration_min INTEGER DEFAULT 15", "drive_markup_min_per_hour INTEGER DEFAULT 10"];
  for (const col of cols) {
    const name = col.split(" ")[0];
    try { await runSql(`ALTER TABLE settings ADD COLUMN ${col};`); } catch {}
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

export async function listAddresses(search = "") {
  const term = String(search || "").trim().toLowerCase();
  if (dbMode === "postgres") {
    const where = term ? `WHERE lower(concat_ws(' ', customer, location, full_address, notes)) LIKE ${sqlValue(`%${term}%`)}` : "";
    const rows = await runSql(`SELECT * FROM addresses ${where} ORDER BY lower(customer), lower(location);`, true);
    return rows.map(rowToAddress);
  }
  const where = term ? `WHERE lower(customer || ' ' || location || ' ' || full_address || ' ' || notes) LIKE ${sqlValue(`%${term}%`)}` : "";
  const rows = await runSql(`SELECT * FROM addresses ${where} ORDER BY customer COLLATE NOCASE, location COLLATE NOCASE;`, true);
  return rows.map(rowToAddress);
}

export async function getAddress(id) {
  const rows = await runSql(`SELECT * FROM addresses WHERE id = ${sqlValue(Number(id))};`, true);
  return rows[0] ? rowToAddress(rows[0]) : null;
}

export async function createAddress(address) {
  const cols = `customer, location, full_address, address_type, phone, phone_type, phone_name, phone2, phone2_type, phone2_name, phone_preferred, email, notes, open_morning, close_morning, open_afternoon, close_afternoon, default_duration, weekly_hours, lat, lng`;
  const vals = `${sqlValue(address.customer || "Senza nome")}, ${sqlValue(address.location || "")}, ${sqlValue(address.fullAddress || address.full_address || "")}, ${sqlValue(address.addressType || "customer")}, ${sqlValue(address.phone || "")}, ${sqlValue(address.phoneType || "cell")}, ${sqlValue(address.phoneName || "")}, ${sqlValue(address.phone2 || "")}, ${sqlValue(address.phone2Type || "fisso")}, ${sqlValue(address.phone2Name || "")}, ${sqlValue(address.phonePreferred || "phone")}, ${sqlValue(address.email || "")}, ${sqlValue(address.notes || "")}, ${sqlValue(address.openMorning || address.open_morning || "")}, ${sqlValue(address.closeMorning || address.close_morning || "")}, ${sqlValue(address.openAfternoon || address.open_afternoon || "")}, ${sqlValue(address.closeAfternoon || address.close_afternoon || "")}, ${sqlValue(Number(address.defaultDuration || address.default_duration || 45))}, ${sqlValue(address.weeklyHours ? JSON.stringify(address.weeklyHours) : null)}, ${sqlValue(address.lat === undefined ? null : Number(address.lat))}, ${sqlValue(address.lng === undefined ? null : Number(address.lng))}`;
  if (dbMode === "postgres") {
    const rows = await runSql(`INSERT INTO addresses (${cols}) VALUES (${vals}) RETURNING *;`, true);
    return rowToAddress(rows[0]);
  }
  await runSql(`INSERT INTO addresses (${cols}) VALUES (${vals});`);
  const rows = await runSql("SELECT * FROM addresses ORDER BY id DESC LIMIT 1;", true);
  return rowToAddress(rows[0]);
}

export async function updateAddress(id, address) {
  const setClause = `customer = ${sqlValue(address.customer || "Senza nome")}, location = ${sqlValue(address.location || "")}, full_address = ${sqlValue(address.fullAddress || "")}, address_type = ${sqlValue(address.addressType || "customer")}, phone = ${sqlValue(address.phone || "")}, phone_type = ${sqlValue(address.phoneType || "cell")}, phone_name = ${sqlValue(address.phoneName || "")}, phone2 = ${sqlValue(address.phone2 || "")}, phone2_type = ${sqlValue(address.phone2Type || "fisso")}, phone2_name = ${sqlValue(address.phone2Name || "")}, phone_preferred = ${sqlValue(address.phonePreferred || "phone")}, email = ${sqlValue(address.email || "")}, notes = ${sqlValue(address.notes || "")}, open_morning = ${sqlValue(address.openMorning || "")}, close_morning = ${sqlValue(address.closeMorning || "")}, open_afternoon = ${sqlValue(address.openAfternoon || "")}, close_afternoon = ${sqlValue(address.closeAfternoon || "")}, default_duration = ${sqlValue(Number(address.defaultDuration || 45))}, weekly_hours = ${sqlValue(address.weeklyHours ? JSON.stringify(address.weeklyHours) : null)}, lat = ${sqlValue(address.lat === undefined ? null : Number(address.lat))}, lng = ${sqlValue(address.lng === undefined ? null : Number(address.lng))}`;
  if (dbMode === "postgres") {
    const rows = await runSql(`UPDATE addresses SET ${setClause}, updated_at = NOW() WHERE id = ${sqlValue(Number(id))} RETURNING *;`, true);
    return rows[0] ? rowToAddress(rows[0]) : null;
  }
  await runSql(`UPDATE addresses SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ${sqlValue(Number(id))};`);
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
  const navPref = sqlValue(settings.navigatorPref || "google");
  const themePref = sqlValue(settings.themePref || "auto");
  const lunchMinutes = sqlValue(Number(settings.lunchBreakMinutes ?? 45));
  const lunchEnabled = sqlValue(settings.lunchBreakEnabled === false ? 0 : 1);
  const dsl = sqlValue(settings.defaultStartLabel || "");
  const dsa = sqlValue(settings.defaultStartAddress || "");
  const rim = sqlValue(Number(settings.restIntervalMin ?? 120));
  const rdm = sqlValue(Number(settings.restMaxDeviationMin ?? 40));
  const rdu = sqlValue(Number(settings.restDurationMin ?? 15));
  const drm = sqlValue(Number(settings.driveMarkupMinPerHour ?? 10));
  const km = sqlValue(Number(settings.kmRate ?? 0.65));
  const dhr = sqlValue(Number(settings.driveHourRate ?? 22));
  const whr = sqlValue(Number(settings.workHourRate ?? 60));
  if (dbMode === "postgres") {
    await runSql(`
      INSERT INTO settings (id, km_rate, drive_hour_rate, work_hour_rate, navigator_pref, theme_pref, lunch_break_minutes, lunch_break_enabled, default_start_label, default_start_address, rest_interval_min, rest_max_deviation_min, rest_duration_min, drive_markup_min_per_hour)
      VALUES (1, ${km}, ${dhr}, ${whr}, ${navPref}, ${themePref}, ${lunchMinutes}, ${lunchEnabled}, ${dsl}, ${dsa}, ${rim}, ${rdm}, ${rdu}, ${drm})
      ON CONFLICT (id) DO UPDATE SET km_rate=EXCLUDED.km_rate, drive_hour_rate=EXCLUDED.drive_hour_rate, work_hour_rate=EXCLUDED.work_hour_rate, navigator_pref=EXCLUDED.navigator_pref, theme_pref=EXCLUDED.theme_pref, lunch_break_minutes=EXCLUDED.lunch_break_minutes, lunch_break_enabled=EXCLUDED.lunch_break_enabled, default_start_label=EXCLUDED.default_start_label, default_start_address=EXCLUDED.default_start_address, rest_interval_min=EXCLUDED.rest_interval_min, rest_max_deviation_min=EXCLUDED.rest_max_deviation_min, rest_duration_min=EXCLUDED.rest_duration_min, drive_markup_min_per_hour=EXCLUDED.drive_markup_min_per_hour;
    `);
    return getSettings();
  }
  await runSql(`UPDATE settings SET km_rate=${km}, drive_hour_rate=${dhr}, work_hour_rate=${whr}, navigator_pref=${navPref}, theme_pref=${themePref}, lunch_break_minutes=${lunchMinutes}, lunch_break_enabled=${lunchEnabled}, default_start_label=${dsl}, default_start_address=${dsa}, rest_interval_min=${rim}, rest_max_deviation_min=${rdm}, rest_duration_min=${rdu}, drive_markup_min_per_hour=${drm} WHERE id = 1;`);
  return getSettings();
}

export async function saveRoute(route) {
  if (dbMode === "postgres") {
    const rows = await runSql(`
      INSERT INTO planned_routes (name, scheduled_date, start_label, start_address, end_label, end_address, start_time, first_arrival_required, total_km, total_drive_minutes, total_work_minutes, total_cost, weather_captured_at, payload_json)
      VALUES (${sqlValue(route.name || "")}, ${sqlValue(route.scheduledDate || route.scheduled_date || "")}, ${sqlValue(route.startLabel || "")}, ${sqlValue(route.startAddress || "")}, ${sqlValue(route.endLabel || "")}, ${sqlValue(route.endAddress || "")}, ${sqlValue(route.startTime || "")}, ${sqlValue(route.firstArrivalRequired || "")}, ${sqlValue(Number(route.summary?.totalKm || 0))}, ${sqlValue(Number(route.summary?.totalDriveMinutes || 0))}, ${sqlValue(Number(route.summary?.totalWorkMinutes || 0))}, ${sqlValue(Number(route.summary?.totalCost || 0))}, ${sqlValue(route.weatherCapturedAt || "")}, ${sqlValue(JSON.stringify(route))})
      RETURNING id;
    `, true);
    return { id: rows[0]?.id };
  }
  await runSql(`
    INSERT INTO planned_routes (name, scheduled_date, start_label, start_address, end_label, end_address, start_time, first_arrival_required, total_km, total_drive_minutes, total_work_minutes, total_cost, weather_captured_at, payload_json)
    VALUES (${sqlValue(route.name || "")}, ${sqlValue(route.scheduledDate || route.scheduled_date || "")}, ${sqlValue(route.startLabel || "")}, ${sqlValue(route.startAddress || "")}, ${sqlValue(route.endLabel || "")}, ${sqlValue(route.endAddress || "")}, ${sqlValue(route.startTime || "")}, ${sqlValue(route.firstArrivalRequired || "")}, ${sqlValue(Number(route.summary?.totalKm || 0))}, ${sqlValue(Number(route.summary?.totalDriveMinutes || 0))}, ${sqlValue(Number(route.summary?.totalWorkMinutes || 0))}, ${sqlValue(Number(route.summary?.totalCost || 0))}, ${sqlValue(route.weatherCapturedAt || "")}, ${sqlValue(JSON.stringify(route))});
  `);
  const rows = await runSql("SELECT id FROM planned_routes ORDER BY id DESC LIMIT 1;", true);
  return { id: rows[0]?.id };
}

export async function listRoutes() {
  if (dbMode === "postgres") {
    const rows = await runSql(`SELECT * FROM planned_routes ORDER BY COALESCE(NULLIF(scheduled_date, ''), created_at::date::text) DESC, id DESC;`, true);
    return rows.map(rowToRouteSummary);
  }
  const rows = await runSql(`SELECT * FROM planned_routes ORDER BY COALESCE(NULLIF(scheduled_date, ''), created_at) DESC, id DESC;`, true);
  return rows.map(rowToRouteSummary);
}

export async function getRoute(id) {
  const rows = await runSql(`SELECT * FROM planned_routes WHERE id = ${sqlValue(Number(id))};`, true);
  return rows[0] ? rowToRoute(rows[0]) : null;
}

export async function updateRoutePayload(id, route) {
  await runSql(`
    UPDATE planned_routes SET scheduled_date = ${sqlValue(route.scheduledDate || "")}, total_km = ${sqlValue(Number(route.summary?.totalKm || 0))}, total_drive_minutes = ${sqlValue(Number(route.summary?.totalDriveMinutes || 0))}, total_work_minutes = ${sqlValue(Number(route.summary?.totalWorkMinutes || 0))}, total_cost = ${sqlValue(Number(route.summary?.totalCost || 0))}, weather_captured_at = ${sqlValue(route.weatherCapturedAt || "")}, payload_json = ${sqlValue(JSON.stringify(route))}
    WHERE id = ${sqlValue(Number(id))};
  `);
  return getRoute(id);
}

export async function renameRoute(id, name) {
  const nextName = String(name || "").trim() || "Giro salvato";
  const stored = await getRoute(id);
  if (!stored) return null;
  const payload = { ...(stored.payload || {}), name: nextName };

  await runSql(`
    UPDATE planned_routes SET name = ${sqlValue(nextName)}, payload_json = ${sqlValue(JSON.stringify(payload))}
    WHERE id = ${sqlValue(Number(id))};
  `);
  return getRoute(id);
}

export async function deleteRoute(id) {
  await runSql(`DELETE FROM planned_routes WHERE id = ${sqlValue(Number(id))};`);
  return { ok: true };
}
