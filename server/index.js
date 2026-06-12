import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  initDb,
  listAddresses,
  getAddress,
  createAddress,
  updateAddress,
  deleteAddress,
  getSettings,
  updateSettings,
  saveRoute,
  listRoutes,
  getRoute,
  updateRoutePayload,
  updateRouteNotes,
  renameRoute,
  routeNameExists,
  deleteRoute,
  createUser,
  findUserByUsername,
  findUserById,
  getUserById,
  updateUserPassword,
  updateUserNickname,
  createSession,
  getSession,
  extendSession,
  deleteSession,
  countRoutesByDate,
  hasAnyUser,
  assignOrphanedData,
  purgeExpiredSessions,
  purgeExpiredSharedRoutes,
  createSharedRoute,
  getSharedRoute,
  adminListUsers,
  adminListSessions,
  adminDeleteUserSessions,
  adminDeleteUser,
  adminGetStats,
  getDbMode
} from "./db.js";
import { hashPassword, verifyPassword, generateToken } from "./auth.js";
import { loadEnv } from "./env.js";
import { isOpenAtTime } from "./googleMapsService.js";
import { planRoute } from "./planner.js";
import { routeShape } from "./googleMapsService.js";
import { parseVoiceCommand } from "./voiceParser.js";
import { attachWeather, shouldRefreshWeather } from "./weatherService.js";
import { trackCall, initApiStatsTable, getApiStats, getApiStatsDetail } from "./apiStats.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");

loadEnv(rootDir);
await initDb(rootDir);
await initApiStatsTable();

const PORT = Number(process.env.PORT || 5174);

// Pulizia sessioni e link condivisione scaduti ogni 6 ore
setInterval(() => {
  purgeExpiredSessions().catch(console.error);
  purgeExpiredSharedRoutes().catch(console.error);
}, 6 * 60 * 60 * 1000).unref();
const HOST = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

// ── Login rate limiting (in-memory, per IP) ───────────────────────────────────
const loginAttempts = new Map(); // ip → { count, resetAt }
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 min

// IP reale per il rate limiting.
// Gli header X-Forwarded-For / X-Real-IP sono fidati SOLO dietro un proxy
// fidato (Vercel li riscrive). Se l'app fosse esposta direttamente, un
// attaccante potrebbe spoofarli e bypassare il rate limit → brute-force.
// TRUST_PROXY=false disabilita la fiducia negli header (usa solo il socket).
const TRUST_PROXY = process.env.TRUST_PROXY !== "false"; // default true (deploy Vercel)
function clientIp(request) {
  if (TRUST_PROXY) {
    // x-real-ip è impostato dal proxy ed è meno manipolabile della prima
    // entry di x-forwarded-for (che il client può pre-popolare)
    if (request.headers["x-real-ip"]) return request.headers["x-real-ip"];
    const xff = request.headers["x-forwarded-for"];
    if (xff) return xff.split(",")[0].trim();
  }
  return request.socket.remoteAddress || "unknown";
}

// Difesa CSRF: le richieste mutanti devono provenire dalla stessa origin.
// Con cookie SameSite=Lax il rischio è già basso; questo chiude la finestra
// residua rifiutando POST/PUT/DELETE/PATCH con Origin cross-site.
function isSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true; // alcune richieste same-origin non inviano Origin
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

// Username: lettere/numeri unicode, spazio e . _ @ - (3-30 char).
// Esclude apici, < > " ; ( ) ecc. → previene XSS quando l'username viene
// mostrato nel pannello admin (difesa in profondità) e input malevoli.
const USERNAME_RE = /^[\p{L}\p{N}._@\- ]{3,30}$/u;
function validUsername(name) {
  return typeof name === "string" && USERNAME_RE.test(name.trim());
}

function checkLoginRateLimit(key, max = LOGIN_MAX_ATTEMPTS) {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }
  entry.count++;
  if (entry.count > max) return false;
  return true;
}

function resetLoginRateLimit(ip) {
  loginAttempts.delete(ip);
}

// Periodically clean up stale entries (every 30 min)
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts) {
    if (now > entry.resetAt) loginAttempts.delete(ip);
  }
}, 30 * 60 * 1000).unref();

// ── Admin authentication (stateless HMAC token — serverless-safe) ────────────
import { createHmac, timingSafeEqual } from "node:crypto";

const adminAttempts = new Map();
const ADMIN_MAX_ATTEMPTS = 3;
const ADMIN_LOCK_MS = 30 * 60 * 1000;
const ADMIN_SESSION_MS = 2 * 60 * 60 * 1000; // 2 ore

