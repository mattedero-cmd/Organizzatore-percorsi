const BASE = "";
let adminToken = sessionStorage.getItem("adminToken") || "";

// ── API helper ────────────────────────────────────────────────────────────────
async function adminApi(path, options = {}) {
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      "x-admin-token": adminToken,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || res.statusText);
  }
  return res.json();
}

// ── Formatting helpers ────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  } catch {
    return iso;
  }
}

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── DOM refs ──────────────────────────────────────────────────────────────────
const loginScreen  = document.getElementById("login-screen");
const dashboard    = document.getElementById("dashboard");
const secretInput  = document.getElementById("secret-input");
const loginBtn     = document.getElementById("login-btn");
const loginError   = document.getElementById("login-error");
const logoutBtn    = document.getElementById("logout-btn");
const purgeBtn     = document.getElementById("purge-btn");
const dbInfo       = document.getElementById("db-info");

const kpiUsers     = document.getElementById("kpi-users");
const kpiRoutes    = document.getElementById("kpi-routes");
const kpiAddresses = document.getElementById("kpi-addresses");
const kpiSessions  = document.getElementById("kpi-sessions");

const usersTbody   = document.getElementById("users-tbody");
const sessionsTbody = document.getElementById("sessions-tbody");

// ── Auth ──────────────────────────────────────────────────────────────────────
function showDashboard() {
  loginScreen.style.display = "none";
  dashboard.style.display = "block";
}

function showLogin() {
  dashboard.style.display = "none";
  loginScreen.style.display = "flex";
  adminToken = "";
  sessionStorage.removeItem("adminToken");
}

async function doLogin() {
  const secret = secretInput.value.trim();
  if (!secret) { loginError.textContent = "Inserisci la chiave admin."; return; }

  loginBtn.disabled = true;
  loginError.textContent = "";
  try {
    const data = await adminApi("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ secret })
    });
    adminToken = data.token;
    sessionStorage.setItem("adminToken", adminToken);
    secretInput.value = "";
    showDashboard();
    await refreshAll();
    startAutoRefresh();
  } catch (err) {
    loginError.textContent = err.message || "Errore di accesso.";
  } finally {
    loginBtn.disabled = false;
  }
}

loginBtn.addEventListener("click", doLogin);
secretInput.addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });

logoutBtn.addEventListener("click", () => {
  stopAutoRefresh();
  showLogin();
});

// ── Data loading ──────────────────────────────────────────────────────────────
async function loadStats() {
  const stats = await adminApi("/api/admin/stats");
  kpiUsers.textContent     = stats.users;
  kpiRoutes.textContent    = stats.routes;
  kpiAddresses.textContent = stats.addresses;
  kpiSessions.textContent  = stats.activeSessions;
  const mode = stats.dbMode === "postgres" ? "PostgreSQL" : "SQLite";
  const pathStr = stats.dbPath ? ` — ${stats.dbPath}` : "";
  dbInfo.innerHTML = `<strong>DB:</strong> ${esc(mode)}${esc(pathStr)}`;
}

async function loadUsers() {
  const users = await adminApi("/api/admin/users");

  if (!users.length) {
    usersTbody.innerHTML = '<tr class="empty-row"><td colspan="7">Nessun utente registrato.</td></tr>';
    return;
  }

  usersTbody.innerHTML = users.map(u => `
    <tr>
      <td class="mono">${u.id}</td>
      <td><strong>${esc(u.username)}</strong></td>
      <td class="mono">${fmtDate(u.createdAt)}</td>
      <td>
        ${u.activeSessions > 0
          ? `<span class="badge badge-green">${u.activeSessions}</span>`
          : `<span class="badge badge-gray">0</span>`}
      </td>
      <td>${u.routeCount}</td>
      <td>${u.addressCount}</td>
      <td>
        <div class="action-cell">
          <button class="btn btn-warning" onclick="kickUser(${u.id}, '${esc(u.username)}')">Kick sessioni</button>
          <button class="btn btn-danger" onclick="deleteUser(${u.id}, '${esc(u.username)}')">Elimina utente</button>
        </div>
      </td>
    </tr>
  `).join("");
}

async function loadSessions() {
  const sessions = await adminApi("/api/admin/sessions");

  if (!sessions.length) {
    sessionsTbody.innerHTML = '<tr class="empty-row"><td colspan="4">Nessuna sessione attiva.</td></tr>';
    return;
  }

  sessionsTbody.innerHTML = sessions.map(s => `
    <tr>
      <td class="mono">${esc(s.token)}</td>
      <td>${esc(s.username)}</td>
      <td class="mono">${fmtDate(s.createdAt)}</td>
      <td class="mono">${fmtDate(s.expiresAt)}</td>
    </tr>
  `).join("");
}

