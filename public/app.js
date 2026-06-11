// ── helpers ──────────────────────────────────────────────────────────────────

const app = document.querySelector("#app");
const toastEl = document.querySelector("#toast");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function euro(value) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(value || 0));
}

function minutesLabel(minutes) {
  const value = Number(minutes || 0);
  const h = Math.floor(value / 60), m = value % 60;
  if (!h) return `${m} min`;
  if (!m) return `${h} h`;
  return `${h} h ${m} min`;
}

// ── SVG icon system ───────────────────────────────────────────────────────────
const _svg = (paths, s = 16) =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const I = {
  trash:    (s) => _svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>', s),
  edit:     (s) => _svg('<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>', s),
  copy:     (s) => _svg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>', s),
  play:     (s) => _svg('<polygon points="5 3 19 12 5 21 5 3"/>', s),
  navigate: (s) => _svg('<polygon points="3 11 22 2 13 21 11 13 3 11"/>', s),
  refresh:  (s) => _svg('<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/>', s),
  map:      (s) => _svg('<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>', s),
  phone:    (s) => _svg('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.28 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>', s),
  phoneLand:(s) => _svg('<path d="M15.05 5A5 5 0 0 1 19 8.95M15.05 1A9 9 0 0 1 23 8.94m-1 7.98v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.28 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>', s),
  email:    (s) => _svg('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>', s),
  close:    (s) => _svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', s),
  plus:     (s) => _svg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', s),
  arrowR:   (s) => _svg('<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>', s),
  arrowUp:  (s) => _svg('<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>', s),
  arrowDown:(s) => _svg('<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>', s),
  check:    (s) => _svg('<polyline points="20 6 9 17 4 12"/>', s),
  mic:      (s) => _svg('<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>', s),
  micStop:  (s) => _svg('<rect x="8" y="8" width="8" height="8" rx="1"/>', s),
  print:    (s) => _svg('<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>', s),
  location: (s) => _svg('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>', s),
  contacts: (s) => _svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>', s),
  link:     (s) => _svg('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>', s),
  eye:      (s) => _svg('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>', s),
  eyeOff:   (s) => _svg('<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>', s),
  arrowLeft:(s) => _svg('<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>', s),
  save:     (s) => _svg('<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>', s),
  checkCircle:(s)=>_svg('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>', s),
  fork:     (s) => _svg('<line x1="8" y1="6" x2="8" y2="2"/><line x1="16" y1="6" x2="16" y2="2"/><path d="M8 6a4 4 0 0 0 0 8v8"/><path d="M16 6a4 4 0 0 1 0 8v-4h-4"/>', s),
  coffee:   (s) => _svg('<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/>', s),
  list:     (s) => _svg('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>', s),
  car:      (s) => _svg('<path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v9a2 2 0 0 1-2 2h-3"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>', s),
  wrench:   (s) => _svg('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>', s),
  upload:   (s) => _svg('<polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>', s),
  clock:    (s) => _svg('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', s),
  lock:     (s) => _svg('<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>', s),
  key:      (s) => _svg('<path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/>', s),
};

function phoneIcon(type) {
  if (type === "fisso") return I.phoneLand(15);
  return I.phone(15);
}

function preferredPhone(a) {
  if (a.phonePreferred === "phone2" && a.phone2) return { number: a.phone2, type: a.phone2Type, name: a.phone2Name };
  if (a.phone) return { number: a.phone, type: a.phoneType, name: a.phoneName };
  if (a.phone2) return { number: a.phone2, type: a.phone2Type, name: a.phone2Name };
  return null;
}

function addressName(a) {
  const primary = a.activity || a.customer || "";
  const secondary = a.activity && a.customer ? a.customer : (a.location || "");
  return `${primary}${secondary ? ` — ${secondary}` : ""}`.trim();
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove("show"), 2800);
}

function showSpinner(msg = "Calcolo in corso…") {
  let el = document.getElementById("loading-overlay");
  if (!el) {
    el = document.createElement("div");
    el.id = "loading-overlay";
    document.body.appendChild(el);
  }
  el.innerHTML = `<div class="loading-box"><div class="loading-spinner"></div><p>${msg}</p></div>`;
  el.style.display = "flex";
}
function hideSpinner() {
  const el = document.getElementById("loading-overlay");
  if (el) el.style.display = "none";
}

function readForm(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const payload = await res.json().catch(() => ({}));
  if (res.status === 401) {
    state.user = null;
    renderAuthScreen(false);
    throw new Error("Sessione scaduta. Effettua di nuovo il login.");
  }
  if (!res.ok) throw new Error(payload.error || `Errore ${res.status}`);
  return payload;
}

// ── state ────────────────────────────────────────────────────────────────────

const emptyForm = {
  id: null, customer: "", activity: "", location: "", fullAddress: "",
  addressType: "customer",
  phone: "", phoneType: "cell", phoneName: "",
  phone2: "", phone2Type: "fisso", phone2Name: "",
  phonePreferred: "phone",
  email: "", notes: "",
  openMorning: "08:30", closeMorning: "12:30",
  openAfternoon: "14:30", closeAfternoon: "18:00",
  weeklyHours: null,
  defaultDuration: 45, lat: "", lng: ""
};

const state = {
  user: null,
  activeTab: "route",
  menuOpen: false, menuSection: null,
  theme: "day",
  themeMode: "auto",      // "auto" | "light" | "dark"
  themePalette: "default", // "default" | "neon" | "luxury" | "metallo" | "pietra" | "foresta" | "legno"
  googleMapsKey: "",
  googleMapsReady: false,
  googleClientId: "",
  googleContactsData: null,
  navigatorPref: (() => { try { return localStorage.getItem("navigatorPref") || "google"; } catch { return "google"; } })(),
  mapApiConfigured: false,
  addresses: [],
  allAddresses: [],
  savedRoutes: [],
  addressSearch: "",
  archiveShowAll: false,
  stopSearchText: "",
  visitCalendar: {}, // { [addressId]: { year, month } }
  statsTab: "summary", // "summary" | "months"
  addressForm: { ...emptyForm },
  settings: { kmRate: 0.65, driveHourRate: 22, workHourRate: 60 },
  route: {
    scheduledDate: new Date().toISOString().slice(0, 10),
    startLabel: "Casa",
    startAddress: "",
    startTime: "07:00",
    timingMode: "first_open_minus",
    arrivalLeadMinutes: 10,
    firstArrivalTime: "08:30",
    endSameAsStart: true,
    endLabel: "Casa",
    endAddress: "",
    firstArrivalRequired: "",
    selectedAddressId: "",
    customCustomer: "", customLocation: "", customAddress: "",
    customDuration: 45,
    customWeeklyHours: null,
    stops: [],
    transcript: "",
    lunchBreak: true,
    lunchBreakMinutes: 45
  },
  result: null,
  manualOrderRows: null,
  planning: false,
  stopFilter: "",
  importWizard: null,
  whisperConfigured: false,
  voiceRecording: false,
  _mediaRecorder: null,
  _audioChunks: []
};

// ── theme ────────────────────────────────────────────────────────────────────

function applyTheme() {
  const mode = state.themeMode || "auto";
  const palette = state.themePalette || "default";
  const isDark = mode === "auto"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : mode === "dark";

  const map = {
    default: isDark ? "night"          : "day",
    neon:    isDark ? "nero"            : "neon-giorno",
    luxury:  isDark ? "luxury-notte"   : "luxury-giorno",
    metallo: isDark ? "metallo"        : "metallo-giorno",
    pietra:  isDark ? "pietra"         : "pietra-giorno",
    foresta: isDark ? "foresta-notte"  : "foresta-giorno",
    legno:   isDark ? "legno"          : "legno-giorno",
  };
  state.theme = map[palette] || (isDark ? "night" : "day");
  document.documentElement.dataset.theme = state.theme;
  try {
    localStorage.setItem("pl_theme", JSON.stringify({ mode, palette }));
    // cookie per il server-side theme injection (no-JS path e primo caricamento)
    const d = isDark ? "1" : "0";
    document.cookie = `pl_dark=${d};path=/;max-age=31536000;samesite=strict`;
  } catch {}
}

const _splashShown = Date.now();
function hideSplash() {
  const el = document.getElementById("splash");
  if (!el) return;
  const elapsed = Date.now() - _splashShown;
  const delay = Math.max(0, 500 - elapsed);
  setTimeout(() => {
    const bar = document.getElementById("splash-bar");
    if (bar) bar.classList.add("complete");
    setTimeout(() => {
      el.classList.add("hiding");
      el.addEventListener("transitionend", () => el.classList.add("hidden"), { once: true });
      setTimeout(() => el.classList.add("hidden"), 450);
    }, 220);
  }, delay);
}

function setActiveTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  if (tab === "archive") {
    // Refresh saved routes so visit calendar is up to date, then render
    refreshSavedRoutes().then(() => render());
  } else {
    render();
  }
}

function openMenu(section = null) {
  state.menuOpen = true;
  state.menuSection = section;
  renderMenu();
}

function closeMenu() {
  state.menuOpen = false;
  state.menuSection = null;
  const existing = document.getElementById("bsheet-overlay");
  if (!existing) return;
  existing.classList.remove("opening");
  existing.classList.add("closing");
  existing.addEventListener("animationend", () => existing.remove(), { once: true });
  // fallback if animation doesn't fire
  setTimeout(() => existing.remove(), 350);
}