function checkAdminRateLimit(ip) {
  const now = Date.now();
  const entry = adminAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    adminAttempts.set(ip, { count: 1, resetAt: now + ADMIN_LOCK_MS });
    return true;
  }
  entry.count++;
  return entry.count <= ADMIN_MAX_ATTEMPTS;
}

function generateAdminToken() {
  const secret = process.env.ADMIN_SECRET || "";
  const expiresAt = Date.now() + ADMIN_SESSION_MS;
  const payload = String(expiresAt);
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function authenticateAdmin(request) {
  const token = request.headers["x-admin-token"] || "";
  if (!token) return false;
  const secret = process.env.ADMIN_SECRET || "";
  const dot = token.lastIndexOf(".");
  if (dot < 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  try {
    if (!timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) return false;
  } catch { return false; }
  return Date.now() < Number(payload);
}

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(self), camera=(), microphone=(self)"
};

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS });
  response.end(JSON.stringify(payload));
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > 2_000_000) {
        request.destroy();
        reject(new Error("Payload troppo grande"));
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("JSON non valido"));
      }
    });
    request.on("error", reject);
  });
}

function parseCookies(header) {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';')
      .map(c => c.trim().split('='))
      .filter(p => p.length >= 2)
      .map(([k, ...v]) => [k.trim(), decodeURIComponent(v.join('=').trim())])
  );
}

function sessionCookie(token, remember = true) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const maxAge = remember ? "; Max-Age=2592000" : ""; // 30 days or session cookie
  return `session=${token}; HttpOnly; Path=/; SameSite=Lax${maxAge}${secure}`;
}

async function authenticate(request) {
  const cookies = parseCookies(request.headers.cookie);
  return getSession(cookies.session || "");
}

const _themeMap = {
  default: { dark: "night",         light: "day" },
  neon:    { dark: "nero",          light: "neon-giorno" },
  luxury:  { dark: "luxury-notte",  light: "luxury-giorno" },
  metallo: { dark: "metallo",       light: "metallo-giorno" },
  pietra:  { dark: "pietra",        light: "pietra-giorno" },
  foresta: { dark: "foresta-notte", light: "foresta-giorno" },
  legno:   { dark: "legno",         light: "legno-giorno" },
};

async function serveIndex(request, response, filePath) {
  let content;
  try { content = fs.readFileSync(filePath, "utf8"); } catch {
    response.writeHead(404, SECURITY_HEADERS); response.end("Not found"); return;
  }
  try {
    const cookies = parseCookies(request.headers.cookie);
    const userId = await getSession(cookies.session || "");
    if (userId) {
      const s = await getSettings(userId);
      const mode = s.themeMode || "auto";
      const palette = s.themePalette || "default";
      let variant = "dark";
      if (mode === "light") variant = "light";
      else if (mode === "dark") variant = "dark";
      else {
        // auto: read the OS preference cookie set by JS on previous visits
        variant = (cookies.pl_dark === "0") ? "light" : "dark";
      }
      const theme = (_themeMap[palette] || _themeMap.default)[variant];
      content = content.replace('data-theme="night"', `data-theme="${theme}"`);
    }
  } catch {}
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", ...SECURITY_HEADERS });
  response.end(content);
}

function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    response.writeHead(403, SECURITY_HEADERS);
    response.end("Forbidden");
    return;
  }

  if (safePath === "/index.html" || url.pathname === "/" || url.pathname.startsWith("/share/")) {
    serveIndex(request, response, path.join(publicDir, "index.html"));
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404, SECURITY_HEADERS);
      response.end("Not found");
      return;
    }
    const isSW = filePath.endsWith("service-worker.js");
    const hasVersion = url.searchParams.has("v");
    const cacheControl = isSW
      ? "no-store, no-cache, must-revalidate"
      : hasVersion
        ? "public, max-age=31536000, immutable"
        : "no-cache";
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": cacheControl,
      ...SECURITY_HEADERS
    });
    response.end(content);
  });
}

// Finestra di dedup per /api/plan: chiave → { at, promise }
const recentPlanRequests = new Map();