// ── API call stats ────────────────────────────────────────────────────────────
const SERVICE_LABELS = {
  google_maps: "Google Maps",
  openai: "OpenAI",
  openroute: "OpenRoute / MapQuest",
  open_meteo: "Open-Meteo (meteo)",
  internal: "Interno"
};
const SERVICE_PAID = new Set(["google_maps", "openai"]);

async function loadApiStats() {
  const days = Number(document.getElementById("api-stats-days")?.value || 30);
  const tbody = document.getElementById("api-stats-tbody");
  const summary = document.getElementById("api-stats-summary");
  if (!tbody) return;

  try {
    const rows = await adminApi(`/api/admin/api-stats?days=${days}`);
    if (!rows.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="4">Nessuna chiamata registrata.</td></tr>';
      if (summary) summary.innerHTML = "";
      return;
    }

    // Aggregate by service for the summary pills
    const totals = {};
    for (const r of rows) {
      totals[r.service] = (totals[r.service] ?? 0) + Number(r.total);
    }

    if (summary) {
      summary.innerHTML = Object.entries(totals)
        .sort((a, b) => b[1] - a[1])
        .map(([svc, tot]) => {
          const label = SERVICE_LABELS[svc] || svc;
          const paid = SERVICE_PAID.has(svc);
          return `<span class="api-stat-pill${paid ? " api-stat-pill-paid" : " api-stat-pill-free"}">${esc(label)}: <strong>${tot}</strong></span>`;
        }).join("");
    }

    // Group rows by day for display
    const byDay = {};
    for (const r of rows) {
      if (!byDay[r.day]) byDay[r.day] = {};
      byDay[r.day][r.service] = Number(r.total);
    }

    const services = Object.keys(totals).sort();
    tbody.innerHTML = Object.entries(byDay).map(([day, svcMap]) => {
      const cells = services.map(svc => {
        const n = svcMap[svc] ?? 0;
        const paid = SERVICE_PAID.has(svc);
        return `<td class="${paid && n > 0 ? "api-cell-paid" : ""}">${n > 0 ? n : ""}</td>`;
      }).join("");
      return `<tr><td class="mono">${esc(day)}</td>${cells}</tr>`;
    }).join("");

    // Rebuild header with dynamic service columns
    const thead = tbody.closest("table")?.querySelector("thead tr");
    if (thead) {
      thead.innerHTML = `<th>Giorno</th>` + services.map(svc => {
        const label = SERVICE_LABELS[svc] || svc;
        const paid = SERVICE_PAID.has(svc);
        return `<th${paid ? ' class="api-header-paid"' : ""}>${esc(label)}</th>`;
      }).join("");
    }
  } catch (err) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="5">${esc(err.message)}</td></tr>`;
  }
}

async function refreshAll() {
  try {
    await Promise.all([loadStats(), loadUsers(), loadSessions(), loadApiStats()]);
  } catch (err) {
    if (err.message.includes("Non autenticato") || err.message.includes("401")) {
      stopAutoRefresh();
      showLogin();
      loginError.textContent = "Sessione scaduta. Effettua di nuovo l'accesso.";
    } else {
      console.error("Admin refresh error:", err.message);
    }
  }
}

// ── Recupero database precedente (v5.082) ─────────────────────────────────────
const oldDbsBtn = document.getElementById("scan-old-dbs");
const oldDbsBox = document.getElementById("old-dbs-result");

oldDbsBtn?.addEventListener("click", async () => {
  oldDbsBox.textContent = "Ricerca in corso (può richiedere fino a un minuto)…";
  oldDbsBtn.disabled = true;
  try {
    const data = await adminApi("/api/admin/old-dbs");
    if (!data.candidates.length) {
      oldDbsBox.textContent = "Nessun altro database trovato nelle variabili d'ambiente del progetto.";
      return;
    }
    oldDbsBox.innerHTML = data.candidates.map(c => {
      if (!c.ok) return `<div style="margin:0.6rem 0;padding:0.6rem;border:1px solid #334155;border-radius:8px;">Database <strong>${esc(c.host)}</strong> — non raggiungibile (${esc(c.error || "errore")})</div>`;
      const n = c.counts || {};
      return `<div style="margin:0.6rem 0;padding:0.6rem;border:1px solid #334155;border-radius:8px;">
        <div><strong>${esc(c.host)}</strong> <span style="color:#64748b;">(${esc((c.envKeys || []).join(", "))})</span></div>
        <div style="margin:0.35rem 0;">Utenti: <strong>${n.users ?? 0}</strong> · Giri: <strong>${n.planned_routes ?? 0}</strong> · Contatti: <strong>${n.addresses ?? 0}</strong> · Cartelle: ${n.folders ?? 0} · Piani: ${n.multiday_plans ?? 0}</div>
        ${c.usernames?.length ? `<div style="color:#94a3b8;">Account trovati: ${c.usernames.map(esc).join(", ")}</div>` : ""}
        ${(n.planned_routes || n.addresses || n.users) ? `<button onclick="importOldDb(${c.index}, '${esc(c.host)}')" style="margin-top:0.5rem;background:#2563eb;color:#fff;border:none;border-radius:6px;padding:0.4rem 0.9rem;font-size:0.82rem;cursor:pointer;">Importa questi dati nel database attuale</button>` : `<div style="color:#64748b;">(vuoto — niente da importare)</div>`}
      </div>`;
    }).join("");
  } catch (err) {
    oldDbsBox.textContent = "Errore: " + err.message;
  } finally {
    oldDbsBtn.disabled = false;
  }
});

window.importOldDb = async function(index, host) {
  if (!confirm(`Importare TUTTI i dati (utenti, giri, contatti, cartelle, piani) da "${host}" nel database attuale?\n\nNiente doppioni: ciò che esiste già viene saltato. Il database di origine NON viene modificato.`)) return;
  oldDbsBox.innerHTML = "Importazione in corso — non chiudere la pagina (fino a un minuto)…";
  try {
    const r = await adminApi("/api/admin/import-old-db", { method: "POST", body: JSON.stringify({ index }) });
    const rep = r.report || {};
    const riga = (label, k) => `${label}: ${rep[k]?.copied ?? 0} importati (su ${rep[k]?.source ?? 0})`;
    oldDbsBox.innerHTML = `<div style="padding:0.6rem;border:1px solid #16a34a;border-radius:8px;color:#e2e8f0;">
      <strong>Importazione da ${esc(r.host)} completata ✓</strong><br>
      ${riga("Utenti", "users")}<br>${riga("Giri", "planned_routes")}<br>${riga("Contatti", "addresses")}<br>${riga("Cartelle", "folders")}<br>${riga("Piani multi-giorno", "multiday_plans")}
      <div style="margin-top:0.4rem;color:#94a3b8;">Ora apri l'app e accedi: i dati sono nel database attuale. Gli account importati funzionano con le loro vecchie password.</div>
    </div>`;
    await refreshAll();
  } catch (err) {
    oldDbsBox.innerHTML = `<span style="color:#f87171;">Importazione fallita: ${esc(err.message)} — riprova.</span>`;
  }
};

// ── Actions ───────────────────────────────────────────────────────────────────
window.kickUser = async function(id, username) {
  if (!confirm(`Terminare tutte le sessioni di "${username}"?`)) return;
  try {
    await adminApi(`/api/admin/users/${id}/kick`, { method: "POST" });
    await refreshAll();
  } catch (err) {
    alert("Errore: " + err.message);
  }
};

window.deleteUser = async function(id, username) {
  if (!confirm(`Eliminare definitivamente l'utente "${username}" e tutti i suoi dati (percorsi, indirizzi, impostazioni, sessioni)?\n\nQuesta operazione è irreversibile.`)) return;
  try {
    await adminApi(`/api/admin/users/${id}`, { method: "DELETE" });
    await refreshAll();
  } catch (err) {
    alert("Errore: " + err.message);
  }
};

purgeBtn.addEventListener("click", async () => {
  try {
    purgeBtn.disabled = true;
    await adminApi("/api/admin/purge-sessions", { method: "POST" });
    await refreshAll();
  } catch (err) {
    alert("Errore: " + err.message);
  } finally {
    purgeBtn.disabled = false;
  }
});

// ── Auto-refresh every 30 seconds ────────────────────────────────────────────
let refreshInterval = null;

function startAutoRefresh() {
  stopAutoRefresh();
  refreshInterval = setInterval(refreshAll, 30_000);
}

function stopAutoRefresh() {
  if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
}

document.getElementById("api-stats-days")?.addEventListener("change", loadApiStats);
window.loadApiStats = loadApiStats;

// ── Init ──────────────────────────────────────────────────────────────────────
if (adminToken) {
  // Try to use existing token from sessionStorage
  showDashboard();
  refreshAll().then(() => startAutoRefresh()).catch(() => showLogin());
} else {
  showLogin();
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopAutoRefresh();
  } else if (adminToken) {
    refreshAll();
    startAutoRefresh();
  }
});