function renderMenu() {
  const existing = document.getElementById("bsheet-overlay");
  if (existing) existing.remove();
  if (!state.menuOpen) return;

  const overlay = document.createElement("div");
  overlay.className = "bsheet-overlay opening";
  overlay.id = "bsheet-overlay";
  overlay.innerHTML = `<div class="bsheet" id="bsheet">${state.menuSection ? renderMenuSection(state.menuSection) : renderMenuRoot()}</div>`;
  document.body.appendChild(overlay);

  const refreshSheet = () => {
    const sheet = document.getElementById("bsheet");
    if (sheet) sheet.innerHTML = state.menuSection ? renderMenuSection(state.menuSection) : renderMenuRoot();
    bindSheetEvents();
  };

  const bindSheetEvents = () => {
    const ov = document.getElementById("bsheet-overlay");
    if (!ov) return;
    ov.querySelectorAll("[data-menu-go]").forEach(btn => {
      btn.addEventListener("click", () => { state.menuSection = btn.dataset.menuGo; refreshSheet(); });
    });
    ov.querySelectorAll("[data-stats-tab]").forEach(btn => {
      btn.addEventListener("click", () => { state.statsTab = btn.dataset.statsTab; refreshSheet(); });
    });
    ov.querySelector("#bsheet-back")?.addEventListener("click", () => { state.menuSection = null; refreshSheet(); });
    ov.querySelector("#bsheet-close")?.addEventListener("click", () => closeMenu());
    ov.querySelector("#logout-btn")?.addEventListener("click", async () => {
      await fetch("/api/auth/logout", { method: "POST" });
      state.user = null;
      closeMenu();
      renderAuthScreen(false);
    });
    ov.querySelector("#settings-form")?.addEventListener("submit", async e => {
      e.preventDefault();
      const v = readForm(e.target);
      const newSettings = {
        kmRate: Number(v.kmRate),
        driveHourRate: Number(v.driveHourRate),
        workHourRate: Number(v.workHourRate),
        navigatorPref: v.navigatorPref || "google",
        themeMode: v.themeMode || state.themeMode || "auto",
        themePalette: v.themePalette || state.themePalette || "default",
        lunchBreakMinutes: Number(v.lunchBreakMinutes || 45),
        lunchBreakEnabled: v.lunchBreakEnabled === "on",
        defaultStartLabel: v.defaultStartLabel || "",
        defaultStartAddress: v.defaultStartAddress || "",
        restIntervalMin: Number(v.restIntervalMin || 120),
        restMaxDeviationMin: Number(v.restMaxDeviationMin || 40),
        restDurationMin: Number(v.restDurationMin || 15),
        earliestBreakTime: v.earliestBreakTime || "08:00",
        maxDetourKm: Math.round((Number(v.maxDetourKm) || 1.5) * 2) / 2,
        maxReturnTime: v.maxReturnTime || "",
        driveMarkupMinPerHour: Number(v.driveMarkupMinPerHour || 10),
        lunchOpenTime: v.lunchOpenTime || "11:30",
        lunchCloseTime: v.lunchCloseTime || "14:00",
        noBreakEarlyMin: Number(v.noBreakEarlyMin ?? 120),
        noBreakBeforeHomeMin: Number(v.noBreakBeforeHomeMin ?? 60),
        noBreakBeforeLunchMin: Number(v.noBreakBeforeLunchMin ?? 60),
        noBreakAfterLunchMin: Number(v.noBreakAfterLunchMin ?? 120)
      };
      state.settings = await api("/api/settings", { method: "PUT", body: JSON.stringify(newSettings) });
      state.navigatorPref = state.settings.navigatorPref;
      try { localStorage.setItem("navigatorPref", state.navigatorPref); } catch {}
      state.themeMode = state.settings.themeMode || "auto";
      state.themePalette = state.settings.themePalette || "default";
      state.route.lunchBreak = state.settings.lunchBreakEnabled !== false;
      state.route.lunchBreakMinutes = state.settings.lunchBreakMinutes || 45;
      if (state.settings.defaultStartLabel || state.settings.defaultStartAddress) {
        state.route.startLabel = state.settings.defaultStartLabel || state.route.startLabel;
        state.route.startAddress = state.settings.defaultStartAddress || state.route.startAddress;
      }
      applyTheme();
      showToast("Impostazioni salvate");
      closeMenu();
    });
    ov.querySelector("#change-pw-form")?.addEventListener("submit", async e => {
      e.preventDefault();
      const errEl = e.target.querySelector(".change-pw-error");
      errEl.textContent = "";
      const v = readForm(e.target);
      if (v.newPassword !== v.confirmPassword) {
        errEl.textContent = "Le nuove password non coincidono";
        return;
      }
      try {
        const res = await fetch("/api/auth/change-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currentPassword: v.currentPassword, newPassword: v.newPassword })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { errEl.textContent = data.error || "Errore aggiornamento password"; return; }
        showToast("Password aggiornata");
        e.target.reset();
        e.target.closest("details").removeAttribute("open");
      } catch (err) {
        errEl.textContent = "Errore di rete";
      }
    });
    ov.addEventListener("click", e => {
      const paletteChip = e.target.closest("[data-palette]");
      if (paletteChip && document.getElementById("themePaletteInput")) {
        document.querySelectorAll(".palette-chip").forEach(c => c.classList.remove("active"));
        paletteChip.classList.add("active");
        document.getElementById("themePaletteInput").value = paletteChip.dataset.palette;
        // live preview
        state.themePalette = paletteChip.dataset.palette;
        applyTheme();
        return;
      }
    });
    ov.addEventListener("change", e => {
      if (e.target.name === "themeMode") {
        state.themeMode = e.target.value;
        applyTheme();
      }
    });
    ov.querySelectorAll("[data-stepper]").forEach(btn => {
      btn.addEventListener("click", () => {
        const name = btn.dataset.stepper;
        const dir = Number(btn.dataset.dir);
        const step = Number(btn.dataset.step || 1);
        const input = ov.querySelector(`[name="${name}"]`);
        if (input) {
          const min = Number(input.min || 0);
          const max = Number(input.max || 9999);
          input.value = Math.min(max, Math.max(min, Number(input.value) + dir * step));
        }
      });
    });

    const startSearch = ov.querySelector("#settings-start-search");
    const startSugg = ov.querySelector("#settings-start-sugg");
    if (startSearch && startSugg) {
      startSearch.addEventListener("input", () => {
        const q = startSearch.value.toLowerCase().trim();
        if (!q) { startSugg.style.display = "none"; startSugg.innerHTML = ""; return; }
        const allFiltered = state.allAddresses
          .filter(a => (a.customer + " " + (a.location || "") + " " + (a.fullAddress || "")).toLowerCase().includes(q));
        const priority = allFiltered.filter(a => a.addressType === "favorite" || a.addressType === "rest");
        const rest = allFiltered.filter(a => a.addressType !== "favorite" && a.addressType !== "rest");
        const matches = [...priority, ...rest].slice(0, 8);
        startSugg.innerHTML = matches.map(a => `<div class="stop-suggestion" data-settings-start="${a.id}">
          ${a.addressType === "favorite" ? "⭐ " : a.addressType === "rest" ? "☕ " : a.addressType === "restaurant" ? "🍽 " : "👤 "}${escapeHtml(a.customer)}${a.location ? ` — ${escapeHtml(a.location)}` : ""}
          <br><small class="stop-meta">${escapeHtml(a.fullAddress || "")}</small>
        </div>`).join("");
        startSugg.style.display = matches.length ? "block" : "none";
      });
      startSugg.addEventListener("click", e => {
        const item = e.target.closest("[data-settings-start]");
        if (!item) return;
        const a = state.allAddresses.find(x => String(x.id) === item.dataset.settingsStart);
        if (!a) return;
        const lbl = ov.querySelector("#settings-start-label");
        const addr = ov.querySelector("#settings-start-address");
        if (lbl) lbl.value = a.customer + (a.location ? ` — ${a.location}` : "");
        if (addr) addr.value = a.fullAddress || "";
        startSugg.style.display = "none";
        startSugg.innerHTML = "";
        startSearch.value = "";
      });
    }
  };

  overlay.addEventListener("click", e => { if (e.target === overlay) closeMenu(); });
  bindSheetEvents();
}

function menuHeader(title, showBack = false) {
  return `<div class="bsheet-header">
    ${showBack ? `<button class="bsheet-back" id="bsheet-back">‹</button>` : ""}
    <h2 class="bsheet-title">${title}</h2>
    <button class="bsheet-close" id="bsheet-close" aria-label="Chiudi">${I.close(14)}</button>
  </div>`;
}

function renderMenuRoot() {
  return `
    ${menuHeader("Menu")}
    <button class="bsheet-menu-item" data-menu-go="stats">
      <span class="bsheet-menu-icon">${_svg('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>', 18)}</span>
      <span class="bsheet-menu-label">Statistiche</span>
      <span class="bsheet-menu-arrow">${I.arrowR(14)}</span>
    </button>
    <button class="bsheet-menu-item" data-menu-go="settings">
      <span class="bsheet-menu-icon">${_svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>', 18)}</span>
      <span class="bsheet-menu-label">Impostazioni</span>
      <span class="bsheet-menu-arrow">${I.arrowR(14)}</span>
    </button>
    <button class="bsheet-menu-item" data-menu-go="guide">
      <span class="bsheet-menu-icon">${_svg('<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>', 18)}</span>
      <span class="bsheet-menu-label">Guida</span>
      <span class="bsheet-menu-arrow">${I.arrowR(14)}</span>
    </button>
    <button class="bsheet-menu-item" data-menu-go="info">
      <span class="bsheet-menu-icon">${_svg('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', 18)}</span>
      <span class="bsheet-menu-label">Info app</span>
      <span class="bsheet-menu-arrow">${I.arrowR(14)}</span>
    </button>
    <div class="bsheet-menu-divider"></div>
    <button class="bsheet-menu-item bsheet-menu-item--account" data-menu-go="account">
      <span class="bsheet-menu-icon bsheet-menu-icon--account">${_svg('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>', 18)}</span>
      <span class="bsheet-menu-label">
        <span class="account-menu-name">${escapeHtml(state.user?.username || "Account")}</span>
        <span class="account-menu-sub">Gestisci account</span>
      </span>
      <span class="bsheet-menu-arrow">${I.arrowR(14)}</span>
    </button>`;
}

function renderMenuSection(section) {
  if (section === "stats") return renderMenuStats();
  if (section === "settings") return renderMenuSettings();
  if (section === "guide") return renderMenuGuide();
  if (section === "info") return renderMenuInfo();
  if (section === "account") return renderMenuAccount();
  return renderMenuRoot();
}

function renderMenuAccount() {
  return `
    ${menuHeader("Account", true)}
    <div class="bsheet-section-body" style="padding:16px;">
      <div class="account-profile-card">
        <div class="account-avatar">${_svg('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>', 36)}</div>
        <div class="account-profile-info">
          <div class="account-profile-name">${escapeHtml(state.user?.username || "")}</div>
          <div class="account-profile-role">Utente</div>
        </div>
      </div>

      <div class="account-section-title">Sicurezza</div>
      <details class="change-pw-details">
        <summary class="change-pw-summary">${I.lock(14)} Cambia password</summary>
        <form id="change-pw-form" class="change-pw-form" autocomplete="off">
          <label class="field">Password attuale<input type="password" name="currentPassword" autocomplete="current-password" required /></label>
          <label class="field">Nuova password<input type="password" name="newPassword" autocomplete="new-password" minlength="6" required /></label>
          <label class="field">Conferma nuova password<input type="password" name="confirmPassword" autocomplete="new-password" minlength="6" required /></label>
          <p class="change-pw-error"></p>
          <button class="btn primary" type="submit" style="width:100%">Aggiorna password</button>
        </form>
      </details>

      <div class="account-section-title" style="margin-top:24px;">Sessione</div>
      <button class="btn danger" id="logout-btn" style="width:100%;margin-top:4px;">${I.arrowLeft(14)} Esci dall'account</button>
    </div>`;
}

function renderMenuSettings() {
  const s = state.settings;
  const nav = s.navigatorPref || "google";
  const stepper = (name, val, min, max, step, unit = "") => `
    <div class="stp-row">
      <div class="settings-stepper">
        <button type="button" data-stepper="${name}" data-dir="-1" data-step="${step}">−</button>
        <input name="${name}" type="number" min="${min}" max="${max}" step="${step}" value="${val}" />
        <button type="button" data-stepper="${name}" data-dir="1" data-step="${step}">+</button>
      </div>
      ${unit ? `<span class="stp-unit">${unit}</span>` : ""}
    </div>`;
  const secTitle = (icon, label) =>
    `<h3 class="settings-section-title">${_svg(icon, 15)} ${label}</h3>`;
  const row2 = (...items) =>
    `<div class="sg-row">${items.map(i => `<div class="sg-cell">${i}</div>`).join("")}</div>`;
  const fld = (label, input) =>
    `<div class="sg-field"><span class="sg-label">${label}</span>${input}</div>`;
  const timeInput = (name, val, placeholder = "") =>
    `<input name="${name}" type="time" value="${escapeHtml(val || "")}" placeholder="${placeholder}" class="sg-time" />`;

  return `
    ${menuHeader("Impostazioni", true)}
    <div class="bsheet-section-body">
      <form id="settings-form">

        ${secTitle('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>', "Partenza e rientro")}
        <div class="sg-stack">
          ${row2(
            `<label class="field">Nome<input name="defaultStartLabel" id="settings-start-label" value="${escapeHtml(s.defaultStartLabel || "")}" placeholder="Casa, Ufficio…" /></label>`,
            fld("Rientro massimo", timeInput("maxReturnTime", s.maxReturnTime))
          )}
          <label class="field">Indirizzo<input name="defaultStartAddress" id="settings-start-address" value="${escapeHtml(s.defaultStartAddress || "")}" placeholder="Via, città…" /></label>
          <div style="position:relative;">
            <input id="settings-start-search" placeholder="Cerca nell'archivio…" autocomplete="off" class="sg-search" />
            <div id="settings-start-sugg" class="stop-suggestions" style="display:none;"></div>
          </div>
        </div>

        ${secTitle('<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/>', "Soste automatiche")}
        <div class="sg-stack">
          ${row2(
            fld("Intervallo guida+lavoro", stepper("restIntervalMin", s.restIntervalMin || 120, 60, 300, 10, "min")),
            fld("Tolleranza ±", stepper("restMaxDeviationMin", s.restMaxDeviationMin || 40, 10, 90, 5, "min"))
          )}
          ${row2(
            fld("Durata sosta", stepper("restDurationMin", s.restDurationMin || 15, 5, 60, 5, "min")),
            fld("Deviazione massima", stepper("maxDetourKm", s.maxDetourKm !== undefined ? Math.round(s.maxDetourKm * 2) / 2 : 1.5, 0.5, 10, 0.5, "km"))
          )}
          ${row2(
            fld("Prima sosta non prima delle", timeInput("earliestBreakTime", s.earliestBreakTime || "08:00")),
            fld("No sosta nelle prime", stepper("noBreakEarlyMin", s.noBreakEarlyMin ?? 120, 0, 240, 10, "min"))
          )}
          ${fld("No sosta nell'ultima", stepper("noBreakBeforeHomeMin", s.noBreakBeforeHomeMin ?? 60, 0, 120, 10, "min prima del rientro"))}
        </div>

        ${secTitle('<line x1="8" y1="6" x2="8" y2="2"/><line x1="16" y1="6" x2="16" y2="2"/><path d="M8 6a4 4 0 0 0 0 8v8"/><path d="M16 6a4 4 0 0 1 0 8v-4h-4"/>', "Pausa pranzo")}
        <div class="sg-stack">
          <label class="field checkbox-field">
            <input type="checkbox" name="lunchBreakEnabled" ${s.lunchBreakEnabled !== false ? "checked" : ""} />
            <span>Pausa pranzo abilitata di default</span>
          </label>
          ${row2(
            fld("Durata", stepper("lunchBreakMinutes", s.lunchBreakMinutes || 45, 15, 120, 5, "min")),
            fld("Finestra: dalle", timeInput("lunchOpenTime", s.lunchOpenTime || "11:30")) +
            fld("alle", timeInput("lunchCloseTime", s.lunchCloseTime || "14:00"))
          )}
          ${row2(
            fld("No sosta nei", stepper("noBreakBeforeLunchMin", s.noBreakBeforeLunchMin ?? 60, 0, 120, 10, "min prima")),
            fld("No sosta nei", stepper("noBreakAfterLunchMin", s.noBreakAfterLunchMin ?? 120, 0, 180, 10, "min dopo"))
          )}
          <p class="sg-hint">Cerca prima i ristoranti salvati in archivio, poi su Maps.</p>
        </div>

        ${secTitle('<path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v9a2 2 0 0 1-2 2h-3"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>', "Guida e tariffe")}
        <div class="sg-stack">
          ${fld("Maggiorazione traffico stimata", stepper("driveMarkupMinPerHour", s.driveMarkupMinPerHour !== undefined ? s.driveMarkupMinPerHour : 10, 0, 30, 1, "min/ora"))}
          ${row2(
            `<label class="field">€/km<input name="kmRate" type="number" min="0" step="0.01" value="${escapeHtml(s.kmRate)}" /></label>`,
            `<label class="field">€/ora guida<input name="driveHourRate" type="number" min="0" step="0.01" value="${escapeHtml(s.driveHourRate)}" /></label>`,
            `<label class="field">€/ora lavoro<input name="workHourRate" type="number" min="0" step="0.01" value="${escapeHtml(s.workHourRate)}" /></label>`
          )}
        </div>

        ${secTitle('<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>', "App")}
        <div class="sg-stack">
          <div class="sg-field"><span class="sg-label">Navigatore</span>
            <div class="settings-radio-group">
              <label class="settings-radio"><input type="radio" name="navigatorPref" value="google" ${nav === "google" ? "checked" : ""} /> Google Maps</label>
              <label class="settings-radio"><input type="radio" name="navigatorPref" value="apple" ${nav === "apple" ? "checked" : ""} /> Apple Mappe</label>
              <label class="settings-radio"><input type="radio" name="navigatorPref" value="waze" ${nav === "waze" ? "checked" : ""} /> Waze</label>
            </div>
          </div>
          <div class="sg-field"><span class="sg-label">Tema</span>
            <div class="settings-radio-group">
              <label class="settings-radio"><input type="radio" name="themeMode" value="auto" ${(s.themeMode||"auto") === "auto" ? "checked" : ""} /> Automatico</label>
              <label class="settings-radio"><input type="radio" name="themeMode" value="light" ${(s.themeMode||"auto") === "light" ? "checked" : ""} /> Giorno</label>
              <label class="settings-radio"><input type="radio" name="themeMode" value="dark" ${(s.themeMode||"auto") === "dark" ? "checked" : ""} /> Notte</label>
            </div>
          </div>
          <div class="sg-field"><span class="sg-label">Palette</span>
            <div class="settings-palette-group">
              <button type="button" class="palette-chip${(s.themePalette||"default")==="default"?" active":""}" data-palette="default"><span class="palette-swatch" style="background:linear-gradient(135deg,#05080f 50%,#e6f2f0 50%)"></span>Default</button>
              <button type="button" class="palette-chip${(s.themePalette||"default")==="neon"?" active":""}" data-palette="neon"><span class="palette-swatch" style="background:linear-gradient(135deg,#000 50%,#e0fff8 50%)"></span>Neon</button>
              <button type="button" class="palette-chip${(s.themePalette||"default")==="luxury"?" active":""}" data-palette="luxury"><span class="palette-swatch" style="background:linear-gradient(135deg,#0a0800 50%,#f5eec8 50%)"></span>Luxury</button>
              <button type="button" class="palette-chip${(s.themePalette||"default")==="metallo"?" active":""}" data-palette="metallo"><span class="palette-swatch" style="background:linear-gradient(135deg,#0c0e10 50%,#dce8f0 50%)"></span>Metallo</button>
              <button type="button" class="palette-chip${(s.themePalette||"default")==="pietra"?" active":""}" data-palette="pietra"><span class="palette-swatch" style="background:linear-gradient(135deg,#0e0d0c 50%,#ede0d0 50%)"></span>Pietra</button>
              <button type="button" class="palette-chip${(s.themePalette||"default")==="foresta"?" active":""}" data-palette="foresta"><span class="palette-swatch" style="background:linear-gradient(135deg,#060d06 50%,#c8e8b0 50%)"></span>Foresta</button>
              <button type="button" class="palette-chip${(s.themePalette||"default")==="legno"?" active":""}" data-palette="legno"><span class="palette-swatch" style="background:linear-gradient(135deg,#0c0800 50%,#f0dcc0 50%)"></span>Legno</button>
            </div>
          </div>
          <input type="hidden" name="themePalette" id="themePaletteInput" value="${s.themePalette||"default"}" />
        </div>

        <div class="actions" style="margin-top:24px;">
          <button class="btn primary" type="submit" style="width:100%">Salva impostazioni</button>
        </div>
      </form>
    </div>`;
}

function renderMenuGuide() {
  const section = (title, content) => `
    <details class="bsheet-guide-section">
      <summary class="bsheet-guide-summary">${title} <span>›</span></summary>
      <div class="bsheet-guide-body">${content}</div>
    </details>`;
  return `
    ${menuHeader("Guida", true)}
    <div class="bsheet-section-body">

      ${section("🗓 Creare un giro", `
        <ol>
          <li>Vai nella tab <b>Nuovo percorso</b>.</li>
          <li>Imposta <b>data</b> e <b>orario di partenza</b>.</li>
          <li>Scegli il punto di partenza con il pulsante 📋 (cerca in archivio) o 🗺 (scegli sulla mappa). Il punto di arrivo è uguale alla partenza per default; puoi cambiarlo separatamente.</li>
          <li>Cerca le tappe nella barra <b>"Cerca e aggiungi tappa"</b> e premi <b>+ Aggiungi</b>.</li>
          <li>Puoi anche aggiungere tappe manuali (non in archivio) aprendo la sezione <b>+ Manuale</b>.</li>
          <li>Premi <b>→ Ottimizza e salva</b>: il percorso viene calcolato nell'ordine ottimale rispettando gli orari di apertura di ogni tappa.</li>
        </ol>
      `)}

      ${section("📋 Tab Giri salvati", `
        <ul>
          <li>Mostra tutti i giri salvati in ordine cronologico.</li>
          <li>Tocca un giro per aprirlo nella tab <b>Percorso</b>.</li>
          <li>Il pulsante <b>✏ Rinomina</b> permette di dare un nome personalizzato al giro.</li>
          <li>Il pulsante <b>⎘ Copia</b> duplica il giro: utile per riutilizzare un giro simile in data diversa.</li>
          <li>Il pulsante <b>× Elimina</b> rimuove il giro.</li>
          <li>I giri mostrano un riepilogo: numero di tappe, km totali, data programmata.</li>
        </ul>
      `)}

      ${section("📍 Tab Percorso (risultato)", `
        <ul>
          <li>Ogni tappa mostra: <b>orario di arrivo stimato</b>, km e minuti di guida dalla tappa precedente, durata della visita.</li>
          <li>Bordo <span style="color:#ef4444;font-weight:700">rosso</span> = errore (sede chiusa oggi, arrivo fuori orario).</li>
          <li>Bordo <span style="color:#f59e0b;font-weight:700">ambra</span> = avviso (arrivo in anticipo, attesa apertura).</li>
          <li>Premi <b>⋯</b> su una tappa per vedere orari settimanali, avvisi dettagliati e meteo.</li>
          <li>Premi <b>↗ Naviga</b> per aprire il navigatore (impostabile in Impostazioni).</li>
          <li>Premi <b>📞</b> per chiamare direttamente il cliente.</li>
          <li>Puoi riordinare le tappe con i pulsanti <b>↑ ↓</b> e ricalcolare il percorso.</li>
          <li>Il pulsante <b>🖨 Stampa PDF</b> genera un foglio di viaggio stampabile (vedi sezione PDF).</li>
        </ul>
      `)}

      ${section("🖨 Stampa PDF del giro", `
        <ul>
          <li>Premi <b>🖨 Stampa PDF</b> nella tab Percorso.</li>
          <li>Si apre una schermata con due opzioni: <b>Includi telefoni</b> e <b>Includi costi</b>.</li>
          <li><b>Includi telefoni</b>: aggiunge il numero di telefono di ogni cliente nella stampa.</li>
          <li><b>Includi costi</b>: aggiunge il riepilogo economico (km, costo guida, costo lavoro, totale).</li>
          <li>Premi <b>Stampa</b> per aprire la finestra di stampa del browser. La scheda si chiude automaticamente dopo la stampa.</li>
        </ul>
      `)}

      ${section("📇 Gestione contatti (Archivio)", `
        <ul>
          <li>Vai su <b>Archivio → + Nuovo</b> per aggiungere un contatto manualmente.</li>
          <li>Compila <b>Nome/Cognome</b>, <b>Attività/Azienda</b>, <b>Sede/Città</b>, <b>Indirizzo completo</b>.</li>
          <li>I due campi telefono supportano: tipo (📱 cellulare, ☎ fisso, 📞 altro), numero e nome intestatario. La stella ★ indica quale numero chiamare per default.</li>
          <li>Gli <b>orari settimanali</b> si impostano giorno per giorno: puoi indicare orario mattina/pomeriggio, orario continuato o chiusura totale. Il tasto <b>Applica a tutti</b> copia l'orario di un giorno a tutti i giorni.</li>
          <li>Il campo <b>Durata default</b> determina quanto tempo viene allocato per la visita in un giro.</li>
          <li>Il tipo contatto (<b>Cliente</b>, <b>☕ Sosta</b>, <b>🍽 Ristorante</b>, <b>⭐ Preferito</b>) cambia il comportamento nel percorso.</li>
        </ul>
      `)}

      ${section("🗺 Completa con Maps (form contatto)", `
        <ul>
          <li>Durante la compilazione di un contatto, premi <b>🗺 Completa con Maps</b> (visibile nella sezione orari se Google Maps è attivo).</li>
          <li>Si apre una mappa a schermo intero centrata sull'indirizzo o le coordinate già inserite nel form. Se il form è vuoto, si apre sulla tua posizione GPS.</li>
          <li>Usa la <b>barra di ricerca</b> in alto per trovare un locale.</li>
          <li>Tocca qualsiasi <b>segnaposto</b> (POI) sulla mappa: compare in basso una scheda con nome e indirizzo.</li>
          <li>Premi <b>Usa</b> per importare automaticamente nel form i campi ancora vuoti: indirizzo, telefono, coordinate e orari di apertura settimanali.</li>
          <li>Solo i campi <b>vuoti</b> vengono modificati — quelli già compilati rimangono intatti.</li>
        </ul>
      `)}

      ${section("📱 Importa contatti da rubrica", `
        <ul>
          <li>Premi <b>📱 Importa</b> nell'Archivio.</li>
          <li>Seleziona un file <b>.vcf</b> (vCard) esportato dalla rubrica del telefono o un file <b>.csv</b>.</li>
          <li>L'app apre una procedura guidata: per ogni contatto del file puoi <b>verificare i dati</b>, modificarli e poi premere <b>Salva contatto</b>.</li>
          <li>Il pulsante <b>Salta →</b> passa al contatto successivo senza salvare.</li>
          <li>Il pulsante <b>× Esci</b> interrompe l'importazione mantenendo i contatti già salvati.</li>
          <li>Dopo l'importazione puoi usare <b>🗺 Completa con Maps</b> per aggiungere orari e dati mancanti.</li>
        </ul>
      `)}

      ${section("📅 Storico visite (calendario)", `
        <ul>
          <li>In ogni scheda contatto dell'Archivio, premi <b>📅 Storico visite</b> per aprire il calendario delle presenze.</li>
          <li><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#f59e0b;vertical-align:middle"></span> <b>Arancio</b> = ultimo giro passato in cui il cliente era incluso.</li>
          <li><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#3b82f6;vertical-align:middle"></span> <b>Blu</b> = altri giri passati.</li>
          <li><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#22c55e;vertical-align:middle"></span> <b>Verde</b> = giri futuri pianificati.</li>
          <li>Usa le frecce <b>‹ ›</b> per navigare tra i mesi.</li>
          <li>Tocca un giorno colorato per aprire quel giro nella tab Percorso.</li>
        </ul>
      `)}

      ${section(`${_svg('<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/>',15)} Soste automatiche`, `
        <ul>
          <li>Il sistema inserisce soste ogni <b>~2 ore</b> di guida+lavoro cumulati.</li>
          <li>Per soste in luoghi specifici, aggiungi contatti di tipo <b>☕ Sosta</b> nell'archivio: verranno usati per prime.</li>
          <li>Senza soste salvate, il sistema cerca punti di sosta tramite Google Maps nelle vicinanze.</li>
          <li>Regole automatiche: nessuna sosta nelle <b>prime 2 ore</b> di giornata, nell'<b>ultima ora prima del rientro</b>, nell'ora prima del pranzo né nelle 2 ore dopo.</li>
        </ul>
      `)}

      ${section("🎤 Comandi vocali", `
        <p>Apri il pannello 🎤 in fondo al form della tab Nuovo percorso e premi <b>● Avvia</b>. Puoi dire:</p>
        <ul>
          <li><code>aggiungi [nome cliente]</code> — aggiunge una tappa dall'archivio</li>
          <li><code>aggiungi X e aggiungi Y</code> — più tappe in un comando</li>
          <li><code>rimuovi [nome cliente]</code> — rimuove la tappa</li>
          <li><code>ottimizza</code> / <code>salva e vai</code> — calcola il percorso</li>
          <li><code>partenza alle 8</code> — cambia orario di partenza</li>
          <li><code>per il 10 giugno</code> / <code>domani</code> — cambia la data</li>
          <li><code>parto da [luogo]</code> — cambia il punto di partenza</li>
          <li><code>in anticipo di 10 minuti</code> — imposta minuti di anticipo arrivo</li>
        </ul>
        <p style="font-size:0.8rem;color:var(--muted);margin-top:6px;">Richiede Whisper configurato sul server.</p>
      `)}

      ${section("📊 Statistiche", `
        <ul>
          <li>Apri il menu ☰ e premi <b>📊 Statistiche</b>.</li>
          <li>Mostra il <b>totale km e giri per mese</b> dell'anno corrente.</li>
          <li>Mostra i <b>clienti più visitati</b>: numero di giri in cui compaiono e km medi.</li>
          <li>I dati vengono calcolati in tempo reale dai giri salvati.</li>
        </ul>
      `)}


    </div>`;
}

function renderMenuInfo() {
  return `
    ${menuHeader("Info app", true)}
    <div class="bsheet-section-body">
      <p class="stop-meta" style="margin-bottom:8px;">Percorsi lavoro — Versione 1.1</p>
      <p class="stop-meta">Pianificazione giornaliera giri commerciali con ottimizzazione automatica del percorso, gestione orari di apertura, soste automatiche e stima costi.</p>
      <p class="stop-meta" style="margin-top:12px;">Google Maps${state.mapApiConfigured ? " ✓ attivo" : " — non configurato (usa stime locali)"}. Whisper${state.whisperConfigured ? " ✓ attivo" : " — non configurato"}.</p>
    </div>`;
}

// ── data loading ──────────────────────────────────────────────────────────────

async function refreshAddresses() {
  if (!state.addressSearch && !state.archiveShowAll) {
    state.addresses = [];
    return;
  }
  const q = encodeURIComponent(state.addressSearch);
  state.addresses = await api(`/api/addresses?search=${q}`).catch(() => []);
}

async function refreshAddressesForRoute() {
  state.allAddresses = await api("/api/addresses?search=").catch(() => []);
}

async function refreshAllData() {
  await Promise.all([refreshAddresses(), refreshAddressesForRoute()]);
}

async function refreshSavedRoutes() {
  state.savedRoutes = await api("/api/routes").catch(() => []);
}

async function migrateContactNotes() {
  const MIGRATION_KEY = "contactNotesMigrated_v1";
  let done = false;
  try { done = localStorage.getItem(MIGRATION_KEY) === "1"; } catch {}
  if (done) return;

  const all = await api("/api/addresses?search=").catch(() => []);
  const emailRe = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;
  const phoneRe = /(?:\+39[\s.\-]?)?(?:0\d{1,4}[\s.\-]?\d{4,8}|3\d{2}[\s.\-]?\d{6,7})/;
  for (const addr of all) {
    const notes = addr.notes || "";
    if (!notes) continue;
    const needsEmail = !addr.email && emailRe.test(notes);
    const needsPhone = !addr.phone && phoneRe.test(notes);
    if (!needsEmail && !needsPhone) continue;
    const patch = { ...addr };
    if (needsEmail) patch.email = notes.match(emailRe)[0];
    if (needsPhone) patch.phone = notes.match(phoneRe)[0].trim();
    await api(`/api/addresses/${addr.id}`, { method: "PUT", body: JSON.stringify(patch) }).catch(() => {});
  }
  try { localStorage.setItem(MIGRATION_KEY, "1"); } catch {}
}

async function loadInitialData() {
  const [health, config, settings] = await Promise.all([
    api("/api/health").catch(() => ({})),
    api("/api/config").catch(() => ({})),
    api("/api/settings").catch(() => state.settings)
  ]);
  state.mapApiConfigured = health.mapApiConfigured || false;
  state.whisperConfigured = health.whisperConfigured || false;
  state.googleMapsKey = config.googleMapsKey || "";
  state.googleClientId = config.googleClientId || "";
  state.settings = settings;
  state.navigatorPref = settings.navigatorPref || localStorage.getItem("navigatorPref") || "google";
  state.themeMode = settings.themeMode || (settings.themePref === "light" ? "light" : settings.themePref === "dark" ? "dark" : "auto");
  state.themePalette = settings.themePalette || "default";
  state.route.lunchBreak = settings.lunchBreakEnabled !== false;
  state.route.lunchBreakMinutes = settings.lunchBreakMinutes || 45;
  if (settings.defaultStartLabel || settings.defaultStartAddress) {
    state.route.startLabel = settings.defaultStartLabel || state.route.startLabel;
    state.route.startAddress = settings.defaultStartAddress || state.route.startAddress;
    if (state.route.endSameAsStart) {
      state.route.endLabel = state.route.startLabel;
      state.route.endAddress = state.route.startAddress;
    }
  }
  applyTheme();
  document.querySelector("#map-status").textContent = state.mapApiConfigured ? "Google Maps" : "Stima locale";
  await Promise.all([refreshAddressesForRoute(), refreshSavedRoutes()]);
  migrateContactNotes().catch(() => {});
}

// ── normalize saved route ─────────────────────────────────────────────────────

function normalizeSavedRoute(route) {
  const rows = Array.isArray(route?.rows) ? route.rows : [];
  const lastRow = rows[rows.length - 1] || {};
  const finalLeg = route?.finalLeg || {};
  const summary = route?.summary || {};
  return {
    ...route, rows,
    weather: Array.isArray(route?.weather) ? route.weather : [],
    start: route?.start || { label: route?.startLabel || "Partenza", address: route?.startAddress || "" },
    end: route?.end || { label: route?.endLabel || "Arrivo", address: route?.endAddress || "" },
    finalLeg: {
      departureTime: finalLeg.departureTime || lastRow.serviceEndTime || "",
      driveMinutes: Number(finalLeg.driveMinutes || 0),
      km: Number(finalLeg.km || 0),
      arrivalTime: finalLeg.arrivalTime || lastRow.serviceEndTime || ""
    },
    summary: {
      totalKm: Number(summary.totalKm ?? route?.totalKm ?? 0),
      totalDriveMinutes: Number(summary.totalDriveMinutes || route?.totalDriveMinutes || 0),
      totalWorkMinutes: Number(summary.totalWorkMinutes || route?.totalWorkMinutes || rows.reduce((t, r) => t + Number(r.durationMinutes || 0), 0)),
      dayStart: summary.dayStart || route?.startTime || "--:--",
      dayEnd: summary.dayEnd || finalLeg.arrivalTime || "--:--",
      costKm: Number(summary.costKm || 0),
      costDrive: Number(summary.costDrive || 0),
      costWork: Number(summary.costWork || 0),
      totalCost: Number(summary.totalCost ?? route?.totalCost ?? 0),
      warnings: Array.isArray(summary.warnings) ? summary.warnings : []
    }
  };
}

// ── navigation helpers ────────────────────────────────────────────────────────

function routePoints(result) {
  const points = [];
  const s = result.start;
  if (s) points.push(s.address || s.fullAddress || s.label || "");
  for (const row of (result.rows || [])) {
    if (row.type === "lunch") continue; // lunch has no physical location
    if (row.type === "rest") {
      if (row.lat && row.lng) points.push(`${row.lat},${row.lng}`);
      else if (row.address) points.push(row.address);
      continue;
    }
    points.push(row.address || `${row.customer} ${row.location || ""}`);
  }
  const e = result.end;
  if (e) points.push(e.address || e.fullAddress || e.label || "");
  return points.filter(Boolean);
}

function navUrl(result, pref) {
  const pts = routePoints(result);
  if (!pts.length) return "#";
  if (pref === "apple") {
    const stops = pts.map(p => encodeURIComponent(p)).join("+to:");
    return `http://maps.apple.com/?daddr=${stops}`;
  }
  if (pref === "waze") {
    // Waze only supports a single destination; use the last stop before home
    const dest = pts[pts.length - 1];
    return `https://waze.com/ul?q=${encodeURIComponent(dest)}&navigate=yes`;
  }
  const origin = encodeURIComponent(pts[0]);
  const dest = encodeURIComponent(pts[pts.length - 1]);
  const wps = pts.slice(1, -1).map(p => encodeURIComponent(p)).join("|");
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}${wps ? "&waypoints=" + wps : ""}`;
}

function stopNavUrl(row, pref) {
  const addr = row.address || `${row.customer} ${row.location || ""}`;
  if (pref === "apple") return `http://maps.apple.com/?q=${encodeURIComponent(addr)}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
}

// ── Google Maps display ───────────────────────────────────────────────────────

let _mapsLoadPromise = null;