async function handleApi(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const method = request.method || "GET";

  try {
    // CSRF: blocca le richieste mutanti da origin diverse
    if ((method === "POST" || method === "PUT" || method === "DELETE" || method === "PATCH") && !isSameOrigin(request)) {
      return sendJson(response, 403, { error: "Origine non consentita" });
    }

    if (method === "GET" && url.pathname === "/api/health") {
      return sendJson(response, 200, {
        ok: true,
        mapApiConfigured: Boolean(process.env.GOOGLE_MAPS_API_KEY),
        whisperConfigured: Boolean(process.env.OPENAI_API_KEY)
      });
    }

    // ── Auth routes (no session required) ────────────────────────────────────
    if (url.pathname.startsWith("/api/auth/")) {
      if (method === "GET" && url.pathname === "/api/auth/me") {
        const cookies = parseCookies(request.headers.cookie);
        const token = cookies.session || "";
        const userId = await getSession(token);
        if (!userId) {
          const noUsers = !(await hasAnyUser());
          return sendJson(response, 401, { error: "Non autenticato", setup: noUsers });
        }
        const user = await getUserById(userId);
        if (!user) return sendJson(response, 401, { error: "Utente non trovato" });
        // Sliding session: rinnova i 30 giorni ad ogni accesso
        extendSession(token).catch(() => {});
        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Set-Cookie": sessionCookie(token),
          ...SECURITY_HEADERS
        });
        response.end(JSON.stringify({ id: user.id, username: user.username, nickname: user.nickname || null }));
        return;
      }

      if (method === "PUT" && url.pathname === "/api/auth/profile") {
        const userId = await authenticate(request);
        if (!userId) return sendJson(response, 401, { error: "Non autenticato" });
        const body = await parseBody(request);
        const nickname = (body.nickname || "").trim().slice(0, 40) || null;
        await updateUserNickname(userId, nickname);
        const user = await getUserById(userId);
        return sendJson(response, 200, { id: user.id, username: user.username, nickname: user.nickname || null });
      }

      if (method === "POST" && url.pathname === "/api/auth/setup") {
        if (await hasAnyUser()) return sendJson(response, 403, { error: "Setup già completato" });
        const body = await parseBody(request);
        const { username, password } = body;
        if (!username || !password || password.length < 6) return sendJson(response, 400, { error: "Username e password (min 6 caratteri) obbligatori" });
        if (!validUsername(username)) return sendJson(response, 400, { error: "Username non valido: 3-30 caratteri, solo lettere, numeri, spazio e . _ @ -" });
        const hash = await hashPassword(password);
        const user = await createUser(username.trim(), hash);
        if (!user) return sendJson(response, 500, { error: "Errore creazione utente" });
        await assignOrphanedData(user.id);
        const token = generateToken();
        await createSession(token, user.id);
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Set-Cookie": sessionCookie(token), ...SECURITY_HEADERS });
        response.end(JSON.stringify({ id: user.id, username: user.username }));
        return;
      }

      if (method === "POST" && url.pathname === "/api/auth/register") {
        const ip = clientIp(request);
        if (!checkLoginRateLimit(ip)) {
          return sendJson(response, 429, { error: "Troppi tentativi. Riprova tra 15 minuti." });
        }
        const body = await parseBody(request);
        const { username, password } = body;
        if (!username || !password || password.length < 6) return sendJson(response, 400, { error: "Username e password (min 6 caratteri) obbligatori" });
        if (!validUsername(username)) return sendJson(response, 400, { error: "Username non valido: 3-30 caratteri, solo lettere, numeri, spazio e . _ @ -" });
        const existing = await findUserByUsername(username.trim());
        if (existing) return sendJson(response, 409, { error: "Username già in uso" });
        const hash = await hashPassword(password);
        const user = await createUser(username.trim(), hash);
        if (!user) return sendJson(response, 500, { error: "Errore creazione utente" });
        const token = generateToken();
        await createSession(token, user.id);
        response.writeHead(201, { "Content-Type": "application/json; charset=utf-8", "Set-Cookie": sessionCookie(token), ...SECURITY_HEADERS });
        response.end(JSON.stringify({ id: user.id, username: user.username }));
        return;
      }

      if (method === "POST" && url.pathname === "/api/auth/login") {
        const ip = clientIp(request);
        if (!checkLoginRateLimit(ip)) {
          return sendJson(response, 429, { error: "Troppi tentativi. Riprova tra 15 minuti." });
        }
        const body = await parseBody(request);
        const { username, password, remember } = body;
        if (!username || !password) return sendJson(response, 400, { error: "Username e password obbligatori" });
        const user = await findUserByUsername(username.trim());
        if (!user || !(await verifyPassword(password, user.password_hash))) {
          return sendJson(response, 401, { error: "Credenziali non valide" });
        }
        resetLoginRateLimit(ip);
        const token = generateToken();
        await createSession(token, user.id);
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Set-Cookie": sessionCookie(token, remember !== false), ...SECURITY_HEADERS });
        response.end(JSON.stringify({ id: user.id, username: user.username }));
        return;
      }

      if (method === "POST" && url.pathname === "/api/auth/change-password") {
        const cookies = parseCookies(request.headers.cookie);
        const userId = await getSession(cookies.session || "");
        if (!userId) return sendJson(response, 401, { error: "Non autenticato" });
        // Anti brute-force della password attuale con cookie rubato
        if (!checkLoginRateLimit(`cp:${userId}`)) {
          return sendJson(response, 429, { error: "Troppi tentativi. Riprova tra 15 minuti." });
        }
        const body = await parseBody(request);
        const { currentPassword, newPassword } = body;
        if (!currentPassword || !newPassword || newPassword.length < 6) {
          return sendJson(response, 400, { error: "Password attuale e nuova password (min 6 caratteri) obbligatorie" });
        }
        const fullUser = await findUserByUsername((await findUserById(userId))?.username || "");
        if (!fullUser || !(await verifyPassword(currentPassword, fullUser.password_hash))) {
          return sendJson(response, 401, { error: "Password attuale non corretta" });
        }
        resetLoginRateLimit(`cp:${userId}`);
        const newHash = await hashPassword(newPassword);
        await updateUserPassword(userId, newHash);
        return sendJson(response, 200, { ok: true });
      }

      if (method === "POST" && url.pathname === "/api/auth/logout") {
        const cookies = parseCookies(request.headers.cookie);
        await deleteSession(cookies.session || "");
        const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Set-Cookie": `session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`, ...SECURITY_HEADERS });
        response.end(JSON.stringify({ ok: true }));
        return;
      }
    }

    // ── Admin routes ──────────────────────────────────────────────────────────
    if (url.pathname.startsWith("/api/admin")) {
      // Login admin — non richiede token
      if (method === "POST" && url.pathname === "/api/admin/login") {
        const ip = clientIp(request);
        if (!checkAdminRateLimit(ip)) {
          return sendJson(response, 429, { error: "Troppi tentativi. Riprova tra 30 minuti." });
        }
        const secret = (process.env.ADMIN_SECRET || "").trim();
        if (!secret) return sendJson(response, 503, { error: "Admin non configurato" });
        const body = await parseBody(request);
        // Guardia tipo (body senza secret → TypeError → 500) + confronto
        // timing-safe: HMAC di entrambi i valori per avere lunghezza uguale
        const provided = typeof body.secret === "string" ? body.secret.trim() : "";
        const providedMac = createHmac("sha256", "admin-login-cmp").update(provided).digest();
        const expectedMac = createHmac("sha256", "admin-login-cmp").update(secret).digest();
        if (!provided || !timingSafeEqual(providedMac, expectedMac)) {
          return sendJson(response, 401, { error: "Credenziali non valide" });
        }
        const token = generateAdminToken();
        return sendJson(response, 200, { token });
      }

      // Tutte le altre rotte admin richiedono il token
      if (!authenticateAdmin(request)) {
        return sendJson(response, 401, { error: "Non autenticato" });
      }

      if (method === "GET" && url.pathname === "/api/admin/stats") {
        const stats = await adminGetStats();
        // dbPath omesso di proposito: rivelerebbe il filesystem del server
        return sendJson(response, 200, {
          ...stats,
          dbMode: getDbMode()
        });
      }

      if (method === "GET" && url.pathname === "/api/admin/users") {
        const users = await adminListUsers();
        return sendJson(response, 200, users.map(u => ({
          id: Number(u.id),
          username: u.username,
          createdAt: u.created_at,
          activeSessions: Number(u.active_sessions || 0),
          routeCount: Number(u.route_count || 0),
          addressCount: Number(u.address_count || 0)
        })));
      }

      if (method === "GET" && url.pathname === "/api/admin/sessions") {
        const sessions = await adminListSessions();
        return sendJson(response, 200, sessions.map(s => ({
          token: s.token.slice(0, 8) + "…",
          userId: Number(s.user_id),
          username: s.username,
          createdAt: s.created_at,
          expiresAt: s.expires_at
        })));
      }

      const kickMatch = url.pathname.match(/^\/api\/admin\/users\/(\d+)\/kick$/);
      if (kickMatch && method === "POST") {
        await adminDeleteUserSessions(kickMatch[1]);
        return sendJson(response, 200, { ok: true });
      }

      const deleteMatch = url.pathname.match(/^\/api\/admin\/users\/(\d+)$/);
      if (deleteMatch && method === "DELETE") {
        await adminDeleteUser(deleteMatch[1]);
        return sendJson(response, 200, { ok: true });
      }

      if (method === "POST" && url.pathname === "/api/admin/purge-sessions") {
        await purgeExpiredSessions();
        return sendJson(response, 200, { ok: true });
      }

      if (method === "GET" && url.pathname === "/api/admin/api-stats") {
        const days = Number(url.searchParams.get("days") || 30);
        return sendJson(response, 200, await getApiStats(days));
      }

      if (method === "GET" && url.pathname === "/api/admin/api-stats/detail") {
        const service = url.searchParams.get("service") || "google_maps";
        const days = Number(url.searchParams.get("days") || 30);
        return sendJson(response, 200, await getApiStatsDetail(service, days));
      }

      return sendJson(response, 404, { error: "Rotta non trovata" });
    }

    // ── Share routes (GET public, no auth needed) ─────────────────────────────
    const shareMatch = url.pathname.match(/^\/api\/share\/([a-zA-Z0-9_-]+)$/);
    if (shareMatch && method === "GET") {
      // Endpoint pubblico: throttle per IP contro enumerazione dei token
      if (!checkLoginRateLimit(`share:${clientIp(request)}`, 30)) {
        return sendJson(response, 429, { error: "Troppe richieste. Riprova tra qualche minuto." });
      }
      const route = await getSharedRoute(shareMatch[1]);
      if (!route) return sendJson(response, 404, { error: "Link scaduto o non trovato" });
      return sendJson(response, 200, route);
    }

    // ── All routes below require authentication ───────────────────────────────
    const userId = await authenticate(request);
    if (!userId) {
      const noUsers = !(await hasAnyUser());
      return sendJson(response, 401, { error: "Non autenticato", setup: noUsers });
    }

    if (method === "GET" && url.pathname === "/api/config") {
      return sendJson(response, 200, {
        googleMapsKey: process.env.GOOGLE_MAPS_API_KEY || "",
        googleClientId: process.env.GOOGLE_CLIENT_ID || ""
      });
    }

    if (method === "GET" && url.pathname === "/api/addresses") {
      const addresses = await listAddresses(url.searchParams.get("search") || "", userId);
      return sendJson(response, 200, addresses);
    }

    if (method === "POST" && url.pathname === "/api/addresses") {
      const body = await parseBody(request);
      if (!body.fullAddress) return sendJson(response, 400, { error: "Indirizzo completo obbligatorio" });
      const address = await createAddress(body, userId);
      return sendJson(response, 201, address);
    }

    const addressMatch = url.pathname.match(/^\/api\/addresses\/(\d+)$/);
    if (addressMatch && method === "PUT") {
      const body = await parseBody(request);
      const address = await updateAddress(addressMatch[1], body, userId);
      return sendJson(response, 200, address);
    }

    if (addressMatch && method === "DELETE") {
      await deleteAddress(addressMatch[1], userId);
      return sendJson(response, 200, { ok: true });
    }

    const openingMatch = url.pathname.match(/^\/api\/addresses\/(\d+)\/opening$/);
    if (openingMatch && method === "GET") {
      const addr = await getAddress(openingMatch[1], userId);
      if (!addr) return sendJson(response, 404, { error: "Non trovato" });
      // chiamata lato server → usa la chiave server (ristretta), non quella browser
      const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY || process.env.GOOGLE_MAPS_API_KEY || "";
      if (!apiKey) return sendJson(response, 503, { error: "API non configurata" });
      const BASE_MAPS = "https://maps.googleapis.com/maps/api";
      let placeId = addr.placeId;
      try {
        if (!placeId) {
          const q = encodeURIComponent([addr.customer, addr.fullAddress].filter(Boolean).join(" "));
          trackCall("google_maps", "text_search");
          const tsRes = await fetch(`${BASE_MAPS}/place/textsearch/json?query=${q}&region=it&key=${apiKey}`, { signal: AbortSignal.timeout(6000) });
          const tsData = await tsRes.json();
          placeId = tsData.results?.[0]?.place_id || null;
        }
        if (!placeId) return sendJson(response, 503, { error: "Luogo non trovato su Google Maps" });
        trackCall("google_maps", "place_details");
        const detRes = await fetch(`${BASE_MAPS}/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=opening_hours,name&language=it&key=${apiKey}`, { signal: AbortSignal.timeout(6000) });
        const detData = await detRes.json();
        const oh = detData.result?.opening_hours || null;
        const dateParam = url.searchParams.get("date");
        const now = dateParam ? (() => { const [y,m,d] = dateParam.split("-").map(Number); return new Date(y, m-1, d); })() : new Date();
        const targetDay = now.getDay();
        const targetMin = now.getHours() * 60 + now.getMinutes();
        const isOpen = isOpenAtTime(oh?.periods ?? null, targetDay, targetMin);
        return sendJson(response, 200, {
          isOpen,
          openNow: oh?.open_now ?? null,
          weekdayText: oh?.weekday_text ?? null,
          placeId
        });
      } catch (err) {
        return sendJson(response, 503, { error: "Errore verifica orari" });
      }
    }

    if (method === "GET" && url.pathname === "/api/settings") {
      return sendJson(response, 200, await getSettings(userId));
    }

    if (method === "PUT" && url.pathname === "/api/settings") {
      const body = await parseBody(request);
      return sendJson(response, 200, await updateSettings(userId, body));
    }

    if (method === "POST" && url.pathname === "/api/plan") {
      const body = await parseBody(request);
      // Dedup: richiesta identica dello stesso utente entro 10s (doppio
      // submit / retry di rete) riusa il risultato senza creare un duplicato
      const dedupKey = `${userId}:${JSON.stringify(body)}`;
      const recent = recentPlanRequests.get(dedupKey);
      if (recent && Date.now() - recent.at < 10000 && recent.promise) {
        try {
          return sendJson(response, 200, await recent.promise);
        } catch (err) {
          // La richiesta originale è fallita: rimuovi la entry così i retry
          // successivi ripartono da zero invece di riusare la promise rigettata
          recentPlanRequests.delete(dedupKey);
          throw err;
        }
      }
      const planPromise = (async () => {
      const settings = await getSettings(userId);
      const allAddresses = await listAddresses("", userId);
      let route = await planRoute(body, settings, allAddresses);
      route = await attachWeather(route, { rowTimeoutMs: 3000 });

      // If replanning an existing route, update it in place instead of creating a new one
      if (body.id) {
        const existing = await getRoute(body.id, userId);
        if (existing) {
          route.id = existing.id;
          route.name = existing.name; // preserve the original name
          route.notes = existing.notes ?? route.notes;
          await updateRoutePayload(existing.id, route, userId);
          return route;
        }
      }

      const autoName = await (async () => {
          const MONTHS_IT = ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];
          const d = route.scheduledDate;
          const dateSuffix = d
            ? (() => { const [, m, day] = d.split("-"); return `${Number(day)} ${MONTHS_IT[Number(m) - 1]}`; })()
            : null;

          // Customer stops only (no breaks, no split afternoon duplicates)
          const stops = (route.rows || []).filter(r => !r.type && r.stopPart !== "afternoon");

          let base = body.name && body.name.trim() ? body.name.trim() : "Percorso";
          if (!body.name || !body.name.trim()) {
            if (stops.length > 0) {
              const locations = [...new Set(stops.map(s => (s.location || "").trim()).filter(Boolean))];
              const customers = [...new Set(stops.map(s => (s.customer || "").trim()).filter(Boolean))];
              if (locations.length === 1) {
                base = locations[0];
              } else if (customers.length === 1) {
                base = customers[0];
              } else {
                base = stops[0].customer || stops[0].location || "Percorso";
              }
            }
          }

          const candidate = dateSuffix ? `${base} — ${dateSuffix}` : base;

          // Ensure uniqueness: append (2), (3) … if name already exists
          let name = candidate;
          let n = 2;
          while (await routeNameExists(name, userId)) {
            name = `${candidate} (${n++})`;
          }
          return name;
        })();
      const saved = await saveRoute({
        ...route,
        name: autoName,
        scheduledDate: route.scheduledDate,
        startLabel: body.start?.label || "",
        startAddress: body.start?.address || body.start?.fullAddress || "",
        endLabel: route.end?.label || "",
        endAddress: route.end?.address || route.end?.fullAddress || ""
      }, userId);
      route.id = saved.id;
      return route;
      })();
      recentPlanRequests.set(dedupKey, { at: Date.now(), promise: planPromise });
      for (const [k, v] of recentPlanRequests) {
        if (Date.now() - v.at > 30000) recentPlanRequests.delete(k);
      }
      try {
        return sendJson(response, 200, await planPromise);
      } catch (err) {
        recentPlanRequests.delete(dedupKey);
        throw err;
      }
    }

    if (method === "POST" && url.pathname === "/api/route-shape") {
      const body = await parseBody(request);
      return sendJson(response, 200, await routeShape(body.points || []));
    }

    if (method === "GET" && url.pathname === "/api/routes") {
      return sendJson(response, 200, await listRoutes(userId));
    }

    if (method === "POST" && url.pathname === "/api/routes") {
      const body = await parseBody(request);
      const saved = await saveRoute({
        ...body,
        name: body.name || "Giro copiato",
        scheduledDate: body.scheduledDate || body.scheduled_date || "",
        startLabel: body.start?.label || body.startLabel || "",
        startAddress: body.start?.address || body.startAddress || "",
        endLabel: body.end?.label || body.endLabel || "",
        endAddress: body.end?.address || body.endAddress || ""
      }, userId);
      return sendJson(response, 201, saved);
    }

    const routeMatch = url.pathname.match(/^\/api\/routes\/(\d+)$/);
    if (routeMatch && method === "GET") {
      const stored = await getRoute(routeMatch[1], userId);
      if (!stored) return sendJson(response, 404, { error: "Giro non trovato" });
      let route = { ...stored.payload, id: stored.id };
      if (shouldRefreshWeather(route)) {
        route = await attachWeather(route, {
          existingWeather: route.weather || [],
          rowTimeoutMs: 3000
        });
        await updateRoutePayload(stored.id, route, userId);
      }
      return sendJson(response, 200, route);
    }

    if (routeMatch && method === "PUT") {
      const body = await parseBody(request);
      const newName = (body.name || "").trim();
      if (newName && await routeNameExists(newName, userId, routeMatch[1])) {
        return sendJson(response, 409, { error: `Esiste già un giro con il nome "${newName}"` });
      }
      const route = await renameRoute(routeMatch[1], newName, userId);
      if (!route) return sendJson(response, 404, { error: "Giro non trovato" });
      return sendJson(response, 200, route);
    }

    if (routeMatch && method === "DELETE") {
      await deleteRoute(routeMatch[1], userId);
      return sendJson(response, 200, { ok: true });
    }

    if (routeMatch && method === "PATCH") {
      const body = await parseBody(request);
      await updateRouteNotes(routeMatch[1], body.notes ?? "", userId);
      return sendJson(response, 200, { ok: true });
    }

    // POST /api/routes/:id/share → crea link di condivisione
    const shareRouteMatch = url.pathname.match(/^\/api\/routes\/(\d+)\/share$/);
    if (shareRouteMatch && method === "POST") {
      const route = await getRoute(shareRouteMatch[1], userId);
      if (!route) return sendJson(response, 404, { error: "Giro non trovato" });
      const token = generateToken();
      const routeData = { ...(route.payload || route), source: "imported" };
      await createSharedRoute(token, userId, JSON.stringify(routeData));
      const host = request.headers.host || "";
      const proto = process.env.NODE_ENV === "production" ? "https" : "http";
      const shareUrl = `${proto}://${host}/share/${token}`;
      return sendJson(response, 200, { token, url: shareUrl, expiresInDays: 5 });
    }

    // POST /api/share/:token/import → importa giro (autenticato)
    const importMatch = url.pathname.match(/^\/api\/share\/([a-zA-Z0-9_-]+)\/import$/);
    if (importMatch && method === "POST") {
      const route = await getSharedRoute(importMatch[1]);
      if (!route) return sendJson(response, 404, { error: "Link scaduto o non trovato" });
      const saved = await saveRoute({ ...route, source: "imported" }, userId, "imported");
      const full = await getRoute(saved.id, userId);
      return sendJson(response, 200, full);
    }

    if (method === "POST" && url.pathname === "/api/voice/parse") {
      const body = await parseBody(request);
      const addresses = await listAddresses("", userId);
      return sendJson(response, 200, parseVoiceCommand(body.text || "", addresses));
    }

    if (method === "POST" && url.pathname === "/api/voice/understand") {
      if (!process.env.OPENAI_API_KEY) {
        return sendJson(response, 400, { error: "OPENAI_API_KEY non configurata" });
      }
      const body = await parseBody(request);
      const text = body.text || "";
      const addresses = await listAddresses("", userId);
      const today = new Date().toISOString().slice(0, 10);

      const addressList = addresses.map(a =>
        `id:${a.id} | "${a.customer}${a.location ? " — " + a.location : ""}" | ${a.fullAddress}`
      ).join("\n");

      const systemPrompt = `Sei un assistente per un pianificatore di percorsi di lavoro.
Oggi è ${today}.
L'utente parla in italiano e ti dà un comando vocale trascritto.
Devi interpretarlo e restituire SOLO un oggetto JSON valido (senza markdown, senza commenti).

## Elenco indirizzi disponibili
${addressList}

## Schema JSON di output
{
  "action": "update" | "optimize" | "remove",
  "scheduledDate": "YYYY-MM-DD" | "",
  "startTime": "HH:MM" | "",
  "firstArrivalTime": "HH:MM" | "",
  "arrivalLeadMinutes": number | null,
  "start": { "label": string, "address": string } | null,
  "end": { "label": string, "address": string } | null,
  "stops": [
    {
      "addressId": number,
      "customer": string,
      "location": string,
      "fullAddress": string,
      "openMorning": string,
      "closeMorning": string,
      "openAfternoon": string,
      "closeAfternoon": string,
      "durationMinutes": number,
      "lat": number | null,
      "lng": number | null,
      "recognized": true
    }
  ],
  "removeStops": [{ "id": number, "customer": string, "location": string }],
  "needsConfirmation": []
}

## Regole
- Per le tappe: cerca nell'elenco sopra il contatto più simile al nome menzionato. Copia tutti i campi (addressId, customer, location, fullAddress, orari, lat, lng) dall'elenco. Se non trovi corrispondenza, metti recognized: false e lascia addressId null.
- "ottimizza", "calcola", "salva e vai" → action: "optimize"
- "rimuovi", "togli", "elimina" → action: "remove" e popola removeStops
- Se dici "domani" calcola la data corretta rispetto a oggi (${today})
- Restituisci SOLO il JSON, nessun testo aggiuntivo.`;

      trackCall("openai", "chat_completions");
      const oaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: text }
          ]
        })
      });

      if (!oaiRes.ok) {
        const err = await oaiRes.json().catch(() => ({}));
        return sendJson(response, 500, { error: err.error?.message || "Errore OpenAI" });
      }
      const oaiData = await oaiRes.json();
      const content = oaiData?.choices?.[0]?.message?.content;
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        return sendJson(response, 500, { error: "Risposta AI non valida" });
      }
      parsed.transcript = text;
      return sendJson(response, 200, parsed);
    }

    if (method === "POST" && url.pathname === "/api/voice/transcribe") {
      if (!process.env.OPENAI_API_KEY) {
        return sendJson(response, 400, { error: "OPENAI_API_KEY non configurata" });
      }
      const chunks = [];
      let audioSize = 0;
      const AUDIO_MAX_BYTES = 25 * 1024 * 1024; // 25 MB — Whisper limit
      await new Promise((resolve, reject) => {
        request.on("data", chunk => {
          audioSize += chunk.length;
          if (audioSize > AUDIO_MAX_BYTES) {
            request.destroy();
            reject(new Error("File audio troppo grande (max 25 MB)"));
            return;
          }
          chunks.push(chunk);
        });
        request.on("end", resolve);
        request.on("error", reject);
      });
      const audioBuffer = Buffer.concat(chunks);
      if (!audioBuffer.length) return sendJson(response, 400, { error: "Audio vuoto" });
      const contentType = request.headers["content-type"] || "audio/webm";
      const form = new FormData();
      form.append("file", new Blob([audioBuffer], { type: contentType }), "audio.webm");
      form.append("model", "whisper-1");
      form.append("language", "it");
      trackCall("openai", "whisper");
      const oaiRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: form
      });
      if (!oaiRes.ok) {
        const err = await oaiRes.json().catch(() => ({}));
        return sendJson(response, 500, { error: err.error?.message || "Errore Whisper" });
      }
      const data = await oaiRes.json();
      return sendJson(response, 200, { text: data.text || "" });
    }

    return sendJson(response, 404, { error: "Endpoint non trovato" });
  } catch (error) {
    console.error(error);
    return sendJson(response, 500, { error: error.message || "Errore server" });
  }
}

const server = http.createServer((request, response) => {
  if (request.url?.startsWith("/api/")) {
    handleApi(request, response);
    return;
  }
  // /share/:token → serve index.html (la PWA gestisce il routing)
  if (request.url?.match(/^\/share\/[a-zA-Z0-9_-]+/)) {
    const filePath = path.join(rootDir, "public", "index.html");
    serveIndex(request, response, filePath);
    return;
  }
  serveStatic(request, response);
});

server.listen(PORT, HOST, () => {
  console.log(`Work Route Planner attivo su http://${HOST}:${PORT}`);
});