async function loadGoogleMapsScript() {
  if (state.googleMapsReady) return true;
  if (!state.googleMapsKey) return false;
  if (window.google?.maps) { state.googleMapsReady = true; return true; }
  // Coalesce concurrent calls into a single load attempt
  if (_mapsLoadPromise) return _mapsLoadPromise;
  _mapsLoadPromise = new Promise(resolve => {
    window.__gMapsCb = () => { state.googleMapsReady = true; _mapsLoadPromise = null; resolve(true); };
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${state.googleMapsKey}&libraries=places&callback=__gMapsCb`;
    s.onerror = () => { _mapsLoadPromise = null; resolve(false); };
    document.head.appendChild(s);
  });
  return _mapsLoadPromise;
}

async function renderGoogleMap(result) {
  const el = document.querySelector("#route-map");
  if (!el) return;
  const ready = await loadGoogleMapsScript();
  if (!ready || !window.google?.maps) { el.style.display = "none"; return; }

  // Geocode an address string using Google Geocoder
  const geocodeStr = (addressStr) => new Promise(resolve => {
    if (!addressStr) return resolve(null);
    new google.maps.Geocoder().geocode({ address: addressStr }, (res, st) => {
      if (st === "OK" && res[0]) {
        const loc = res[0].geometry.location;
        resolve({ lat: loc.lat(), lng: loc.lng() });
      } else resolve(null);
    });
  });

  // Enrich rows with coordinates — from payload, allAddresses cache, or geocoding
  const rawRows = result.rows || [];
  const rows = await Promise.all(rawRows.map(async row => {
    if (row.lat && row.lng) return row;
    const addr = state.allAddresses.find(a => String(a.id) === String(row.addressId));
    if (addr?.lat) return { ...row, lat: addr.lat, lng: addr.lng };
    const coord = await geocodeStr(row.fullAddress || row.address || `${row.customer} ${row.location || ""}`);
    return coord ? { ...row, ...coord } : row;
  }));

  const firstCoord = rows.find(r => r.lat) || result.start;
  const center = firstCoord?.lat ? { lat: Number(firstCoord.lat), lng: Number(firstCoord.lng) } : { lat: 46.0, lng: 11.0 };

  const map = new google.maps.Map(el, { center, zoom: 10, mapTypeControl: false, fullscreenControl: false });
  const bounds = new google.maps.LatLngBounds();
  let hasPoints = false;

  const addMarker = (lat, lng, label, title) => {
    if (!lat || !lng) return;
    const pos = { lat: Number(lat), lng: Number(lng) };
    new google.maps.Marker({ position: pos, map, title,
      label: { text: label, color: "#001110", fontWeight: "bold", fontSize: "11px" } });
    bounds.extend(pos);
    hasPoints = true;
  };

  const geocodeAddr = (addr) => geocodeStr(addr?.address || addr?.fullAddress || addr?.label || "");

  let startCoord = result.start?.lat ? { lat: Number(result.start.lat), lng: Number(result.start.lng) } : await geocodeAddr(result.start);
  let endCoord = result.end?.lat ? { lat: Number(result.end.lat), lng: Number(result.end.lng) } : await geocodeAddr(result.end);

  const addRestMarker = (lat, lng, title) => {
    if (!lat || !lng) return;
    const pos = { lat: Number(lat), lng: Number(lng) };
    new google.maps.Marker({ position: pos, map, title,
      label: { text: "☕", fontSize: "14px" },
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10,
              fillColor: "#7c3aed", fillOpacity: 0.9, strokeColor: "#fff", strokeWeight: 2 }
    });
    bounds.extend(pos);
    hasPoints = true;
  };

  if (startCoord) addMarker(startCoord.lat, startCoord.lng, "P", result.start?.label || "Partenza");
  for (const row of rows) {
    if (row.type === "lunch") continue;
    if (row.type === "rest") { addRestMarker(row.lat, row.lng, row.customer); continue; }
    addMarker(row.lat, row.lng, String(row.stopNumber), row.customer);
  }
  if (endCoord) addMarker(endCoord.lat, endCoord.lng, "A", result.end?.label || "Arrivo");

  if (hasPoints) map.fitBounds(bounds);

  // Draw route — include rest stops as waypoints so the polyline passes through them
  const allPoints = [];
  if (startCoord) allPoints.push(startCoord);
  for (const row of rows) {
    if (row.type === "lunch") continue;
    if (row.lat && row.lng) allPoints.push({ lat: Number(row.lat), lng: Number(row.lng) });
  }
  if (endCoord) allPoints.push(endCoord);

  const drawFallbackPolyline = () => {
    new google.maps.Polyline({
      path: allPoints.map(p => new google.maps.LatLng(p.lat, p.lng)),
      map,
      strokeColor: "#00a99d",
      strokeOpacity: 0.75,
      strokeWeight: 4
    });
  };

  if (allPoints.length >= 2) {
    const ds = new google.maps.DirectionsService();
    const dr = new google.maps.DirectionsRenderer({
      map,
      suppressMarkers: true,
      polylineOptions: { strokeColor: "#00a99d", strokeOpacity: 0.9, strokeWeight: 4 }
    });

    // Directions API max 25 waypoints; split if needed
    const origin = new google.maps.LatLng(allPoints[0].lat, allPoints[0].lng);
    const destination = new google.maps.LatLng(allPoints[allPoints.length - 1].lat, allPoints[allPoints.length - 1].lng);
    const waypoints = allPoints.slice(1, -1).slice(0, 23).map(p => ({ location: new google.maps.LatLng(p.lat, p.lng), stopover: true }));
    ds.route({
      origin, destination, waypoints,
      travelMode: google.maps.TravelMode.DRIVING
    }, (res, status) => {
      if (status === "OK") {
        dr.setDirections(res);
        const route = res.routes[0];
        if (route) {
          const b = new google.maps.LatLngBounds();
          route.legs.forEach(leg => { b.extend(leg.start_location); b.extend(leg.end_location); });
          map.fitBounds(b);
        }
      } else {
        drawFallbackPolyline();
      }
    });
  }
}

// ── render: route tab ─────────────────────────────────────────────────────────

function renderStopSuggestions() {
  const q = state.stopSearchText.trim().toLowerCase();
  if (!q) return "";
  const matches = state.allAddresses.filter(a =>
    [a.customer, a.activity, a.location, a.fullAddress].some(v => (v || "").toLowerCase().includes(q))
  ).slice(0, 8);
  if (!matches.length) return `<div class="stop-suggestion-empty">Nessun risultato</div>`;
  return matches.map(a => `
    <div class="stop-suggestion-item" data-suggest-id="${a.id}">
      <span class="stop-suggestion-name">${escapeHtml(addressName(a))}</span>
      <span class="stop-suggestion-addr">${escapeHtml(a.fullAddress)}</span>
    </div>`).join("");
}

function renderStops() {
  const q = state.stopFilter.trim().toLowerCase();
  const visible = q
    ? state.route.stops.filter(s =>
        [s.customer, s.activity, s.location, s.fullAddress].some(v => (v || "").toLowerCase().includes(q)))
    : state.route.stops;
  if (!state.route.stops.length) return `<div class="empty">Nessuna tappa inserita.</div>`;
  if (!visible.length) return `<div class="empty">Nessuna tappa corrisponde alla ricerca.</div>`;
  return `<div class="stop-list">${visible.map((stop, i) => {
    const globalIdx = state.route.stops.indexOf(stop);
    return `
    <article class="card stop-card">
      <div class="stop-head">
        <div>
          <p class="stop-title">${globalIdx + 1}. ${escapeHtml(stop.customer)} ${escapeHtml(stop.location || "")}</p>
          <div class="stop-meta">${escapeHtml(stop.fullAddress)}</div>
        </div>
        <button class="btn danger icon-btn" data-remove-stop="${stop.uid}" title="Rimuovi">${I.close(13)}</button>
      </div>
      <div class="form-grid three">
        <label class="field">Durata (min)<input type="number" min="5" step="5" value="${escapeHtml(stop.durationMinutes)}" data-stop="${stop.uid}:durationMinutes" /></label>
        <div class="field">${stopHoursHint(stop, state.route.scheduledDate)}</div>
        <div class="field"><span class="badge ${stop.recognized ? "ok" : "warning"}">${stop.recognized ? "Archivio" : "Da confermare"}</span></div>
      </div>
    </article>`;
  }).join("")}</div>`;
}

function syncEndIfSameAsStart() {
  if (!state.route.endSameAsStart) return;
  state.route.endLabel = state.route.startLabel;
  state.route.endAddress = state.route.startAddress;
  const nameEl = document.getElementById("rp-end-name");
  if (nameEl) nameEl.textContent = state.route.startLabel || state.route.startAddress || "= partenza";
  const lh = document.getElementById("rp-end-label-h");
  const ah = document.getElementById("rp-end-addr-h");
  if (lh) lh.value = state.route.endLabel;
  if (ah) ah.value = state.route.endAddress;
}

function renderRoute() {
  const r = state.route;
  const dm = r.timingMode;
  const startDisplay = r.startLabel || r.startAddress || "Imposta partenza";
  const endDisplay = r.endSameAsStart ? (r.startLabel || r.startAddress || "= partenza") : (r.endLabel || r.endAddress || "Imposta arrivo");
  app.innerHTML = `
    <form id="route-form" class="rp-form">

      <!-- Sezione 1: Quando -->
      <div class="rp-section">
        <div class="rp-when-row">
          <label class="rp-when-date">
            <span class="rp-label">Data</span>
            <input name="scheduledDate" type="date" value="${escapeHtml(r.scheduledDate)}" />
          </label>
          <label class="rp-when-time">
            <span class="rp-label">Partenza</span>
            <input name="startTime" type="time" value="${escapeHtml(r.startTime)}" />
          </label>
        </div>
        <div style="margin-top:8px;">
          <label class="rp-label" style="display:block;margin-bottom:4px;">Modalità arrivo</label>
          <select name="timingMode" style="width:100%;font-size:0.85rem;padding:6px 8px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--text);">
            <option value="first_open_minus" ${dm === "first_open_minus" ? "selected" : ""}>Prima dell'apertura</option>
            <option value="arrive_at" ${dm === "arrive_at" ? "selected" : ""}>Arrivo a orario fisso</option>
            <option value="depart_at" ${dm === "depart_at" ? "selected" : ""}>Partenza a orario fisso</option>
          </select>
        </div>
        ${dm === "first_open_minus" ? `<div style="margin-top:6px;"><label class="field">Anticipo (min)<input name="arrivalLeadMinutes" type="number" min="0" max="60" step="5" value="${escapeHtml(r.arrivalLeadMinutes)}" /></label></div>` : ""}
        ${dm === "arrive_at" ? `<div style="margin-top:6px;"><label class="field">Arrivo target<input name="firstArrivalTime" type="time" value="${escapeHtml(r.firstArrivalTime)}" /></label></div>` : ""}
      </div>

      <!-- Sezione 2: Da / A -->
      <div class="rp-section">
        <!-- Partenza -->
        <div class="rp-endpoint-card" id="rp-start-card">
          <div class="rp-ep-row">
            <span class="rp-endpoint-icon">${I.location(16)}</span>
            <span class="rp-endpoint-name" id="rp-start-name">${escapeHtml(startDisplay)}</span>
            <div class="rp-ep-actions">
              <button type="button" class="btn icon-btn rp-ep-nav" id="rp-start-map-btn" title="Scegli sulla mappa">${I.map(15)}</button>
              <button type="button" class="btn icon-btn" id="rp-start-archive-btn" title="Scegli dall'archivio">${I.contacts(15)}</button>
            </div>
          </div>
          <input type="hidden" name="startLabel" id="rp-start-label-h" value="${escapeHtml(r.startLabel)}" />
          <input type="hidden" name="startAddress" id="rp-start-addr-h" value="${escapeHtml(r.startAddress)}" />
          <div class="rp-archive-inline" id="rp-start-archive" style="display:none">
            <input id="rp-start-archive-search" placeholder="Cerca nell'archivio…" autocomplete="off" />
            <div class="stop-suggestions" id="rp-start-archive-suggestions"></div>
          </div>
        </div>
        <!-- Arrivo -->
        <div class="rp-endpoint-card rp-endpoint-card--end" id="rp-end-card">
          <div class="rp-ep-row">
            <span class="rp-endpoint-icon">${I.checkCircle(16)}</span>
            <span class="rp-endpoint-name" id="rp-end-name">${escapeHtml(endDisplay)}</span>
            <label class="rp-same-label" onclick="event.stopPropagation()">
              <input name="endSameAsStart" type="checkbox" id="rp-end-same" ${r.endSameAsStart ? "checked" : ""} />
              <span>= partenza</span>
            </label>
            <div class="rp-ep-actions" id="rp-end-ep-actions"${r.endSameAsStart ? ' style="display:none"' : ""}>
              <button type="button" class="btn icon-btn rp-ep-nav" id="rp-end-map-btn" title="Scegli sulla mappa">${I.map(15)}</button>
              <button type="button" class="btn icon-btn" id="rp-end-archive-btn" title="Scegli dall'archivio">${I.contacts(15)}</button>
            </div>
          </div>
          <input type="hidden" name="endLabel" id="rp-end-label-h" value="${escapeHtml(r.endLabel)}" />
          <input type="hidden" name="endAddress" id="rp-end-addr-h" value="${escapeHtml(r.endAddress)}" />
          <div class="rp-archive-inline" id="rp-end-archive" style="display:none">
            <input id="rp-end-archive-search" placeholder="Cerca nell'archivio…" autocomplete="off" />
            <div class="stop-suggestions" id="rp-end-archive-suggestions"></div>
          </div>
        </div>
      </div>

      <!-- Sezione 4: Pausa pranzo -->
      <div class="rp-section rp-lunch-row">
        <label class="rp-lunch-check">
          <input name="lunchBreak" type="checkbox" ${r.lunchBreak ? "checked" : ""} id="lunch-break-check" />
          <span>${I.fork(14)} Pausa pranzo</span>
        </label>
        <input name="lunchBreakMinutes" type="number" min="15" max="120" step="5"
          value="${escapeHtml(r.lunchBreakMinutes)}" id="lunch-break-minutes"
          class="rp-lunch-min" ${!r.lunchBreak ? "style=\"display:none\"" : ""} />
        <span class="rp-lunch-unit" ${!r.lunchBreak ? 'style="display:none"' : ""}>min</span>
      </div>

      <!-- Sezione 5: Tappe -->
      <div class="rp-section rp-stops-section" id="stops-aside">
        <h2 class="rp-stops-title">Tappe (${state.route.stops.length})</h2>
        <div class="rp-add-stop-panel" id="rp-add-stop-panel">
          <div style="position:relative;">
            <input id="stop-search" placeholder="Cerca e aggiungi tappa…" value="${escapeHtml(state.stopSearchText)}" autocomplete="off" />
            <input type="hidden" name="selectedAddressId" value="${escapeHtml(state.route.selectedAddressId)}" id="selected-address-id" />
            <div id="stop-suggestions" class="stop-suggestions">${renderStopSuggestions()}</div>
          </div>
          <div class="rp-add-stop-actions">
            <button type="button" class="btn" id="add-saved-stop">${I.plus(14)} Aggiungi</button>
            <button type="button" class="btn ghost" id="rp-manual-stop-toggle">+ Manuale</button>
          </div>
          <div id="rp-manual-stop-panel" style="display:none">
            <div class="form-grid route-fields" style="margin-top:8px;">
              <label class="field">Cliente<input name="customCustomer" id="rp-custom-customer" value="${escapeHtml(r.customCustomer)}" /></label>
              <label class="field">Sede<input name="customLocation" value="${escapeHtml(r.customLocation)}" /></label>
              <label class="field full">
                Indirizzo<input name="customAddress" id="rp-custom-address" value="${escapeHtml(r.customAddress)}" />
              </label>
              ${state.googleMapsKey ? `<div class="field full" style="padding-top:0"><button type="button" class="btn" id="rp-custom-map-btn">${I.map(14)} Scegli sulla mappa</button></div>` : ""}
              <input type="hidden" id="rp-custom-lat" value="" />
              <input type="hidden" id="rp-custom-lng" value="" />
              <label class="field">Durata (min)<input name="customDuration" type="number" min="5" step="5" value="${escapeHtml(r.customDuration)}" /></label>
            </div>
            ${renderWeeklyHoursSection(r.customWeeklyHours || null)}
            <div class="actions" style="margin-top:8px;">
              <button type="button" class="btn" id="add-custom-stop">+ Salva e aggiungi</button>
            </div>
          </div>
        </div>
        <div class="rp-stop-filter-row" ${state.route.stops.length ? "" : 'style="display:none"'}>
          <input id="stop-filter" placeholder="Filtra tappe…" value="${escapeHtml(state.stopFilter)}" />
        </div>
        ${renderStops()}
      </div>

      <!-- Pulsante sticky -->
      <div class="rp-plan-sticky">
        <button type="button" class="btn primary" id="plan-route" style="width:100%">${state.planning ? "Calcolo in corso…" : `${I.navigate(14)} Ottimizza e salva`}</button>
      </div>

      <!-- Comando vocale (in fondo, non prominente) -->
      <div class="rp-section">
        <details class="panel-details">
          <summary>🎤 Comando vocale
            <details class="voice-help-wrap" style="display:inline-block;margin-left:8px;">
              <summary class="btn ghost" style="min-height:24px;padding:0 6px;font-size:0.75rem;list-style:none">❓</summary>
              <div class="voice-help-panel">
                <ul>
                  <li><b>aggiungi [nome cliente]</b> — aggiunge tappa dall'archivio</li>
                  <li><b>aggiungi X e aggiungi Y</b> — più tappe in un comando</li>
                  <li><b>rimuovi [nome cliente]</b> — rimuove la tappa</li>
                  <li><b>ottimizza</b> · <b>salva e vai</b> — calcola il percorso</li>
                  <li><b>partenza alle 8</b> — cambia orario di partenza</li>
                  <li><b>primo arrivo alle 9:30</b> — orario primo cliente</li>
                  <li><b>in anticipo di 10 minuti</b> — minuti prima apertura</li>
                  <li><b>per il 10 giugno</b> · <b>domani</b> — cambia la data</li>
                  <li><b>parto da [luogo]</b> — cambia punto di partenza</li>
                </ul>
              </div>
            </details>
          </summary>
          <label class="field" style="margin-top:8px;"><textarea name="transcript" id="transcript">${escapeHtml(r.transcript)}</textarea></label>
          <div class="actions" style="margin-top:6px;">
            <button type="button" class="btn${state.voiceRecording ? " recording" : ""}" id="listen-command">${state.voiceRecording ? `${I.micStop(14)} Stop` : `${I.mic(14)} Avvia`}</button>
            <button type="button" class="btn" id="apply-command">${I.check(14)} Applica</button>
          </div>
        </details>
      </div>

    </form>`;

  // Manual stop panel toggle
  const manualToggle = document.getElementById("rp-manual-stop-toggle");
  const manualPanel = document.getElementById("rp-manual-stop-panel");
  if (manualToggle && manualPanel) {
    manualToggle.addEventListener("click", () => {
      manualPanel.style.display = manualPanel.style.display === "none" ? "block" : "none";
    });
  }

  // Lunch break inline toggle
  const lunchCheck = document.getElementById("lunch-break-check");
  const lunchMin = document.getElementById("lunch-break-minutes");
  const lunchUnit = document.querySelector(".rp-lunch-unit");
  if (lunchCheck) {
    lunchCheck.addEventListener("change", () => {
      if (lunchMin) lunchMin.style.display = lunchCheck.checked ? "" : "none";
      if (lunchUnit) lunchUnit.style.display = lunchCheck.checked ? "" : "none";
    });
  }

  // Map picker buttons for start/end
  document.querySelectorAll(".rp-map-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const labelName = btn.dataset.mapLabel;
      const addrName = btn.dataset.mapAddress;
      const form = document.getElementById("route-form");
      openMapPickerForField({
        labelEl: form.querySelector(`[name="${labelName}"]`),
        addressEl: form.querySelector(`[name="${addrName}"]`)
      });
    });
  });

  // Archive inline search helper
  const bindArchiveSearch = ({ btnId, panelId, searchId, sugId, labelHiddenId, addrHiddenId, nameDisplayId, mapsLinkSelector, dataAttr, onSelect }) => {
    const btn = document.getElementById(btnId);
    const panel = document.getElementById(panelId);
    const search = document.getElementById(searchId);
    const sug = document.getElementById(sugId);
    if (!btn || !panel || !search || !sug) return;
    btn.addEventListener("click", () => {
      panel.style.display = panel.style.display === "none" ? "block" : "none";
      if (panel.style.display !== "none") search.focus();
    });
    search.addEventListener("input", () => {
      const q = search.value.toLowerCase();
      const matches = state.allAddresses.filter(a => {
        const n = (a.customer + " " + (a.location || "") + " " + (a.fullAddress || "")).toLowerCase();
        return q && n.includes(q);
      }).slice(0, 8);
      sug.innerHTML = matches.map(a =>
        `<div class="stop-suggestion-item" data-${dataAttr}="${escapeHtml(a.id)}">${escapeHtml(addressName(a))}<span class="stop-meta">${escapeHtml(a.fullAddress || "")}</span></div>`
      ).join("");
    });
    sug.addEventListener("click", e => {
      const item = e.target.closest(`[data-${dataAttr}]`);
      if (!item) return;
      const addr = state.allAddresses.find(a => String(a.id) === item.dataset[dataAttr.replace(/-([a-z])/g, (_, c) => c.toUpperCase())]);
      if (!addr) return;
      const labelH = document.getElementById(labelHiddenId);
      const addrH = document.getElementById(addrHiddenId);
      const nameEl = document.getElementById(nameDisplayId);
      if (labelH) labelH.value = addr.customer || "";
      if (addrH) addrH.value = addr.fullAddress || "";
      if (nameEl) nameEl.textContent = addr.customer || addr.fullAddress || "";
      // Update state immediately
      if (onSelect) onSelect(addr);
      // Update Maps link
      const mapsLink = document.querySelector(mapsLinkSelector);
      if (mapsLink) mapsLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr.fullAddress || "")}`;
      panel.style.display = "none";
      search.value = "";
      sug.innerHTML = "";
    });
  };

  bindArchiveSearch({
    btnId: "rp-start-archive-btn", panelId: "rp-start-archive",
    searchId: "rp-start-archive-search", sugId: "rp-start-archive-suggestions",
    labelHiddenId: "rp-start-label-h", addrHiddenId: "rp-start-addr-h",
    nameDisplayId: "rp-start-name", mapsLinkSelector: "#rp-start-card .rp-ep-nav",
    dataAttr: "rp-addr-start",
    onSelect: addr => {
      state.route.startLabel = addr.customer || "";
      state.route.startAddress = addr.fullAddress || "";
      syncEndIfSameAsStart();
    }
  });

  bindArchiveSearch({
    btnId: "rp-end-archive-btn", panelId: "rp-end-archive",
    searchId: "rp-end-archive-search", sugId: "rp-end-archive-suggestions",
    labelHiddenId: "rp-end-label-h", addrHiddenId: "rp-end-addr-h",
    nameDisplayId: "rp-end-name", mapsLinkSelector: "#rp-end-card .rp-ep-nav",
    dataAttr: "rp-addr-end",
    onSelect: addr => { state.route.endLabel = addr.customer || ""; state.route.endAddress = addr.fullAddress || ""; }
  });

  // Map picker buttons for start/end endpoints
  const bindMapBtn = (btnId, labelHiddenId, addrHiddenId, nameDisplayId, stateKey) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener("click", () => {
      const labelEl = document.getElementById(labelHiddenId);
      const addressEl = document.getElementById(addrHiddenId);
      openMapPickerForField({
        labelEl, addressEl,
        onConfirm: (label, address) => {
          if (labelEl) labelEl.value = label;
          if (addressEl) addressEl.value = address;
          const nameEl = document.getElementById(nameDisplayId);
          if (nameEl) nameEl.textContent = label || address || "";
          state.route[stateKey + "Label"] = label;
          state.route[stateKey + "Address"] = address;
          if (stateKey === "start") syncEndIfSameAsStart();
        }
      });
    });
  };
  bindMapBtn("rp-start-map-btn", "rp-start-label-h", "rp-start-addr-h", "rp-start-name", "start");
  bindMapBtn("rp-end-map-btn", "rp-end-label-h", "rp-end-addr-h", "rp-end-name", "end");
}

// ── weekly hours helper ───────────────────────────────────────────────────────

const DAYS_IT = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

function renderWeeklyHoursSection(weeklyHours) {
  const wh = weeklyHours || {};
  const rows = [1,2,3,4,5,6,0].map(d => {
    const h = wh[d] || wh[String(d)] || {};
    const closed = h.closed ? "checked" : "";
    const cont = h.continuous ? "checked" : "";
    const dis = h.closed ? "disabled" : "";
    const disC = (h.closed || h.continuous) ? "disabled" : "";
    return `<div class="wh-row" data-day="${d}">
      <div class="wh-row-top">
        <span class="wh-dn">${DAYS_IT[d]}</span>
        <label class="wh-toggle"><input type="checkbox" class="wh-closed" ${closed}> Chiuso</label>
        <label class="wh-toggle"><input type="checkbox" class="wh-cont" ${cont} ${dis}> Cont.</label>
      </div>
      <div class="wh-row-times"${h.closed ? ' style="display:none"' : ''}>
        <div class="wh-range">
          <input type="time" class="wh-om" value="${h.openMorning || ""}" ${dis}>
          <span>–</span>
          <input type="time" class="wh-cm" value="${h.closeMorning || ""}" ${disC}>
        </div>
        <div class="wh-range">
          <input type="time" class="wh-oa" value="${h.openAfternoon || ""}" ${disC}>
          <span>–</span>
          <input type="time" class="wh-ca" value="${h.closeAfternoon || ""}" ${dis}>
        </div>
      </div>
    </div>`;
  }).join("");
  return `<div class="field full">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px;flex-wrap:wrap;">
      <label class="wh-label" style="margin-bottom:0">Orari settimanali</label>
      <div style="display:flex;gap:6px;">
        ${state.googleMapsKey ? `<button type="button" class="btn" id="complete-with-maps-btn" data-cwm-btn>${I.map(14)} Completa con Maps</button>` : ""}
        <button type="button" class="btn wh-fill-all" id="wh-fill-all-btn">${I.arrowDown(14)} Applica a tutti</button>
      </div>
    </div>
    <div class="wh-days-wrap">${rows}</div>
  </div>`;
}

function stopHoursHint(stop, scheduledDate) {
  const wh = stop.weeklyHours;
  if (!wh) {
    const parts = [];
    if (stop.openMorning && stop.closeMorning) parts.push(`${stop.openMorning}–${stop.closeMorning}`);
    if (stop.openAfternoon && stop.closeAfternoon) parts.push(`${stop.openAfternoon}–${stop.closeAfternoon}`);
    const txt = parts.join(" / ") || "Orari non impostati";
    return `<span class="stop-meta">${txt}</span>`;
  }
  const dow = scheduledDate ? new Date(scheduledDate + "T12:00:00").getDay() : new Date().getDay();
  const day = wh[dow] || wh[String(dow)];
  if (!day) return `<span class="stop-meta">—</span>`;
  if (day.closed) return `<span class="badge badge-error">Chiuso ${DAYS_IT[dow]}</span>`;
  if (day.continuous) return `<span class="stop-meta">${day.openMorning}–${day.closeAfternoon} <span style="opacity:.6">(cont.)</span></span>`;
  const parts = [];
  if (day.openMorning && day.closeMorning) parts.push(`${day.openMorning}–${day.closeMorning}`);
  if (day.openAfternoon && day.closeAfternoon) parts.push(`${day.openAfternoon}–${day.closeAfternoon}`);
  return `<span class="stop-meta">${DAYS_IT[dow]}: ${parts.join(" / ") || "—"}</span>`;
}

function weeklyHoursSummary(a) {
  const wh = a.weeklyHours;
  if (!wh) {
    const parts = [];
    if (a.openMorning && a.closeMorning) parts.push(`${a.openMorning}–${a.closeMorning}`);
    if (a.openAfternoon && a.closeAfternoon) parts.push(`${a.openAfternoon}–${a.closeAfternoon}`);
    return parts.join(" / ") || "—";
  }
  const today = new Date().getDay();
  const d = wh[today] || wh[String(today)];
  if (!d) return "—";
  if (d.closed) return "Oggi chiuso";
  if (d.continuous) return d.openMorning && d.closeAfternoon ? `${d.openMorning}–${d.closeAfternoon} cont.` : "—";
  const parts = [];
  if (d.openMorning && d.closeMorning) parts.push(`${d.openMorning}–${d.closeMorning}`);
  if (d.openAfternoon && d.closeAfternoon) parts.push(`${d.openAfternoon}–${d.closeAfternoon}`);
  return parts.join(" / ") || "—";
}

function deriveHoursFromWeekly(wh) {
  if (!wh) return { openMorning: "", closeMorning: "", openAfternoon: "", closeAfternoon: "" };
  // Use Monday (1) or first non-closed weekday
  const day = wh[1] || wh[2] || wh[3] || wh[4] || wh[5] || Object.values(wh).find(d => !d.closed);
  if (!day || day.closed) return { openMorning: "", closeMorning: "", openAfternoon: "", closeAfternoon: "" };
  if (day.continuous) return { openMorning: day.openMorning || "", closeMorning: "", openAfternoon: "", closeAfternoon: day.closeAfternoon || "" };
  return { openMorning: day.openMorning || "", closeMorning: day.closeMorning || "", openAfternoon: day.openAfternoon || "", closeAfternoon: day.closeAfternoon || "" };
}

function readWeeklyHours() {
  const result = {};
  document.querySelectorAll(".wh-row").forEach(row => {
    const d = Number(row.dataset.day);
    const closed = row.querySelector(".wh-closed")?.checked;
    const cont = row.querySelector(".wh-cont")?.checked;
    const om = row.querySelector(".wh-om")?.value || "";
    const cm = row.querySelector(".wh-cm")?.value || "";
    const oa = row.querySelector(".wh-oa")?.value || "";
    const ca = row.querySelector(".wh-ca")?.value || "";
    if (closed || om || cm || oa || ca) {
      result[d] = { closed: !!closed, continuous: !!cont, openMorning: om, closeMorning: cont ? "" : cm, openAfternoon: cont ? "" : oa, closeAfternoon: ca };
    }
  });
  return Object.keys(result).length ? result : null;
}

// ── render: saved tab ─────────────────────────────────────────────────────────

function renderSaved() {
  app.innerHTML = `
    <section class="panel">
      <div class="section-head">
        <h2>Giri salvati</h2>
        <button class="btn" id="refresh-routes" title="Aggiorna">${I.refresh(14)}</button>
      </div>
      <div class="saved-list">
        ${state.savedRoutes.map(route => `
          <article class="card saved-card">
            <p class="saved-card-name">${escapeHtml(route.name)}</p>
            <div class="saved-card-info">
              <input type="date" class="saved-date-input" data-reschedule-route="${route.id}" value="${escapeHtml(route.scheduledDate || "")}" title="Cambia data e ricalcola" />
              <span>${escapeHtml(route.startTime || "--:--")}</span>
              <span>${Number(route.totalKm).toFixed(1)} km</span>
              <span>${euro(route.totalCost)}</span>
            </div>
            <div class="stop-meta saved-card-route">${escapeHtml(route.startLabel || "—")} → ${escapeHtml(route.endLabel || "—")}</div>
            <div class="saved-card-btns">
              <button class="btn primary saved-card-btn" data-open-route="${route.id}">${I.play(13)} Apri</button>
              <div class="saved-card-btns-actions">
                <button class="btn saved-card-btn" data-rename-route="${route.id}" title="Rinomina">${I.edit(13)} Rinomina</button>
                <button class="btn saved-card-btn" data-duplicate-route="${route.id}" title="Duplica">${I.copy(13)} Duplica</button>
                <button class="btn danger saved-card-btn" data-delete-route="${route.id}" title="Elimina">${I.trash(13)} Elimina</button>
              </div>
            </div>
            ${route.plannedStops?.length ? `<div class="saved-stops-list">${route.plannedStops.filter((s, i, arr) => !s.stopPart || s.stopPart === "morning" || arr.findIndex(x => x.addressId === s.addressId) === i).map((s, i) => { const isRest = s.addressType === "rest" || s.customer?.includes("⭐") || s.customer?.includes("★"); return `<span class="saved-stop-chip">${i + 1}. ${escapeHtml(s.customer)}${!isRest && s.location ? ` — ${escapeHtml(s.location)}` : ""}</span>`; }).join("")}</div>` : ""}
          </article>`).join("") || `<div class="empty">Nessun giro salvato.</div>`}
      </div>
    </section>`;
}

// ── visit calendar helpers ────────────────────────────────────────────────────

function getVisitDates(addressId) {
  // Returns array of { date: "YYYY-MM-DD", routeId, name, isPast }
  const today = new Date().toISOString().slice(0, 10);
  const visits = [];
  for (const r of state.savedRoutes) {
    const stops = Array.isArray(r.plannedStops) ? r.plannedStops
      : Array.isArray(r.rows) ? r.rows.filter(row => !row.type)
      : [];
    if (stops.some(s => s.addressId != null && String(s.addressId) === String(addressId))) {
      visits.push({ date: r.scheduledDate || "", routeId: r.id, name: r.name || "Giro senza nome", isPast: (r.scheduledDate || "") <= today });
    }
  }
  return visits.sort((a, b) => a.date.localeCompare(b.date));
}

function renderVisitCalendar(addressId) {
  const visits = getVisitDates(addressId);
  if (!visits.length) return `<div class="visit-history-empty">Nessun giro salvato include questa tappa</div>`;

  const cal = state.visitCalendar[addressId];
  const today = new Date();
  const lastPast = [...visits].filter(v => v.isPast).pop();
  const defaultDate = lastPast ? new Date(lastPast.date + "T00:00:00") : today;
  const year = cal?.year ?? defaultDate.getFullYear();
  const month = cal?.month ?? defaultDate.getMonth(); // 0-based

  const byDate = {};
  for (const v of visits) byDate[v.date] = v;

  // Calendar grid
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // Mon=0
  const monthName = firstDay.toLocaleDateString("it-IT", { month: "long", year: "numeric" });

  const prevM = month === 0 ? `data-vcal-nav="${addressId}:${year - 1}:11"` : `data-vcal-nav="${addressId}:${year}:${month - 1}"`;
  const nextM = month === 11 ? `data-vcal-nav="${addressId}:${year + 1}:0"` : `data-vcal-nav="${addressId}:${year}:${month + 1}"`;

  const days = ["L","M","M","G","V","S","D"];
  let cells = days.map(d => `<span class="vcal-head">${d}</span>`).join("");
  for (let i = 0; i < startDow; i++) cells += `<span></span>`;
  const todayStr = today.toISOString().slice(0, 10);
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const v = byDate[dateStr];
    let cls = "vcal-day";
    if (v) {
      if (lastPast && v.date === lastPast.date) cls += " vcal-last";
      else if (v.isPast) cls += " vcal-past";
      else cls += " vcal-future";
    }
    if (dateStr === todayStr) cls += " vcal-today";
    const attrs = v ? ` data-load-route="${v.routeId}" title="${escapeHtml(v.name)}"` : "";
    cells += `<span class="${cls}"${attrs}>${d}</span>`;
  }

  return `<div class="vcal">
    <div class="vcal-header">
      <button class="btn vcal-nav" ${prevM}>‹</button>
      <span class="vcal-month">${monthName}</span>
      <button class="btn vcal-nav" ${nextM}>›</button>
    </div>
    <div class="vcal-grid">${cells}</div>
    <div class="vcal-legend">
      <span class="vcal-dot vcal-last"></span>Ultimo&nbsp;
      <span class="vcal-dot vcal-past"></span>Passato&nbsp;
      <span class="vcal-dot vcal-future"></span>Futuro
    </div>
  </div>`;
}

// ── render: archive tab ───────────────────────────────────────────────────────

function renderArchive() {
  const form = state.addressForm;
  const showingResults = state.archiveShowAll || state.addressSearch;
  app.innerHTML = `
    <section class="grid">
      <div class="panel">
        <div class="section-head">
          <h2>Archivio</h2>
          <div class="row">
            <button class="btn" id="import-contacts">${I.upload(14)} Importa</button>
            ${state.googleClientId ? `<button class="btn" id="import-google-contacts">${I.link(14)} Google</button>` : ""}
            <button class="btn" id="new-address">${I.plus(14)} Nuovo</button>
          </div>
        </div>
        <div class="row" style="gap:8px; margin-bottom:10px;">
          <input id="archive-search" placeholder="Cerca per nome, città, indirizzo…" value="${escapeHtml(state.addressSearch)}" style="flex:1" autocomplete="off" />
          ${showingResults
            ? `<button class="btn" id="hide-all-addresses">${I.eyeOff(14)} Nascondi</button>`
            : `<button class="btn" id="show-all-addresses">${I.eye(14)} Mostra tutti</button>`}
        </div>
        <input id="vcf-input" type="file" accept=".vcf,.vcard,.csv" style="display:none" />
        <div class="archive-list">
          ${!showingResults
            ? `<div class="empty" style="grid-column:1/-1">Cerca un contatto per nome o città, oppure premi <b>Mostra tutti</b>.</div>`
            : state.addresses.map(a => `
            <article class="card archive-card">
              <p class="stop-title">${a.addressType === "rest" ? "☕ " : a.addressType === "restaurant" ? "🍽 " : a.addressType === "favorite" ? "⭐ " : ""}${escapeHtml(a.activity || a.customer)}</p>
              ${a.activity ? `<div class="stop-meta" style="font-weight:600">👤 ${escapeHtml(a.customer)}</div>` : ""}
              <div class="stop-meta">${escapeHtml(a.fullAddress)}</div>
              ${a.phone ? `<div class="stop-meta">${phoneIcon(a.phoneType)} ${escapeHtml(a.phone)}${a.phoneName ? ` <span class="phone-name-badge">${escapeHtml(a.phoneName)}</span>` : ""}${a.phonePreferred === "phone" && a.phone2 ? " ★" : ""}</div>` : ""}
              ${a.phone2 ? `<div class="stop-meta">${phoneIcon(a.phone2Type)} ${escapeHtml(a.phone2)}${a.phone2Name ? ` <span class="phone-name-badge">${escapeHtml(a.phone2Name)}</span>` : ""}${a.phonePreferred === "phone2" ? " ★" : ""}</div>` : ""}
              ${a.email ? `<div class="stop-meta">${I.email(13)} ${escapeHtml(a.email)}</div>` : ""}
              <div class="stop-meta">${weeklyHoursSummary(a)}</div>
              <div class="actions">
                ${a.phone ? `<a class="btn" href="tel:${escapeHtml(a.phone)}" title="${escapeHtml(a.phoneName || a.phone)}">${phoneIcon(a.phoneType)}</a>` : ""}
                ${a.phone2 ? `<a class="btn" href="tel:${escapeHtml(a.phone2)}" title="${escapeHtml(a.phone2Name || a.phone2)}">${phoneIcon(a.phone2Type)}</a>` : ""}
                ${a.email ? `<a class="btn icon-btn" href="mailto:${escapeHtml(a.email)}" title="${escapeHtml(a.email)}">${I.email(15)}</a>` : ""}
                <button class="btn icon-btn" data-check-opening="${a.id}" title="Verifica orari apertura">${I.clock(15)}</button>
                <button class="btn" data-edit-address="${a.id}">${I.edit(13)} Modifica</button>
                <button class="btn danger icon-btn" data-delete-address="${a.id}" title="Elimina">${I.trash(14)}</button>
              </div>
              <div class="opening-status" id="opening-status-${a.id}" style="display:none"></div>
              <details class="visit-history-details" ${state.visitCalendar[a.id] !== undefined ? "open" : ""}>
                <summary class="visit-history-toggle">📅 Storico visite</summary>
                ${renderVisitCalendar(a.id)}
              </details>
            </article>`).join("") || `<div class="empty" style="grid-column:1/-1">Nessun contatto trovato.</div>`}
        </div>
      </div>

      <form class="panel" id="address-form">
        ${state.importWizard ? `
          <div class="import-wizard-banner">
            <div>
              <span class="import-wizard-step">Contatto ${state.importWizard.index + 1} di ${state.importWizard.contacts.length}</span>
              <span class="stop-meta"> · ${state.importWizard.saved} salvati, ${state.importWizard.skipped} saltati</span>
            </div>
            <div style="display:flex;gap:6px;">
              <button type="button" class="btn" id="wizard-skip">Salta ${I.arrowR(14)}</button>
              <button type="button" class="btn danger" id="wizard-abort">${I.close(13)} Esci</button>
            </div>
          </div>` : ""}
        <h2>${state.importWizard ? "Verifica e salva" : form.id ? "Modifica contatto" : "Nuovo contatto"}</h2>
        <div class="form-grid">
          <label class="field">Nome / Cognome<input name="customer" value="${escapeHtml(form.customer)}" required placeholder="Mario Rossi" /></label>
          <label class="field">Attività / Azienda<input name="activity" value="${escapeHtml(form.activity || "")}" placeholder="Intesa Sanpaolo" /></label>
          <label class="field">Sede / Città<input name="location" value="${escapeHtml(form.location)}" /></label>
          <label class="field full">Indirizzo completo<input name="fullAddress" value="${escapeHtml(form.fullAddress)}" required /></label>
          <div class="field full phone-group">
            <div class="phone-row">
              <label class="phone-pref-star" title="Preferito"><input type="radio" name="phonePreferred" value="phone" ${form.phonePreferred !== "phone2" ? "checked" : ""} />★</label>
              <select name="phoneType" class="phone-type-select">
                <option value="cell" ${form.phoneType === "cell" ? "selected" : ""}>Cell</option>
                <option value="fisso" ${form.phoneType === "fisso" ? "selected" : ""}>Fisso</option>
                <option value="altro" ${form.phoneType === "altro" ? "selected" : ""}>Altro</option>
              </select>
              <input name="phone" type="tel" value="${escapeHtml(form.phone)}" placeholder="Tel 1" style="flex:2;min-width:0" />
              <input name="phoneName" value="${escapeHtml(form.phoneName)}" placeholder="Intestatario" style="flex:1;min-width:0" />
            </div>
            <div class="phone-row">
              <label class="phone-pref-star" title="Preferito"><input type="radio" name="phonePreferred" value="phone2" ${form.phonePreferred === "phone2" ? "checked" : ""} />★</label>
              <select name="phone2Type" class="phone-type-select">
                <option value="cell" ${form.phone2Type === "cell" ? "selected" : ""}>Cell</option>
                <option value="fisso" ${form.phone2Type === "fisso" ? "selected" : ""}>Fisso</option>
                <option value="altro" ${form.phone2Type === "altro" ? "selected" : ""}>Altro</option>
              </select>
              <input name="phone2" type="tel" value="${escapeHtml(form.phone2)}" placeholder="Tel 2" style="flex:2;min-width:0" />
              <input name="phone2Name" value="${escapeHtml(form.phone2Name)}" placeholder="Intestatario" style="flex:1;min-width:0" />
            </div>
          </div>
          <label class="field">Tipo contatto<select name="addressType">
            <option value="customer" ${!form.addressType || form.addressType === "customer" ? "selected" : ""}>Cliente</option>
            <option value="rest" ${form.addressType === "rest" ? "selected" : ""}>Sosta (bar/autogrill)</option>
            <option value="restaurant" ${form.addressType === "restaurant" ? "selected" : ""}>Ristorante (pranzo)</option>
            <option value="favorite" ${form.addressType === "favorite" ? "selected" : ""}>Preferito (casa, ecc.)</option>
          </select></label>
          <label class="field">Email<input name="email" type="email" value="${escapeHtml(form.email)}" /></label>
          <label class="field full">Note<textarea name="notes" id="contact-notes">${escapeHtml(form.notes)}</textarea></label>
          ${renderWeeklyHoursSection(form.weeklyHours)}
          <label class="field">Durata abituale (min)<input name="defaultDuration" type="number" min="5" step="5" value="${escapeHtml(form.defaultDuration)}" /></label>
          <div class="field full">
            <label>Coordinate GPS</label>
            <div class="coord-actions">
              <button type="button" class="btn" id="use-current-pos">${I.location(14)} Posizione attuale</button>
              ${state.googleMapsKey ? `<button type="button" class="btn" id="open-map-picker">${I.map(14)} Scegli sulla mappa</button>` : ""}
            </div>
            <div class="form-grid" style="margin-top:8px;">
              <label class="field">Latitudine<input name="lat" id="coord-lat" type="number" step="0.000001" value="${escapeHtml(form.lat ?? "")}" /></label>
              <label class="field">Longitudine<input name="lng" id="coord-lng" type="number" step="0.000001" value="${escapeHtml(form.lng ?? "")}" /></label>
            </div>
          </div>
        </div>
        <div class="actions">
          <button class="btn primary" type="submit">${state.importWizard ? "Salva e prossimo →" : "Salva"}</button>
          ${!state.importWizard ? `<button class="btn ghost" type="button" id="cancel-address">Annulla</button>` : ""}
        </div>
      </form>
    </section>`;
}

// ── render: result tab ────────────────────────────────────────────────────────

function weatherIcon(w) {
  const t = `${w.description || ""} ${(w.warnings || []).join(" ")}`.toLowerCase();
  if (t.includes("temporale")) return "⛈";
  if (t.includes("vento")) return "💨";
  if (t.includes("ghiaccio") || t.includes("neve")) return "❄";
  if (t.includes("piogg") || t.includes("precip")) return "🌧";
  if (t.includes("nuvol")) return "☁";
  return "☀";
}

function stopDetailExtra(result, row, addr) {
  const parts = [];

  // Full weather
  const w = (result.weather || []).find(x => Number(x.stopNumber) === Number(row.stopNumber));
  if (w) {
    const temp = w.temperatureC != null ? `${Math.round(w.temperatureC)}°C` : "--";
    const humidity = w.humidity != null ? ` ${w.humidity}% umid.` : "";
    const wind = w.windKmh != null ? ` 💨${Math.round(w.windKmh)}km/h` : "";
    const alerts = (w.warnings || []).map(s => `<span class="badge warning">${escapeHtml(s)}</span>`).join(" ");
    parts.push(`<div class="stop-detail-section"><span class="rc-section-label">Meteo</span><div class="stop-weather-full">${weatherIcon(w)} <strong>${temp}</strong> ${escapeHtml(w.description || "")}${humidity}${wind}${alerts ? " " + alerts : ""}</div></div>`);
  }

  // Hours — show only the scheduled day, expandable to full week
  const wh = addr?.weeklyHours || row.weeklyHours;
  if (wh) {
    const scheduledDow = result.scheduledDate ? new Date(result.scheduledDate + "T12:00:00").getDay() : new Date().getDay();
    const dayData = wh[scheduledDow] || wh[String(scheduledDow)] || null;
    let todayStr = "—";
    let isClosed = false;
    if (dayData) {
      if (dayData.closed) { todayStr = "Chiuso"; isClosed = true; }
      else if (dayData.continuous && dayData.openMorning && dayData.closeAfternoon) todayStr = `${dayData.openMorning}–${dayData.closeAfternoon}`;
      else {
        const p = [];
        if (dayData.openMorning && dayData.closeMorning) p.push(`${dayData.openMorning}–${dayData.closeMorning}`);
        if (dayData.openAfternoon && dayData.closeAfternoon) p.push(`${dayData.openAfternoon}–${dayData.closeAfternoon}`);
        todayStr = p.join(" / ") || "—";
      }
    }
    // Full week table for expand panel
    const ORDER = [1,2,3,4,5,6,0];
    const dayKey = d => { const h = wh[d] || wh[String(d)] || { closed: true }; return h.closed ? "chiuso" : h.continuous ? `cont:${h.openMorning}-${h.closeAfternoon}` : `${h.openMorning}-${h.closeMorning}|${h.openAfternoon}-${h.closeAfternoon}`; };
    const groups = [];
    for (const d of ORDER) {
      const k = dayKey(d);
      if (groups.length && groups[groups.length-1].key === k) { groups[groups.length-1].days.push(d); }
      else groups.push({ key: k, days: [d] });
    }
    const fullRows = groups.map(g => {
      const isToday = g.days.includes(scheduledDow);
      const tr = isToday ? `<tr class="wh-today">` : `<tr>`;
      const label = g.days.length === 1 ? DAYS_IT[g.days[0]] : `${DAYS_IT[g.days[0]]}–${DAYS_IT[g.days[g.days.length-1]]}`;
      const h = wh[g.days[0]] || wh[String(g.days[0])] || { closed: true };
      if (h.closed) return `${tr}<td class="wh-day">${label}</td><td class="wh-hours wh-muted" colspan="2">Chiuso</td></tr>`;
      if (h.continuous) return `${tr}<td class="wh-day">${label}</td><td class="wh-hours" colspan="2">${h.openMorning}–${h.closeAfternoon}</td></tr>`;
      const am = (h.openMorning && h.closeMorning) ? `${h.openMorning}–${h.closeMorning}` : "—";
      const pm = (h.openAfternoon && h.closeAfternoon) ? `${h.openAfternoon}–${h.closeAfternoon}` : "";
      return `${tr}<td class="wh-day">${label}</td><td class="wh-hours">${am}</td><td class="wh-hours wh-muted">${pm}</td></tr>`;
    }).join("");
    const uid = `wh-${row.stopNumber}${row.stopPart ? "-" + row.stopPart : ""}`;
    parts.push(`
      <div class="stop-detail-section">
        <span class="rc-section-label">Orari</span>
        <div class="wh-day-row">
          <button class="wh-day-btn${isClosed ? " wh-closed-btn" : ""}" data-toggle-hours="${uid}" aria-expanded="false">
            <span class="wh-day-hours">${todayStr}</span>
            <span class="wh-day-expand">${I.arrowDown(12)}</span>
          </button>
        </div>
        <div class="wh-full-panel" id="${uid}" hidden>
          <table class="wh-inline"><colgroup><col class="wh-col-day"><col class="wh-col-am"><col class="wh-col-pm"></colgroup><tbody>${fullRows}</tbody></table>
          <button class="wh-close-btn" data-toggle-hours="${uid}">${I.close(12)} Chiudi</button>
        </div>
      </div>`);
  }

  return parts.length ? `<div class="stop-detail-extra">${parts.join("")}</div>` : "";
}

function weatherPill(result, stopNumber) {
  const w = (result.weather || []).find(x => Number(x.stopNumber) === Number(stopNumber));
  if (!w) return "";
  const temp = w.temperatureC != null ? `${Math.round(w.temperatureC)}°C` : "--";
  const warnings = (w.warnings || []).map(s => `<span class="badge warning">${escapeHtml(s)}</span>`).join(" ");
  return `<div class="weather-pill">${weatherIcon(w)} <strong>${temp}</strong> <span class="stop-meta">${escapeHtml(w.description || "")}</span>${warnings ? " " + warnings : ""}</div>`;
}

function weatherCompact(result, stopNumber) {
  const w = (result.weather || []).find(x => Number(x.stopNumber) === Number(stopNumber));
  if (!w) return "";
  const temp = w.temperatureC != null ? `${Math.round(w.temperatureC)}°C` : "";
  const wind = w.windKmh > 20 ? ` · 💨 ${Math.round(w.windKmh)} km/h` : "";
  const alerts = (w.warnings || []).map(s => `<span class="badge warning">${escapeHtml(s)}</span>`).join(" ");
  return `<div class="stop-weather-line">${weatherIcon(w)} ${temp}${wind}${alerts ? "  " + alerts : ""}</div>`;
}

function warningBadges(warnings) {
  if (!warnings?.length) return `<span class="badge ok">OK</span>`;
  return warnings.map(w => {
    const msg = w.msg || w;
    const level = w.level || (/(chiusa|dopo|oltre)/.test(msg) ? "error" : "warn");
    const cls = level === "error" ? "badge-error" : level === "warn" ? "badge-warn" : "badge";
    return `<span class="badge ${cls}">${escapeHtml(msg)}</span>`;
  }).join(" ");
}

function worstWarningLevel(warnings) {
  if (!warnings?.length) return null;
  if (warnings.some(w => (w.level || "") === "error" || /(chiusa|dopo|oltre)/.test(w.msg || w))) return "error";
  if (warnings.some(w => (w.level || "") === "warn")) return "warn";
  return null;
}

function renderManualOrder(result) {
  const rows = getOrderableStops(result);
  return `
    <details class="panel order-panel" ${state.manualOrderRows ? "open" : ""}>
      <summary>Riordina tappe manualmente</summary>
      <div class="order-list" style="margin-top:10px;">
        ${rows.filter(r => !r.stopPart || r.stopPart === "morning").map((row, i) => `
          <div class="order-item">
            <span class="order-num">${i + 1}</span>
            <span>${escapeHtml(row.customer)} ${escapeHtml(row.location || "")}</span>
            <div class="row">
              ${i > 0 ? `<button class="btn icon-btn" data-move-up="${i}" title="Sposta su">${I.arrowUp(14)}</button>` : ""}
              ${i < rows.length - 1 ? `<button class="btn icon-btn" data-move-down="${i}" title="Sposta giù">${I.arrowDown(14)}</button>` : ""}
            </div>
          </div>`).join("")}
      </div>
      <div class="actions">
        <button class="btn primary" id="replan-order">${I.check(14)} Ricalcola con quest'ordine</button>
        <button class="btn" id="reset-order">${I.refresh(14)} Ottimizzato</button>
      </div>
    </details>`;
}

function renderResult() {
  if (!state.result) {
    app.innerHTML = `<section class="panel"><h2>Percorso</h2><div class="empty">Nessun percorso calcolato. Vai su "Nuovo percorso" e premi Ottimizza.</div></section>`;
    return;
  }
  const result = normalizeSavedRoute(state.result);
  const { rows, finalLeg, summary } = result;
  const pref = state.navigatorPref;

  app.innerHTML = `
    <section>
      <div class="section-head" style="margin-bottom:10px;">
        <div>
          <div class="row" style="align-items:center;gap:8px;">
            <h2 style="margin:0;">${escapeHtml(result.name || "Percorso")}</h2>
            ${result.id ? `<button class="btn icon-btn" data-rename-current-route="${result.id}" title="Rinomina">${I.edit(14)}</button>` : ""}
          </div>
          <div class="row" style="align-items:center;gap:8px;margin-top:4px;">
            <input type="date" class="result-date-input" id="result-date-input" value="${escapeHtml(result.scheduledDate || "")}" title="Cambia data e ricalcola" />
            <span class="stop-meta">${escapeHtml(summary.dayStart)} → ${escapeHtml(summary.dayEnd)} · ${summary.totalKm.toFixed(1)} km · ${euro(summary.totalCost)}</span>
          </div>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap;">
          <button class="btn" data-tab-jump="saved">${I.list(14)} Giri</button>
          <button class="btn${result.rows?.some(r => r.type === "lunch") ? " primary" : ""}" id="toggle-lunch-break" title="${result.rows?.some(r => r.type === "lunch") ? "Rimuovi pausa pranzo" : "Aggiungi pausa pranzo"}">${I.fork(14)} ${result.rows?.some(r => r.type === "lunch") ? "Togli pranzo" : "Aggiungi pranzo"}</button>
          <button class="btn" id="print-route-btn" title="Stampa o salva come PDF">${I.print(14)} PDF</button>
        </div>
      </div>

      ${state.googleMapsKey ? `<div id="route-map" style="height:280px;border-radius:8px;border:1px solid var(--line);margin-bottom:14px;"></div>` : ""}

      <div class="nav-panel">
        <a class="btn primary" href="${navUrl(result, pref)}" target="_blank" rel="noopener">${I.navigate(14)} Apri percorso completo</a>
      </div>

      ${renderManualOrder(result)}

      <div class="result-list">
        ${rows.map(row => {
          // Build Maps URL for a break row (rest or restaurant lunch)
          const breakMapsUrl = (r) => {
            if (!r.lat || !r.lng) return null;
            const q = encodeURIComponent(r.customer + (r.location ? " " + r.location : ""));
            if (state.navigatorPref === "apple") return `http://maps.apple.com/?ll=${r.lat},${r.lng}&q=${q}`;
            if (state.navigatorPref === "waze") return `https://waze.com/ul?ll=${r.lat},${r.lng}&navigate=yes`;
            return `https://www.google.com/maps/search/?api=1&query=${q}&center=${r.lat},${r.lng}`;
          };

          // Special row: lunch break
          if (row.type === "lunch") {
            const lunchUrl = breakMapsUrl(row);
            const lunchName = row.customer && row.customer !== "Pausa pranzo"
              ? row.customer
              : null;
            return `
          <article class="card result-card break-card lunch-card">
            <div class="break-row">
              <span class="break-icon lunch-icon">${I.fork(18)}</span>
              <div style="flex:1;min-width:0">
                ${lunchUrl && lunchName
                  ? `<a class="stop-title break-place-link" href="${lunchUrl}" target="_blank" rel="noopener" style="margin:0">${escapeHtml(lunchName)}${row.location ? ` — ${escapeHtml(row.location)}` : ""}</a>`
                  : `<p class="stop-title" style="margin:0">Pausa pranzo</p>`}
                <div class="stop-meta">${escapeHtml(row.serviceStartTime)} – ${escapeHtml(row.serviceEndTime)} · ${minutesLabel(row.durationMinutes)}</div>
              </div>
            </div>
          </article>`;
          }

          // Special row: rest stop
          if (row.type === "rest") {
            const restUrl = breakMapsUrl(row);
            return `
          <article class="card result-card break-card rest-card">
            <div class="break-row">
              <span class="break-icon coffee-icon">${I.coffee(18)}</span>
              <div style="flex:1;min-width:0">
                ${restUrl
                  ? `<a class="stop-title break-place-link" href="${restUrl}" target="_blank" rel="noopener" style="margin:0">${escapeHtml(row.customer)}${row.location ? ` — ${escapeHtml(row.location)}` : ""}</a>`
                  : `<p class="stop-title" style="margin:0">${escapeHtml(row.customer)}${row.location ? ` — ${escapeHtml(row.location)}` : ""}</p>`}
                <div class="stop-meta">${escapeHtml(row.serviceStartTime)} – ${escapeHtml(row.serviceEndTime)} · ${minutesLabel(row.durationMinutes)}</div>
                ${row.address ? `<div class="stop-meta" style="font-size:0.8rem">${escapeHtml(row.address)}</div>` : ""}
              </div>
            </div>
          </article>`;
          }

          const addr = state.allAddresses.find(a => String(a.id) === String(row.addressId));
          const prefPhone = preferredPhone(addr || {});
          const phone = addr?.phone || row.phone || "";
          const phone2 = addr?.phone2 || row.phone2 || "";
          const email = addr?.email || row.email || "";
          const emailSubject = encodeURIComponent(`Appuntamento ${row.customer} - ${result.scheduledDate || ""} ore ${row.arrivalTime}`);
          const partBadge = row.stopPart === "morning" ? `<span class="badge" style="background:color-mix(in srgb,#3b82f6 15%,var(--surface));color:#1d4ed8">mattina</span> ` : row.stopPart === "afternoon" ? `<span class="badge" style="background:color-mix(in srgb,#f97316 15%,var(--surface));color:#c2410c">pomeriggio</span> ` : "";
          const stopTitle = `${row.stopNumber}. ${escapeHtml(row.customer)}${row.location ? ` — ${escapeHtml(row.location)}` : ""}`;
          const phoneBtn = prefPhone ? `<a class="btn icon-btn" href="tel:${escapeHtml(prefPhone.number)}" title="${escapeHtml(prefPhone.number)}">${phoneIcon(prefPhone.type)}</a>` : "";
          const warnLevel = worstWarningLevel(row.warnings);
          const cardClass = warnLevel === "error" ? " card-error" : warnLevel === "warn" ? " card-warn" : "";
          const warnMsg = warnLevel ? (row.warnings.find(w => w.level === warnLevel || (warnLevel==="error" && /(chiusa|dopo|oltre)/.test(w.msg||w)))?.msg || "") : "";
          const expandId = `${row.stopNumber}${row.stopPart ? "-" + row.stopPart : ""}`;
          const isAfternoon = row.stopPart === "afternoon";
          const arrivalDisplay = isAfternoon ? row.serviceStartTime : row.arrivalTime;
          return `
          <article class="card rc${cardClass}">
            <div class="rc-head" data-expand-stop="${expandId}">
              <div class="rc-left">
                <div class="rc-num-name">${partBadge}<span class="rc-name">${stopTitle}</span></div>
                <div class="rc-addr">${escapeHtml(row.address)}</div>
                ${warnLevel ? `<span class="badge ${warnLevel === "error" ? "badge-error" : "badge-warn"} rc-warn">${escapeHtml(warnMsg)}</span>` : ""}
              </div>
              <div class="rc-arrival">
                <div class="rc-arr-time">${escapeHtml(arrivalDisplay)}</div>
                <div class="rc-arr-label">${isAfternoon ? "riprende" : "arrivo"}</div>
                ${weatherCompact(result, row.stopNumber)}
              </div>
            </div>
            <div class="rc-actions">
              ${!isAfternoon ? `<a class="btn primary rc-nav-btn" href="${stopNavUrl(row, state.navigatorPref)}" target="_blank" rel="noopener">${I.navigate(14)} Naviga</a>` : ""}
              ${phoneBtn}
              ${email && !row.stopPart ? `<a class="btn icon-btn" href="mailto:${escapeHtml(email)}?subject=${emailSubject}" title="${escapeHtml(email)}">${I.email(15)}</a>` : ""}
            </div>
            <div class="rc-details" data-stop-details="${expandId}" hidden>
              <div class="rc-timing-strip">
                ${!isAfternoon ? `<span>${I.car(13)} ${minutesLabel(row.driveMinutes)} · ${row.km.toFixed(1)} km</span>` : ""}
                <span>${I.wrench(13)} ${minutesLabel(row.durationMinutes)}</span>
                <span>${I.check(13)} ${escapeHtml(row.serviceEndTime)}</span>
                ${!isAfternoon ? `<span class="rc-ts-muted">${I.arrowUp(13)} ${escapeHtml(row.departureTime)}</span>` : ""}
              </div>
              ${phone && !row.stopPart ? `<div class="rc-contact rc-contact--phone">${phoneIcon(addr?.phoneType)} <a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a>${addr?.phoneName ? ` <span class="phone-name-badge">${escapeHtml(addr.phoneName)}</span>` : ""}${addr?.phonePreferred !== "phone2" && phone2 ? " ★" : ""}</div>` : ""}
              ${phone2 && !row.stopPart ? `<div class="rc-contact rc-contact--phone">${phoneIcon(addr?.phone2Type)} <a href="tel:${escapeHtml(phone2)}">${escapeHtml(phone2)}</a>${addr?.phone2Name ? ` <span class="phone-name-badge">${escapeHtml(addr.phone2Name)}</span>` : ""}${addr?.phonePreferred === "phone2" ? " ★" : ""}</div>` : ""}
              ${email && !row.stopPart ? `<div class="rc-contact">${I.email(14)} <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></div>` : ""}
              ${row.notes && !row.stopPart ? `<div class="rc-notes">${escapeHtml(row.notes)}</div>` : ""}
              ${warnLevel ? warningBadges(row.warnings) : ""}
              ${!row.stopPart ? stopDetailExtra(result, row, addr) : ""}
            </div>
          </article>`;
        }).join("")}

        <article class="card rc">
          <div class="rc-head" style="cursor:default">
            <div class="rc-left">
              <div class="rc-num-name"><span class="rc-name">↩ ${escapeHtml(result.end?.label || "Casa")}</span></div>
              <div class="rc-addr">${escapeHtml(result.end?.address || result.end?.fullAddress || "")}</div>
            </div>
            <div class="rc-arrival">
              <div class="rc-arr-time">${escapeHtml(finalLeg.arrivalTime)}</div>
              <div class="rc-arr-label">arrivo</div>
            </div>
          </div>
          <div class="rc-timing-strip" style="padding-top:0">
            <span>${I.car(13)} ${minutesLabel(finalLeg.driveMinutes)} · ${finalLeg.km.toFixed(1)} km</span>
            <span class="rc-ts-muted">${I.arrowUp(13)} ${escapeHtml(finalLeg.departureTime)}</span>
          </div>
        </article>
      </div>

      <div class="summary-grid">
        <div class="metric"><div class="metric-label">Km totali</div><div class="metric-value">${summary.totalKm.toFixed(1)}</div></div>
        <div class="metric"><div class="metric-label">Ore guida</div><div class="metric-value">${minutesLabel(summary.totalDriveMinutes)}</div></div>
        <div class="metric"><div class="metric-label">Ore lavoro</div><div class="metric-value">${minutesLabel(summary.totalWorkMinutes)}</div></div>
        <div class="metric"><div class="metric-label">Giornata</div><div class="metric-value">${escapeHtml(summary.dayStart)}–${escapeHtml(summary.dayEnd)}</div></div>
        <div class="metric"><div class="metric-label">Costo km</div><div class="metric-value">${euro(summary.costKm)}</div></div>
        <div class="metric"><div class="metric-label">Costo guida</div><div class="metric-value">${euro(summary.costDrive)}</div></div>
        <div class="metric"><div class="metric-label">Costo lavoro</div><div class="metric-value">${euro(summary.costWork)}</div></div>
        <div class="metric"><div class="metric-label">Totale</div><div class="metric-value">${euro(summary.totalCost)}</div></div>
      </div>
      ${(summary.warnings || []).map(w => {
        const msg = w.msg || w;
        const level = w.level || (/(chiusa|dopo|oltre)/.test(msg) ? "error" : "warn");
        return `<span class="badge ${level === "error" ? "badge-error" : "badge-warn"}" style="margin-top:8px;display:inline-flex;">${escapeHtml(msg)}</span>`;
      }).join(" ")}
    </section>`;

  if (state.googleMapsKey) {
    requestAnimationFrame(() => renderGoogleMap(result));
  }
}

// ── print / PDF export ────────────────────────────────────────────────────────

function printRoute() {
  if (!state.result) return;
  const result = normalizeSavedRoute(state.result);
  const routeName = result.name || "Percorso";
  const date = result.scheduledDate
    ? new Date(result.scheduledDate).toLocaleDateString("it-IT", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    : "";

  // Enrich rows with address data now, before opening the window
  const enrichedRows = result.rows.map(row => {
    const addr = state.allAddresses.find(a => String(a.id) === String(row.addressId)) || {};
    return {
      ...row,
      phone:     addr.phone     || row.phone     || "",
      phoneName: addr.phoneName || row.phoneName || "",
      phoneType: addr.phoneType || row.phoneType || "",
      phone2:     addr.phone2     || row.phone2     || "",
      phone2Name: addr.phone2Name || row.phone2Name || "",
      phone2Type: addr.phone2Type || row.phone2Type || "",
      activity:   addr.activity   || row.activity   || "",
    };
  });

  const payload = JSON.stringify({ result: { ...result, rows: enrichedRows }, routeName, date });

  const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<title>Stampa — ${routeName}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, Arial, sans-serif; background: #f4f4f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .card { background: #fff; border-radius: 12px; padding: 28px 32px; max-width: 360px; width: 100%; box-shadow: 0 4px 24px rgba(0,0,0,.10); }
  h2 { font-size: 1.1rem; margin-bottom: 4px; }
  .sub { font-size: .85rem; color: #666; margin-bottom: 22px; }
  label { display: flex; align-items: center; gap: 10px; font-size: .95rem; cursor: pointer; padding: 10px 0; border-bottom: 1px solid #eee; }
  label:last-of-type { border-bottom: none; margin-bottom: 20px; }
  input[type=checkbox] { width: 18px; height: 18px; accent-color: #2563eb; flex-shrink: 0; }
  .desc { font-size: .78rem; color: #888; margin-top: 1px; }
  button { width: 100%; padding: 11px; border: none; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; background: #2563eb; color: #fff; }
  button:hover { background: #1d4ed8; }
  @media print { body { background: white; } .card { box-shadow: none; } }
</style>
</head>
<body>
<div class="card">
  <h2>🖨 Opzioni stampa</h2>
  <div class="sub">${routeName}${date ? " · " + date : ""}</div>
  <label>
    <input type="checkbox" id="opt-phones" checked>
    <span>Numeri di telefono<br><span class="desc">Aggiunge una colonna con i contatti di ogni tappa</span></span>
  </label>
  <label>
    <input type="checkbox" id="opt-costs">
    <span>Riepilogo costi<br><span class="desc">Costo km, guida, lavoro e totale giornata</span></span>
  </label>
  <button onclick="generate()">Stampa / Salva PDF</button>
</div>
<script>
const DATA = ${payload};

function esc(s) {
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function mins(v) {
  const n = Number(v || 0), h = Math.floor(n / 60), m = n % 60;
  if (!h) return m + " min";
  if (!m) return h + " h";
  return h + " h " + m + " min";
}
function eur(v) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(v || 0));
}

function generate() {
  const withPhones = document.getElementById("opt-phones").checked;
  const withCosts  = document.getElementById("opt-costs").checked;
  const { result, routeName, date } = DATA;
  const { rows, finalLeg, summary } = result;

  const colCount = withPhones ? 6 : 5;
  const stopRows = rows.map(row => {
    if (row.type === "lunch") {
      const name = row.customer && row.customer !== "Pausa pranzo" ? row.customer : "Pausa pranzo";
      return '<tr class="br"><td colspan="' + colCount + '">🍽 ' + esc(name) + (row.location ? " — " + esc(row.location) : "") + "</td><td>" + esc(row.serviceStartTime) + "–" + esc(row.serviceEndTime) + "</td><td>" + mins(row.durationMinutes) + "</td></tr>";
    }
    if (row.type === "rest") {
      return '<tr class="br"><td colspan="' + colCount + '">☕ ' + esc(row.customer) + (row.location ? " — " + esc(row.location) : "") + "</td><td>" + esc(row.serviceStartTime) + "–" + esc(row.serviceEndTime) + "</td><td>" + mins(row.durationMinutes) + "</td></tr>";
    }
    const phoneCell = (() => {
      if (!withPhones) return "";
      const lines = [];
      if (row.phone) lines.push(esc(row.phone) + (row.phoneName ? " <small>(" + esc(row.phoneName) + ")</small>" : ""));
      if (row.phone2) lines.push(esc(row.phone2) + (row.phone2Name ? " <small>(" + esc(row.phone2Name) + ")</small>" : ""));
      return "<td>" + (lines.join("<br>") || "—") + "</td>";
    })();
    const nameCell = "<td>" + esc(row.customer || "") + (row.activity ? "<br><small>" + esc(row.activity) + "</small>" : "") + (row.location && !row.activity ? "<br><small>" + esc(row.location) + "</small>" : "") + "<br><small class='a'>" + esc(row.address || "") + "</small></td>";
    return "<tr><td>" + esc(row.stopNumber) + "</td>" + nameCell + phoneCell + "<td>" + esc(row.arrivalTime) + "–" + esc(row.serviceEndTime) + "</td><td>" + mins(row.durationMinutes) + "</td><td>" + (row.km ? Number(row.km).toFixed(1) : "") + "</td><td class='note'></td></tr>";
  }).join("");

  const phoneHeader = withPhones ? "<th>Telefono</th>" : "";
  const endColspan = withPhones ? 3 : 2;

  // Summary block: clean 2-column label/value rows grouped by topic
  const summaryRows =
    '<tr class="sg"><td colspan="4" class="sh">Giornata</td></tr>' +
    '<tr><td>Orario</td><td>' + esc(summary.dayStart) + ' – ' + esc(summary.dayEnd) + '</td><td>Km totali</td><td>' + summary.totalKm.toFixed(1) + ' km</td></tr>' +
    '<tr><td>Ore guida</td><td>' + mins(summary.totalDriveMinutes) + '</td><td>Ore lavoro</td><td>' + mins(summary.totalWorkMinutes) + '</td></tr>' +
    (withCosts
      ? '<tr class="sg"><td colspan="4" class="sh">Costi</td></tr>' +
        '<tr><td>Costo km</td><td>' + eur(summary.costKm) + '</td><td>Costo guida</td><td>' + eur(summary.costDrive) + '</td></tr>' +
        '<tr><td>Costo lavoro</td><td>' + eur(summary.costWork) + '</td><td class="tl">Totale giornata</td><td class="tv">' + eur(summary.totalCost) + '</td></tr>'
      : '');
  const costsBlock = '<table class="st"><tbody>' + summaryRows + '</tbody></table>';

  const styles = '*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11pt;color:#111;padding:20px}h1{font-size:16pt;margin-bottom:2px}.sub{font-size:10pt;color:#555;margin-bottom:14px}table{width:100%;border-collapse:collapse;margin-bottom:16px}th{background:#222;color:#fff;padding:6px 8px;text-align:left;font-size:10pt}td{padding:5px 8px;border-bottom:1px solid #ddd;font-size:10pt;vertical-align:top}tr.br td{background:#f5f5f5;font-style:italic;color:#555}small{color:#666}.a{font-size:9pt}.st td{padding:5px 10px;border-bottom:1px solid #eee;font-size:10pt}.st td:first-child,.st td:nth-child(3){color:#666;width:18%}.st .sh{font-weight:700;background:#f0f0f0;color:#111;padding:5px 10px;font-size:9pt;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #ccc}.st .tl{font-weight:700;color:#111!important}.st .tv{font-weight:700;font-size:12pt}.note{min-width:60px}@media print{body{padding:0}}';

  document.open();
  document.write('<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><title>' + esc(routeName) + (date ? " – " + date : "") + '</title><style>' + styles + '</style></head><body><h1>' + esc(routeName) + '</h1>' + (date ? '<div class="sub">' + date + '</div>' : '') + '<table><thead><tr><th>#</th><th>Tappa</th>' + phoneHeader + '<th>Orario</th><th>Durata</th><th>Km</th><th class="note">Note</th></tr></thead><tbody>' + stopRows + '<tr><td colspan="' + endColspan + '"><strong>↩ ' + esc(result.end?.label || "Casa") + '</strong><br><small>' + esc(result.end?.address || result.end?.fullAddress || "") + '</small></td><td>' + esc(finalLeg.arrivalTime) + '</td><td></td><td>' + Number(finalLeg.km).toFixed(1) + '</td><td></td></tr></tbody></table>' + costsBlock + '</body></html>');
  document.close();
  window.addEventListener('afterprint', () => window.close());
  setTimeout(() => window.print(), 300);
}
<\/script>
</body>
</html>`;

  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

// ── render: statistics (menu panel) ──────────────────────────────────────────

function renderMenuStats() {
  const routes = state.savedRoutes.map(r => normalizeSavedRoute(r));

  if (!routes.length) {
    return `${menuHeader("Statistiche", true)}
      <div style="padding:24px 16px;color:var(--muted);font-size:0.95rem;text-align:center;">Nessun giro salvato.<br>Calcola e salva qualche percorso per vedere le statistiche.</div>`;
  }

  // ── aggregate by month ────────────────────────────────────────────────────
  const byMonth = {};
  for (const r of routes) {
    const key = r.scheduledDate ? r.scheduledDate.slice(0, 7) : "senza-data";
    if (!byMonth[key]) byMonth[key] = { km: 0, driveMin: 0, workMin: 0, cost: 0, count: 0 };
    const m = byMonth[key];
    m.km += r.summary.totalKm; m.driveMin += r.summary.totalDriveMinutes;
    m.workMin += r.summary.totalWorkMinutes; m.cost += r.summary.totalCost; m.count++;
  }
  const monthKeys = Object.keys(byMonth).filter(k => k !== "senza-data").sort().reverse();
  if (byMonth["senza-data"]) monthKeys.push("senza-data");

  const fmtMonth = key => {
    if (key === "senza-data") return "Senza data";
    const [y, m] = key.split("-");
    return new Date(Number(y), Number(m) - 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  };

  // ── unique clients count (for summary KPI) ───────────────────────────────
  const clientNames = new Set();
  for (const r of routes) for (const row of r.rows) if (!row.type && row.customer) clientNames.add(row.customer);

  // ── totals ────────────────────────────────────────────────────────────────
  const totals = routes.reduce((t, r) => {
    t.km += r.summary.totalKm; t.driveMin += r.summary.totalDriveMinutes;
    t.workMin += r.summary.totalWorkMinutes; t.cost += r.summary.totalCost; t.count++;
    return t;
  }, { km: 0, driveMin: 0, workMin: 0, cost: 0, count: 0 });

  const tab = state.statsTab || "summary";

  const tabBar = `<div class="stats-tabs">
    <button class="stats-tab-btn${tab === "summary" ? " active" : ""}" data-stats-tab="summary">Riepilogo</button>
    <button class="stats-tab-btn${tab === "months" ? " active" : ""}" data-stats-tab="months">Per mese</button>
  </div>`;

  let body = "";

  if (tab === "summary") {
    body = `
      <div class="stats-cards">
        <div class="stats-kpi"><span class="stats-kpi-val">${totals.count}</span><span class="stats-kpi-lbl">Giri salvati</span></div>
        <div class="stats-kpi"><span class="stats-kpi-val">${totals.km.toFixed(0)}</span><span class="stats-kpi-lbl">Km totali</span></div>
        <div class="stats-kpi"><span class="stats-kpi-val">${minutesLabel(totals.driveMin)}</span><span class="stats-kpi-lbl">Ore guida</span></div>
        <div class="stats-kpi"><span class="stats-kpi-val">${minutesLabel(totals.workMin)}</span><span class="stats-kpi-lbl">Ore lavoro</span></div>
        <div class="stats-kpi"><span class="stats-kpi-val">${euro(totals.cost)}</span><span class="stats-kpi-lbl">Costo totale</span></div>
        <div class="stats-kpi"><span class="stats-kpi-val">${(totals.km / totals.count).toFixed(0)}</span><span class="stats-kpi-lbl">Km medi/giro</span></div>
        <div class="stats-kpi"><span class="stats-kpi-val">${clientNames.size}</span><span class="stats-kpi-lbl">Clienti unici</span></div>
        <div class="stats-kpi"><span class="stats-kpi-val">${monthKeys.length}</span><span class="stats-kpi-lbl">Mesi attivi</span></div>
      </div>`;
  } else if (tab === "months") {
    body = monthKeys.map(k => {
      const m = byMonth[k];
      return `<div class="stats-month-block">
        <div class="stats-month-title">${fmtMonth(k)}</div>
        <div class="stats-cards">
          <div class="stats-kpi"><span class="stats-kpi-val">${m.count}</span><span class="stats-kpi-lbl">Giri</span></div>
          <div class="stats-kpi"><span class="stats-kpi-val">${m.km.toFixed(0)}</span><span class="stats-kpi-lbl">Km totali</span></div>
          <div class="stats-kpi"><span class="stats-kpi-val">${minutesLabel(m.driveMin)}</span><span class="stats-kpi-lbl">Ore guida</span></div>
          <div class="stats-kpi"><span class="stats-kpi-val">${minutesLabel(m.workMin)}</span><span class="stats-kpi-lbl">Ore lavoro</span></div>
          <div class="stats-kpi"><span class="stats-kpi-val">${euro(m.cost)}</span><span class="stats-kpi-lbl">Costo totale</span></div>
        </div>
      </div>`;
    }).join("");
  }

  return `${menuHeader("Statistiche", true)}
    ${tabBar}
    <div class="stats-body">${body}</div>`;
}

// ── render dispatch ───────────────────────────────────────────────────────────

function render() {
  if (!state.user) { renderAuthScreen(false); return; }
  if (state.activeTab === "route") renderRoute();
  else if (state.activeTab === "saved") renderSaved();
  else if (state.activeTab === "archive") renderArchive();
  else if (state.activeTab === "result") renderResult();
  else if (state.activeTab === "google-contacts") renderGoogleContactsTab();
}

// ── route form helpers ────────────────────────────────────────────────────────

function updateRouteFromForm() {
  const form = document.querySelector("#route-form");
  if (!form) return;
  const v = readForm(form);
  Object.assign(state.route, {
    scheduledDate: v.scheduledDate,
    startLabel: v.startLabel, startAddress: v.startAddress,
    startTime: v.startTime, timingMode: v.timingMode,
    arrivalLeadMinutes: Number(v.arrivalLeadMinutes || 10),
    firstArrivalTime: v.firstArrivalTime,
    endSameAsStart: Boolean(v.endSameAsStart),
    endLabel: v.endLabel, endAddress: v.endAddress,
    firstArrivalRequired: v.firstArrivalRequired || "",
    selectedAddressId: v.selectedAddressId || state.route.selectedAddressId,
    customCustomer: v.customCustomer, customLocation: v.customLocation,
    customAddress: v.customAddress, customDuration: Number(v.customDuration || 45),
    transcript: v.transcript || "",
    lunchBreak: Boolean(v.lunchBreak),
    lunchBreakMinutes: Number(v.lunchBreakMinutes || 45)
  });
}

function addressToStop(address, durationOverride = null) {
  return {
    uid: crypto.randomUUID(),
    addressId: address.id,
    customer: address.customer, location: address.location,
    fullAddress: address.fullAddress, notes: address.notes,
    openMorning: address.openMorning, closeMorning: address.closeMorning,
    openAfternoon: address.openAfternoon, closeAfternoon: address.closeAfternoon,
    weeklyHours: address.weeklyHours || null,
    durationMinutes: Number(durationOverride || address.defaultDuration || 45),
    lat: address.lat, lng: address.lng, recognized: true
  };
}

// ── plan route ────────────────────────────────────────────────────────────────

async function planCurrentRoute() {
  updateRouteFromForm();
  if (!state.route.stops.length) { showToast("Aggiungi almeno una tappa"); return; }
  state.planning = true;
  showSpinner("Calcolo percorso…");
  render();
  try {
    const r = state.route;
    const autoName = (() => {
      if (r.name) return r.name;
      const d = r.scheduledDate ? r.scheduledDate.split("-") : null;
      const dateStr = d ? `${d[2]}/${d[1]}/${d[0]}` : "";
      const firstStop = r.stops[0];
      const label = firstStop?.customer || firstStop?.location || "";
      return dateStr && label ? `${dateStr} – ${label}` : dateStr || label || "Percorso giornaliero";
    })();
    state.result = await api("/api/plan", {
      method: "POST",
      body: JSON.stringify({
        name: autoName,
        scheduledDate: r.scheduledDate,
        start: { label: r.startLabel, address: r.startAddress },
        end: { sameAsStart: r.endSameAsStart, label: r.endLabel, address: r.endAddress },
        startTime: r.startTime,
        timingMode: r.timingMode,
        arrivalLeadMinutes: r.arrivalLeadMinutes,
        firstArrivalTime: r.firstArrivalTime,
        firstArrivalRequired: r.firstArrivalRequired,
        stops: r.stops, rates: state.settings,
        lunchBreak: r.lunchBreak, lunchBreakMinutes: r.lunchBreakMinutes
      })
    });
    state.manualOrderRows = null;
    state.route.stops = [];
    state.route.name = "";
    await refreshSavedRoutes();
    setActiveTab("result");
    showToast("Percorso calcolato e salvato");
  } catch (e) {
    showToast(e.message);
  } finally {
    hideSpinner();
    state.planning = false;
    if (state.activeTab === "route") render();
  }
}

// ── voice ─────────────────────────────────────────────────────────────────────

function updateVoiceButton() {
  const btn = document.querySelector("#listen-command");
  if (!btn) return;
  if (state.voiceRecording) {
    btn.innerHTML = `${I.micStop(14)} Stop`;
    btn.classList.add("recording");
  } else {
    btn.innerHTML = `${I.mic(14)} Avvia`;
    btn.classList.remove("recording");
  }
}

async function transcribeBlob(blob, mimeType) {
  showToast("Trascrizione in corso…");
  const res = await fetch("/api/voice/transcribe", {
    method: "POST",
    headers: { "Content-Type": mimeType },
    body: blob
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Errore trascrizione");
  return data.text || "";
}

function startSpeechRecognitionFallback() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { showToast("Riconoscimento vocale non disponibile"); return; }
  const rec = new SR();
  rec.lang = "it-IT"; rec.interimResults = false; rec.maxAlternatives = 1;
  rec.onresult = e => {
    const t = e.results[0][0].transcript;
    const ta = document.querySelector("#transcript");
    if (ta) ta.value = t;
    state.route.transcript = t;
    showToast("Voce acquisita");
  };
  rec.onerror = () => showToast("Voce non acquisita");
  rec.start();
}

async function toggleVoiceRecording() {
  // Stop ongoing recording
  if (state.voiceRecording && state._mediaRecorder) {
    state._mediaRecorder.stop();
    return;
  }

  // Use Whisper if configured and MediaRecorder available
  if (state.whisperConfigured && window.MediaRecorder && navigator.mediaDevices?.getUserMedia) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      state._audioChunks = [];
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]
        .find(t => MediaRecorder.isTypeSupported(t)) || "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType });
      mr.ondataavailable = e => { if (e.data.size > 0) state._audioChunks.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        state.voiceRecording = false;
        updateVoiceButton();
        try {
          const blob = new Blob(state._audioChunks, { type: mimeType });
          const text = await transcribeBlob(blob, mimeType);
          const ta = document.querySelector("#transcript");
          if (ta) ta.value = text;
          state.route.transcript = text;
          showToast("Elaboro il comando…");
          await applyVoiceCommand();
        } catch (err) {
          showToast(err.message);
        }
      };
      state._mediaRecorder = mr;
      mr.start();
      state.voiceRecording = true;
      updateVoiceButton();
      return;
    } catch {
      // mic permission denied or not available — fall through
    }
  }

  // Fallback: Web Speech API
  startSpeechRecognitionFallback();
}

async function applyVoiceCommand() {
  updateRouteFromForm();
  if (!state.route.transcript.trim()) return;
  const endpoint = state.whisperConfigured ? "/api/voice/understand" : "/api/voice/parse";
  const parsed = await api(endpoint, { method: "POST", body: JSON.stringify({ text: state.route.transcript }) });

  if (parsed.start) {
    state.route.startLabel = parsed.start.label || state.route.startLabel;
    state.route.startAddress = parsed.start.address || state.route.startAddress;
  }
  if (parsed.startTime) state.route.startTime = parsed.startTime;
  if (parsed.firstArrivalTime) state.route.firstArrivalTime = parsed.firstArrivalTime;
  if (parsed.arrivalLeadMinutes != null) state.route.arrivalLeadMinutes = parsed.arrivalLeadMinutes;
  if (parsed.scheduledDate) state.route.scheduledDate = parsed.scheduledDate;
  if (parsed.end) {
    state.route.endSameAsStart = false;
    state.route.endLabel = parsed.end.label || state.route.endLabel;
    state.route.endAddress = parsed.end.address || state.route.endAddress;
  }
  for (const stop of parsed.stops || []) state.route.stops.push({ ...stop, uid: crypto.randomUUID() });
  for (const rem of parsed.removeStops || []) {
    state.route.stops = state.route.stops.filter(s => {
      if (rem.id && s.addressId && String(s.addressId) === String(rem.id)) return false;
      const a = `${rem.customer} ${rem.location || ""}`.toLowerCase().trim();
      const b = `${s.customer} ${s.location || ""}`.toLowerCase().trim();
      return a !== b;
    });
  }

  const msg = parsed.needsConfirmation?.length
    ? `Da confermare: ${parsed.needsConfirmation.join(", ")}`
    : parsed.removeStops?.length
    ? `${parsed.removeStops.length} tappa rimossa`
    : "Comando applicato";
  showToast(msg);

  if (parsed.action === "optimize") await planCurrentRoute();
  else render();
}

// ── contact import ────────────────────────────────────────────────────────────

function parseVcf(text) {
  // Unfold lines (RFC 6350: CRLF + space/tab = continuation)
  const unfolded = text
    .replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    .replace(/\n[ \t]/g, "");

  function decodeQP(str) {
    // Decode QUOTED-PRINTABLE encoding (common in iPhone vCards for non-ASCII)
    return str.replace(/=([0-9A-Fa-f]{2})/g, (_, h) =>
      String.fromCharCode(parseInt(h, 16))
    );
  }

  const contacts = [];
  const blocks = unfolded.split(/^BEGIN:VCARD$/im);

  for (const block of blocks.slice(1)) {
    const endIdx = block.search(/^END:VCARD$/im);
    const body = endIdx >= 0 ? block.slice(0, endIdx) : block;
    const lines = body.split("\n").filter(l => l.trim());

    const props = {};
    for (const line of lines) {
      const colonIdx = line.indexOf(":");
      if (colonIdx < 0) continue;
      // Strip item\d+. prefix used by iPhone (e.g. item1.ADR → ADR)
      const rawKey = line.slice(0, colonIdx).replace(/^item\d+\./i, "");
      let value = line.slice(colonIdx + 1);

      const keyParts = rawKey.toUpperCase().split(";");
      const propName = keyParts[0];
      const paramStr = keyParts.slice(1).join(";");

      // Decode QUOTED-PRINTABLE if indicated
      if (paramStr.includes("ENCODING=QUOTED-PRINTABLE")) {
        try { value = decodeURIComponent(escape(decodeQP(value))); } catch { value = decodeQP(value); }
      }

      // Collect TYPE values (TYPE=CELL, TYPE=WORK, CELL, WORK, IPHONE, etc.)
      const typeTokens = paramStr.split(";").flatMap(p => {
        const [k, v] = p.split("=");
        return v ? (k === "TYPE" ? v.split(",") : []) : [k];
      }).map(t => t.toUpperCase());

      if (!props[propName]) props[propName] = [];
      props[propName].push({ value: value.trim(), types: typeTokens });
    }

    const fn = props["FN"]?.[0]?.value || "";
    if (!fn) continue;

    // ORG → location (first component only)
    const org = (props["ORG"]?.[0]?.value || "").split(";")[0].trim();

    // Phones: prefer CELL, then any, extract up to 2
    const allTels = (props["TEL"] || []).map(t => {
      const num = t.value.replace(/[^\d+]/g, "");
      const types = t.types;
      const isCell = types.some(x => ["CELL","MOBILE","IPHONE"].includes(x));
      const isFisso = !isCell && types.some(x => ["WORK","HOME","VOICE"].includes(x));
      return { num, type: isCell ? "cell" : isFisso ? "fisso" : "cell" };
    }).filter(t => t.num.length >= 6);

    const p1 = allTels.find(t => t.type === "cell") || allTels[0] || null;
    const p2 = allTels.find(t => t !== p1) || null;

    // Address: prefer WORK, then HOME, then any
    const adrs = props["ADR"] || [];
    const workAdr = adrs.find(a => a.types.includes("WORK")) || adrs[0] || null;
    let fullAddress = "";
    if (workAdr) {
      const parts = workAdr.value.split(";");
      // ADR: PO Box; Extended; Street; City; Region; Postal; Country
      const street = parts[2]?.trim() || "";
      const city   = parts[3]?.trim() || "";
      const postal = parts[5]?.trim() || "";
      fullAddress = [street, `${postal} ${city}`.trim()].filter(Boolean).join(", ");
    }

    const email = (props["EMAIL"]?.[0]?.value || "").toLowerCase();

    contacts.push({
      customer:   fn,
      activity:   org,
      location:   "",
      fullAddress,
      phone:      p1?.num  || "",
      phoneType:  p1?.type || "cell",
      phone2:     p2?.num  || "",
      phone2Type: p2?.type || "fisso",
      email,
      addressType: "customer"
    });
  }

  return contacts;
}

function parseCsv(text) {
  // Handles quoted fields with embedded commas
  function splitCsvLine(line) {
    const result = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === "," && !inQ) { result.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    result.push(cur.trim());
    return result;
  }

  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map(h => h.toLowerCase().replace(/["\s]/g, ""));
  return lines.slice(1).flatMap(line => {
    const vals = splitCsvLine(line);
    const row = Object.fromEntries(headers.map((h, i) => [h, vals[i] || ""]));
    const customer = row.name || row.nome || row.customer || row.cliente || row["firstname"] || "";
    if (!customer) return [];
    return [{
      customer,
      location: row.company || row.azienda || row.sede || row.location || "",
      fullAddress: row.address || row.indirizzo || row.full_address || "",
      phone: row.phone || row.tel || row.telefono || row["mobilephone"] || row["mobile"] || "",
      phoneType: "cell",
      phone2: row.phone2 || row.tel2 || row["homephone"] || row["workphone"] || "",
      phone2Type: "fisso",
      email: row.email || "",
      addressType: "customer"
    }];
  });
}

async function geocodeOne(address, apiKey) {
  if (!address || !apiKey) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=it&key=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    if (data.status === "OK" && data.results[0]) {
      const loc = data.results[0].geometry.location;
      return { lat: loc.lat, lng: loc.lng };
    }
  } catch { /* ignore */ }
  return null;
}

function showImportPreview(rawContacts) {
  const existing = new Set(state.addresses.map(a => a.customer.toLowerCase().trim()));
  // Flag duplicates but still show them (user decides)
  const contacts = rawContacts.map(c => ({
    ...c,
    _dup: existing.has(c.customer.toLowerCase().trim())
  }));

  const hasAddr = contacts.some(c => c.fullAddress);
  const canGeo  = hasAddr && Boolean(state.googleMapsKey);

  const overlay = document.createElement("div");
  overlay.id = "import-preview-overlay";
  overlay.className = "map-picker-overlay";
  overlay.innerHTML = `
    <div class="map-picker-box" style="max-height:90dvh;display:flex;flex-direction:column;">
      <div class="map-picker-header">
        <span>Anteprima importazione</span>
        <button class="btn ghost" id="import-close">×</button>
      </div>
      <div style="padding:12px 16px;border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;gap:10px;align-items:center;">
        <span class="stop-meta"><b>${contacts.length}</b> contatti trovati · <b>${contacts.filter(c => c._dup).length}</b> già presenti</span>
        <label style="display:flex;align-items:center;gap:6px;font-size:0.82rem;margin-left:auto;">
          <input type="checkbox" id="import-select-all" checked style="width:16px;min-height:16px;height:16px;" />
          Seleziona tutti
        </label>
        ${canGeo ? `<label style="display:flex;align-items:center;gap:6px;font-size:0.82rem;">
          <input type="checkbox" id="import-geocode" style="width:16px;min-height:16px;height:16px;" />
          Geocodifica indirizzi 📍
        </label>` : ""}
      </div>
      <div id="import-list" style="flex:1;overflow-y:auto;padding:8px 12px;display:grid;gap:6px;">
        ${contacts.map((c, i) => `
          <label class="import-contact-row${c._dup ? " import-dup" : ""}">
            <input type="checkbox" class="import-cb" data-idx="${i}" ${c._dup ? "" : "checked"} style="width:16px;min-height:16px;height:16px;flex-shrink:0;" />
            <div style="min-width:0;">
              <div style="font-weight:700;font-size:0.88rem;">${escapeHtml(c.customer)}${c.location ? ` <span style="font-weight:400;color:var(--muted)">— ${escapeHtml(c.location)}</span>` : ""}${c._dup ? ' <span class="badge" style="font-size:0.7rem;vertical-align:middle;">già presente</span>' : ""}</div>
              ${c.phone ? `<div class="stop-meta">${phoneIcon(c.phoneType)} ${escapeHtml(c.phone)}${c.phone2 ? ` · ${phoneIcon(c.phone2Type)} ${escapeHtml(c.phone2)}` : ""}</div>` : ""}
              ${c.fullAddress ? `<div class="stop-meta" style="font-size:0.78rem;">${escapeHtml(c.fullAddress)}</div>` : ""}
              ${c.email ? `<div class="stop-meta" style="font-size:0.78rem;">${I.email(12)} ${escapeHtml(c.email)}</div>` : ""}
            </div>
          </label>`).join("")}
      </div>
      <div style="padding:12px 16px;border-top:1px solid var(--line);display:flex;gap:8px;align-items:center;">
        <div id="import-progress" class="stop-meta" style="flex:1;"></div>
        <button class="btn" id="import-close-btn">Annulla</button>
        <button class="btn primary" id="import-confirm-btn">Importa selezionati</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  // Select all toggle
  const selectAll = overlay.querySelector("#import-select-all");
  selectAll?.addEventListener("change", () => {
    overlay.querySelectorAll(".import-cb").forEach(cb => cb.checked = selectAll.checked);
  });

  // Close
  const close = () => overlay.remove();
  overlay.querySelector("#import-close")?.addEventListener("click", close);
  overlay.querySelector("#import-close-btn")?.addEventListener("click", close);

  // Confirm
  overlay.querySelector("#import-confirm-btn")?.addEventListener("click", async () => {
    const geocode = overlay.querySelector("#import-geocode")?.checked ?? false;
    const selected = [...overlay.querySelectorAll(".import-cb:checked")]
      .map(cb => contacts[Number(cb.dataset.idx)]);

    if (!selected.length) { showToast("Nessun contatto selezionato"); return; }

    const confirmBtn = overlay.querySelector("#import-confirm-btn");
    const closeBtn   = overlay.querySelector("#import-close-btn");
    const progress   = overlay.querySelector("#import-progress");
    confirmBtn.disabled = true;
    closeBtn.disabled   = true;

    let added = 0;
    for (let i = 0; i < selected.length; i++) {
      const c = { ...selected[i] };
      delete c._dup;
      if (progress) progress.textContent = `${i + 1} / ${selected.length}…`;

      if (geocode && c.fullAddress && !c.lat) {
        const geo = await geocodeOne(c.fullAddress, state.googleMapsKey);
        if (geo) { c.lat = geo.lat; c.lng = geo.lng; }
      }

      try {
        await api("/api/addresses", { method: "POST", body: JSON.stringify(c) });
        added++;
      } catch { /* skip on error */ }
    }

    await refreshAllData();
    renderArchive();
    close();
    showToast(`${added} contatti importati`);
  });
}

function startImportWizard(contacts) {
  if (!contacts.length) { showToast("Nessun contatto trovato nel file"); return; }
  state.importWizard = { contacts, index: 0, saved: 0, skipped: 0 };
  loadWizardContact(0);
  setActiveTab("archive");
  renderArchive();
}

function loadWizardContact(index) {
  const c = state.importWizard.contacts[index];
  state.addressForm = {
    ...emptyForm,
    customer:   c.customer   || "",
    activity:   c.activity   || "",
    location:   c.location   || "",
    fullAddress: c.fullAddress || "",
    phone:      c.phone      || "",
    phoneType:  c.phoneType  || "cell",
    phone2:     c.phone2     || "",
    phone2Type: c.phone2Type || "fisso",
    email:      c.email      || "",
    addressType: c.addressType || "customer"
  };
}

function advanceWizard(wasSaved = true) {
  const w = state.importWizard;
  if (w && wasSaved) w.saved++;
  const next = w ? w.index + 1 : 0;
  if (!w || next >= w.contacts.length) {
    const summary = w ? `${w.saved} salvati, ${w.skipped} saltati` : "";
    state.importWizard = null;
    state.addressForm = { ...emptyForm };
    refreshAllData().then(() => renderArchive());
    showToast(`Importazione completata — ${summary}`);
    return;
  }
  w.index = next;
  loadWizardContact(next);
  renderArchive();
  // Scroll form into view on mobile
  setTimeout(() => document.getElementById("address-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
}

async function importFromContactPicker() {
  document.querySelector("#vcf-input")?.click();
}

async function importFromVcf(file) {
  showSpinner("Lettura file…");
  try {
    const text = await file.text();
    const contacts = file.name.toLowerCase().endsWith(".csv") ? parseCsv(text) : parseVcf(text);
    hideSpinner();
    startImportWizard(contacts);
  } catch {
    hideSpinner();
    showToast("Errore lettura file");
  }
}

let _gsiLoadPromise = null;

function loadGsiScript() {
  if (window.google?.accounts?.oauth2) return Promise.resolve(true);
  if (_gsiLoadPromise) return _gsiLoadPromise;
  _gsiLoadPromise = new Promise(resolve => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.onload = () => { _gsiLoadPromise = null; resolve(true); };
    s.onerror = () => { _gsiLoadPromise = null; resolve(false); };
    document.head.appendChild(s);
  });
  return _gsiLoadPromise;
}

function mapGoogleConnection(conn) {
  const name = conn.names?.[0];
  const org = conn.organizations?.[0];
  const email = conn.emailAddresses?.[0]?.value || "";
  const phones = conn.phoneNumbers || [];
  const addr = conn.addresses?.[0];

  const customer = name ? [name.givenName, name.familyName].filter(Boolean).join(" ") : "";
  const activity = org?.name || "";

  let phone = "", phoneType = "mobile", phoneName = "";
  let phone2 = "", phone2Type = "mobile", phone2Name = "";

  if (phones[0]) {
    phone = phones[0].value || "";
    phoneType = phones[0].type === "home" ? "fisso" : phones[0].type === "other" ? "altro" : "mobile";
    phoneName = phones[0].formattedType || "";
  }
  if (phones[1]) {
    phone2 = phones[1].value || "";
    phone2Type = phones[1].type === "home" ? "fisso" : phones[1].type === "other" ? "altro" : "mobile";
    phone2Name = phones[1].formattedType || "";
  }

  let fullAddress = "", street = "", city = "", postalCode = "", province = "";
  if (addr) {
    street = [addr.streetAddress, addr.extendedAddress].filter(Boolean).join(", ");
    city = addr.city || "";
    postalCode = addr.postalCode || "";
    province = addr.region || "";
    fullAddress = [street, postalCode, city, province].filter(Boolean).join(" ").trim()
      || addr.formattedValue || "";
  }

  return { customer, activity, location: "", fullAddress, street, city, postalCode, province,
    country: "Italia", phone, phoneType, phoneName, phone2, phone2Type, phone2Name,
    email, notes: "", lat: null, lng: null };
}

async function fetchGoogleConnections(token) {
  const allConnections = [];
  let pageToken = "";
  do {
    const url = new URL("https://people.googleapis.com/v1/people/me/connections");
    url.searchParams.set("personFields", "names,emailAddresses,phoneNumbers,addresses,organizations");
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`People API error ${response.status}`);
    const data = await response.json();
    for (const conn of data.connections || []) allConnections.push(conn);
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return allConnections;
}

function showGoogleContactsSelector(rawContacts) {
  const existing = new Set(state.addresses.map(a => a.customer.toLowerCase().trim()));
  state.googleContactsData = {
    contacts: rawContacts.map(c => ({ ...c, _dup: existing.has(c.customer.toLowerCase().trim()), _selected: false })),
    search: "",
    allSelected: false
  };
  state.activeTab = "google-contacts";
  render();
}

function renderGoogleContactsTab() {
  const data = state.googleContactsData;
  if (!data) { setActiveTab("archive"); return; }

  const { contacts, search, allSelected } = data;
  const q = search.trim().toLowerCase();
  const filtered = q
    ? contacts.filter(c => (c.customer + c.phone + c.email + c.fullAddress + c.activity).toLowerCase().includes(q))
    : contacts;

  const selectedCount = contacts.filter(c => c._selected).length;

  app.innerHTML = `
    <section class="grid" style="display:flex;flex-direction:column;height:100%;">
      <div class="panel" style="display:flex;flex-direction:column;flex:1;min-height:0;">
        <div class="section-head">
          <button class="btn ghost" id="gc-back">← Indietro</button>
          <h2 style="flex:1;text-align:center;">Contatti Google</h2>
          <span class="stop-meta" style="white-space:nowrap;">${contacts.length} totali</span>
        </div>

        <div style="display:flex;gap:8px;padding:10px 0;flex-wrap:wrap;align-items:center;">
          <input id="gc-search" placeholder="Cerca per nome, telefono, email…"
            value="${escapeHtml(search)}" style="flex:1;min-width:160px;" autocomplete="off" />
          <button class="btn" id="gc-toggle-all" style="white-space:nowrap;">
            ${allSelected ? "Deseleziona tutti" : "Seleziona tutti"}
          </button>
        </div>

        <div class="stop-meta" style="padding:2px 0 8px;">
          ${selectedCount > 0 ? `<b>${selectedCount}</b> selezionati` : "Nessun contatto selezionato"}
          ${q ? ` · ${filtered.length} risultati` : ""}
        </div>

        <div style="flex:1;overflow-y:auto;display:grid;gap:6px;padding-bottom:4px;">
          ${filtered.length === 0
            ? `<div class="empty">Nessun risultato</div>`
            : filtered.map(c => {
                const idx = contacts.indexOf(c);
                return `
                <label class="import-contact-row${c._dup ? " import-dup" : ""}${c._selected ? " import-selected" : ""}"
                  style="cursor:pointer;">
                  <input type="checkbox" class="gc-cb" data-idx="${idx}"
                    ${c._selected ? "checked" : ""}
                    style="width:18px;min-height:18px;height:18px;flex-shrink:0;" />
                  <div style="min-width:0;flex:1;">
                    <div style="font-weight:700;font-size:0.9rem;">
                      ${escapeHtml(c.customer || c.email || c.phone)}
                      ${c.activity ? `<span style="font-weight:400;color:var(--muted)"> — ${escapeHtml(c.activity)}</span>` : ""}
                      ${c._dup ? ' <span class="badge" style="font-size:0.7rem;vertical-align:middle;">già presente</span>' : ""}
                    </div>
                    ${c.phone ? `<div class="stop-meta">${phoneIcon(c.phoneType)} ${escapeHtml(c.phone)}${c.phone2 ? ` · ${escapeHtml(c.phone2)}` : ""}</div>` : ""}
                    ${c.email ? `<div class="stop-meta">${I.email(12)} ${escapeHtml(c.email)}</div>` : ""}
                    ${c.fullAddress ? `<div class="stop-meta">${I.location(12)} ${escapeHtml(c.fullAddress)}</div>` : ""}
                  </div>
                </label>`;
              }).join("")}
        </div>

        <div style="padding-top:12px;border-top:1px solid var(--line);display:flex;gap:8px;">
          <button class="btn" id="gc-back-btn">Annulla</button>
          <button class="btn primary" id="gc-confirm-btn" style="flex:1;"
            ${selectedCount === 0 ? "disabled" : ""}>
            Importa ${selectedCount > 0 ? selectedCount : ""} selezionati →
          </button>
        </div>
      </div>
    </section>`;
}

async function importFromGoogleContacts() {
  if (!state.googleClientId) { showToast("Google Client ID non configurato"); return; }

  const loaded = await loadGsiScript();
  if (!loaded) { showToast("Impossibile caricare Google Sign-In"); return; }

  return new Promise(resolve => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: state.googleClientId,
      scope: "https://www.googleapis.com/auth/contacts.readonly",
      callback: async tokenResponse => {
        if (tokenResponse.error) { showToast("Accesso Google negato"); resolve(); return; }
        showSpinner("Importazione contatti Google…");
        try {
          const connections = await fetchGoogleConnections(tokenResponse.access_token);
          hideSpinner();
          if (!connections.length) { showToast("Nessun contatto trovato"); resolve(); return; }
          const contacts = connections
            .map(mapGoogleConnection)
            .filter(c => c.customer || c.phone || c.email);
          showGoogleContactsSelector(contacts);
        } catch (err) {
          hideSpinner();
          showToast("Errore importazione: " + err.message);
        }
        resolve();
      }
    });
    client.requestAccessToken({ prompt: "consent" });
  });
}

// ── save address form ─────────────────────────────────────────────────────────

async function saveAddressForm(form) {
  const v = readForm(form);
  const payload = {
    customer: v.customer, activity: v.activity || "", location: v.location, fullAddress: v.fullAddress,
    addressType: v.addressType || "customer",
    phone: v.phone || "", phoneType: v.phoneType || "cell", phoneName: v.phoneName || "",
    phone2: v.phone2 || "", phone2Type: v.phone2Type || "fisso", phone2Name: v.phone2Name || "",
    phonePreferred: v.phonePreferred || "phone",
    email: v.email || "", notes: v.notes,
    weeklyHours: readWeeklyHours(),
    // Derive legacy fields from Mon or first working day for backward compat
    ...deriveHoursFromWeekly(readWeeklyHours()),
    defaultDuration: Number(v.defaultDuration || 45),
    lat: v.lat ? Number(v.lat) : null, lng: v.lng ? Number(v.lng) : null
  };
  if (state.addressForm.id) {
    await api(`/api/addresses/${state.addressForm.id}`, { method: "PUT", body: JSON.stringify(payload) });
  } else {
    await api("/api/addresses", { method: "POST", body: JSON.stringify(payload) });
  }
  if (!state.importWizard) {
    state.addressForm = { ...emptyForm };
    await refreshAllData();
    render();
  } else {
    await refreshAllData();
  }
  showToast("Contatto salvato");
}

// ── manual order helpers ──────────────────────────────────────────────────────

// Returns the ordered list of unique stops (no split-afternoon duplicates, no breaks)
// from either manualOrderRows (already filtered) or result.rows.
function getOrderableStops(result) {
  if (state.manualOrderRows) return [...state.manualOrderRows];
  return result.rows.filter(r => !r.type && (!r.stopPart || r.stopPart === "morning"));
}

// ── manual order replan ───────────────────────────────────────────────────────

async function replanWithOrder(manualOrder) {
  const result = normalizeSavedRoute(state.result);
  const rows = manualOrder ? getOrderableStops(result) : result.rows.filter(r => !r.type && (!r.stopPart || r.stopPart === "morning"));
  const r = state.route;
  state.planning = true;
  render();
  try {
    state.result = await api("/api/plan", {
      method: "POST",
      body: JSON.stringify({
        scheduledDate: result.scheduledDate,
        start: result.start,
        end: result.end,
        startTime: result.startTime,
        timingMode: result.timingMode,
        arrivalLeadMinutes: result.arrivalLeadMinutes,
        firstArrivalTime: result.firstArrivalTime,
        firstArrivalRequired: result.firstArrivalRequired,
        rates: state.settings,
        stops: rows.map(row => ({
          uid: row.stopUid || row.uid || crypto.randomUUID(),
          addressId: row.addressId,
          customer: row.customer, location: row.location,
          fullAddress: row.address || row.fullAddress, notes: row.notes,
          openMorning: row.openMorning, closeMorning: row.closeMorning,
          openAfternoon: row.openAfternoon, closeAfternoon: row.closeAfternoon,
          weeklyHours: row.weeklyHours || null,
          durationMinutes: row.durationMinutes, lat: row.lat, lng: row.lng
        })),
        manualOrder
      })
    });
    state.manualOrderRows = null;
    await refreshSavedRoutes();
    showToast("Percorso ricalcolato");
  } catch (e) {
    showToast(e.message);
  } finally {
    state.planning = false;
    render();
  }
}

// ── coordinate helpers ────────────────────────────────────────────────────────

function setCoordFields(lat, lng) {
  const latEl = document.querySelector("#coord-lat");
  const lngEl = document.querySelector("#coord-lng");
  if (latEl) latEl.value = Number(lat).toFixed(6);
  if (lngEl) lngEl.value = Number(lng).toFixed(6);
}

async function useCurrentPosition() {
  if (!navigator.geolocation) { showToast("GPS non disponibile su questo dispositivo"); return; }
  showToast("Lettura GPS…");
  navigator.geolocation.getCurrentPosition(
    pos => {
      setCoordFields(pos.coords.latitude, pos.coords.longitude);
      showToast(`Posizione acquisita: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
    },
    () => showToast("Impossibile ottenere la posizione. Controlla i permessi GPS."),
    { enableHighAccuracy: true, timeout: 10000 }
  );
}


async function completeFormWithMaps() {
  if (document.getElementById("cwm-modal")) return;

  const form = document.getElementById("address-form");
  if (!form) return;

  // Show modal immediately with loading state
  const modal = document.createElement("div");
  modal.id = "cwm-modal";
  modal.className = "cwm-modal";
  modal.innerHTML = `
    <div class="cwm-modal-header">
      <input id="cwm-search-input" type="text" class="cwm-search-input" placeholder="Cerca un luogo…" autocomplete="off" />
      <button class="btn" id="cwm-search-btn" style="flex-shrink:0">🔍</button>
      <button class="btn cwm-close-btn" id="cwm-close">✕</button>
    </div>
    <div id="cwm-map-container" class="cwm-map-container">
      <div class="cwm-map-loading">Caricamento mappa…</div>
    </div>
    <div id="cwm-place-bar" class="cwm-place-bar" style="display:none">
      <div class="cwm-place-info">
        <span id="cwm-place-name" class="cwm-place-name"></span>
        <span id="cwm-place-addr" class="cwm-place-addr"></span>
      </div>
      <button class="btn primary" id="cwm-use-btn">Usa</button>
    </div>`;
  document.body.appendChild(modal);

  const closeModal = () => modal.remove();
  modal.querySelector("#cwm-close").onclick = closeModal;
  document.addEventListener("keydown", function escHandler(e) {
    if (e.key === "Escape") { closeModal(); document.removeEventListener("keydown", escHandler); }
  });

  const mapEl = modal.querySelector("#cwm-map-container");
  const placeBar = modal.querySelector("#cwm-place-bar");
  const placeNameEl = modal.querySelector("#cwm-place-name");
  const placeAddrEl = modal.querySelector("#cwm-place-addr");
  const useBtn = modal.querySelector("#cwm-use-btn");

  const fVal = name => (form.querySelector(`[name="${name}"]`)?.value || "").trim();

  // Load Maps script
  const ready = await loadGoogleMapsScript();
  if (!ready || !google?.maps?.places) {
    mapEl.innerHTML = `<div class="cwm-map-loading" style="color:#ef4444">Google Maps non disponibile.<br>Verifica la configurazione della chiave API.</div>`;
    return;
  }

  mapEl.innerHTML = ""; // clear loading text

  let startLat = Number(fVal("lat")) || 0;
  let startLng = Number(fVal("lng")) || 0;
  const hasCoords = startLat !== 0 || startLng !== 0;
  const initCenter = hasCoords ? { lat: startLat, lng: startLng } : { lat: 46.07, lng: 11.12 };

  let map;
  try {
    map = new google.maps.Map(mapEl, {
      center: initCenter,
      zoom: hasCoords ? 16 : 7,
      gestureHandling: "greedy",
      clickableIcons: true,
    });
  } catch (err) {
    mapEl.innerHTML = `<div class="cwm-map-loading" style="color:#ef4444">Errore inizializzazione mappa: ${escapeHtml(err.message)}</div>`;
    return;
  }

  const svc = new google.maps.places.PlacesService(map);
  let selectedPlace = null;
  let activeMarker = null;

  function placeMarker(location, place) {
    if (activeMarker) activeMarker.setMap(null);
    activeMarker = new google.maps.Marker({ map, position: location, animation: google.maps.Animation.DROP });
    map.setCenter(location);
    map.setZoom(17);
    if (place) showPlaceBar(place);
  }

  function showPlaceBar(place) {
    selectedPlace = place;
    placeNameEl.textContent = place.name || "";
    placeAddrEl.textContent = place.formatted_address || place.vicinity || "";
    placeBar.style.display = "flex";
  }

  // Auto-center and pin on open
  const autoQuery = [fVal("activity") || fVal("customer"), fVal("fullAddress") || fVal("location")].filter(Boolean).join(" ");
  if (hasCoords) {
    new google.maps.Geocoder().geocode({ location: { lat: startLat, lng: startLng } }, (res, status) => {
      if (status === "OK" && res[0]) {
        placeMarker({ lat: startLat, lng: startLng }, {
          name: fVal("activity") || fVal("customer") || res[0].formatted_address,
          formatted_address: res[0].formatted_address,
          place_id: res[0].place_id
        });
      }
    });
  } else if (autoQuery) {
    svc.textSearch({ query: autoQuery, region: "it" }, (res, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && res[0]) {
        svc.getDetails({ placeId: res[0].place_id, fields: ["name", "formatted_address", "geometry", "formatted_phone_number", "international_phone_number", "opening_hours"] }, (detail, s) => {
          const place = s === google.maps.places.PlacesServiceStatus.OK ? detail : res[0];
          if (place.geometry?.location) placeMarker(place.geometry.location, place);
        });
      }
    });
  } else {
    navigator.geolocation?.getCurrentPosition(pos => {
      map.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      map.setZoom(14);
    });
  }

  // Helper: search by text query and pin result
  const doTextSearch = q => {
    if (!q.trim()) return;
    svc.textSearch({ query: q, region: "it" }, (res, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && res[0]) {
        svc.getDetails({ placeId: res[0].place_id, fields: ["name", "formatted_address", "geometry", "formatted_phone_number", "international_phone_number", "opening_hours"] }, (detail, s) => {
          const place = s === google.maps.places.PlacesServiceStatus.OK ? detail : res[0];
          if (place.geometry?.location) placeMarker(place.geometry.location, place);
        });
      } else {
        showToast("Nessun risultato trovato");
      }
    });
  };

  // Search box — also triggers on Enter key if user doesn't pick autocomplete
  const searchInput = modal.querySelector("#cwm-search-input");
  const searchBox = new google.maps.places.SearchBox(searchInput);
  map.addListener("bounds_changed", () => searchBox.setBounds(map.getBounds()));
  searchBox.addListener("places_changed", () => {
    const places = searchBox.getPlaces();
    if (!places?.length) return;
    const p = places[0];
    if (!p.place_id) { if (p.geometry?.location) placeMarker(p.geometry.location, p); return; }
    svc.getDetails({ placeId: p.place_id, fields: ["name", "formatted_address", "geometry", "formatted_phone_number", "international_phone_number", "opening_hours"] }, (detail, s) => {
      const place = s === google.maps.places.PlacesServiceStatus.OK ? detail : p;
      placeMarker(place.geometry?.location || p.geometry.location, place);
    });
  });
  searchInput.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); doTextSearch(searchInput.value); }
  });
  modal.querySelector("#cwm-search-btn").onclick = () => doTextSearch(searchInput.value);

  // Click on POI — pin it and show place bar
  map.addListener("click", e => {
    if (!e.placeId) return;
    e.stop();
    svc.getDetails({ placeId: e.placeId, fields: ["name", "formatted_address", "geometry", "formatted_phone_number", "international_phone_number", "opening_hours"] }, (place, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && place.geometry?.location) {
        placeMarker(place.geometry.location, place);
      }
    });
  });

  useBtn.onclick = async () => {
    if (!selectedPlace) return;
    if (!selectedPlace.opening_hours && selectedPlace.place_id) {
      useBtn.textContent = "…";
      useBtn.disabled = true;
      selectedPlace = await new Promise(resolve =>
        svc.getDetails({ placeId: selectedPlace.place_id, fields: ["name", "formatted_address", "geometry", "formatted_phone_number", "international_phone_number", "opening_hours"] },
          (p, s) => resolve(s === google.maps.places.PlacesServiceStatus.OK ? p : selectedPlace))
      );
    }
    closeModal();
    applyPlaceToForm(selectedPlace);
  };
}

function applyPlaceToForm(place) {
  const form = document.getElementById("address-form");
  if (!form) return;
  const f = name => form.querySelector(`[name="${name}"]`);
  const setIfEmpty = (name, value) => { const el = f(name); if (el && !el.value.trim() && value) el.value = value; };

  setIfEmpty("activity", place.name);
  setIfEmpty("customer", place.name);
  setIfEmpty("fullAddress", place.formatted_address);
  setIfEmpty("phone", place.formatted_phone_number || place.international_phone_number || "");
  if (place.geometry?.location) {
    setIfEmpty("lat", place.geometry.location.lat().toFixed(6));
    setIfEmpty("lng", place.geometry.location.lng().toFixed(6));
  }

  if (!place.opening_hours?.periods) { showToast("Dati compilati — nessun orario disponibile su Maps"); return; }

  const fmtTime = t => t?.length === 4 ? `${t.slice(0, 2)}:${t.slice(2)}` : (t || "");
  const byDay = {};
  for (const p of place.opening_hours.periods) {
    const d = p.open?.day ?? -1;
    if (d < 0) continue;
    if (!byDay[d]) byDay[d] = [];
    byDay[d].push({ open: fmtTime(p.open?.time), close: fmtTime(p.close?.time) });
  }

  let filled = 0;
  document.querySelectorAll(".wh-row").forEach(row => {
    const d = Number(row.dataset.day);
    const om = row.querySelector(".wh-om");
    if (!om || om.value.trim()) return;
    const periods = byDay[d];
    if (!periods) {
      const closedEl = row.querySelector(".wh-closed");
      if (closedEl && !closedEl.checked) { closedEl.checked = true; closedEl.dispatchEvent(new Event("change")); filled++; }
    } else {
      const p0 = periods[0], p1 = periods[1];
      const cont = periods.length === 1;
      const setV = (sel, v) => { const el = row.querySelector(sel); if (el && !el.value.trim()) el.value = v; };
      setV(".wh-om", p0.open);
      if (cont) {
        setV(".wh-ca", p0.close);
        const contEl = row.querySelector(".wh-cont");
        if (contEl && !contEl.checked) { contEl.checked = true; contEl.dispatchEvent(new Event("change")); }
      } else {
        setV(".wh-cm", p0.close);
        if (p1) { setV(".wh-oa", p1.open); setV(".wh-ca", p1.close); }
      }
      filled++;
    }
  });
  showToast(filled ? `Compilati orari per ${filled} giorni` : "Dati compilati — orari già presenti");
}



function openMapPicker() {
  const latEl = document.querySelector("#coord-lat");
  const lngEl = document.querySelector("#coord-lng");
  const startLat = Number(latEl?.value) || 46.07;
  const startLng = Number(lngEl?.value) || 11.12;
  let pickedLat = startLat, pickedLng = startLng;
  let pickedPlace = null; // full place data when selected via search
  let pickedAddress = ""; // real resolved address from geocoding or search

  const modal = document.createElement("div");
  modal.className = "map-picker-modal";
  modal.innerHTML = `
    <div class="map-picker-inner">
      <div class="map-picker-header">
        <input id="map-picker-search" class="map-picker-search" type="text" placeholder="Cerca un posto, indirizzo…" autocomplete="off" />
        <button class="btn" id="map-picker-cancel">✕</button>
      </div>
      <div id="map-picker-map"></div>
      <div class="map-picker-footer">
        <span id="map-picker-label" class="stop-meta">Tocca la mappa o cerca un luogo</span>
        <button class="btn primary" id="map-picker-confirm">✓ Usa</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  loadGoogleMapsScript().then(ready => {
    if (!ready) { showToast("Google Maps non disponibile"); modal.remove(); return; }

    const map = new google.maps.Map(document.getElementById("map-picker-map"), {
      center: { lat: startLat, lng: startLng }, zoom: 15,
      mapTypeControl: false, fullscreenControl: false, streetViewControl: false
    });

    const marker = new google.maps.Marker({
      position: { lat: startLat, lng: startLng }, map, draggable: true
    });

    const labelEl = document.getElementById("map-picker-label");

    const updateMarker = (lat, lng, label) => {
      pickedLat = lat; pickedLng = lng;
      marker.setPosition({ lat, lng });
      map.panTo({ lat, lng });
      if (labelEl) labelEl.textContent = label || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    };

    // Reverse geocode a tap to get a readable address
    const reverseGeocode = (lat, lng) => {
      new google.maps.Geocoder().geocode({ location: { lat, lng } }, (res, st) => {
        const addr = st === "OK" && res[0] ? res[0].formatted_address : "";
        pickedAddress = addr;
        updateMarker(lat, lng, addr || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        pickedPlace = null;
      });
    };

    map.addListener("click", e => {
      if (e.placeId) {
        // User tapped a business/POI pin on the map — load full place details
        e.stop();
        const svc = new google.maps.places.PlacesService(map);
        svc.getDetails({
          placeId: e.placeId,
          fields: ["name", "formatted_address", "geometry", "address_components",
                   "formatted_phone_number", "international_phone_number",
                   "opening_hours", "website"]
        }, (place, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && place.geometry) {
            pickedPlace = place;
            updateMarker(place.geometry.location.lat(), place.geometry.location.lng(),
              place.name || place.formatted_address);
            map.setZoom(17);
          }
        });
      } else {
        reverseGeocode(e.latLng.lat(), e.latLng.lng());
      }
    });
    marker.addListener("dragend", e => reverseGeocode(e.latLng.lat(), e.latLng.lng()));

    // Places Autocomplete — request all useful fields including phone and opening hours
    const searchInput = document.getElementById("map-picker-search");
    const autocomplete = new google.maps.places.Autocomplete(searchInput, {
      fields: ["name", "formatted_address", "geometry", "address_components",
               "formatted_phone_number", "international_phone_number",
               "opening_hours", "website", "types"],
      componentRestrictions: { country: "it" }
    });

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place.geometry?.location) { showToast("Luogo non trovato"); return; }
      pickedPlace = place;
      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();
      updateMarker(lat, lng, place.name || place.formatted_address);
      map.setZoom(17);
    });

    document.getElementById("map-picker-confirm").onclick = () => {
      // Always save coordinates (useful for route planning even for real addresses)
      setCoordFields(pickedLat, pickedLng);

      if (pickedPlace) {
        const components = pickedPlace.address_components || [];
        const get = (...types) => {
          for (const t of types) {
            const c = components.find(x => x.types.includes(t));
            if (c) return c.long_name;
          }
          return "";
        };
        const city = get("locality", "administrative_area_level_3", "administrative_area_level_2");
        const province = get("administrative_area_level_2");

        const f = name => document.querySelector(`#address-form [name=${name}]`);

        // Always overwrite with place data when coming from map search
        if (f("customer")) f("customer").value = pickedPlace.name || "";
        if (f("location")) f("location").value = city || province || "";
        if (f("fullAddress")) f("fullAddress").value = pickedPlace.formatted_address || "";

        // Phone — prefer formatted local number, fall back to international; auto-detect type
        const phone = pickedPlace.formatted_phone_number || pickedPlace.international_phone_number || "";
        if (phone) {
          const digits = phone.replace(/\D/g, "");
          // Italian mobile: starts with 3 (after country code +39 → strip it)
          const localDigits = digits.startsWith("39") ? digits.slice(2) : digits;
          const autoType = localDigits.startsWith("3") ? "cell" : "fisso";
          if (f("phone") && !f("phone").value) {
            f("phone").value = phone;
            const sel = document.querySelector("#address-form [name=phoneType]");
            if (sel) sel.value = autoType;
          }
        }

        // Opening hours — parse periods into morning/afternoon for each day
        const periods = pickedPlace.opening_hours?.periods;
        const weekdayText = pickedPlace.opening_hours?.weekday_text || [];
        if (periods && periods.length) {
          const fmtTime = s => {
            // s is a string like "0830" or "1730"
            const str = String(s || "").padStart(4, "0");
            return `${str.slice(0,2)}:${str.slice(2,4)}`;
          };
          // Build per-day hours map (Google day: 0=Sun)
          const byDay = {};
          for (const p of periods) {
            const d = p.open?.day;
            if (d == null) continue;
            if (!byDay[d]) byDay[d] = { openMorning:"", closeMorning:"", openAfternoon:"", closeAfternoon:"", closed:false };
            const openT = p.open?.time ? fmtTime(p.open.time) : "";
            const closeT = p.close?.time ? fmtTime(p.close.time) : "";
            const slot = byDay[d];
            if (!slot.openMorning) {
              slot.openMorning = openT; slot.closeMorning = closeT; slot._periods = 1;
            } else {
              slot.openAfternoon = openT; slot.closeAfternoon = closeT; slot._periods = 2;
            }
          }
          // Mark closed days; detect continuous (single period)
          for (let d = 0; d < 7; d++) {
            if (!byDay[d]) { byDay[d] = { closed: true, continuous: false, openMorning:"", closeMorning:"", openAfternoon:"", closeAfternoon:"" }; continue; }
            const s = byDay[d];
            if (!s.closed && s._periods === 1) {
              // Single period — treat as continuous: openMorning→closeMorning becomes open→close
              s.continuous = true;
              s.closeAfternoon = s.closeMorning;
              s.closeMorning = "";
              s.openAfternoon = "";
            } else {
              s.continuous = false;
            }
            delete s._periods;
          }
          // Update state and re-render weekly hours table
          state.addressForm.weeklyHours = byDay;

          // Fill standard fields from a typical weekday (prefer Monday=1)
          const typical = byDay[1] || byDay[2] || byDay[3] || byDay[4] || byDay[5];
          if (typical && !typical.closed) {
            if (f("openMorning") && !f("openMorning").value) f("openMorning").value = typical.openMorning || "";
            if (f("closeMorning") && !f("closeMorning").value) f("closeMorning").value = typical.closeMorning || "";
            if (f("openAfternoon") && !f("openAfternoon").value) f("openAfternoon").value = typical.openAfternoon || "";
            if (f("closeAfternoon") && !f("closeAfternoon").value) f("closeAfternoon").value = typical.closeAfternoon || "";
          }

          // Re-render weekly hours table with imported data
          const whContainer = document.querySelector("#address-form .wh-days-wrap");
          if (whContainer) {
            const tempDiv = document.createElement("div");
            tempDiv.innerHTML = renderWeeklyHoursSection(byDay);
            const newWrap = tempDiv.querySelector(".wh-days-wrap");
            if (newWrap) whContainer.replaceWith(newWrap);
          }

          // Special hours: check if any day differs from the typical pattern
          const specialDays = [];
          if (weekdayText.length) {
            // Always include full weekday_text when there are irregular hours
            const hasClosure = Object.values(byDay).some(d => d.closed);
            const uniqueSlots = new Set(Object.values(byDay).map(d => `${d.openMorning}-${d.closeMorning}-${d.openAfternoon}-${d.closeAfternoon}`));
            if (hasClosure || uniqueSlots.size > 2) {
              specialDays.push(...weekdayText);
            }
          }
          if (specialDays.length) {
            const notesEl = f("notes");
            if (notesEl) {
              const existing = notesEl.value.trim();
              const hoursBlock = "Orari: " + specialDays.join("; ");
              notesEl.value = existing ? `${existing}\n${hoursBlock}` : hoursBlock;
            }
          }
        }

        showToast("Dati compilati dalla mappa");
      } else {
        showToast("Coordinate aggiornate");
      }
      modal.remove();
    };

    document.getElementById("map-picker-cancel").onclick = () => modal.remove();
  });
}

// ── openMapPickerForField ─────────────────────────────────────────────────────

function openMapPickerForField({ labelEl, addressEl, latEl, lngEl, onConfirm }) {
  const startLat = Number(latEl?.value) || 46.07;
  const startLng = Number(lngEl?.value) || 11.12;
  let pickedLat = startLat, pickedLng = startLng;
  let pickedPlace = null;
  let pickedAddress = ""; // real resolved address (empty = only coordinates)

  const modal = document.createElement("div");
  modal.className = "map-picker-modal";
  modal.innerHTML = `
    <div class="map-picker-inner">
      <div class="map-picker-header">
        <input id="map-picker-field-search" class="map-picker-search" type="text" placeholder="Cerca un posto, indirizzo…" autocomplete="off" />
        <button class="btn" id="map-picker-field-cancel">✕</button>
      </div>
      <div id="map-picker-field-map"></div>
      <div class="map-picker-footer">
        <span id="map-picker-field-label" class="stop-meta">Tocca la mappa o cerca un luogo</span>
        <div style="display:flex;gap:6px;">
          <button class="btn ghost" id="map-picker-field-save" title="Salva nell'archivio e usa">💾 Salva</button>
          <button class="btn primary" id="map-picker-field-confirm">✓ Usa</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);

  loadGoogleMapsScript().then(ready => {
    if (!ready) { showToast("Google Maps non disponibile"); modal.remove(); return; }

    const map = new google.maps.Map(document.getElementById("map-picker-field-map"), {
      center: { lat: startLat, lng: startLng }, zoom: 15,
      mapTypeControl: false, fullscreenControl: false, streetViewControl: false
    });
    const marker = new google.maps.Marker({ position: { lat: startLat, lng: startLng }, map, draggable: true });
    const labelSpan = document.getElementById("map-picker-field-label");

    const updateMarker = (lat, lng, label) => {
      pickedLat = lat; pickedLng = lng;
      marker.setPosition({ lat, lng }); map.panTo({ lat, lng });
      if (labelSpan) labelSpan.textContent = label || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    };
    const reverseGeocode = (lat, lng) => {
      new google.maps.Geocoder().geocode({ location: { lat, lng } }, (res, st) => {
        const addr = st === "OK" && res[0] ? res[0].formatted_address : "";
        pickedAddress = addr;
        updateMarker(lat, lng, addr || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        pickedPlace = null;
      });
    };
    map.addListener("click", e => {
      if (e.placeId) {
        e.stop();
        new google.maps.places.PlacesService(map).getDetails({
          placeId: e.placeId,
          fields: ["name", "formatted_address", "geometry"]
        }, (place, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && place.geometry) {
            pickedPlace = place;
            updateMarker(place.geometry.location.lat(), place.geometry.location.lng(), place.name || place.formatted_address);
            map.setZoom(17);
          }
        });
      } else {
        reverseGeocode(e.latLng.lat(), e.latLng.lng());
      }
    });
    marker.addListener("dragend", e => reverseGeocode(e.latLng.lat(), e.latLng.lng()));

    const searchInput = document.getElementById("map-picker-field-search");
    const autocomplete = new google.maps.places.Autocomplete(searchInput, {
      fields: ["name", "formatted_address", "geometry"],
      componentRestrictions: { country: "it" }
    });
    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place.geometry?.location) { showToast("Luogo non trovato"); return; }
      pickedPlace = place;
      pickedAddress = place.formatted_address || place.name || "";
      updateMarker(place.geometry.location.lat(), place.geometry.location.lng(), place.name || place.formatted_address);
      map.setZoom(17);
    });

    const applyPick = async (saveToArchive) => {
      if (latEl) latEl.value = Number(pickedLat).toFixed(6);
      if (lngEl) lngEl.value = Number(pickedLng).toFixed(6);
      let label = "", address = "";
      if (pickedPlace) {
        label = pickedPlace.name || "";
        address = pickedPlace.formatted_address || "";
        pickedAddress = address;
        if (labelEl) labelEl.value = label;
        if (addressEl) addressEl.value = address;
      } else {
        address = pickedAddress;
        if (addressEl && address) addressEl.value = address;
      }
      if (saveToArchive) {
        if (!address) { showToast("Cerca o seleziona un luogo prima di salvare"); return; }
        try {
          await api("/api/addresses", {
            method: "POST",
            body: JSON.stringify({ customer: label || address, fullAddress: address, lat: pickedLat, lng: pickedLng, placeId: pickedPlace?.place_id || null })
          });
          await refreshAllData();
          showToast("Luogo salvato nell'archivio");
        } catch (err) { showToast("Errore nel salvataggio: " + err.message); return; }
      } else {
        showToast(pickedPlace ? "Dati compilati dalla mappa" : "Coordinate aggiornate");
      }
      if (onConfirm) onConfirm(label, address, pickedLat, pickedLng);
      modal.remove();
    };
    document.getElementById("map-picker-field-confirm").onclick = () => applyPick(false);
    document.getElementById("map-picker-field-save").onclick = () => applyPick(true);
    document.getElementById("map-picker-field-cancel").onclick = () => modal.remove();
  });
}

// ── events ────────────────────────────────────────────────────────────────────

function bindEvents() {
  document.getElementById("menu-btn")?.addEventListener("click", () => openMenu());
  document.querySelector(".tabs").addEventListener("click", e => {
    const b = e.target.closest("[data-tab]");
    if (b) {
      updateRouteFromForm();
      // Reset archive state when leaving archive tab
      if (b.dataset.tab !== "archive") {
        state.addressSearch = "";
        state.archiveShowAll = false;
      }
      setActiveTab(b.dataset.tab);
    }
  });

  app.addEventListener("input", e => {
    // stop field updates
    const sf = e.target.closest("[data-stop]");
    if (sf) {
      const [uid, key] = sf.dataset.stop.split(":");
      const stop = state.route.stops.find(s => s.uid === uid);
      if (stop) stop[key] = key === "durationMinutes" ? Number(sf.value || 0) : sf.value;
    }
    // google contacts search
    if (e.target.id === "gc-search" && state.googleContactsData) {
      state.googleContactsData.search = e.target.value;
      render();
      return;
    }
    // archive search
    if (e.target.id === "archive-search") {
      const q = e.target.value;
      state.addressSearch = q;
      state.archiveShowAll = Boolean(q);
      // Immediate client-side filter from already-loaded list, then server confirms
      if (q) {
        const ql = q.toLowerCase();
        state.addresses = state.allAddresses.filter(a =>
          [a.customer, a.activity, a.location, a.fullAddress, a.notes].some(v => (v || "").toLowerCase().includes(ql))
        );
        renderArchive();
      }
      refreshAllData().then(() => renderArchive());
    }
    // stop autocomplete
    if (e.target.id === "stop-search") {
      state.stopSearchText = e.target.value;
      state.route.selectedAddressId = "";
      const sug = document.querySelector("#stop-suggestions");
      if (sug) sug.innerHTML = renderStopSuggestions();
    }
    // stop filter
    if (e.target.id === "stop-filter") {
      state.stopFilter = e.target.value;
      const aside = document.querySelector("#stops-aside");
      if (aside) {
        const h2 = aside.querySelector("h2");
        if (h2) h2.textContent = `Tappe (${state.route.stops.length})`;
        const filterInput = aside.querySelector("#stop-filter");
        const stopListEl = aside.querySelector(".stop-list, .empty");
        const newHtml = renderStops();
        if (stopListEl) stopListEl.outerHTML = newHtml;
        else aside.insertAdjacentHTML("beforeend", newHtml);
        if (filterInput) filterInput.focus();
      }
    }
  });

  app.addEventListener("change", e => {
    if (e.target.name === "endSameAsStart" || e.target.name === "timingMode") {
      updateRouteFromForm();
      render();
    }
    if (e.target.name === "lunchBreak") {
      const minutesInput = document.getElementById("lunch-break-minutes");
      if (minutesInput) minutesInput.disabled = !e.target.checked;
      state.route.lunchBreak = e.target.checked;
    }
  });

  app.addEventListener("click", async e => {
    // expand button (⋯) — explicit handler so the button works
    const expandBtn = e.target.closest(".rc-expand-btn");
    if (expandBtn) {
      const id = expandBtn.dataset.expandStop;
      const details = document.querySelector(`[data-stop-details="${id}"]`);
      if (details) details.hidden = !details.hidden;
      return;
    }
    // accordion expand/collapse by clicking the head row (not on a link or button)
    const toggleHours = e.target.closest("[data-toggle-hours]");
    if (toggleHours) {
      const uid = toggleHours.dataset.toggleHours;
      const panel = document.getElementById(uid);
      const btn = document.querySelector(`.wh-day-btn[data-toggle-hours="${uid}"]`);
      if (panel) {
        panel.hidden = !panel.hidden;
        if (btn) {
          btn.setAttribute("aria-expanded", String(!panel.hidden));
          btn.querySelector(".wh-day-expand")?.replaceWith(Object.assign(document.createElement("span"), { className: "wh-day-expand", innerHTML: panel.hidden ? I.arrowDown(12) : I.arrowUp(12) }));
        }
      }
      return;
    }

    const expandHead = e.target.closest("[data-expand-stop]");
    if (expandHead && !e.target.closest("a, button")) {
      const id = expandHead.dataset.expandStop;
      const details = document.querySelector(`[data-stop-details="${id}"]`);
      if (details) details.hidden = !details.hidden;
      return;
    }

    const tabJump = e.target.closest("[data-tab-jump]");
    if (tabJump) { setActiveTab(tabJump.dataset.tabJump); return; }

    // suggestion item selected
    const sugItem = e.target.closest("[data-suggest-id]");
    if (sugItem) {
      const id = sugItem.dataset.suggestId;
      const addr = state.allAddresses.find(a => String(a.id) === id);
      if (addr) {
        state.route.selectedAddressId = id;
        state.stopSearchText = addressName(addr);
        const inp = document.querySelector("#stop-search");
        if (inp) inp.value = state.stopSearchText;
        const hidden = document.querySelector("#selected-address-id");
        if (hidden) hidden.value = id;
        const sug = document.querySelector("#stop-suggestions");
        if (sug) sug.innerHTML = "";
      }
      return;
    }

    if (e.target.closest("#print-route-btn")) {
      printRoute();
      return;
    }

    if (e.target.closest("#toggle-lunch-break")) {
      if (!state.result) return;
      const hasLunch = state.result.rows?.some(r => r.type === "lunch");
      // Toggle lunch break by replanning with inverted setting
      const result = normalizeSavedRoute(state.result);
      const customerRows = result.rows.filter(r => !r.type);
      state.planning = true;
      showSpinner(hasLunch ? "Rimozione pranzo…" : "Aggiunta pranzo…");
      render();
      try {
        state.result = await api("/api/plan", {
          method: "POST",
          body: JSON.stringify({
            name: result.name || "Percorso giornaliero",
            scheduledDate: result.scheduledDate,
            start: result.start,
            end: result.end,
            startTime: result.startTime,
            timingMode: result.timingMode,
            arrivalLeadMinutes: result.arrivalLeadMinutes,
            firstArrivalTime: result.firstArrivalTime,
            firstArrivalRequired: result.firstArrivalRequired,
            rates: state.settings,
            manualOrder: true,
            lunchBreak: !hasLunch,
            lunchBreakMinutes: state.settings.lunchBreakMinutes || 45,
            stops: customerRows.filter((r, i, arr) => !r.stopPart || arr.findIndex(x => x.stopUid === r.stopUid) === i).map(row => ({
              uid: row.stopUid || crypto.randomUUID(),
              addressId: row.addressId,
              customer: row.customer, location: row.location,
              fullAddress: row.fullAddress || row.address, notes: row.notes,
              openMorning: row.openMorning, closeMorning: row.closeMorning,
              openAfternoon: row.openAfternoon, closeAfternoon: row.closeAfternoon,
              durationMinutes: (row.stopPart === "morning" ? (customerRows.filter(x => x.stopUid === row.stopUid).reduce((t, x) => t + x.durationMinutes, 0)) : row.durationMinutes),
              lat: row.lat, lng: row.lng
            }))
          })
        });
        state.manualOrderRows = null;
        showToast(hasLunch ? "Pausa pranzo rimossa" : "Pausa pranzo aggiunta");
        setActiveTab("result");
      } catch (err) {
        showToast(err.message);
      } finally {
        hideSpinner();
        state.planning = false;
        render();
      }
      return;
    }

    const renameCurrentRoute = e.target.closest("[data-rename-current-route]");
    if (renameCurrentRoute) {
      const name = window.prompt("Nuovo nome giro:", state.result?.name || "");
      if (!name) return;
      const id = renameCurrentRoute.dataset.renameCurrentRoute;
      await api(`/api/routes/${id}`, { method: "PUT", body: JSON.stringify({ name }) });
      if (state.result) state.result.name = name;
      await refreshSavedRoutes();
      render();
      return;
    }

    // show all archive contacts
    if (e.target.closest("#show-all-addresses")) {
      state.archiveShowAll = true;
      await refreshAllData();
      renderArchive();
      return;
    }

    // hide / reset archive
    if (e.target.closest("#hide-all-addresses")) {
      state.archiveShowAll = false;
      state.addressSearch = "";
      state.addresses = [];
      renderArchive();
      return;
    }

    if (e.target.closest("#refresh-routes")) {
      await refreshSavedRoutes();
      renderSaved();
      showToast("Aggiornato");
      return;
    }

    const openRoute = e.target.closest("[data-open-route]");
    if (openRoute) {
      showToast("Carico giro…");
      try {
        const raw = await api(`/api/routes/${openRoute.dataset.openRoute}`);
        state.result = normalizeSavedRoute({ ...raw.payload, id: raw.id, ...raw });
        state.manualOrderRows = null;
        setActiveTab("result");
      } catch (err) {
        showToast(err.message);
      }
      return;
    }

    const renameRoute = e.target.closest("[data-rename-route]");
    if (renameRoute) {
      const name = window.prompt("Nuovo nome giro:");
      if (!name) return;
      await api(`/api/routes/${renameRoute.dataset.renameRoute}`, { method: "PUT", body: JSON.stringify({ name }) });
      await refreshSavedRoutes();
      renderSaved();
      return;
    }

    const deleteRoute = e.target.closest("[data-delete-route]");
    if (deleteRoute) {
      if (!confirm("Eliminare questo giro?")) return;
      await api(`/api/routes/${deleteRoute.dataset.deleteRoute}`, { method: "DELETE" });
      await refreshSavedRoutes();
      renderSaved();
      return;
    }

    const duplicateRoute = e.target.closest("[data-duplicate-route]");
    if (duplicateRoute) {
      try {
        const id = duplicateRoute.dataset.duplicateRoute;
        const raw = await api(`/api/routes/${id}`);
        const { id: _id, ...payload } = raw;
        const newName = (raw.name || "Giro") + " (copia)";
        await api("/api/routes", { method: "POST", body: JSON.stringify({ ...payload, name: newName }) });
        await refreshSavedRoutes();
        renderSaved();
        showToast("Giro duplicato");
      } catch (err) {
        showToast(err.message);
      }
      return;
    }

    const removeStop = e.target.closest("[data-remove-stop]");
    if (removeStop) {
      state.route.stops = state.route.stops.filter(s => s.uid !== removeStop.dataset.removeStop);
      render();
      return;
    }

    if (e.target.closest("#add-saved-stop")) {
      updateRouteFromForm();
      const addr = state.allAddresses.find(a => String(a.id) === String(state.route.selectedAddressId));
      if (!addr) { showToast("Seleziona prima un contatto dalla lista"); return; }
      state.route.stops.push(addressToStop(addr));
      state.route.selectedAddressId = "";
      state.stopSearchText = "";
      render();
      return;
    }

    if (e.target.closest("#add-custom-stop")) {
      updateRouteFromForm();
      if (!state.route.customAddress || !state.route.customCustomer) { showToast("Cliente e indirizzo obbligatori"); return; }
      const wh = readWeeklyHours();
      const saved = await api("/api/addresses", {
        method: "POST",
        body: JSON.stringify({
          customer: state.route.customCustomer, location: state.route.customLocation,
          fullAddress: state.route.customAddress,
          weeklyHours: wh || null,
          defaultDuration: state.route.customDuration
        })
      }).catch(() => null);
      await refreshAllData();
      state.route.stops.push({
        uid: crypto.randomUUID(),
        addressId: saved?.id, customer: state.route.customCustomer, location: state.route.customLocation,
        fullAddress: state.route.customAddress, durationMinutes: state.route.customDuration,
        weeklyHours: wh, recognized: true
      });
      Object.assign(state.route, { customCustomer: "", customLocation: "", customAddress: "", customDuration: 45, customWeeklyHours: null });
      render();
      showToast("Tappa aggiunta e salvata");
      return;
    }

    if (e.target.closest("#plan-route")) { await planCurrentRoute(); return; }
    if (e.target.closest("#listen-command")) { toggleVoiceRecording(); return; }
    if (e.target.closest("#apply-command")) {
      try { await applyVoiceCommand(); } catch (err) { showToast(err.message); }
      return;
    }

    const checkOpening = e.target.closest("[data-check-opening]");
    if (checkOpening) {
      const id = checkOpening.dataset.checkOpening;
      const statusEl = document.getElementById(`opening-status-${id}`);
      if (!statusEl) return;
      if (statusEl.style.display !== "none") { statusEl.style.display = "none"; return; }
      statusEl.style.display = "block";
      statusEl.textContent = "⏳ Verifica in corso…";
      const today = new Date().toISOString().slice(0, 10);
      try {
        const data = await api(`/api/addresses/${id}/opening?date=${today}`);
        const dayNames = ["domenica","lunedì","martedì","mercoledì","giovedì","venerdì","sabato"];
        const todayName = dayNames[new Date().getDay()];
        const todayLine = data.weekdayText
          ? data.weekdayText.find(l => l.toLowerCase().startsWith(todayName.slice(0, 3))) || data.weekdayText[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1]
          : null;
        const statusIcon = data.isOpen === true ? "🟢 Aperto" : data.isOpen === false ? "🔴 Chiuso" : "⚫ Sconosciuto";
        statusEl.innerHTML = `<span class="opening-badge">${statusIcon}</span>${todayLine ? `<span class="opening-hours-today">${escapeHtml(todayLine)}</span>` : ""}`;
      } catch {
        statusEl.textContent = "Orari non disponibili";
      }
      return;
    }

    const editAddr = e.target.closest("[data-edit-address]");
    if (editAddr) {
      const addr = state.allAddresses.find(a => String(a.id) === editAddr.dataset.editAddress) || state.addresses.find(a => String(a.id) === editAddr.dataset.editAddress);
      state.addressForm = { ...emptyForm, ...addr };
      render();
      requestAnimationFrame(() => document.getElementById("address-form")?.scrollIntoView({ behavior: "smooth", block: "start" }));
      return;
    }

    const delAddr = e.target.closest("[data-delete-address]");
    if (delAddr) {
      if (!confirm("Eliminare questo contatto?")) return;
      await api(`/api/addresses/${delAddr.dataset.deleteAddress}`, { method: "DELETE" });
      await refreshAllData();
      render();
      return;
    }

    const vcalNav = e.target.closest("[data-vcal-nav]");
    if (vcalNav) {
      const [addrId, y, m] = vcalNav.dataset.vcalNav.split(":");
      state.visitCalendar[addrId] = { year: Number(y), month: Number(m) };
      // Re-render just the calendar div inside the card
      const calContainer = vcalNav.closest(".visit-history-details");
      if (calContainer) {
        const content = calContainer.querySelector(".vcal, .visit-history-empty");
        if (content) content.outerHTML = renderVisitCalendar(addrId);
      }
      return;
    }

    const visitRow = e.target.closest("[data-load-route]");
    if (visitRow) {
      const routeId = visitRow.dataset.loadRoute;
      const route = state.savedRoutes.find(r => String(r.id) === String(routeId));
      if (route) { state.result = route; setActiveTab("result"); }
      else {
        // Load full route from server
        api(`/api/routes/${routeId}`).then(raw => {
          if (raw) { state.result = raw; setActiveTab("result"); }
        });
      }
      return;
    }

    if (e.target.closest("#new-address") || e.target.closest("#cancel-address")) {
      state.addressForm = { ...emptyForm };
      render();
      return;
    }

    if (e.target.closest("#use-current-pos")) { useCurrentPosition(); return; }
    if (e.target.closest("#open-map-picker")) { openMapPicker(); return; }
    if (e.target.closest("#rp-custom-map-btn")) {
      openMapPickerForField({
        labelEl: document.querySelector("#rp-custom-customer"),
        addressEl: document.querySelector("#rp-custom-address"),
        latEl: document.querySelector("#rp-custom-lat"),
        lngEl: document.querySelector("#rp-custom-lng")
      });
      return;
    }

    // Weekly hours: toggle disabled state
    if (e.target.closest("#complete-with-maps-btn")) {
      completeFormWithMaps();
      return;
    }

    if (e.target.closest("#wh-fill-all-btn")) {
      // Copy Monday's hours to all non-closed days
      const rows = document.querySelectorAll(".wh-row");
      let srcRow = null;
      rows.forEach(r => { if (Number(r.dataset.day) === 1) srcRow = r; });
      if (!srcRow) return;
      const om = srcRow.querySelector(".wh-om")?.value || "";
      const cm = srcRow.querySelector(".wh-cm")?.value || "";
      const oa = srcRow.querySelector(".wh-oa")?.value || "";
      const ca = srcRow.querySelector(".wh-ca")?.value || "";
      const cont = srcRow.querySelector(".wh-cont")?.checked;
      rows.forEach(r => {
        if (r === srcRow) return;
        if (r.querySelector(".wh-closed")?.checked) return;
        const setV = (sel, v) => { const el = r.querySelector(sel); if (el) el.value = v; };
        setV(".wh-om", om); setV(".wh-cm", cont ? "" : cm);
        setV(".wh-oa", cont ? "" : oa); setV(".wh-ca", ca);
        const contEl = r.querySelector(".wh-cont");
        if (contEl) contEl.checked = !!cont;
      });
      return;
    }

    if (e.target.classList.contains("wh-closed") || e.target.classList.contains("wh-cont")) {
      const row = e.target.closest(".wh-row");
      if (row) {
        const closed = row.querySelector(".wh-closed")?.checked;
        const cont = row.querySelector(".wh-cont")?.checked;
        const times = row.querySelector(".wh-row-times");
        if (times) times.style.display = closed ? "none" : "";
        row.querySelector(".wh-cont") && (row.querySelector(".wh-cont").disabled = closed);
        row.querySelector(".wh-om") && (row.querySelector(".wh-om").disabled = closed);
        row.querySelector(".wh-cm") && (row.querySelector(".wh-cm").disabled = closed || cont);
        row.querySelector(".wh-oa") && (row.querySelector(".wh-oa").disabled = closed || cont);
        row.querySelector(".wh-ca") && (row.querySelector(".wh-ca").disabled = closed);
      }
      return;
    }

    if (e.target.closest("#import-contacts")) {
      await importFromContactPicker();
      return;
    }

    if (e.target.closest("#import-google-contacts")) {
      await importFromGoogleContacts();
      return;
    }

    if (e.target.closest("#gc-back") || e.target.closest("#gc-back-btn")) {
      state.googleContactsData = null;
      setActiveTab("archive");
      return;
    }

    if (e.target.closest("#gc-toggle-all")) {
      const data = state.googleContactsData;
      if (!data) return;
      data.allSelected = !data.allSelected;
      data.contacts.forEach(c => { c._selected = data.allSelected; });
      render();
      return;
    }

    if (e.target.closest("#gc-confirm-btn")) {
      const data = state.googleContactsData;
      if (!data) return;
      const selected = data.contacts.filter(c => c._selected).map(c => { const copy = { ...c }; delete copy._dup; delete copy._selected; return copy; });
      if (!selected.length) { showToast("Nessun contatto selezionato"); return; }
      state.googleContactsData = null;
      startImportWizard(selected);
      return;
    }

    if (e.target.classList.contains("gc-cb")) {
      const data = state.googleContactsData;
      if (!data) return;
      const idx = Number(e.target.dataset.idx);
      data.contacts[idx]._selected = e.target.checked;
      data.allSelected = data.contacts.every(c => c._selected);
      // aggiorna solo contatore e pulsante senza re-render completo
      const countEl = document.querySelector(".stop-meta b");
      const confirmBtn = document.querySelector("#gc-confirm-btn");
      const toggleBtn = document.querySelector("#gc-toggle-all");
      const selectedCount = data.contacts.filter(c => c._selected).length;
      if (countEl?.closest(".stop-meta")) {
        const meta = document.querySelector("[style*='padding:2px']");
        if (meta) meta.innerHTML = selectedCount > 0 ? `<b>${selectedCount}</b> selezionati` : "Nessun contatto selezionato";
      }
      if (confirmBtn) { confirmBtn.disabled = selectedCount === 0; confirmBtn.textContent = `Importa ${selectedCount > 0 ? selectedCount : ""} selezionati →`; }
      if (toggleBtn) toggleBtn.textContent = data.allSelected ? "Deseleziona tutti" : "Seleziona tutti";
      return;
    }

    // manual order controls — manualOrderRows stores only the unique stops (no split/type rows)
    const moveUp = e.target.closest("[data-move-up]");
    if (moveUp) {
      const i = Number(moveUp.dataset.moveUp);
      const result = normalizeSavedRoute(state.result);
      const stops = getOrderableStops(result);
      [stops[i - 1], stops[i]] = [stops[i], stops[i - 1]];
      state.manualOrderRows = stops;
      render();
      return;
    }

    const moveDown = e.target.closest("[data-move-down]");
    if (moveDown) {
      const i = Number(moveDown.dataset.moveDown);
      const result = normalizeSavedRoute(state.result);
      const stops = getOrderableStops(result);
      [stops[i], stops[i + 1]] = [stops[i + 1], stops[i]];
      state.manualOrderRows = stops;
      render();
      return;
    }

    if (e.target.closest("#replan-order")) { await replanWithOrder(true); return; }
    if (e.target.closest("#reset-order")) {
      state.manualOrderRows = null;
      await replanWithOrder(false);
      return;
    }
  });

  // Auto-detect phone/email from notes
  app.addEventListener("blur", e => {
    if (e.target.id !== "contact-notes") return;
    const text = e.target.value || "";
    const emailField = document.querySelector("#address-form [name=email]");
    const phoneField = document.querySelector("#address-form [name=phone]");
    if (emailField && !emailField.value) {
      const emailMatch = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) { emailField.value = emailMatch[0]; showToast("Email trovata nelle note"); }
    }
    if (phoneField && !phoneField.value) {
      const phoneMatch = text.match(/(?:\+39[\s.-]?)?(?:0\d{1,4}[\s.\-]?\d{4,8}|3\d{2}[\s.\-]?\d{6,7})/);
      if (phoneMatch) { phoneField.value = phoneMatch[0].trim(); showToast("Telefono trovato nelle note"); }
    }
  }, true);

  app.addEventListener("change", e => {
    if (e.target.id === "vcf-input") {
      const file = e.target.files?.[0];
      if (file) importFromVcf(file).catch(() => showToast("Errore lettura file"));
    }

    if (e.target.id === "result-date-input") {
      const newDate = e.target.value;
      if (!newDate) return;
      (async () => {
        try {
          showToast("Ricalcolo in corso…");
          const res = state.result;
          // Extract stops from result rows (regular stops have no type field)
          const stopsFromRows = (res?.rows || [])
            .filter(r => !r.type)
            .map(r => ({
              uid: r.uid || crypto.randomUUID(),
              addressId: r.addressId || null,
              customer: r.customer, location: r.location,
              fullAddress: r.fullAddress || r.address || "",
              lat: r.lat, lng: r.lng,
              durationMinutes: r.durationMinutes,
              weeklyHours: r.weeklyHours || null,
              openMorning: r.openMorning, closeMorning: r.closeMorning,
              openAfternoon: r.openAfternoon, closeAfternoon: r.closeAfternoon,
              notes: r.notes || ""
            }));
          const stops = stopsFromRows.length ? stopsFromRows
            : (res?.plannedStops || []).map(s => ({ ...s, uid: s.uid || crypto.randomUUID() }));
          if (!stops.length) { showToast("Nessuna tappa da ricalcolare"); return; }
          state.route = {
            ...state.route,
            scheduledDate: newDate,
            name: res?.name || state.route.name,
            startLabel: res?.start?.label || res?.startLabel || state.route.startLabel,
            startAddress: res?.start?.address || res?.startAddress || state.route.startAddress,
            endSameAsStart: res?.end?.sameAsStart ?? state.route.endSameAsStart,
            endLabel: res?.end?.label || res?.endLabel || state.route.endLabel,
            endAddress: res?.end?.address || res?.endAddress || state.route.endAddress,
            startTime: res?.startTime || state.route.startTime,
            lunchBreak: res?.lunchBreak ?? state.route.lunchBreak,
            lunchBreakMinutes: res?.lunchBreakMinutes || state.route.lunchBreakMinutes,
            stops
          };
          if (state.result) state.result = { ...state.result, scheduledDate: newDate };
          await planCurrentRoute();
        } catch (err) {
          showToast(err.message);
        }
      })();
      return;
    }

    const reschedule = e.target.closest("[data-reschedule-route]");
    if (reschedule) {
      const id = reschedule.dataset.rescheduleRoute;
      const newDate = reschedule.value;
      if (!newDate) return;
      (async () => {
        try {
          showToast("Ricalcolo in corso…");
          const raw = await api(`/api/routes/${id}`);
          const stops = (raw.plannedStops || raw.payload?.plannedStops || []).map(s => ({ ...s, uid: s.uid || crypto.randomUUID() }));
          state.route = {
            ...state.route,
            name: raw.name || state.route.name,
            scheduledDate: newDate,
            startLabel: raw.start?.label || raw.startLabel || state.route.startLabel,
            startAddress: raw.start?.address || raw.startAddress || state.route.startAddress,
            endSameAsStart: raw.end?.sameAsStart ?? state.route.endSameAsStart,
            endLabel: raw.end?.label || raw.endLabel || state.route.endLabel,
            endAddress: raw.end?.address || raw.endAddress || state.route.endAddress,
            startTime: raw.startTime || state.route.startTime,
            timingMode: raw.timingMode || state.route.timingMode,
            lunchBreak: raw.lunchBreak ?? state.route.lunchBreak,
            lunchBreakMinutes: raw.lunchBreakMinutes || state.route.lunchBreakMinutes,
            stops
          };
          setActiveTab("route");
          await planCurrentRoute();
        } catch (err) {
          showToast(err.message);
        }
      })();
    }
  });

  app.addEventListener("submit", async e => {
    e.preventDefault();
    if (e.target.id === "address-form") {
      try {
        await saveAddressForm(e.target);
        if (state.importWizard) advanceWizard(true);
      } catch (err) { showToast(err.message); }
    }
  });

  app.addEventListener("click", e => {
    if (e.target.id === "wizard-skip") {
      state.importWizard.skipped++;
      advanceWizard(false);
    }
    if (e.target.id === "wizard-abort") {
      const w = state.importWizard;
      state.importWizard = null;
      state.addressForm = { ...emptyForm };
      renderArchive();
      showToast(`Importazione interrotta — ${w.saved} contatti salvati`);
    }
  });
}

// ── auth screen ───────────────────────────────────────────────────────────────

function renderLoginForm() {
  return `<form class="auth-form">
    <label class="field">Username<input name="username" autocomplete="username" required /></label>
    <label class="field">Password<input name="password" type="password" autocomplete="current-password" required /></label>
    <label class="auth-remember"><input type="checkbox" name="remember" checked /> Ricordami su questo dispositivo</label>
    <p class="auth-error"></p>
    <button class="btn primary" type="submit" style="width:100%">Accedi</button>
  </form>`;
}

function renderRegisterForm() {
  return `<form class="auth-form">
    <label class="field">Username<input name="username" autocomplete="username" required /></label>
    <label class="field">Password<input name="password" type="password" autocomplete="new-password" minlength="6" required /></label>
    <p class="auth-error"></p>
    <button class="btn primary" type="submit" style="width:100%">Crea account</button>
    <p class="auth-hint">Minimo 6 caratteri per la password</p>
  </form>`;
}

function renderSetupForm() {
  return `<form class="auth-form">
    <label class="field">Username<input name="username" autocomplete="username" required /></label>
    <label class="field">Password<input name="password" type="password" autocomplete="new-password" minlength="6" required /></label>
    <p class="auth-error"></p>
    <button class="btn primary" type="submit" style="width:100%">Configura e accedi</button>
    <p class="auth-hint">I tuoi dati esistenti verranno associati a questo account.</p>
  </form>`;
}

function renderAuthScreen(isSetup = false) {
  let activeTab = isSetup ? "setup" : "login";

  const renderInner = () => {
    app.innerHTML = `
      <div class="auth-screen">
        <div class="auth-card">
          <div class="auth-logo">${_svg('<polygon points="3 11 22 2 13 21 11 13 3 11"/>',24)} Percorsi Lavoro</div>
          ${isSetup
            ? `<p class="auth-subtitle">Prima configurazione — crea il tuo account</p>`
            : `<div class="auth-tabs">
                <button class="auth-tab ${activeTab === 'login' ? 'active' : ''}" data-tab="login">Accedi</button>
                <button class="auth-tab ${activeTab === 'register' ? 'active' : ''}" data-tab="register">Registrati</button>
              </div>`
          }
          ${activeTab === "setup" ? renderSetupForm() : activeTab === "login" ? renderLoginForm() : renderRegisterForm()}
        </div>
      </div>`;

    app.querySelectorAll(".auth-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        activeTab = btn.dataset.tab;
        renderInner();
      });
    });

    const form = app.querySelector(".auth-form");
    if (form) {
      form.addEventListener("submit", async e => {
        e.preventDefault();
        const errEl = form.querySelector(".auth-error");
        const btn = form.querySelector("[type=submit]");
        const data = Object.fromEntries(new FormData(form));
        btn.disabled = true;
        try {
          const endpoint = isSetup ? "/api/auth/setup" : activeTab === "login" ? "/api/auth/login" : "/api/auth/register";
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: data.username, password: data.password, remember: data.remember === "on" })
          });
          const result = await res.json();
          if (!res.ok) throw new Error(result.error || "Errore");
          state.user = result;
          await initApp();
        } catch (err) {
          if (errEl) errEl.textContent = err.message;
        } finally {
          btn.disabled = false;
        }
      });
    }
  };

  renderInner();
}

// ── init ──────────────────────────────────────────────────────────────────────

async function initApp() {
  await loadInitialData();
  render();
}

async function init() {
  try {
    const meRes = await fetch('/api/auth/me');
    const me = await meRes.json().catch(() => ({}));
    if (!meRes.ok) {
      hideSplash();
      renderAuthScreen(me.setup === true);
      return;
    }
    state.user = me;
    await initApp();
    hideSplash();
  } catch {
    hideSplash();
    renderAuthScreen(false);
  }
}

applyTheme();
// Follow OS dark/light preference in real time when set to "auto"
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if ((state.themeMode || "auto") === "auto") applyTheme();
});
bindEvents();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/service-worker.js").catch(() => {}));
}

init().catch(err => {
  app.innerHTML = `<section class="panel"><h2>Errore avvio</h2><div class="empty">${escapeHtml(err.message)}</div></section>`;
});
