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

function minsToHHMM(minutes) {
  const v = Number(minutes || 0);
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
}
function hhmmToMins(str) {
  if (!str) return 0;
  // Accepts HH:MM, H:MM, or plain number (minutes)
  const m = String(str).match(/^(\d{1,2}):(\d{2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return Math.max(0, Number(str) || 0);
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
  share:    (s) => _svg('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>', s),
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
  whatsapp: (s) => _svg('<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.532 5.851L0 24l6.318-1.508A11.955 11.955 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.816 9.816 0 0 1-5.034-1.387l-.36-.214-3.742.893.925-3.65-.235-.374A9.773 9.773 0 0 1 2.182 12C2.182 6.57 6.57 2.182 12 2.182c5.43 0 9.818 4.388 9.818 9.818 0 5.43-4.388 9.818-9.818 9.818z"/>', s),
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

function formatPhoneForWhatsApp(phone) {
  let n = String(phone || "").replace(/[\s\-().+]/g, "");
  if (!n) return null;
  if (n.startsWith("00")) n = n.slice(2);
  if (!n.startsWith("39") && !n.startsWith("+")) n = "39" + n;
  return n.replace(/^\+/, "");
}

function parseTimeToMinutes(t) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h)) return null;
  return h * 60 + (m || 0);
}

function buildWhatsAppMessage(result, row) {
  const senderName = state.user?.nickname || state.user?.username || "";
  const scheduledDate = result.scheduledDate || "";
  const todayStr = new Date().toISOString().slice(0, 10);
  const isPast   = scheduledDate && scheduledDate < todayStr;
  const isToday  = scheduledDate === todayStr;
  // Past date or no date → no message
  if (isPast) return null;

  if (isToday) {
    // Use planned arrival as ETA. If already past → empty message.
    const planned = parseTimeToMinutes(row.arrivalTime);
    if (planned === null) return null;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (planned <= nowMin) return null;
    const eta = planned;
    const etaH = Math.floor(eta / 60).toString().padStart(2, "0");
    const etaM = (eta % 60).toString().padStart(2, "0");
    const parts = [
      `Buongiorno,`,
      `sono ${senderName || "in arrivo"}`.trim() + ` e il mio arrivo è previsto intorno alle ore ${etaH}:${etaM}.`,
      "A presto."
    ];
    return parts.join(" ");
  } else {
    // Future date: appointment confirmation request
    const dateStr = scheduledDate ? (() => {
      const [, m, d] = scheduledDate.split("-");
      const MONTHS = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
      return `${Number(d)} ${MONTHS[Number(m) - 1]}`;
    })() : "";
    const timeStr = row.arrivalTime ? row.arrivalTime.slice(0, 5) : "";
    const parts = [
      `Buongiorno,`,
      `la contatto per chiedere disponibilità per l'intervento di (specificare)${dateStr ? " il " + dateStr : ""}${timeStr ? " alle ore " + timeStr : ""}.`,
      `Grazie, attendo conferma.`
    ];
    return parts.join(" ");
  }
}

function addressName(a) {
  const primary = a.activity || a.customer || "";
  const secondary = a.activity && a.customer ? a.customer : (a.location || "");
  return `${primary}${secondary ? ` — ${secondary}` : ""}`.trim();
}

function showToast(message, duration = 2800) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove("show"), duration);
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
  const res = await fetch(window.location.origin + path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const payload = await res.json().catch(() => ({}));
  if (res.status === 401) {
    // Don't force logout during initial load (when user was just verified by /api/auth/me)
    if (state._authVerified) {
      state.user = null;
      state._authVerified = false;
      renderAuthScreen(false);
    }
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

// Pre-load theme from localStorage so applyTheme() uses correct values before settings load
const _savedTheme = (function(){ try { return JSON.parse(localStorage.getItem("pl_theme")||"{}"); } catch(e){ return {}; } })();

const state = {
  user: null,
  activeTab: "route",
  menuOpen: false, menuSection: null,
  theme: "day",
  themeMode: _savedTheme.mode || "auto",
  themePalette: _savedTheme.palette || "default",
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
    lunchBreakMinutes: 45,
    lunchFixedTime: "12:30",
    departureLatest: "",
    routeNotes: ""
  },
  result: null,
  expandedStops: new Set(),
  expandedPanels: new Set(),
  dirtyStops: new Set(),
  resultLunchEnabled: null,
  showCosts: false,
  resultCostRates: null,
  manualOrderRows: null,
  archiveSelectMode: false,
  archiveSelected: new Set(),
  archiveDeletePending: null,
  planning: false,
  stopFilter: "",
  importWizard: null,
  whisperConfigured: false,
  voiceRecording: false,
  _mediaRecorder: null,
  _audioChunks: []
};

// ── theme ────────────────────────────────────────────────────────────────────

function _hexToRgb(hex) {
  const h = hex.replace("#", "");
  return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
}
function _toHex({r,g,b}) { return "#"+[r,g,b].map(v=>Math.min(255,Math.max(0,Math.round(v))).toString(16).padStart(2,"0")).join(""); }
function _rgba({r,g,b},a) { return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`; }
function _mix(c,t,f) { return { r:c.r*f+t.r*(1-f), g:c.g*f+t.g*(1-f), b:c.b*f+t.b*(1-f) }; }

function applyBrandColor(hex) {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return;
  const el = document.documentElement;
  const isDark = el.dataset.theme === "night";
  const rgb = _hexToRgb(hex);
  const dark = _mix(rgb, {r:0,g:0,b:0}, 0.72);
  const light = _mix(rgb, {r:255,g:255,b:255}, 0.72);
  const darkOk = _mix(rgb, {r:0,g:0,b:0}, 0.58);
  const grey = { r:130, g:150, b:148 };
  const muted = _mix(rgb, grey, 0.35);

  el.style.setProperty("--primary", hex);
  el.style.setProperty("--primary-dark", _toHex(dark));
  el.style.setProperty("--accent", hex);
  el.style.setProperty("--accent-bg", _rgba(rgb, 0.10));
  el.style.setProperty("--accent-border", _rgba(rgb, 0.30));
  el.style.setProperty("--accent-glow", _rgba(rgb, 0.18));
  el.style.setProperty("--ok", _toHex(darkOk));
  el.style.setProperty("--muted", _toHex(muted));
  el.style.setProperty("--line", _rgba(rgb, 0.14));
  el.style.setProperty("--line-strong", _rgba(rgb, 0.30));
  el.style.setProperty("--grid-line", _rgba(rgb, 0.06));
  el.style.setProperty("--tab-active-text", _toHex(dark));
  el.style.setProperty("--tab-active-border", _rgba(rgb, 0.32));
  el.style.setProperty("--tab-active-bg", _rgba(rgb, 0.14));
  el.style.setProperty("--btn-primary-bg", `linear-gradient(135deg,${_toHex(light)} 0%,${hex} 55%,${_toHex(dark)} 100%)`);
  el.style.setProperty("--btn-primary-border", _rgba(rgb, 0.45));
  el.style.setProperty("--btn-primary-glow", _rgba(rgb, 0.28));
  el.style.setProperty("--btn-primary-text", "#ffffff");
  el.style.setProperty("--btn-primary-shine", "rgba(255,255,255,0.28)");
  el.style.setProperty("--top-line-a", _rgba(rgb, 0.90));
  el.style.setProperty("--card-top-a", _rgba(rgb, 0.50));
  el.style.setProperty("--card-corner", _rgba(rgb, 0.10));
  el.style.setProperty("--blob1", _rgba(rgb, 0.26));
  el.style.setProperty("--blob3", _rgba(rgb, 0.18));

  // Background e tab: tinta derivata dal colore aziendale (chiara/scura in base al tema)
  if (isDark) {
    const bgDark = _mix(rgb, {r:5,g:8,b:15}, 0.94);
    el.style.setProperty("--bg", _toHex(bgDark));
    el.style.setProperty("--tab-bg", _rgba(bgDark, 0.85));
    el.style.setProperty("--tab-border", _rgba(rgb, 0.06));
    el.style.setProperty("--tab-text", _toHex(_mix(rgb, {r:0,g:0,b:0}, 0.70)));
  } else {
    const bgLight = _mix(rgb, {r:255,g:255,b:255}, 0.92);
    const tabBgLight = _mix(rgb, {r:255,g:255,b:255}, 0.80);
    el.style.setProperty("--bg", _toHex(bgLight));
    el.style.setProperty("--tab-bg", _rgba(tabBgLight, 0.90));
    el.style.setProperty("--tab-border", _rgba(rgb, 0.14));
    el.style.setProperty("--tab-text", _toHex(_mix(rgb, {r:255,g:255,b:255}, 0.48)));
  }
}

// Secondo colore aziendale: ruoli visibili dedicati (sottotitolo header, pill
// di stato, bottoni ghost, etichette metriche) attivati da html[data-brand2]
function applyBrandColor2(hex2, hex1) {
  const el = document.documentElement;
  if (!hex2 || !/^#[0-9a-fA-F]{6}$/.test(hex2) || hex2.toLowerCase() === (hex1 || "").toLowerCase()) {
    clearBrandColor2();
    return;
  }
  const rgb2 = _hexToRgb(hex2);
  const dark2 = _mix(rgb2, {r:0,g:0,b:0}, 0.70);
  el.style.setProperty("--brand2", _toHex(dark2));
  el.style.setProperty("--brand2-bg", _rgba(rgb2, 0.12));
  el.style.setProperty("--brand2-border", _rgba(rgb2, 0.34));
  el.style.setProperty("--brand2-glow", _rgba(rgb2, 0.18));
  // dettagli decorativi condivisi: seconda metà di linee e blob
  el.style.setProperty("--top-line-b", _rgba(rgb2, 0.7));
  el.style.setProperty("--card-top-b", _rgba(rgb2, 0.4));
  el.style.setProperty("--blob2", _rgba(rgb2, 0.22));
  el.style.setProperty("--blob4", _rgba(rgb2, 0.16));
  el.style.setProperty("--accent2", _rgba(rgb2, 0.12));
  if (hex1 && /^#[0-9a-fA-F]{6}$/.test(hex1)) {
    const rgb1 = _hexToRgb(hex1);
    const light1 = _mix(rgb1, {r:255,g:255,b:255}, 0.72);
    el.style.setProperty("--btn-primary-bg", `linear-gradient(135deg,${_toHex(light1)} 0%,${hex1} 45%,${_toHex(dark2)} 100%)`);
  }
  el.dataset.brand2 = "1";
}

function clearBrandColor2() {
  const el = document.documentElement;
  ["--brand2","--brand2-bg","--brand2-border","--brand2-glow",
   "--top-line-b","--card-top-b","--blob2","--blob4","--accent2"
  ].forEach(v => el.style.removeProperty(v));
  delete el.dataset.brand2;
}

function clearBrandColor() {
  ["--primary","--primary-dark","--accent","--accent-bg","--accent-border","--accent-glow",
   "--ok","--muted","--line","--line-strong","--grid-line","--tab-active-text",
   "--tab-active-border","--tab-active-bg","--btn-primary-bg","--btn-primary-border",
   "--btn-primary-glow","--btn-primary-text","--btn-primary-shine",
   "--top-line-a","--card-top-a","--card-corner","--blob1","--blob3",
   "--bg","--tab-bg","--tab-border","--tab-text"
  ].forEach(v => document.documentElement.style.removeProperty(v));
}

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
  if (palette === "custom") state.theme = isDark ? "night" : "day";
  document.documentElement.dataset.theme = state.theme;
  // Applica/rimuovi colori aziendali personalizzati
  if (palette === "custom" && state.settings?.brandColor) {
    applyBrandColor(state.settings.brandColor);
    applyBrandColor2(state.settings.brandColor2, state.settings.brandColor);
  } else {
    clearBrandColor();
    clearBrandColor2();
  }
  try {
    localStorage.setItem("pl_theme", JSON.stringify({ mode, palette }));
    // cookie per il server-side theme injection (no-JS path e primo caricamento)
    const d = isDark ? "1" : "0";
    document.cookie = `pl_dark=${d};path=/;max-age=31536000;samesite=strict`;
  } catch {}
}

function updateGreeting() {
  const nick = state.user?.nickname;
  const eyebrow = document.querySelector(".topbar .eyebrow");
  const h1 = document.querySelector(".topbar h1");
  if (!eyebrow || !h1) return;

  if (!nick) {
    eyebrow.textContent = "Pianificazione giornaliera";
    h1.textContent = "Percorsi lavoro";
    return;
  }

  const now = new Date();
  const h = now.getHours();
  const todayStr = now.toISOString().slice(0, 10);

  // Cerca un giro programmato per oggi
  const todayRoute = (state.savedRoutes || []).find(r => r.scheduledDate === todayStr);
  const result = state.lastResult;
  const hasActiveRoute = !!(todayRoute || result?.rows?.length);

  let eyebrowText = "";
  let h1Text = nick;

  if (hasActiveRoute) {
    const result = state.lastResult;
    // Conta tappe da result se caricato, altrimenti da plannedStops del giro salvato
    const stops = result?.rows?.filter(r => !r.type)
      || (todayRoute?.plannedStops || []);
    const stopCount = stops.length;
    const lunchRow = result?.rows?.find(r => r.type === "lunch");
    const dayStart = result?.summary?.dayStart || todayRoute?.startTime || "";
    const finalTime = result?.finalLeg?.arrivalTime || "";

    if (h < 7) {
      eyebrowText = "Partenza presto oggi —";
      h1Text = stopCount ? `${stopCount} tappe in programma` : nick;
    } else if (dayStart && h < 10) {
      eyebrowText = "Buona giornata,";
      h1Text = `Partenza alle ${dayStart}`;
    } else if (lunchRow && h >= 11 && h < 13) {
      eyebrowText = "Quasi ora di pranzo —";
      h1Text = `${stopCount} tappe oggi`;
    } else if (lunchRow && h >= 13 && h < 15) {
      eyebrowText = "Buon pranzo,";
      h1Text = nick;
    } else if (finalTime && h >= 15) {
      eyebrowText = "Rientro previsto alle";
      h1Text = finalTime;
    } else if (stopCount) {
      const done = (result?.rows?.filter(r => !r.type) || []).filter(s => {
        const t = s.serviceEndTime ? (parseInt(s.serviceEndTime.split(":")[0]) * 60 + parseInt(s.serviceEndTime.split(":")[1] || 0)) : null;
        return t !== null && t < h * 60 + now.getMinutes();
      }).length;
      eyebrowText = done > 0 ? `${done} di ${stopCount} tappe completate —` : `${stopCount} tappe oggi —`;
      h1Text = nick;
    } else {
      eyebrowText = "Giro in corso,";
    }
  } else {
    // Nessun giro oggi — saluto orario
    if (h >= 0 && h < 5) {
      eyebrowText = "Meglio dormire..";
      h1Text = nick;
    } else if (h < 6) {
      eyebrowText = "Di buon'ora oggi,";
    } else if (h < 12) {
      eyebrowText = "Buongiorno,";
    } else if (h < 14) {
      eyebrowText = "Buon pranzo,";
    } else if (h < 18) {
      eyebrowText = "Buon pomeriggio,";
    } else if (h < 22) {
      eyebrowText = "Buonasera,";
    } else {
      eyebrowText = "Lavori a quest'ora?";
      h1Text = nick;
    }
  }

  eyebrow.textContent = eyebrowText;
  h1.textContent = h1Text;
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
  // Persisti la tab attiva e il giro corrente per il ripristino dopo reload
  try {
    const snap = { tab };
    if (tab === "result" && state.result?.id) snap.resultId = state.result.id;
    localStorage.setItem("pl_nav", JSON.stringify(snap));
  } catch {}
  if (tab === "archive") {
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

function closeMenu(revertTheme = true) {
  if (revertTheme && state._previewTheme) {
    state.themeMode = state._previewTheme.mode;
    state.themePalette = state._previewTheme.palette;
    if (state._previewTheme.brandColor !== undefined) state.settings.brandColor = state._previewTheme.brandColor;
    if (state._previewTheme.brandColor2 !== undefined) state.settings.brandColor2 = state._previewTheme.brandColor2;
    applyTheme();
    state._previewTheme = null;
  }
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
      btn.addEventListener("click", () => {
        if (btn.dataset.menuGo === "settings" && !state._previewTheme) {
          state._previewTheme = { mode: state.themeMode, palette: state.themePalette, brandColor: state.settings.brandColor, brandColor2: state.settings.brandColor2 };
        }
        state.menuSection = btn.dataset.menuGo;
        refreshSheet();
      });
    });
    ov.querySelectorAll("[data-stats-tab]").forEach(btn => {
      btn.addEventListener("click", () => { state.statsTab = btn.dataset.statsTab; refreshSheet(); });
    });
    ov.querySelector("#bsheet-back")?.addEventListener("click", () => {
      if (state.menuSection === "settings" && state._previewTheme) {
        state.themeMode = state._previewTheme.mode;
        state.themePalette = state._previewTheme.palette;
        if (state._previewTheme.brandColor !== undefined) state.settings.brandColor = state._previewTheme.brandColor;
        if (state._previewTheme.brandColor2 !== undefined) state.settings.brandColor2 = state._previewTheme.brandColor2;
        applyTheme();
        state._previewTheme = null;
      }
      state.menuSection = null;
      refreshSheet();
    });
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
        maxDetourMin: Math.round(Number(v.maxDetourMin) || 10),
        maxReturnTime: v.maxReturnTime || "",
        driveMarkupMinPerHour: Number(v.driveMarkupMinPerHour || 10),
        lunchOpenTime: v.lunchOpenTime || "11:30",
        lunchCloseTime: v.lunchCloseTime || "14:00",
        noBreakEarlyMin: Number(v.noBreakEarlyMin ?? 120),
        noBreakBeforeHomeMin: Number(v.noBreakBeforeHomeMin ?? 60),
        noBreakBeforeLunchMin: Number(v.noBreakBeforeLunchMin ?? 60),
        noBreakAfterLunchMin: Number(v.noBreakAfterLunchMin ?? 120),
        brandColor: v.brandColor || state.settings.brandColor || "",
        brandColor2: v.brandColor2 || state.settings.brandColor2 || ""
      };
      let saved;
      try {
        saved = await api("/api/settings", { method: "PUT", body: JSON.stringify(newSettings) });
      } catch (err) {
        showToast(err.message || "Errore nel salvataggio");
        return;
      }
      state._previewTheme = null;
      state.settings = saved;
      state.navigatorPref = state.settings.navigatorPref;
      try { localStorage.setItem("navigatorPref", state.navigatorPref); } catch {}
      state.themeMode = state.settings.themeMode || "auto";
      state.themePalette = state.settings.themePalette || "default";
      state.route.lunchBreak = state.settings.lunchBreakEnabled !== false;
      state.route.lunchBreakMinutes = state.settings.lunchBreakMinutes || 45;
      if (state.settings.defaultStartLabel || state.settings.defaultStartAddress) {
        state.route.startLabel = state.settings.defaultStartLabel || state.route.startLabel;
        state.route.startAddress = state.settings.defaultStartAddress || state.route.startAddress;
        if (state.route.endSameAsStart) {
          state.route.endLabel = state.route.startLabel;
          state.route.endAddress = state.route.startAddress;
        }
      }
      applyTheme();
      render(); // aggiorna il form percorso con i nuovi default
      showToast("Impostazioni salvate");
      closeMenu(false);
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
    ov.querySelector("#nickname-form")?.addEventListener("submit", async e => {
      e.preventDefault();
      const v = readForm(e.target);
      const errEl = document.getElementById("nickname-error");
      try {
        const res = await fetch("/api/auth/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nickname: v.nickname }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { if (errEl) errEl.textContent = data.error || "Errore"; return; }
        state.user = { ...state.user, nickname: data.nickname };
        try { localStorage.removeItem("pl_nickname_prompt_shown"); } catch {}
        updateGreeting();
        showToast("Nickname salvato");
      } catch { if (errEl) errEl.textContent = "Errore di rete"; }
    });
    ov.addEventListener("click", e => {
      const iconChip = e.target.closest("[data-icon-style]");
      if (iconChip) {
        const style = iconChip.dataset.iconStyle;
        ov.querySelectorAll(".icon-style-chip").forEach(c => c.classList.toggle("active", c.dataset.iconStyle === style));
        if (state.settings) state.settings.iconStyle = style;
        // Persist via settings API
        api("/api/settings", { method: "PUT", body: JSON.stringify({ ...state.settings, iconStyle: style }) })
          .then(s => { state.settings = s; }).catch(() => {});
        try { localStorage.setItem("pl_icon_style", style); } catch {}
        showToast("Icona salvata. Per vederla sulla schermata home rimuovi l'app e aggiungila di nuovo dal browser.", 5000);
        return;
      }
      const paletteChip = e.target.closest("[data-palette]");
      if (paletteChip && document.getElementById("themePaletteInput")) {
        document.querySelectorAll(".palette-chip").forEach(c => c.classList.remove("active"));
        paletteChip.classList.add("active");
        document.getElementById("themePaletteInput").value = paletteChip.dataset.palette;
        // Mostra/nascondi color picker aziendali
        const brandRow = document.getElementById("brand-color-row");
        if (brandRow) brandRow.style.display = paletteChip.dataset.palette === "custom" ? "" : "none";
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
      // Live preview colori aziendali
      if (e.target.name === "brandColor" || e.target.name === "brandColor2") {
        const c1 = document.getElementById("brandColorInput")?.value || "";
        const c2 = document.getElementById("brandColor2Input")?.value || "";
        const p1 = document.getElementById("brand-color-preview");
        if (p1) p1.textContent = c1;
        const p2 = document.getElementById("brand-color2-preview");
        if (p2) p2.textContent = c2;
        const chip = document.getElementById("palette-chip-custom");
        if (chip) chip.querySelector(".palette-swatch").style.background = `linear-gradient(135deg,${c1} 50%,${c2 || "#1a1a1a"} 50%)`;
        if (state.themePalette === "custom") {
          state.settings = { ...state.settings, brandColor: c1, brandColor2: c2 };
          applyTheme();
        }
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

const _iconStyles = [
  { id: "color",   label: "Color",    src: "/icons/icon-192.svg" },
  { id: "light",   label: "Light",    src: "/icons/icon-192-light.svg" },
  { id: "bw",      label: "B&W",      src: "/icons/icon-192-bw.svg" },
  { id: "outline", label: "Outline",  src: "/icons/icon-192-outline.svg" },
];

function renderMenuAccount() {
  const nick = state.user?.nickname || "";
  const iconStyle = state.settings?.iconStyle || "color";
  return `
    ${menuHeader("Account", true)}
    <div class="bsheet-section-body" style="padding:16px;">
      <div class="account-profile-card">
        <div class="account-avatar">${_svg('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>', 36)}</div>
        <div class="account-profile-info">
          <div class="account-profile-name">${escapeHtml(state.user?.username || "")}</div>
          <div class="account-profile-role">${nick ? escapeHtml(nick) : '<span style="color:var(--muted);font-style:italic">Nessun nickname</span>'}</div>
        </div>
      </div>

      <div class="account-section-title">Profilo</div>
      <form id="nickname-form" class="change-pw-form" autocomplete="off">
        <label class="field">Nickname <span style="color:var(--muted);font-size:.8rem">(visibile nell'intestazione)</span>
          <input type="text" name="nickname" maxlength="40" placeholder="Come vuoi essere chiamato?" value="${escapeHtml(nick)}" />
        </label>
        <p class="change-pw-error" id="nickname-error"></p>
        <button class="btn primary" type="submit" style="width:100%">Salva nickname</button>
      </form>

      <div class="account-section-title" style="margin-top:24px;">Icona app</div>
      <div class="icon-style-grid">
        ${_iconStyles.map(s => `
          <button type="button" class="icon-style-chip${s.id === iconStyle ? " active" : ""}" data-icon-style="${s.id}">
            <img src="${s.src}" alt="${s.label}" class="icon-style-preview" />
            <span>${s.label}</span>
          </button>`).join("")}
      </div>

      <div class="account-section-title" style="margin-top:24px;">Sicurezza</div>
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

function showNicknameSetup() {
  const key = "pl_nickname_prompt_shown";
  if (localStorage.getItem(key)) return;
  localStorage.setItem(key, "1");
  showToast("Imposta il tuo nickname in Menu → Account", 4000);
}

function renderMenuSettings() {
  const s = state.settings;
  const nav = s.navigatorPref || "google";

  // stepper: − [val] + unità
  const stp = (name, val, min, max, step) => `
    <div class="settings-stepper">
      <button type="button" data-stepper="${name}" data-dir="-1" data-step="${step}">−</button>
      <input name="${name}" type="number" min="${min}" max="${max}" step="${step}" value="${val}" />
      <button type="button" data-stepper="${name}" data-dir="1" data-step="${step}">+</button>
    </div>`;

  // Riga inline: [etichetta a sinistra] [controllo + unità a destra]
  const irow = (label, control, unit = "") => `
    <div class="si-row">
      <span class="si-label">${label}</span>
      <div class="si-ctrl">${control}${unit ? `<span class="si-unit">${unit}</span>` : ""}</div>
    </div>`;

  // Due colonne simmetriche (solo per campi brevi)
  const pair = (a, b) => `<div class="sg-pair">${a}${b}</div>`;

  // Campo verticale etichetta+controllo (per 2-col)
  const vcol = (label, control, unit = "") => `
    <div class="sg-vcol">
      <span class="sg-label">${label}</span>
      <div class="si-ctrl">${control}${unit ? `<span class="si-unit">${unit}</span>` : ""}</div>
    </div>`;

  const secTitle = (icon, label) =>
    `<h3 class="settings-section-title">${_svg(icon, 15)} ${label}</h3>`;

  const timeInput = (name, val) =>
    `<input name="${name}" type="time" step="300" value="${escapeHtml(val || "")}" class="sg-time" />`;

  return `
    ${menuHeader("Impostazioni", true)}
    <div class="bsheet-section-body">
      <form id="settings-form">

        ${secTitle('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>', "Partenza e rientro")}
        <div class="sg-card">
          <label class="field">Nome punto di partenza
            <input name="defaultStartLabel" id="settings-start-label" value="${escapeHtml(s.defaultStartLabel || "")}" placeholder="Casa, Ufficio…" />
          </label>
          <label class="field">Indirizzo
            <input name="defaultStartAddress" id="settings-start-address" value="${escapeHtml(s.defaultStartAddress || "")}" placeholder="Via, città…" />
          </label>
          <div style="position:relative;">
            <input id="settings-start-search" placeholder="Cerca nell'archivio…" autocomplete="off" class="sg-search" />
            <div id="settings-start-sugg" class="stop-suggestions" style="display:none;"></div>
          </div>
          ${irow("Orario rientro massimo", timeInput("maxReturnTime", s.maxReturnTime))}
        </div>

        ${secTitle('<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/>', "Soste automatiche")}
        <div class="sg-card">
          ${pair(
            vcol("Intervallo", stp("restIntervalMin", s.restIntervalMin || 120, 60, 300, 10), "min"),
            vcol("Tolleranza ±", stp("restMaxDeviationMin", s.restMaxDeviationMin || 40, 10, 90, 5), "min")
          )}
          ${pair(
            vcol("Durata sosta", stp("restDurationMin", s.restDurationMin || 15, 5, 60, 5), "min"),
            vcol("Deviazione max", stp("maxDetourMin", s.maxDetourMin !== undefined ? s.maxDetourMin : 10, 1, 30, 1), "min")
          )}
          ${irow("Prima sosta non prima delle", timeInput("earliestBreakTime", s.earliestBreakTime || "08:00"))}
          ${irow("Pausa vietata nelle prime", stp("noBreakEarlyMin", s.noBreakEarlyMin ?? 120, 0, 240, 10), "min di giornata")}
          ${irow("Pausa vietata nell'ultima", stp("noBreakBeforeHomeMin", s.noBreakBeforeHomeMin ?? 60, 0, 120, 10), "min prima di rientrare")}
        </div>

        ${secTitle('<line x1="8" y1="6" x2="8" y2="2"/><line x1="16" y1="6" x2="16" y2="2"/><path d="M8 6a4 4 0 0 0 0 8v8"/><path d="M16 6a4 4 0 0 1 0 8v-4h-4"/>', "Pausa pranzo")}
        <div class="sg-card">
          <label class="field checkbox-field">
            <input type="checkbox" name="lunchBreakEnabled" ${s.lunchBreakEnabled !== false ? "checked" : ""} />
            <span>Pausa pranzo abilitata di default</span>
          </label>
          ${irow("Durata pausa", stp("lunchBreakMinutes", s.lunchBreakMinutes || 45, 15, 120, 5), "min")}
          <div class="si-row">
            <span class="si-label">Fascia oraria pranzo</span>
            <div class="si-ctrl si-timepair">
              <span class="si-unit">dalle</span>${timeInput("lunchOpenTime", s.lunchOpenTime || "11:30")}
              <span class="si-unit">alle</span>${timeInput("lunchCloseTime", s.lunchCloseTime || "14:00")}
            </div>
          </div>
          ${irow("Pausa vietata nei", stp("noBreakBeforeLunchMin", s.noBreakBeforeLunchMin ?? 60, 0, 120, 10), "min prima del pranzo")}
          ${irow("Pausa vietata nei", stp("noBreakAfterLunchMin", s.noBreakAfterLunchMin ?? 120, 0, 180, 10), "min dopo il pranzo")}
          <p class="sg-hint">Cerca prima i ristoranti salvati in archivio, poi su Maps.</p>
        </div>

        ${secTitle('<path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v9a2 2 0 0 1-2 2h-3"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>', "Guida e tariffe")}
        <div class="sg-card">
          ${irow("Maggiorazione traffico stimata", stp("driveMarkupMinPerHour", s.driveMarkupMinPerHour !== undefined ? s.driveMarkupMinPerHour : 10, 0, 30, 1), "min/ora")}
          <div class="sg-tariffe">
            <label class="field">€ / km<input name="kmRate" type="number" min="0" step="0.01" value="${escapeHtml(s.kmRate)}" /></label>
            <label class="field">€ / ora guida<input name="driveHourRate" type="number" min="0" step="0.01" value="${escapeHtml(s.driveHourRate)}" /></label>
            <label class="field">€ / ora lavoro<input name="workHourRate" type="number" min="0" step="0.01" value="${escapeHtml(s.workHourRate)}" /></label>
          </div>
        </div>

        ${secTitle('<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>', "App")}
        <div class="sg-card">
          <div class="sg-approw">
            <span class="sg-label">Navigatore</span>
            <div class="settings-radio-group">
              <label class="settings-radio"><input type="radio" name="navigatorPref" value="google" ${nav === "google" ? "checked" : ""} /> Google Maps</label>
              <label class="settings-radio"><input type="radio" name="navigatorPref" value="apple" ${nav === "apple" ? "checked" : ""} /> Apple Mappe</label>
              <label class="settings-radio"><input type="radio" name="navigatorPref" value="waze" ${nav === "waze" ? "checked" : ""} /> Waze</label>
            </div>
          </div>
          <div class="sg-approw">
            <span class="sg-label">Tema</span>
            <div class="settings-radio-group">
              <label class="settings-radio"><input type="radio" name="themeMode" value="auto" ${(s.themeMode||"auto") === "auto" ? "checked" : ""} /> Auto</label>
              <label class="settings-radio"><input type="radio" name="themeMode" value="light" ${(s.themeMode||"auto") === "light" ? "checked" : ""} /> Giorno</label>
              <label class="settings-radio"><input type="radio" name="themeMode" value="dark" ${(s.themeMode||"auto") === "dark" ? "checked" : ""} /> Notte</label>
            </div>
          </div>
          <div class="sg-approw">
            <span class="sg-label">Palette colori</span>
            <div class="settings-palette-group">
              <button type="button" class="palette-chip${(s.themePalette||"default")==="default"?" active":""}" data-palette="default"><span class="palette-swatch" style="background:linear-gradient(135deg,#05080f 50%,#e6f2f0 50%)"></span>Default</button>
              <button type="button" class="palette-chip${(s.themePalette||"default")==="neon"?" active":""}" data-palette="neon"><span class="palette-swatch" style="background:linear-gradient(135deg,#000 50%,#e0fff8 50%)"></span>Neon</button>
              <button type="button" class="palette-chip${(s.themePalette||"default")==="luxury"?" active":""}" data-palette="luxury"><span class="palette-swatch" style="background:linear-gradient(135deg,#0a0800 50%,#f5eec8 50%)"></span>Luxury</button>
              <button type="button" class="palette-chip${(s.themePalette||"default")==="metallo"?" active":""}" data-palette="metallo"><span class="palette-swatch" style="background:linear-gradient(135deg,#0c0e10 50%,#dce8f0 50%)"></span>Metallo</button>
              <button type="button" class="palette-chip${(s.themePalette||"default")==="pietra"?" active":""}" data-palette="pietra"><span class="palette-swatch" style="background:linear-gradient(135deg,#0e0d0c 50%,#ede0d0 50%)"></span>Pietra</button>
              <button type="button" class="palette-chip${(s.themePalette||"default")==="foresta"?" active":""}" data-palette="foresta"><span class="palette-swatch" style="background:linear-gradient(135deg,#060d06 50%,#c8e8b0 50%)"></span>Foresta</button>
              <button type="button" class="palette-chip${(s.themePalette||"default")==="legno"?" active":""}" data-palette="legno"><span class="palette-swatch" style="background:linear-gradient(135deg,#0c0800 50%,#f0dcc0 50%)"></span>Legno</button>
              <button type="button" class="palette-chip${(s.themePalette||"default")==="custom"?" active":""}" data-palette="custom" id="palette-chip-custom"><span class="palette-swatch" style="background:${s.brandColor ? `linear-gradient(135deg,${s.brandColor} 50%,${s.brandColor2 || "#1a1a1a"} 50%)` : "linear-gradient(135deg,#1a1a1a 50%,#888 50%)"}"></span>Aziendali</button>
            </div>
          </div>
          <div class="sg-approw" id="brand-color-row" style="${(s.themePalette||"default")==="custom" ? "" : "display:none"}">
            <span class="sg-label">Colori aziendali</span>
            <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
              <label style="display:flex;align-items:center;gap:8px;font-size:0.82rem;">Primario
                <input type="color" name="brandColor" id="brandColorInput" value="${escapeHtml(s.brandColor||"#00a896")}" style="width:44px;height:32px;border:none;padding:0;border-radius:6px;cursor:pointer;background:transparent;" />
                <span class="stop-meta" id="brand-color-preview" style="font-size:0.8rem;">${s.brandColor||"#00a896"}</span>
              </label>
              <label style="display:flex;align-items:center;gap:8px;font-size:0.82rem;">Secondario
                <input type="color" name="brandColor2" id="brandColor2Input" value="${escapeHtml(s.brandColor2||s.brandColor||"#a855f7")}" style="width:44px;height:32px;border:none;padding:0;border-radius:6px;cursor:pointer;background:transparent;" />
                <span class="stop-meta" id="brand-color2-preview" style="font-size:0.8rem;">${s.brandColor2||"—"}</span>
              </label>
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
  const sec = (icon, title, body) => `
    <details class="bsheet-guide-section">
      <summary class="bsheet-guide-summary">${_svg(icon, 15)} ${title}<span class="bsheet-guide-arrow">${I.arrowDown(12)}</span></summary>
      <div class="bsheet-guide-body">${body}</div>
    </details>`;

  return `
    ${menuHeader("Guida", true)}
    <div class="bsheet-section-body">

      ${sec('<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
        "Creare un giro", `
        <ol>
          <li>Vai nella tab <b>Percorso</b>.</li>
          <li>Imposta <b>data</b> e <b>orario di partenza</b> (o l'orario di arrivo target alla prima tappa).</li>
          <li>Scegli il punto di partenza tramite l'archivio contatti o la mappa. L'arrivo è uguale alla partenza per default.</li>
          <li>Cerca le tappe con la barra <b>Cerca e aggiungi tappa</b> oppure apri <b>+ Manuale</b> per inserire un indirizzo non in archivio.</li>
          <li>Con <b>+ Usa senza salvare</b> aggiungi una tappa temporanea che non viene registrata nell'archivio.</li>
          <li>Per ogni tappa puoi impostare la <b>durata della visita</b> e spuntare <b>Ignora orari di apertura</b> se lavori fuori orario.</li>
          <li>La prima tappa può essere fissata in posizione con la spunta <b>Prima tappa fissa</b>: le altre vengono ottimizzate liberamente.</li>
          <li>Premi <b>Ottimizza e salva</b>: il percorso viene calcolato nell'ordine ottimale rispettando orari, soste e pranzo.</li>
        </ol>
      `)}

      ${sec('<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
        "Giri salvati", `
        <ul>
          <li>Mostra tutti i giri in ordine cronologico.</li>
          <li><b>Tocca la card</b> del giro per aprirlo nel tab Risultato.</li>
          <li><b>Tocca il nome</b> del giro per rinominarlo.</li>
          <li>I pulsanti <b>Condividi</b>, <b>Duplica</b> ed <b>Elimina</b> sono visibili sulla card.</li>
          <li>I giri con bordo viola e badge <b>Importato</b> sono stati ricevuti da un'altra persona tramite link di condivisione.</li>
          <li>Il campo data sulla card permette di riprogrammare il giro a un altro giorno con ricalcolo automatico.</li>
        </ul>
      `)}

      ${sec('<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
        "Visualizzare e usare un giro", `
        <ul>
          <li>Ogni tappa mostra: orario di arrivo, km dalla tappa precedente, durata della visita.</li>
          <li>Bordo <span style="color:var(--error,#ef4444);font-weight:700">rosso</span> = errore (sede chiusa, arrivo fuori orario). Bordo <span style="color:#f59e0b;font-weight:700">ambra</span> = avviso (anticipo, attesa apertura).</li>
          <li>Premi <b>⋯</b> su una tappa per vedere orari, avvisi dettagliati e meteo.</li>
          <li>Premi <b>Naviga</b> per aprire Google Maps, Apple Maps o Waze (impostabile in Impostazioni).</li>
          <li>Premi il tasto telefono per chiamare direttamente il cliente.</li>
          <li>Con i pulsanti <b>↑ ↓</b> puoi riordinare manualmente le tappe e ricalcolare.</li>
        </ul>
      `)}

      ${sec('<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
        "Modificare un giro già calcolato", `
        <ul>
          <li>Nel tab Risultato, apri il pannello <b>Modifica impostazioni giro</b> per cambiare data, orario di partenza, modalità timing, indirizzi e pausa pranzo, poi premi <b>Ricalcola</b>.</li>
          <li>Apri il pannello <b>Aggiungi tappa al giro</b> per inserire nuove tappe (dall'archivio o manuale). Le tappe vengono messe in coda e inserite al ricalcolo.</li>
          <li>Il ricalcolo sovrascrive il giro esistente mantenendo lo stesso nome e data.</li>
        </ul>
      `)}

      ${sec('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',
        "Condividere un giro", `
        <ul>
          <li>Premi <b>Condividi</b> su un giro (nel Risultato o nei Giri salvati).</li>
          <li>Si apre il foglio di condivisione iOS: scegli AirDrop, WhatsApp, mail o qualsiasi altra app.</li>
          <li>Chi riceve il link lo apre, vede una preview del giro e con un tocco lo importa nei propri giri salvati.</li>
          <li>Il link è valido per <b>5 giorni</b> dalla creazione.</li>
          <li>I contatti del giro condiviso non vengono aggiunti all'archivio del destinatario, ma rimangono incorporati nel giro e sono utilizzabili normalmente.</li>
          <li>I giri importati sono riconoscibili dal bordo viola e dal badge <b>Importato</b>.</li>
        </ul>
      `)}

      ${sec('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
        "Gestione contatti (Archivio)", `
        <ul>
          <li>Vai su <b>Archivio → + Nuovo</b> per aggiungere un contatto.</li>
          <li>Compila nome, attività, sede e indirizzo. I due campi telefono supportano tipo, numero e nome intestatario.</li>
          <li>Gli <b>orari settimanali</b> si impostano giorno per giorno con mattina/pomeriggio, orario continuato o chiusura. <b>Applica a tutti</b> copia l'orario a tutti i giorni.</li>
          <li>Il campo <b>Durata default</b> determina il tempo allocato per la visita nel giro.</li>
          <li>I tipi contatto <b>Sosta</b> e <b>Ristorante</b> vengono usati per le soste automatiche e la pausa pranzo.</li>
          <li>Con <b>Completa con Maps</b> importi automaticamente indirizzo, telefono, coordinate e orari da Google Maps.</li>
        </ul>
      `)}

      ${sec('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
        "Scegliere sulla mappa", `
        <ul>
          <li>Disponibile durante la creazione di un giro (bottone mappa accanto al campo indirizzo) e nel form contatto.</li>
          <li>Si apre una mappa a schermo intero. Usa la barra di ricerca per trovare un luogo.</li>
          <li>Tocca un segnaposto sulla mappa: compare una scheda con nome e indirizzo.</li>
          <li>Premi <b>Usa</b> per importare l'indirizzo (e gli orari, se disponibili).</li>
          <li>Nel form di creazione giro, <b>Usa senza salvare</b> crea una tappa temporanea senza aggiungere il contatto all'archivio.</li>
        </ul>
      `)}

      ${sec('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
        "Importa contatti da file", `
        <ul>
          <li>Premi <b>Importa</b> nell'Archivio e seleziona un file <b>.vcf</b> (vCard) o <b>.csv</b>.</li>
          <li>L'app mostra una procedura guidata: verifica i dati di ogni contatto e premi <b>Salva contatto</b>.</li>
          <li><b>Salta →</b> passa al successivo senza salvare. <b>Esci</b> interrompe mantenendo i già salvati.</li>
          <li>Dopo l'importazione usa <b>Completa con Maps</b> per aggiungere orari e dati mancanti.</li>
        </ul>
      `)}

      ${sec('<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
        "Storico visite (calendario)", `
        <ul>
          <li>In ogni scheda contatto dell'Archivio premi <b>Storico visite</b>.</li>
          <li><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#f59e0b;vertical-align:middle;margin-right:3px"></span>Arancio = ultimo giro passato con quel cliente.</li>
          <li><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#3b82f6;vertical-align:middle;margin-right:3px"></span>Blu = giri passati.</li>
          <li><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#22c55e;vertical-align:middle;margin-right:3px"></span>Verde = giri futuri pianificati.</li>
          <li>Tocca un giorno colorato per aprire quel giro nel tab Risultato.</li>
        </ul>
      `)}

      ${sec('<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/>',
        "Soste automatiche", `
        <ul>
          <li>Il planner inserisce soste ogni <b>2 ore</b> di guida+lavoro cumulati (tolleranza −10 / +30 min).</li>
          <li>Per soste in luoghi specifici aggiungi contatti di tipo <b>Sosta</b> nell'archivio: vengono usati prioritariamente.</li>
          <li>Senza soste salvate il sistema cerca punti di sosta tramite Google Maps nelle vicinanze.</li>
          <li>Regole automatiche: nessuna sosta nelle prime 2 ore di giornata, nell'ultima ora prima del rientro, nell'ora prima del pranzo né nelle 2 ore dopo.</li>
          <li>Tutti i parametri (intervallo, tolleranza, durata, orario minimo) sono configurabili in <b>Impostazioni → Soste automatiche</b>.</li>
        </ul>
      `)}

      ${sec('<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
        "Stampa PDF", `
        <ul>
          <li>Premi <b>PDF</b> nella tab Risultato.</li>
          <li>Scegli se includere i numeri di telefono e/o il riepilogo dei costi.</li>
          <li>Premi <b>Stampa</b> per aprire la finestra di stampa del browser — salva come PDF o invia direttamente alla stampante.</li>
        </ul>
      `)}

      ${sec('<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>',
        "Comandi vocali", `
        <p>Apri il pannello <b>Comando vocale</b> in fondo al tab Percorso e premi <b>Avvia</b>. Esempi:</p>
        <ul>
          <li><code>aggiungi [nome]</code> — aggiunge una tappa dall'archivio</li>
          <li><code>rimuovi [nome]</code> — rimuove la tappa</li>
          <li><code>ottimizza</code> — calcola il percorso</li>
          <li><code>partenza alle 8</code> — cambia orario di partenza</li>
          <li><code>per il 10 giugno</code> / <code>domani</code> — cambia data</li>
          <li><code>parto da [luogo]</code> — cambia il punto di partenza</li>
          <li><code>in anticipo di 10 minuti</code> — imposta anticipo arrivo</li>
        </ul>
        <p class="guide-note">Richiede Whisper configurato sul server.</p>
      `)}

      ${sec('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
        "Statistiche", `
        <ul>
          <li>Apri il menu <b>☰ → Statistiche</b>.</li>
          <li>Mostra km totali, numero giri e ore di lavoro per mese.</li>
          <li>Mostra i clienti più visitati con numero di giri e km medi.</li>
          <li>I dati vengono calcolati in tempo reale dai giri salvati.</li>
        </ul>
      `)}

      ${sec('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
        "Impostazioni", `
        <ul>
          <li><b>Partenza e rientro</b>: indirizzo e nome del punto di partenza default, orario massimo di rientro.</li>
          <li><b>Soste automatiche</b>: intervallo, tolleranza, durata, deviazione massima dal percorso, orario minimo sosta, limiti temporali da inizio/fine giornata.</li>
          <li><b>Pausa pranzo</b>: abilitazione, durata, fascia oraria, finestre di esclusione soste prima e dopo il pranzo.</li>
          <li><b>Guida e tariffe</b>: maggiorazione traffico, costo al km, costo orario guida, costo orario lavoro.</li>
          <li><b>Navigatore</b>: Google Maps, Apple Maps o Waze.</li>
          <li><b>Tema</b>: chiaro, scuro o automatico con sette palette colori.</li>
        </ul>
      `)}

    </div>`;
}

function renderMenuInfo() {
  return `
    ${menuHeader("Info app", true)}
    <div class="bsheet-section-body">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
        <img src="/icons/icon-192.svg" alt="" style="width:44px;height:44px;border-radius:12px;flex-shrink:0;">
        <div>
          <p style="font-weight:700;font-size:1rem;margin:0;">Percorsi lavoro</p>
          <p class="stop-meta" style="margin:2px 0 0;">Versione 4.077 &mdash; giugno 2026</p>
        </div>
      </div>

      <p class="stop-meta" style="margin-bottom:14px;">Pianificazione giornaliera giri commerciali con ottimizzazione automatica del percorso, gestione orari di apertura, soste automatiche e stima costi chilometrici.</p>

      <p style="font-weight:600;font-size:0.85rem;margin-bottom:6px;">Integrazioni</p>
      <ul class="info-list">
        <li>${state.mapApiConfigured ? _svg('<polyline points="20 6 9 17 4 12"/>', 14) + " Google Maps attivo — percorsi reali e ottimizzazione avanzata" : _svg('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', 14) + " Google Maps non configurato — stime distanze locali"}</li>
        <li>${state.whisperConfigured ? _svg('<polyline points="20 6 9 17 4 12"/>', 14) + " Comandi vocali attivi (Whisper)" : _svg('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', 14) + " Comandi vocali non configurati"}</li>
      </ul>

      <p style="font-weight:600;font-size:0.85rem;margin-top:14px;margin-bottom:6px;">Novità v4.070</p>
      <ul class="info-list">
        <li>Partenza/arrivo in modifica giro: stessa barra di ricerca e selettore Maps della creazione percorso</li>
        <li>Pausa pranzo visibile sulla mappa con marker arancione e inclusa nel tracciato</li>
        <li>Deviazione max soste in minuti (non km); tempo viaggio al ristorante incluso nella durata pranzo</li>
        <li>Tab bar rimane fissa su iOS (fix overflow-x:clip); "Prima tappa fissa" su tutte le tappe</li>
        <li>Selettore finestra oraria attivo appena si inserisce un orario, senza ricalcolo</li>
        <li>Tema aziendale (palette custom): tutti i colori dell'app rispettano il colore scelto</li>
        <li>Anteprima tema live nelle impostazioni — si annulla chiudendo senza salvare</li>
        <li>Fix pausa pranzo con orario fisso inserita all'orario sbagliato</li>
      </ul>

      <p style="font-weight:600;font-size:0.85rem;margin-top:14px;margin-bottom:6px;">Novità v4.060</p>
      <ul class="info-list">
        <li>Indirizzo di casa dalle impostazioni auto-compilato come partenza/arrivo; pulsante matita per modifica testuale diretta</li>
        <li>Orario fisso pranzo (Pranzo alle): toggle attiva/disattiva in form percorso, pannello giro e card per-tappa</li>
        <li>Split vincolante: tappa che inizia prima e finisce dopo l'orario pranzo viene spezzata esattamente a quell'ora</li>
        <li>Messaggi WhatsApp/mail: logica data/ora corretta — passato → silenzio, oggi+passato → silenzio, oggi+futuro → ETA, futuro → disponibilità</li>
        <li>Nuovo template messaggio data futura con placeholder "(specificare)" per tipo intervento</li>
        <li>Pulsanti telefono/WhatsApp/mail sempre visibili anche senza contatto salvato</li>
      </ul>

      <p style="font-weight:600;font-size:0.85rem;margin-top:14px;margin-bottom:6px;">Novità v4.050</p>
      <ul class="info-list">
        <li>Hook pre-commit: blocca il commit se versione, CHANGELOG, service-worker o sezione Novità non sono aggiornati</li>
        <li>WhatsApp e mail: se l'arrivo stimato è già nel passato viene inviato un messaggio vuoto</li>
        <li>Mail precompilata: il corpo del messaggio segue la stessa logica del testo WhatsApp</li>
      </ul>

      <p style="font-weight:600;font-size:0.85rem;margin-top:14px;margin-bottom:6px;">Novità v4.040–v4.048</p>
      <ul class="info-list">
        <li>Pulsante WhatsApp nelle card tappa — messaggi precompilati: conferma appuntamento (data futura) o ETA in tempo reale (oggi)</li>
        <li>Tracciamento chiamate API esterne nel pannello admin (Google Maps, OpenAI, OpenRoute, Open-Meteo) con grafico giornaliero</li>
        <li>Pulsante cestino discreto per rimuovere una tappa direttamente dalla vista giro</li>
        <li>Ricalcolo giro aggiorna il record esistente — nome e note vengono preservati</li>
        <li>Nomi giro unici garantiti — rinomina segnala errore se il nome è già in uso</li>
        <li>Smart naming automatico per nuovi giri: sede/cliente unico o prima tappa + data italiana</li>
        <li>Fix login Safari PWA con Face ID: URL assoluti in tutti i fetch</li>
        <li>Fix priorità pranzo su soste: contatore cumulativo azzerato al pranzo</li>
        <li>Fix flag "Prima tappa": il planner sposta correttamente la tappa marcata in testa</li>
        <li>Fix finestra oraria fissa su prima tappa: l'orario di partenza viene retroceduto di conseguenza</li>
      </ul>

      <p style="font-weight:600;font-size:0.85rem;margin-top:14px;margin-bottom:6px;">Novità v4.030</p>
      <ul class="info-list">
        <li>Finestra oraria "Fissa": durata tappa = timeTo − timeFrom, visualizzata e non modificabile manualmente</li>
        <li>Fix planner: effectiveDuration corretta per finestre fisse e tappe spezzate dal pranzo</li>
        <li>Toggle pranzo dal giro: aggiunta e rimozione entrambe funzionanti, tutti i parametri passati correttamente</li>
        <li>Fix pannello "Modifica impostazioni giro": campo Rientro max aggiunto, startTime pre-popolato dall'originale</li>
        <li>Fix maggiorazione oraria: driveMinutes con buffer usato per calcolo partenza — arrivi puntuali</li>
        <li>Pannello finestre orarie tappe nella vista risultato — modifica Dalle/Alle senza uscire dal giro</li>
        <li>Fix picker iOS Dalle/Alle: render() su blur — il picker non viene più distrutto mentre è aperto</li>
        <li>Mappe in stile scuro quando il tema app è notte</li>
      </ul>

      <p style="font-weight:600;font-size:0.85rem;margin-top:14px;margin-bottom:6px;">Novità v4.020</p>
      <ul class="info-list">
        <li>Impostazioni tappa modificabili direttamente dalla card del giro (durata, finestra oraria, prima tappa, ignora orari)</li>
        <li>Finestre orarie "Disponibilità" e "Fissa" per ogni tappa — il planner pianifica di conseguenza</li>
        <li>UI selettore modalità finestra oraria compatto stile iOS</li>
        <li>Campo "Rientro max" pre-compilato con il default dalle impostazioni</li>
        <li>Note libere per ogni giro — testo libero salvato separatamente</li>
        <li>Durata interventi in formato HH:MM in tutti i campi</li>
        <li>Soste/ristoranti rispettano gli orari di apertura</li>
        <li>Fix picker iOS — non si chiude più durante la selezione</li>
      </ul>
    </div>`;
}

// ── data loading ──────────────────────────────────────────────────────────────

// Ranking per pertinenza: anche con 1-2 lettere i risultati "giusti" emergono
// in cima invece di restare sepolti tra i match casuali in note e indirizzi
function rankAddressMatches(list, query) {
  const ql = (query || "").toLowerCase();
  if (!ql) return list;
  const score = (a) => {
    const cust = (a.customer || "").toLowerCase();
    const act = (a.activity || "").toLowerCase();
    const name = act + " " + cust;
    if (cust.startsWith(ql) || act.startsWith(ql)) return 0;
    if (name.split(/\s+/).some(w => w.startsWith(ql))) return 1;
    if (name.includes(ql)) return 2;
    if ((a.location || "").toLowerCase().includes(ql)) return 3;
    if ((a.fullAddress || "").toLowerCase().includes(ql)) return 4;
    if ((a.notes || "").toLowerCase().includes(ql)) return 5;
    return -1;
  };
  return list
    .map(a => ({ a, s: score(a) }))
    .filter(x => x.s >= 0)
    .sort((x, y) => x.s - y.s)
    .map(x => x.a);
}

async function refreshAddresses() {
  if (!state.addressSearch && !state.archiveShowAll) {
    state.addresses = [];
    return;
  }
  const q = encodeURIComponent(state.addressSearch);
  const found = await api(`/api/addresses?search=${q}`).catch(() => []);
  state.addresses = rankAddressMatches(found, state.addressSearch);
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
  if (settings.brandColor) state.settings = { ...state.settings, brandColor: settings.brandColor };
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

function getMapDarkStyles() {
  const theme = document.documentElement.dataset.theme;
  const isDark = theme && !["day","neon-giorno","luxury-giorno","metallo-giorno","pietra-giorno","foresta-giorno","legno-giorno"].includes(theme);
  if (!isDark) return [];
  return [
    { elementType: "geometry", stylers: [{ color: "#0d1117" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#8b9aaa" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#0d1117" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#1e2a38" }] },
    { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#263340" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#14b8a6" }] },
    { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#0d9488" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#071520" }] },
    { featureType: "poi", elementType: "geometry", stylers: [{ color: "#111c26" }] },
    { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#607080" }] },
    { featureType: "transit", elementType: "geometry", stylers: [{ color: "#0d1117" }] },
    { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#1e3040" }] },
    { featureType: "administrative.land_parcel", elementType: "labels.text.fill", stylers: [{ color: "#506070" }] },
  ];
}

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

  const map = new google.maps.Map(el, { center, zoom: 10, mapTypeControl: false, fullscreenControl: false, styles: getMapDarkStyles() });
  // Forza il ridisegno delle tile su Safari — senza questo la mappa appare bianca
  setTimeout(() => google.maps.event.trigger(map, "resize"), 200);
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

  const addLunchMarker = (lat, lng, title) => {
    if (!lat || !lng) return;
    const pos = { lat: Number(lat), lng: Number(lng) };
    new google.maps.Marker({ position: pos, map, title,
      label: { text: "🍽", fontSize: "14px" },
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10,
              fillColor: "#e97316", fillOpacity: 0.9, strokeColor: "#fff", strokeWeight: 2 }
    });
    bounds.extend(pos);
    hasPoints = true;
  };

  if (startCoord) addMarker(startCoord.lat, startCoord.lng, "P", result.start?.label || "Partenza");
  for (const row of rows) {
    if (row.type === "lunch") { addLunchMarker(row.lat, row.lng, row.customer || "Pausa pranzo"); continue; }
    if (row.type === "rest") { addRestMarker(row.lat, row.lng, row.customer); continue; }
    addMarker(row.lat, row.lng, String(row.stopNumber), row.customer);
  }
  if (endCoord) addMarker(endCoord.lat, endCoord.lng, "A", result.end?.label || "Arrivo");

  if (hasPoints) map.fitBounds(bounds);

  // Draw route — include rest stops and lunch stops as waypoints
  const allPoints = [];
  if (startCoord) allPoints.push(startCoord);
  for (const row of rows) {
    if (row.lat && row.lng) allPoints.push({ lat: Number(row.lat), lng: Number(row.lng) });
  }
  if (endCoord) allPoints.push(endCoord);

  const _routeColor = "#7c3aed";
  const drawFallbackPolyline = () => {
    new google.maps.Polyline({
      path: allPoints.map(p => new google.maps.LatLng(p.lat, p.lng)),
      map,
      strokeColor: _routeColor,
      strokeOpacity: 0.85,
      strokeWeight: 5
    });
  };

  if (allPoints.length >= 2) {
    const ds = new google.maps.DirectionsService();
    const dr = new google.maps.DirectionsRenderer({
      map,
      suppressMarkers: true,
      polylineOptions: { strokeColor: _routeColor, strokeOpacity: 0.9, strokeWeight: 5 }
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
  const matches = rankAddressMatches(state.allAddresses, q).slice(0, 8);
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
    const isFirst = globalIdx === 0;
    const isPinned = stop.fixedFirst === true;
    return `
    <article class="card stop-card${isPinned ? " stop-card--pinned" : ""}">
      <div class="stop-head">
        <div class="stop-head-info">
          <p class="stop-title">
            ${isPinned ? `<span class="stop-pin-badge" title="Prima tappa fissa">${_svg('<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',11)}</span>` : ""}
            ${globalIdx + 1}. ${escapeHtml(stop.customer)} <span class="stop-loc">${escapeHtml(stop.location || "")}</span>
          </p>
          <div class="stop-meta">${escapeHtml(stop.fullAddress)}</div>
        </div>
        <button class="btn danger icon-btn" data-remove-stop="${stop.uid}" title="Rimuovi">${I.close(13)}</button>
      </div>
      <div class="stop-fields">
        <label class="field">Durata<input type="time" step="300" value="${stop.timeFrom && stop.timeTo && stop.timeWindowMode === "fixed" ? minsToHHMM(Math.max(0, hhmmToMins(stop.timeTo) - hhmmToMins(stop.timeFrom))) : minsToHHMM(stop.durationMinutes)}" data-stop="${stop.uid}:durationMinutes" data-duration-hhmm ${stop.timeFrom && stop.timeTo && stop.timeWindowMode === "fixed" ? "disabled" : ""}/></label>
        <div class="field">${stop.timeFrom && stop.timeTo ? `<span class="stop-window-badge">${_svg('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',13)} ${stop.timeWindowMode === "fixed" ? "Fissa" : "Disponibile"} ${escapeHtml(stop.timeFrom)}–${escapeHtml(stop.timeTo)}</span>` : stopHoursHint(stop, state.route.scheduledDate)}</div>
      </div>
      <div class="stop-window-block">
        <div class="stop-window-row">
          <span class="stop-opt-label">Finestra oraria</span>
          <div class="stop-window-mode${!stop.timeFrom && !stop.timeTo ? " disabled" : ""}">
            <label class="stop-window-mode-opt${(!stop.timeWindowMode || stop.timeWindowMode === "available") ? " active" : ""}">
              <input type="radio" name="twm-${stop.uid}" value="available" data-stop="${stop.uid}:timeWindowMode" ${(!stop.timeWindowMode || stop.timeWindowMode === "available") ? "checked" : ""} ${!stop.timeFrom && !stop.timeTo ? "disabled" : ""} />
              <span>Disponibilità</span>
            </label>
            <label class="stop-window-mode-opt${stop.timeWindowMode === "fixed" ? " active" : ""}">
              <input type="radio" name="twm-${stop.uid}" value="fixed" data-stop="${stop.uid}:timeWindowMode" ${stop.timeWindowMode === "fixed" ? "checked" : ""} ${!stop.timeFrom && !stop.timeTo ? "disabled" : ""} />
              <span>Fissa</span>
            </label>
          </div>
        </div>
        <div class="stop-window-inputs">
          <label class="stop-window-field">Dalle<input type="time" step="300" value="${escapeHtml(stop.timeFrom || "")}" data-stop="${stop.uid}:timeFrom" /></label>
          <label class="stop-window-field">Alle<input type="time" step="300" value="${escapeHtml(stop.timeTo || "")}" data-stop="${stop.uid}:timeTo" /></label>
        </div>
      </div>
      <div class="stop-options">
        <label class="stop-opt-check" title="Lavora all'arrivo anche se il locale è chiuso">
          <input type="checkbox" data-stop="${stop.uid}:ignoreHours" ${stop.ignoreHours ? "checked" : ""} />
          <span>Ignora orari di apertura</span>
        </label>
        <label class="stop-opt-check" title="Mantieni questa tappa per prima anche dopo l'ottimizzazione">
          <input type="checkbox" data-stop="${stop.uid}:fixedFirst" ${isPinned ? "checked" : ""} />
          <span>Prima tappa fissa</span>
        </label>
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
            <input name="startTime" type="time" step="300" value="${escapeHtml(r.startTime)}" />
          </label>
          <label class="rp-when-time">
            <span class="rp-label">Rientro max</span>
            <input name="departureLatest" type="time" step="300" value="${escapeHtml(r.departureLatest || state.settings.maxReturnTime || "")}" />
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
        ${dm === "arrive_at" ? `<div style="margin-top:6px;"><label class="field">Arrivo target<input name="firstArrivalTime" type="time" step="300" value="${escapeHtml(r.firstArrivalTime)}" /></label></div>` : ""}
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
              <button type="button" class="btn icon-btn" id="rp-start-edit-btn" title="Modifica indirizzo">${I.edit(15)}</button>
            </div>
          </div>
          <input type="hidden" name="startLabel" id="rp-start-label-h" value="${escapeHtml(r.startLabel)}" />
          <input type="hidden" name="startAddress" id="rp-start-addr-h" value="${escapeHtml(r.startAddress)}" />
          <div class="rp-archive-inline" id="rp-start-archive" style="display:none">
            <input id="rp-start-archive-search" placeholder="Cerca nell'archivio…" autocomplete="off" />
            <div class="stop-suggestions" id="rp-start-archive-suggestions"></div>
          </div>
          <div class="rp-archive-inline" id="rp-start-edit-panel" style="display:none">
            <input id="rp-start-edit-input" type="text" placeholder="Indirizzo (es. Via Roma 1, Milano)…" value="${escapeHtml(r.startAddress)}" autocomplete="off" />
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
              <button type="button" class="btn icon-btn" id="rp-end-edit-btn" title="Modifica indirizzo">${I.edit(15)}</button>
            </div>
          </div>
          <input type="hidden" name="endLabel" id="rp-end-label-h" value="${escapeHtml(r.endLabel)}" />
          <input type="hidden" name="endAddress" id="rp-end-addr-h" value="${escapeHtml(r.endAddress)}" />
          <div class="rp-archive-inline" id="rp-end-archive" style="display:none">
            <input id="rp-end-archive-search" placeholder="Cerca nell'archivio…" autocomplete="off" />
            <div class="stop-suggestions" id="rp-end-archive-suggestions"></div>
          </div>
          <div class="rp-archive-inline" id="rp-end-edit-panel" style="display:none">
            <input id="rp-end-edit-input" type="text" placeholder="Indirizzo (es. Via Roma 1, Milano)…" value="${escapeHtml(r.endAddress)}" autocomplete="off" />
          </div>
        </div>
      </div>

      <!-- Sezione 4: Pausa pranzo -->
      <div class="rp-section rp-lunch-row">
        <label class="rp-lunch-check">
          <input type="hidden" name="lunchBreak" value="off" />
          <input name="lunchBreak" type="checkbox" ${r.lunchBreak ? "checked" : ""} id="lunch-break-check" />
          <span>${I.fork(14)} Pausa pranzo</span>
        </label>
        <input name="lunchBreakMinutes" type="number" min="15" max="120" step="5"
          value="${escapeHtml(r.lunchBreakMinutes)}" id="lunch-break-minutes"
          class="rp-lunch-min" ${!r.lunchBreak ? "style=\"display:none\"" : ""} />
        <span class="rp-lunch-unit" ${!r.lunchBreak ? 'style="display:none"' : ""}>min</span>
        <label class="rp-lunch-unit" id="lunch-fixed-label" ${!r.lunchBreak ? 'style="display:none"' : ""} style="margin-left:6px;cursor:pointer;display:${!r.lunchBreak ? "none" : "flex"};align-items:center;gap:4px;">
          <input type="checkbox" id="lunch-fixed-enabled" ${r.lunchFixedTime ? "checked" : ""} style="width:14px;height:14px;margin:0;" />
          <span>alle</span>
        </label>
        <input name="lunchFixedTime" type="time" step="300"
          value="${escapeHtml(r.lunchFixedTime || "12:30")}" id="lunch-fixed-time"
          class="rp-lunch-min" style="width:88px;${!r.lunchBreak || !r.lunchFixedTime ? "display:none;" : ""}"
          ${!r.lunchFixedTime ? "disabled" : ""} />
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
              <label class="field">Durata<input name="customDuration" type="time" step="300" value="${minsToHHMM(r.customDuration || 45)}" data-duration-hhmm /></label>
            </div>
            ${renderWeeklyHoursSection(r.customWeeklyHours || null)}
            <div class="actions" style="margin-top:8px;">
              <button type="button" class="btn ghost" id="add-temp-stop">+ Usa senza salvare</button>
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
  const lunchFixed = document.getElementById("lunch-fixed-time");
  if (lunchCheck) {
    lunchCheck.addEventListener("change", () => {
      const show = lunchCheck.checked;
      document.querySelectorAll(".rp-lunch-min, .rp-lunch-unit").forEach(el => el.style.display = show ? "" : "none");
      if (show) {
        const fixedEnabled = document.getElementById("lunch-fixed-enabled");
        const fixedTime = document.getElementById("lunch-fixed-time");
        if (fixedEnabled && fixedTime) {
          fixedTime.style.display = fixedEnabled.checked ? "" : "none";
          fixedTime.disabled = !fixedEnabled.checked;
        }
      }
    });
  }
  const lunchFixedEnabled = document.getElementById("lunch-fixed-enabled");
  if (lunchFixedEnabled) {
    lunchFixedEnabled.addEventListener("change", () => {
      const fixedTime = document.getElementById("lunch-fixed-time");
      if (fixedTime) {
        fixedTime.style.display = lunchFixedEnabled.checked ? "" : "none";
        fixedTime.disabled = !lunchFixedEnabled.checked;
        if (lunchFixedEnabled.checked && !fixedTime.value) fixedTime.value = "12:30";
      }
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

  // Edit buttons — testo libero per indirizzo partenza/arrivo
  const bindEditBtn = (btnId, panelId, inputId, labelHiddenId, addrHiddenId, nameDisplayId, stateKey) => {
    const btn = document.getElementById(btnId);
    const panel = document.getElementById(panelId);
    const input = document.getElementById(inputId);
    if (!btn || !panel || !input) return;
    btn.addEventListener("click", () => {
      const isOpen = panel.style.display !== "none";
      panel.style.display = isOpen ? "none" : "";
      if (!isOpen) { input.focus(); input.select(); }
    });
    input.addEventListener("input", () => {
      const val = input.value.trim();
      const labelEl = document.getElementById(labelHiddenId);
      const addrEl = document.getElementById(addrHiddenId);
      const nameEl = document.getElementById(nameDisplayId);
      if (labelEl) labelEl.value = val;
      if (addrEl) addrEl.value = val;
      if (nameEl) nameEl.textContent = val || (stateKey === "start" ? "Imposta partenza" : "Imposta arrivo");
      state.route[stateKey + "Label"] = val;
      state.route[stateKey + "Address"] = val;
      if (stateKey === "start") syncEndIfSameAsStart();
    });
  };
  bindEditBtn("rp-start-edit-btn", "rp-start-edit-panel", "rp-start-edit-input", "rp-start-label-h", "rp-start-addr-h", "rp-start-name", "start");
  bindEditBtn("rp-end-edit-btn", "rp-end-edit-panel", "rp-end-edit-input", "rp-end-label-h", "rp-end-addr-h", "rp-end-name", "end");
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
          <input type="time" step="300" class="wh-om" value="${h.openMorning || ""}" ${dis}>
          <span>–</span>
          <input type="time" step="300" class="wh-cm" value="${h.closeMorning || ""}" ${disC}>
        </div>
        <div class="wh-range">
          <input type="time" step="300" class="wh-oa" value="${h.openAfternoon || ""}" ${disC}>
          <span>–</span>
          <input type="time" step="300" class="wh-ca" value="${h.closeAfternoon || ""}" ${dis}>
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
          <article class="card saved-card${route.source === "imported" ? " saved-card--imported" : ""}" data-open-route="${route.id}" style="cursor:pointer;">
            <p class="saved-card-name">${escapeHtml(route.name)}${route.source === "imported" ? ` <span class="badge badge-imported">${route.sharedBy ? "Condiviso da " + escapeHtml(route.sharedBy) : "Importato"}</span>` : ""}</p>
            <div class="saved-card-info">
              <input type="date" class="saved-date-input" data-reschedule-route="${route.id}" value="${escapeHtml(route.scheduledDate || "")}" title="Cambia data e ricalcola" onclick="event.stopPropagation()" />
              <span>${escapeHtml(route.startTime || "--:--")}</span>
              <span>${Number(route.totalKm).toFixed(1)} km</span>
            </div>
            <div class="stop-meta saved-card-route">${escapeHtml(route.startLabel || "—")} → ${escapeHtml(route.endLabel || "—")}</div>
            ${route.notes ? `<div class="saved-card-notes">${escapeHtml(route.notes)}</div>` : ""}
            <div class="saved-card-btns">
              <button class="btn saved-card-btn" data-rename-route="${route.id}">${I.edit(13)} Rinomina</button>
              <button class="btn saved-card-btn" data-share-route="${route.id}">${I.share(13)} Condividi</button>
              <button class="btn saved-card-btn" data-duplicate-route="${route.id}">${I.copy(13)} Duplica</button>
              <button class="btn danger saved-card-btn" data-delete-route="${route.id}">${I.trash(13)} Elimina</button>
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
  const sel = state.archiveSelectMode;
  const selSet = state.archiveSelected;
  const nSel = selSet.size;
  app.innerHTML = `
    <section class="grid">
      <div class="panel">
        <div class="section-head">
          <h2>Archivio</h2>
          <div class="row">
            ${sel ? `
              <button class="btn" id="archive-select-all">${I.check(14)} Tutti</button>
              <button class="btn danger" id="archive-delete-selected" ${nSel === 0 ? "disabled" : ""}>${I.trash(14)} Elimina${nSel > 0 ? ` (${nSel})` : ""}</button>
              <button class="btn" id="archive-cancel-select">${I.close(13)} Annulla</button>
            ` : `
              <button class="btn" id="import-contacts">${I.upload(14)} Importa</button>
              ${state.googleClientId ? `<button class="btn" id="import-google-contacts">${I.link(14)} Google</button>` : ""}
              <button class="btn" id="new-address">${I.plus(14)} Nuovo</button>
              ${showingResults ? `<button class="btn" id="archive-start-select">${I.check(14)} Seleziona</button>` : ""}
            `}
          </div>
        </div>
        ${!sel ? `<div class="row" style="gap:8px; margin-bottom:10px;">
          <input id="archive-search" placeholder="Cerca per nome, città, indirizzo…" value="${escapeHtml(state.addressSearch)}" style="flex:1" autocomplete="off" />
          ${showingResults
            ? `<button class="btn" id="hide-all-addresses">${I.eyeOff(14)} Nascondi</button>`
            : `<button class="btn" id="show-all-addresses">${I.eye(14)} Mostra tutti</button>`}
        </div>` : ""}
        <input id="vcf-input" type="file" accept=".vcf,.vcard,.csv" style="display:none" />
        <div class="archive-list">
          ${!showingResults
            ? `<div class="empty" style="grid-column:1/-1">Cerca un contatto per nome o città, oppure premi <b>Mostra tutti</b>.</div>`
            : state.addresses.map(a => {
              const isSel = sel && selSet.has(String(a.id));
              const isPending = state.archiveDeletePending === String(a.id);
              return `
            <article class="card archive-card${isSel ? " archive-card--selected" : ""}" ${sel ? `data-select-address="${a.id}" style="cursor:pointer;"` : ""}>
              ${sel ? `<span class="archive-check-dot${isSel ? " archive-check-dot--on" : ""}">${isSel ? _svg('<polyline points="20 6 9 17 4 12"/>',13) : ""}</span>` : ""}
              <p class="stop-title">${a.addressType === "rest" ? "☕ " : a.addressType === "restaurant" ? "🍽 " : a.addressType === "favorite" ? "⭐ " : ""}${escapeHtml(a.activity || a.customer)}</p>
              ${a.activity ? `<div class="stop-meta" style="font-weight:600">👤 ${escapeHtml(a.customer)}</div>` : ""}
              <div class="stop-meta">${escapeHtml(a.fullAddress)}</div>
              ${a.phone ? `<div class="stop-meta">${phoneIcon(a.phoneType)} ${escapeHtml(a.phone)}${a.phoneName ? ` <span class="phone-name-badge">${escapeHtml(a.phoneName)}</span>` : ""}${a.phonePreferred === "phone" && a.phone2 ? " ★" : ""}</div>` : ""}
              ${a.phone2 ? `<div class="stop-meta">${phoneIcon(a.phone2Type)} ${escapeHtml(a.phone2)}${a.phone2Name ? ` <span class="phone-name-badge">${escapeHtml(a.phone2Name)}</span>` : ""}${a.phonePreferred === "phone2" ? " ★" : ""}</div>` : ""}
              ${a.email ? `<div class="stop-meta">${I.email(13)} ${escapeHtml(a.email)}</div>` : ""}
              <div class="stop-meta">${weeklyHoursSummary(a)}</div>
              ${!sel ? `<div class="actions">
                ${a.phone ? `<a class="btn" href="tel:${escapeHtml(a.phone)}" title="${escapeHtml(a.phoneName || a.phone)}">${phoneIcon(a.phoneType)}</a>` : ""}
                ${a.phone2 ? `<a class="btn" href="tel:${escapeHtml(a.phone2)}" title="${escapeHtml(a.phone2Name || a.phone2)}">${phoneIcon(a.phone2Type)}</a>` : ""}
                ${a.email ? `<a class="btn icon-btn" href="mailto:${escapeHtml(a.email)}" title="${escapeHtml(a.email)}">${I.email(15)}</a>` : ""}
                <button class="btn icon-btn" data-check-opening="${a.id}" title="Verifica orari apertura">${I.clock(15)}</button>
                <button class="btn" data-edit-address="${a.id}">${I.edit(13)} Modifica</button>
                ${isPending
                  ? `<span class="archive-delete-confirm">Eliminare?
                      <button class="btn danger" data-confirm-delete-address="${a.id}">Sì</button>
                      <button class="btn" data-cancel-delete-address="1">No</button>
                    </span>`
                  : `<button class="btn danger icon-btn" data-delete-address="${a.id}" title="Elimina">${I.trash(14)}</button>`}
              </div>` : ""}
              <div class="opening-status" id="opening-status-${a.id}" style="display:none"></div>
              ${!sel ? `<details class="visit-history-details" ${state.visitCalendar[a.id] !== undefined ? "open" : ""}>
                <summary class="visit-history-toggle">📅 Storico visite</summary>
                ${renderVisitCalendar(a.id)}
              </details>` : ""}
            </article>`;}).join("") || `<div class="empty" style="grid-column:1/-1">Nessun contatto trovato.</div>`}
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
          <label class="field">Durata abituale<input name="defaultDuration" type="time" step="300" value="${minsToHHMM(form.defaultDuration || 45)}" data-duration-hhmm /></label>
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

function getRvStopRow(idx) {
  if (!state.result?.rows) return null;
  return state.result.rows.filter(r => !r.type && (!r.stopPart || r.stopPart === "morning"))[Number(idx)] ?? null;
}

function stopDetailExtra(result, row, addr, stopIdx) {
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
      const label = g.days.length === 1 ? DAYS_IT[g.days[0]] : `${DAYS_IT[g.days[0]]}–${DAYS_IT[g.days[g.days.length-1]]}`;
      const h = wh[g.days[0]] || wh[String(g.days[0])] || { closed: true };
      let hoursHtml;
      if (h.closed) {
        hoursHtml = `<span class="wh-row-closed">Chiuso</span>`;
      } else if (h.continuous) {
        hoursHtml = `<span class="wh-row-time">${h.openMorning}–${h.closeAfternoon}</span>`;
      } else {
        const am = (h.openMorning && h.closeMorning) ? `${h.openMorning}–${h.closeMorning}` : null;
        const pm = (h.openAfternoon && h.closeAfternoon) ? `${h.openAfternoon}–${h.closeAfternoon}` : null;
        hoursHtml = [am, pm].filter(Boolean).map(t => `<span class="wh-row-time">${t}</span>`).join(`<span class="wh-row-sep">·</span>`);
      }
      return `<div class="wh-row${isToday ? " wh-row-today" : ""}"><span class="wh-row-day">${label}</span><span class="wh-row-hours">${hoursHtml}</span></div>`;
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
          <div class="wh-rows">${fullRows}</div>
          <button class="wh-close-btn" data-toggle-hours="${uid}">${I.close(12)} Chiudi</button>
        </div>
      </div>`);
  }

  // Per-stop settings edit block (always shown for non-split stops)
  if (stopIdx !== undefined && stopIdx >= 0) {
    const hasWindow = !!(row.timeFrom && row.timeTo);
    const twMode = row.timeWindowMode || "available";
    const isDurFixed = hasWindow && twMode === "fixed";
    const twDisabled = hasWindow ? "" : " disabled";
    parts.push(`
      <div class="rv-stop-edit">
        <span class="rc-section-label">Impostazioni tappa</span>
        <div class="rv-stop-edit-row">
          <span class="rv-stop-edit-label">Durata</span>
          <input type="time" step="300" value="${isDurFixed ? minsToHHMM(Math.max(0, hhmmToMins(row.timeTo) - hhmmToMins(row.timeFrom))) : minsToHHMM(row.durationMinutes)}" data-rv-stop="${stopIdx}:durationMinutes" data-duration-hhmm${isDurFixed ? " disabled" : ""} />
        </div>
        <div class="rv-stop-edit-row">
          <span class="rv-stop-edit-label">Finestra oraria</span>
          <div class="stop-window-mode${hasWindow ? "" : " disabled"}">
            <label class="stop-window-mode-opt${twMode !== "fixed" ? " active" : ""}">
              <input type="radio" name="rvswm-${stopIdx}" value="available" data-rv-stop="${stopIdx}:timeWindowMode" ${twMode !== "fixed" ? "checked" : ""}${twDisabled} /><span>Disponibilità</span>
            </label>
            <label class="stop-window-mode-opt${twMode === "fixed" ? " active" : ""}">
              <input type="radio" name="rvswm-${stopIdx}" value="fixed" data-rv-stop="${stopIdx}:timeWindowMode" ${twMode === "fixed" ? "checked" : ""}${twDisabled} /><span>Fissa</span>
            </label>
          </div>
        </div>
        <div class="stop-window-inputs">
          <label class="stop-window-field">Dalle<input type="time" step="300" value="${escapeHtml(row.timeFrom || "")}" data-rv-stop="${stopIdx}:timeFrom" /></label>
          <label class="stop-window-field">Alle<input type="time" step="300" value="${escapeHtml(row.timeTo || "")}" data-rv-stop="${stopIdx}:timeTo" /></label>
        </div>
        <div class="rv-stop-edit-checks">
          <label class="stop-opt-check"><input type="checkbox" data-rv-stop="${stopIdx}:fixedFirst" ${row.fixedFirst ? "checked" : ""} /><span>Prima tappa</span></label>
          <label class="stop-opt-check"><input type="checkbox" data-rv-stop="${stopIdx}:ignoreHours" ${row.ignoreHours ? "checked" : ""} /><span>Ignora orari</span></label>
        </div>
        <button type="button" class="btn${state.dirtyStops.has(String(stopIdx)) ? " primary" : ""} rv-stop-replan-btn">${I.navigate(14)} Ricalcola</button>
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
            <span class="stop-meta">${escapeHtml(summary.dayStart)} → ${escapeHtml(summary.dayEnd)} · ${summary.totalKm.toFixed(1)} km${state.showCosts ? " · " + euro(calcResultCosts(summary).totalCost) : ""}</span>
          </div>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap;">
          <button class="btn" data-tab-jump="saved">${I.list(14)} Giri</button>
          <button class="btn${result.rows?.some(r => r.type === "lunch") ? " primary" : ""}" id="toggle-lunch-break" title="${result.rows?.some(r => r.type === "lunch") ? "Rimuovi pausa pranzo" : "Aggiungi pausa pranzo"}">${I.fork(14)} ${result.rows?.some(r => r.type === "lunch") ? "Togli pranzo" : "Aggiungi pranzo"}</button>
          ${result.id ? `<button class="btn" id="share-route-btn" data-share-route="${result.id}" title="Condividi giro">${I.share(14)} Condividi</button>` : ""}
          <button class="btn" id="print-route-btn" title="Stampa o salva come PDF">${I.print(14)} PDF</button>
        </div>
      </div>

      ${result.notes ? `<div class="result-notes">${escapeHtml(result.notes)}</div>` : ""}

      ${state.googleMapsKey ? `<div id="route-map" style="height:280px;border-radius:8px;border:1px solid var(--line);margin-bottom:14px;"></div>` : ""}

      <div class="nav-panel">
        <a class="btn primary" href="${navUrl(result, pref)}" target="_blank" rel="noopener">${I.navigate(14)} Apri percorso completo</a>
      </div>

      ${renderResultEditPanels(result)}

      ${renderManualOrder(result)}

      <div class="result-list">
        ${(()=>{let rvStopIdx=-1;return rows.map(row => {
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
          if (!row.stopPart || row.stopPart === "morning") rvStopIdx++;
          const thisStopIdx = (!row.stopPart || row.stopPart === "morning") ? rvStopIdx : -1;
          const isAfternoon = row.stopPart === "afternoon";
          const prefPhone = preferredPhone(addr || {});
          const phone = addr?.phone || row.phone || "";
          const phone2 = addr?.phone2 || row.phone2 || "";
          const email = addr?.email || row.email || "";
          const emailSubject = encodeURIComponent(`Appuntamento ${row.customer} - ${result.scheduledDate || ""} ore ${row.arrivalTime}`);
          const emailBody = buildWhatsAppMessage(result, row);
          const emailHref = email
            ? `mailto:${escapeHtml(email)}?subject=${emailSubject}${emailBody ? "&body=" + encodeURIComponent(emailBody) : ""}`
            : `mailto:?subject=${emailSubject}${emailBody ? "&body=" + encodeURIComponent(emailBody) : ""}`;
          const waPhone = formatPhoneForWhatsApp(prefPhone?.number || phone);
          const partBadge = row.stopPart === "morning" ? `<span class="badge" style="background:color-mix(in srgb,#3b82f6 15%,var(--surface));color:#1d4ed8">mattina</span> ` : row.stopPart === "afternoon" ? `<span class="badge" style="background:color-mix(in srgb,#f97316 15%,var(--surface));color:#c2410c">pomeriggio</span> ` : "";
          const stopTitle = `${row.stopNumber}. ${escapeHtml(row.customer)}${row.location ? ` — ${escapeHtml(row.location)}` : ""}`;
          const phoneBtn = !isAfternoon
            ? (prefPhone
                ? `<a class="btn icon-btn" href="tel:${escapeHtml(prefPhone.number)}" title="${escapeHtml(prefPhone.number)}">${phoneIcon(prefPhone.type)}</a>`
                : `<a class="btn icon-btn" href="tel:" title="Chiama">${I.phone(15)}</a>`)
            : "";
          const warnLevel = worstWarningLevel(row.warnings);
          const cardClass = warnLevel === "error" ? " card-error" : warnLevel === "warn" ? " card-warn" : "";
          const warnMsg = warnLevel ? (row.warnings.find(w => w.level === warnLevel || (warnLevel==="error" && /(chiusa|dopo|oltre)/.test(w.msg||w)))?.msg || "") : "";
          const expandId = `${row.stopNumber}${row.stopPart ? "-" + row.stopPart : ""}`;
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
              ${!isAfternoon ? `<a class="btn icon-btn" href="${emailHref}" title="${escapeHtml(email) || "Email"}">${I.email(15)}</a>` : ""}
              ${!isAfternoon ? `<button class="btn icon-btn rc-wa-btn" data-wa-stop="${row.stopUid || row.uid || row.stopNumber}" title="WhatsApp" style="color:#25d366">${I.whatsapp(15)}</button>` : ""}
              ${!isAfternoon ? `<button class="btn icon-btn rc-remove-stop-btn" data-remove-stop="${row.stopUid || row.uid || row.stopNumber}" title="Rimuovi tappa">${I.trash(14)}</button>` : ""}
            </div>
            <div class="rc-details" data-stop-details="${expandId}"${state.expandedStops.has(expandId) ? "" : " hidden"}>
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
              ${(!row.stopPart || row.stopPart === "morning") ? stopDetailExtra(result, row, addr, thisStopIdx) : ""}
            </div>
          </article>`;
        }).join("");})()}

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
      </div>
      ${(() => {
        const rates = state.resultCostRates || defaultCostRates();
        const operators = Array.isArray(rates.operators) && rates.operators.length > 0
          ? rates.operators
          : [{ workHourRate: rates.workHourRate ?? state.settings.workHourRate ?? 22 }];
        const costs = state.showCosts ? calcResultCosts(summary) : null;
        return `<div class="rv-costs-section">
          <label class="rv-costs-toggle-row">
            <input type="checkbox" id="rv-costs-check" ${state.showCosts ? "checked" : ""} />
            <span>Calcola costi</span>
            ${costs ? `<span class="rv-costs-badge">${euro(costs.totalCost)}</span>` : ""}
          </label>
          ${state.showCosts ? `<div class="rv-costs-body">
            <div class="rv-cost-section-title">Tariffe base</div>
            <div class="rv-cost-rates">
              <label class="rv-cost-rate-lbl">€/km<input type="number" data-rv-rate="kmRate" value="${rates.kmRate}" min="0" step="0.01" /></label>
              <label class="rv-cost-rate-lbl">€/h guida × op.<input type="number" data-rv-rate="driveHourRate" value="${rates.driveHourRate}" min="0" step="1" /></label>
            </div>
            <div class="rv-cost-section-title" style="margin-top:12px;">
              Operatori
              <button type="button" id="rv-add-operator" class="btn icon-btn" style="padding:2px 8px;font-size:0.78rem;height:auto;" ${operators.length >= 8 ? "disabled" : ""}>${I.plus(11)} Aggiungi</button>
            </div>
            <div class="rv-cost-operators">
              ${operators.map((op, i) => `
                <div class="rv-cost-op-row">
                  <span class="rv-cost-op-label">Op. ${i + 1}</span>
                  <label class="rv-cost-rate-lbl" style="flex:1;">€/h lavoro
                    <input type="number" data-rv-op-rate="1" data-rv-op-idx="${i}" value="${op.workHourRate ?? 22}" min="0" step="1" />
                  </label>
                  ${operators.length > 1 ? `<button type="button" class="btn icon-btn danger" data-remove-operator="${i}" style="padding:4px 6px;align-self:flex-end;">${I.trash(12)}</button>` : ""}
                </div>`).join("")}
            </div>
            <div class="summary-grid" style="margin-top:12px;">
              <div class="metric"><div class="metric-label">Costo km</div><div class="metric-value">${euro(costs.costKm)}</div></div>
              <div class="metric"><div class="metric-label">Costo guida<br><span style="font-size:0.68rem;font-weight:500;opacity:0.7;">${costs.nOps} op. × ${minutesLabel(summary.totalDriveMinutes)}</span></div><div class="metric-value">${euro(costs.costDrive)}</div></div>
              <div class="metric"><div class="metric-label">Costo lavoro<br><span style="font-size:0.68rem;font-weight:500;opacity:0.7;">${costs.nOps} op. × ${minutesLabel(summary.totalWorkMinutes)}</span></div><div class="metric-value">${euro(costs.costWork)}</div></div>
              <div class="metric metric-total"><div class="metric-label">Totale</div><div class="metric-value">${euro(costs.totalCost)}</div></div>
            </div>
          </div>` : ""}
        </div>`;
      })()}
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

// ── cost calculation (client-side, uses per-route rates) ─────────────────────

function defaultCostRates() {
  return {
    kmRate: state.settings.kmRate ?? 0.65,
    driveHourRate: state.settings.driveHourRate ?? 22,
    operators: [{ workHourRate: state.settings.workHourRate ?? 22 }]
  };
}

function calcResultCosts(summary) {
  const rates = state.resultCostRates || defaultCostRates();
  const operators = Array.isArray(rates.operators) && rates.operators.length > 0
    ? rates.operators
    : [{ workHourRate: rates.workHourRate ?? state.settings.workHourRate ?? 22 }];
  const nOps = operators.length;
  const costKm = summary.totalKm * (rates.kmRate ?? 0.65);
  const costDrive = (summary.totalDriveMinutes / 60) * (rates.driveHourRate ?? 22) * nOps;
  const workRateSum = operators.reduce((s, op) => s + (op.workHourRate ?? 22), 0);
  const costWork = (summary.totalWorkMinutes / 60) * workRateSum;
  const totalCost = costKm + costDrive + costWork;
  return { costKm, costDrive, costWork, totalCost, nOps };
}

// ── print / PDF export ────────────────────────────────────────────────────────

function _buildPrintDoc(withPhones, withCosts, result, routeName, date, costOverride = null) {
  const { rows, finalLeg, summary } = result;

  const _esc = s => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const _mins = v => { const n=Number(v||0),h=Math.floor(n/60),m=n%60; return !h?m+" min":!m?h+" h":h+" h "+m+" min"; };
  const _eur = v => new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format(Number(v||0));

  const stopRows = rows.map(row => {
    if (row.type === "lunch") {
      const name = row.customer && row.customer !== "Pausa pranzo" ? row.customer : "Pausa pranzo";
      const extra = withPhones ? "<td></td>" : "";
      return `<tr class="brk"><td>🍽</td><td colspan="2"><span class="n">${_esc(name)}${row.location ? " — " + _esc(row.location) : ""}</span></td>${extra}<td class="num">${_esc(row.serviceStartTime)}–${_esc(row.serviceEndTime)}</td><td>${_mins(row.durationMinutes)}</td><td></td><td></td></tr>`;
    }
    if (row.type === "rest") {
      const extra = withPhones ? "<td></td>" : "";
      return `<tr class="brk"><td>☕</td><td colspan="2"><span class="n">${_esc(row.customer)}${row.location ? " — " + _esc(row.location) : ""}</span></td>${extra}<td class="num">${_esc(row.serviceStartTime)}–${_esc(row.serviceEndTime)}</td><td>${_mins(row.durationMinutes)}</td><td></td><td></td></tr>`;
    }
    const phoneLines = [];
    if (row.phone) phoneLines.push(_esc(row.phone) + (row.phoneName ? '<br><span class="ph">'+_esc(row.phoneName)+"</span>" : ""));
    if (row.phone2) phoneLines.push(_esc(row.phone2) + (row.phone2Name ? '<br><span class="ph">'+_esc(row.phone2Name)+"</span>" : ""));
    const phoneCell = withPhones ? "<td>" + (phoneLines.join("<br>") || "—") + "</td>" : "";
    const sub = [row.activity, !row.activity && row.location ? row.location : null].filter(Boolean).map(_esc).join(" · ");
    const wx = (result.weather || []).find(x => Number(x.stopNumber) === Number(row.stopNumber));
    const wxStr = wx && wx.temperatureC != null ? `${Math.round(wx.temperatureC)}°C${wx.description ? " · " + _esc(wx.description) : ""}` : "";
    const nameCell = `<td colspan="2"><div class="n">${_esc(row.customer||"")}</div>${sub?`<div class="s">${sub}</div>`:""}<div class="s2">${_esc(row.address||"")}${wxStr?` <span class="wx">${wxStr}</span>`:""}</div></td>`;
    return `<tr><td>${_esc(row.stopNumber)}</td>${nameCell}${phoneCell}<td class="num">${_esc(row.arrivalTime)}–${_esc(row.serviceEndTime)}</td><td>${_mins(row.durationMinutes)}</td><td class="num">${row.km?Number(row.km).toFixed(1):""}</td><td></td></tr>`;
  }).join("");

  const homeRow = `<tr class="home"><td>↩</td><td colspan="2"><span class="n">${_esc(result.end?.label||"Casa")}</span><div class="s2">${_esc(result.end?.address||result.end?.fullAddress||"")}</div></td>${withPhones?"<td></td>":""}<td class="num">${_esc(finalLeg.arrivalTime)}</td><td></td><td class="num">${Number(finalLeg.km).toFixed(1)}</td><td></td></tr>`;

  const sumDay =
    `<div class="sc"><div class="sl">Orario</div><div class="sv num">${_esc(summary.dayStart)} – ${_esc(summary.dayEnd)}</div></div>` +
    `<div class="sc"><div class="sl">Km totali</div><div class="sv num">${summary.totalKm.toFixed(1)} km</div></div>` +
    `<div class="sc"><div class="sl">Ore guida</div><div class="sv num">${_mins(summary.totalDriveMinutes)}</div></div>` +
    `<div class="sc"><div class="sl">Ore lavoro</div><div class="sv num">${_mins(summary.totalWorkMinutes)}</div></div>`;
  const _costs = withCosts ? (costOverride || { costKm: summary.costKm, costDrive: summary.costDrive, costWork: summary.costWork, totalCost: summary.totalCost }) : null;
  const sumCost = _costs
    ? `<div class="sc"><div class="sl">Costo km</div><div class="sv num">${_eur(_costs.costKm)}</div></div>` +
      `<div class="sc"><div class="sl">Costo guida</div><div class="sv num">${_eur(_costs.costDrive)}</div></div>` +
      `<div class="sc"><div class="sl">Costo lavoro</div><div class="sv num">${_eur(_costs.costWork)}</div></div>` +
      `<div class="sc"><div class="sl">Totale giornata</div><div class="sv sv-total num">${_eur(_costs.totalCost)}</div></div>`
    : "";
  const summaryHtml =
    `<div class="summary"><div class="ss"><div class="stitle">Giornata</div><div class="sg">${sumDay}</div></div>` +
    (withCosts ? `<div class="ss"><div class="stitle">Costi</div><div class="sg">${sumCost}</div></div>` : "") +
    `</div>`;

  const phoneHeader = withPhones ? "<th>Telefono</th>" : "";
  // Departure + weather info bar
  const startLabel = _esc(result.start?.label || result.startLabel || "");
  const startAddr  = _esc(result.start?.address || result.start?.fullAddress || result.startAddress || "");
  const depTime    = _esc(summary.dayStart || "");
  const infoBar =
    `<div class="ib">` +
    (startLabel || startAddr ? `<div class="ib-item"><span class="ib-lbl">Partenza</span><span class="ib-val">${startLabel}${startAddr && startLabel ? " — " : ""}${startAddr}</span></div>` : "") +
    (depTime ? `<div class="ib-item"><span class="ib-lbl">Orario</span><span class="ib-val">${depTime}</span></div>` : "") +
    `</div>`;

  const now = new Date().toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});

  const css = [
    "*{box-sizing:border-box;margin:0;padding:0}",
    "body{font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;font-size:10.5pt;color:#1a1a2e;background:#fff;padding:28px 32px}",
    ".dh{margin-bottom:12px;padding-bottom:14px;border-bottom:2px solid #1a1a2e}",
    ".dt{font-size:17pt;font-weight:700;letter-spacing:-.01em}",
    ".ds{font-size:10pt;color:#555;margin-top:3px}",
    ".ib{display:flex;flex-wrap:wrap;gap:0;border:1px solid #e0e0e0;border-radius:4px;overflow:hidden;margin-bottom:18px;font-size:9.5pt}",
    ".ib-item{display:flex;align-items:baseline;gap:8px;padding:7px 14px;border-right:1px solid #e0e0e0;flex:1;min-width:160px}",
    ".ib-item:last-child{border-right:none}",
    ".ib-lbl{font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#888;white-space:nowrap}",
    ".ib-val{font-size:9.5pt;color:#1a1a2e;font-weight:500}",
    "table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:10pt}",
    "thead tr{border-bottom:2px solid #1a1a2e}",
    "th{padding:7px 8px;text-align:left;font-size:8.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#444;white-space:nowrap}",
    "th:first-child{width:26px;text-align:center}th:nth-child(2){width:auto}th:nth-child(3){min-width:80px}",
    "tbody tr{border-bottom:1px solid #e8e8e8}",
    "tbody tr:last-child{border-bottom:2px solid #1a1a2e}",
    "td{padding:8px 8px;vertical-align:top;font-size:10pt;color:#1a1a2e}",
    "td:first-child{text-align:center;color:#999;font-size:9pt;padding-top:10px;width:26px}",
    ".n{font-weight:600;line-height:1.3}.s{font-size:8.5pt;color:#555;margin-top:2px;line-height:1.4}.s2{font-size:8pt;color:#999;margin-top:1px}.ph{font-size:8pt;color:#888}.wx{color:#8899aa;font-size:7.5pt;margin-left:4px}",
    "tr.brk td{background:#fafafa;color:#666;font-size:9.5pt;padding:6px 8px}",
    "tr.home td{background:#f5f7fa;font-weight:600}tr.home td:first-child{color:#999}",
    ".num{font-variant-numeric:tabular-nums}",
    ".summary{margin-top:4px;page-break-inside:avoid}",
    ".ss{margin-bottom:14px}.stitle{font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#888;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #e0e0e0}",
    ".sg{display:grid;grid-template-columns:1fr 1fr;border:1px solid #e0e0e0;border-radius:4px;overflow:hidden}",
    ".sc{padding:9px 12px;border-right:1px solid #e0e0e0;border-bottom:1px solid #e0e0e0}",
    ".sc:nth-child(2n){border-right:none}.sc:nth-last-child(-n+2){border-bottom:none}",
    ".sl{font-size:8pt;color:#888;text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px}",
    ".sv{font-size:11pt;font-weight:700}.sv-total{font-size:13pt;color:#1d4ed8}",
    ".df{margin-top:24px;padding-top:10px;border-top:1px solid #ddd;display:flex;justify-content:space-between;font-size:8pt;color:#aaa}",
    "@media print{body{padding:0}.df{position:fixed;bottom:0;left:32px;right:32px}}",
  ].join("");

  return `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${_esc(routeName)}${date?" – "+date:""}</title><style>${css}</style></head><body>` +
    `<div class="dh"><div class="dt">${_esc(routeName)}</div>${date?`<div class="ds">${_esc(date)}</div>`:""}</div>` + infoBar +
    `<table><thead><tr><th>#</th><th>Tappa</th><th>&nbsp;</th>${phoneHeader}<th>Orario</th><th>Durata</th><th>Km</th><th>Note</th></tr></thead><tbody>` +
    stopRows + homeRow +
    `</tbody></table>` +
    summaryHtml +
    `<div class="df"><span>organizzatore-percorsi.vercel.app</span><span>${now}</span></div>` +
    `</body></html>`;
}

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

  const _r = { ...result, rows: enrichedRows };
  const _costData = state.showCosts ? calcResultCosts(result.summary) : null;
  const variants = {
    "":   _buildPrintDoc(false, false, _r, routeName, date),
    "p":  _buildPrintDoc(true,  false, _r, routeName, date),
    "c":  _buildPrintDoc(false, !!_costData, _r, routeName, date, _costData),
    "pc": _buildPrintDoc(true,  !!_costData, _r, routeName, date, _costData),
  };
  const costsAvailable = !!_costData;
  const payload = JSON.stringify({ variants, routeName, date });

  const _dt = document.documentElement.dataset.theme || "night";
  const _isDk = !["day","neon-giorno","luxury-giorno","metallo-giorno","pietra-giorno","foresta-giorno","legno-giorno"].includes(_dt);
  const _bg    = _isDk ? "#0d1117" : "#f0f4f8";
  const _bg2   = _isDk ? "#161d27" : "#ffffff";
  const _text  = _isDk ? "#e2e8f0" : "#1a202c";
  const _muted = _isDk ? "#64748b" : "#64748b";
  const _line  = _isDk ? "#1e293b" : "#e2e8f0";
  const _acc   = "#14b8a6";
  const _accDk = "#0d9488";

  const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Stampa — ${routeName}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, "Segoe UI", Arial, sans-serif; background: ${_bg}; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px 16px; color: ${_text}; }
  .card { background: ${_bg2}; border-radius: 18px; padding: 28px 28px 24px; max-width: 420px; width: 100%; border: 1px solid ${_line}; box-shadow: 0 8px 32px rgba(0,0,0,${_isDk ? ".4" : ".08"}); }
  .card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
  .card-icon { width: 36px; height: 36px; border-radius: 10px; background: ${_acc}22; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0; }
  h2 { font-size: 1.15rem; font-weight: 700; color: ${_text}; }
  .sub { font-size: .875rem; color: ${_muted}; margin-bottom: 22px; padding-left: 46px; }
  .options { display: flex; flex-direction: column; gap: 0; margin-bottom: 20px; border: 1px solid ${_line}; border-radius: 12px; overflow: hidden; }
  label { display: flex; align-items: flex-start; gap: 14px; font-size: 1rem; cursor: pointer; padding: 14px 16px; background: transparent; border-bottom: 1px solid ${_line}; transition: background .12s; }
  label:last-of-type { border-bottom: none; }
  label:hover { background: ${_acc}11; }
  .check-wrap { padding-top: 2px; flex-shrink: 0; }
  input[type=checkbox] { width: 20px; height: 20px; accent-color: ${_acc}; cursor: pointer; }
  .opt-text { display: flex; flex-direction: column; gap: 3px; }
  .opt-label { font-weight: 600; font-size: .95rem; color: ${_text}; }
  .opt-desc { font-size: .8rem; color: ${_muted}; line-height: 1.4; }
  button { width: 100%; padding: 14px; border: none; border-radius: 12px; font-size: 1rem; font-weight: 700; cursor: pointer; background: ${_acc}; color: #fff; letter-spacing: .01em; transition: background .15s, transform .1s; }
  button:hover { background: ${_accDk}; }
  button:active { transform: scale(.98); }
  @media print { body { background: white; } .card { box-shadow: none; border: none; } }
</style>
</head>
<body>
<div class="card">
  <div class="card-header">
    <div class="card-icon">🖨</div>
    <h2>Opzioni stampa</h2>
  </div>
  <div class="sub">${routeName}${date ? " · " + date : ""}</div>
  <div class="options">
    <label>
      <div class="check-wrap"><input type="checkbox" id="opt-phones" checked></div>
      <div class="opt-text">
        <span class="opt-label">Numeri di telefono</span>
        <span class="opt-desc">Aggiunge una colonna con i contatti di ogni tappa</span>
      </div>
    </label>
    <label style="${costsAvailable ? "" : "opacity:.45;pointer-events:none"}">
      <div class="check-wrap"><input type="checkbox" id="opt-costs" ${costsAvailable ? "" : "disabled"}></div>
      <div class="opt-text">
        <span class="opt-label">Riepilogo costi</span>
        <span class="opt-desc">${costsAvailable ? "Costo km, guida, lavoro e totale giornata" : "Attiva \\\"Calcola costi\\\" nel giro per includere i costi"}</span>
      </div>
    </label>
  </div>
  <button onclick="generate()">Stampa / Salva PDF</button>
</div>
<script>
const DATA = ${payload};
function generate() {
  const p = document.getElementById("opt-phones").checked;
  const c = document.getElementById("opt-costs").checked;
  const key = (p?"p":"")+(c?"c":"");
  const doc = DATA.variants[key] || DATA.variants[""];
  document.open(); document.write(doc); document.close();
  window.addEventListener("afterprint", function(){ window.close(); });
  setTimeout(function(){ window.print(); }, 300);
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
    customAddress: v.customAddress, customDuration: hhmmToMins(v.customDuration) || 45,
    transcript: v.transcript || "",
    lunchBreak: Boolean(v.lunchBreak),
    lunchBreakMinutes: Number(v.lunchBreakMinutes || 45),
    lunchFixedTime: v.lunchFixedTime || "",
    departureLatest: v.departureLatest || ""
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

// ── share route ───────────────────────────────────────────────────────────────

async function shareRoute(routeId) {
  try {
    showSpinner("Generazione link…");
    const data = await api(`/api/routes/${routeId}/share`, { method: "POST" });
    hideSpinner();
    const url = data.url;
    if (navigator.share) {
      const routeName = state.result?.name || state.savedRoutes.find(r => String(r.id) === String(routeId))?.name || "Giro";
      await navigator.share({ title: routeName, text: `Giro di lavoro: ${routeName}`, url }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url).catch(() => {});
      showToast("Link copiato — scade tra 5 giorni");
    }
  } catch (e) {
    hideSpinner();
    showToast(e.message);
  }
}

async function handleShareImport(token) {
  try {
    showSpinner("Caricamento giro…");
    const route = await fetch(`/api/share/${token}`).then(r => r.ok ? r.json() : Promise.reject(new Error("Link scaduto o non valido")));
    hideSpinner();

    // Mostra preview e chiede conferma
    const name = route.name || "Giro condiviso";
    const stops = (route.rows || route.plannedStops || []).filter(s => !s.type);
    const stopNames = stops.slice(0, 5).map(s => `• ${s.customer || s.customer}`).join("\n");
    const more = stops.length > 5 ? `\n… e altri ${stops.length - 5}` : "";
    const confirm = window.confirm(`Importare il giro "${name}"?\n\n${stopNames}${more}\n\nVerrà aggiunto ai tuoi giri salvati.`);
    if (!confirm) return;

    showSpinner("Importazione…");
    const saved = await api(`/api/share/${token}/import`, { method: "POST" });
    state.result = saved;
    await refreshSavedRoutes();
    hideSpinner();
    setActiveTab("result");
    showToast(`Giro "${name}" importato`);
    // Pulisci l'URL dal token
    history.replaceState(null, "", "/");
  } catch (e) {
    hideSpinner();
    showToast(e.message);
  }
}

// ── replan from result view ───────────────────────────────────────────────────

function _readResultEditForm() {
  const f = document.querySelector("#rv-settings-form");
  if (!f) return {};
  const fd = new FormData(f);
  return Object.fromEntries(fd.entries());
}

async function replanFromResult() {
  const result = normalizeSavedRoute(state.result);
  const v = _readResultEditForm();

  // Reconstruct stops from current result rows (skip breaks)
  const stops = (result.rows || [])
    .filter(r => !r.type)
    .filter((r, i, arr) => !r.stopPart || r.stopPart === "morning" || arr.findIndex(x => x.addressId === r.addressId && !x.stopPart) === i)
    .map(r => ({
      uid: crypto.randomUUID(),
      addressId: r.addressId ?? null,
      customer: r.customer, location: r.location,
      fullAddress: r.address, notes: r.notes,
      durationMinutes: Number(r.durationMinutes || 45),
      lat: r.lat, lng: r.lng,
      weeklyHours: r.weeklyHours ?? null,
      ignoreHours: r.ignoreHours === true,
      fixedFirst: r.fixedFirst === true,
      timeFrom: r.timeFrom || "",
      timeTo: r.timeTo || "",
      timeWindowMode: r.timeWindowMode || "available",
      recognized: true
    }));

  // Add any newly queued stops from the result-view add-stop panel
  for (const s of (state.resultPendingStops || [])) stops.push(s);
  state.resultPendingStops = [];

  if (!stops.length) { showToast("Nessuna tappa nel giro"); return; }

  const timingMode = v.timingMode || result.timingMode || "first_open_minus";
  const lunchBreak = state.resultLunchEnabled !== null
    ? state.resultLunchEnabled
    : (v.lunchBreak === "on" || v.lunchBreak === true);
  const routePayload = {
    name: result.name || "Percorso giornaliero",
    id: result.id,
    scheduledDate: v.scheduledDate || result.scheduledDate || "",
    start: { label: v.startLabel || result.start?.label || "", address: v.startAddress || result.start?.address || "" },
    end: { sameAsStart: v.endSameAsStart === "on", label: v.endLabel || result.end?.label || "", address: v.endAddress || result.end?.address || "" },
    startTime: v.startTime || result.startTime || result.summary?.dayStart || "07:00",
    timingMode,
    arrivalLeadMinutes: Number(v.arrivalLeadMinutes ?? result.arrivalLeadMinutes ?? 10),
    firstArrivalTime: v.firstArrivalTime || result.firstArrivalTime || "08:30",
    firstArrivalRequired: v.firstArrivalRequired || result.firstArrivalRequired || "",
    departureLatest: v.departureLatest || result.maxReturnTime || result.departureLatest || "",
    stops, rates: state.settings,
    lunchBreak,
    lunchBreakMinutes: Number(v.lunchBreakMinutes || result.lunchBreakMinutes || 45),
    lunchFixedTime: v.lunchFixedTime || result.lunchFixedTime || ""
  };

  state.planning = true;
  showSpinner("Ricalcolo percorso…");
  render();
  try {
    state.result = await api("/api/plan", { method: "POST", body: JSON.stringify(routePayload) });
    state.manualOrderRows = null;
    state.expandedStops = new Set();
    state.expandedPanels = new Set();
    state.resultLunchEnabled = null;
    state.showCosts = false;
    state.resultCostRates = null;
    state.dirtyStops = new Set();
    await refreshSavedRoutes();
    setActiveTab("result");
    showToast("Percorso ricalcolato");
  } catch (e) {
    showToast(e.message);
  } finally {
    hideSpinner();
    state.planning = false;
    render();
  }
}

function renderResultEditPanels(result) {
  const s = result.summary || {};
  const hasLunch = result.rows?.some(r => r.type === "lunch");
  const timingMode = result.timingMode || "first_open_minus";
  const startAddr = result.start?.address || "";
  const endAddr = result.end?.address || "";
  const endSame = startAddr && startAddr === endAddr;
  const scheduledDate = result.scheduledDate || "";
  const lunchBreakMinutes = result.lunchBreakMinutes || 45;
  const arrivalLeadMinutes = result.arrivalLeadMinutes ?? 10;
  const firstArrivalTime = result.firstArrivalTime || "08:30";

  return `
    <details class="rv-panel" id="rv-settings-panel"${state.expandedPanels.has("rv-settings-panel") ? " open" : ""}>
      <summary class="rv-panel-summary">
        ${I.edit(14)} Modifica impostazioni giro
      </summary>
      <form id="rv-settings-form" class="rv-settings-form" onsubmit="return false">
        <div class="rv-fields">
          <label class="rp-when-date"><span class="rp-label">Data</span><input name="scheduledDate" type="date" value="${escapeHtml(scheduledDate)}" /></label>
          <label class="rp-when-time"><span class="rp-label">Orario partenza</span><input name="startTime" type="time" step="300" value="${escapeHtml(result.startTime || s.dayStart || "07:00")}" /></label>
          <label class="rp-when-time"><span class="rp-label">Rientro max</span><input name="departureLatest" type="time" step="300" value="${escapeHtml(result.maxReturnTime || result.departureLatest || state.settings.maxReturnTime || "")}" /></label>
        </div>
        <div class="rv-field-full">
          <label class="rp-label" style="display:block;margin-bottom:4px;">Modalità arrivo</label>
          <select name="timingMode" id="rv-timing-mode" style="width:100%;font-size:0.85rem;padding:6px 8px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--text);">
            <option value="first_open_minus" ${timingMode === "first_open_minus" ? "selected" : ""}>Prima dell'apertura</option>
            <option value="arrive_at" ${timingMode === "arrive_at" ? "selected" : ""}>Arrivo a orario fisso</option>
            <option value="depart_at" ${timingMode === "depart_at" ? "selected" : ""}>Partenza a orario fisso</option>
          </select>
        </div>
        <div id="rv-timing-extra">
          ${timingMode === "first_open_minus" ? `<label class="rp-when-date" style="max-width:160px;"><span class="rp-label">Anticipo</span><input name="arrivalLeadMinutes" type="number" min="0" max="60" step="5" value="${arrivalLeadMinutes}" /></label>` : ""}
          ${timingMode === "arrive_at" ? `<label class="rp-when-time" style="max-width:160px;"><span class="rp-label">Arrivo target</span><input name="firstArrivalTime" type="time" step="300" value="${escapeHtml(firstArrivalTime)}" /></label>` : ""}
        </div>
        <div class="rv-field-full">
          <span class="rp-label" style="display:block;margin-bottom:4px;">Partenza da</span>
          <div class="rv-addr-block">
            <div class="rv-addr-row">
              <input id="rv-start-search" type="text" value="${escapeHtml(result.start?.label || startAddr)}" placeholder="Cerca archivio o digita indirizzo…" autocomplete="off" />
              <input type="hidden" name="startAddress" id="rv-start-addr-h" value="${escapeHtml(startAddr)}" />
              <input type="hidden" name="startLabel" id="rv-start-label-h" value="${escapeHtml(result.start?.label || '')}" />
              ${state.googleMapsKey ? `<button type="button" class="btn icon-btn rv-addr-map-btn" data-rv-addr="start" title="Scegli sulla mappa">${I.map(15)}</button>` : ""}
            </div>
            <div id="rv-start-sugg" class="stop-suggestions"></div>
          </div>
        </div>
        <div class="rv-field-full" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span class="rp-label" style="flex:1;min-width:120px;">Arrivo a</span>
          <label class="stop-opt-check"><input type="checkbox" name="endSameAsStart" id="rv-end-same" ${endSame ? "checked" : ""} /><span>= partenza</span></label>
        </div>
        <div class="rv-field-full" id="rv-end-addr-wrap" ${endSame ? 'style="display:none"' : ""}>
          <div class="rv-addr-block">
            <div class="rv-addr-row">
              <input id="rv-end-search" type="text" value="${escapeHtml(result.end?.label || endAddr)}" placeholder="Cerca archivio o digita indirizzo…" autocomplete="off" />
              <input type="hidden" name="endAddress" id="rv-end-addr-h" value="${escapeHtml(endAddr)}" />
              <input type="hidden" name="endLabel" id="rv-end-label-h" value="${escapeHtml(result.end?.label || '')}" />
              ${state.googleMapsKey ? `<button type="button" class="btn icon-btn rv-addr-map-btn" data-rv-addr="end" title="Scegli sulla mappa">${I.map(15)}</button>` : ""}
            </div>
            <div id="rv-end-sugg" class="stop-suggestions"></div>
          </div>
        </div>
        <div class="rv-field-full" style="display:flex;align-items:center;gap:12px;padding-top:4px;">
          <label class="stop-opt-check">
            <input type="hidden" name="lunchBreak" value="off" />
            <input type="checkbox" name="lunchBreak" ${(state.resultLunchEnabled ?? hasLunch) ? "checked" : ""} />
            <span>${I.fork(14)} Pausa pranzo</span>
          </label>
          <input name="lunchBreakMinutes" type="number" min="15" max="120" step="5" value="${lunchBreakMinutes}" style="width:64px;" /> <span class="stop-meta">min</span>
          <label class="stop-opt-check" style="gap:4px;margin-left:6px;" id="rv-lunch-fixed-label">
            <input type="checkbox" id="rv-lunch-fixed-enabled" ${result.lunchFixedTime ? "checked" : ""} />
            <span>alle</span>
          </label>
          <input name="lunchFixedTime" type="time" step="300" value="${escapeHtml(result.lunchFixedTime || "12:30")}" id="rv-lunch-fixed-time" style="width:88px;${!result.lunchFixedTime ? "display:none;" : ""}" ${!result.lunchFixedTime ? "disabled" : ""} />
        </div>
        <button type="button" class="btn primary" id="rv-replan-btn" style="width:100%;margin-top:10px;">${I.navigate(14)} Ricalcola</button>
      </form>
    </details>

    <details class="rv-panel" id="rv-add-stop-panel"${state.expandedPanels.has("rv-add-stop-panel") ? " open" : ""}>
      <summary class="rv-panel-summary">
        ${I.plus(14)} Aggiungi tappa al giro
      </summary>
      <div class="rv-add-stop-body">
        <div style="position:relative;">
          <input id="rv-stop-search" placeholder="Cerca per cliente, sede, attività, indirizzo…" autocomplete="off" />
          <input type="hidden" id="rv-selected-address-id" value="" />
          <div id="rv-stop-suggestions" class="stop-suggestions"></div>
        </div>
        <div id="rv-add-saved-row" style="display:none;margin-top:6px;">
          <div class="rv-selected-stop-preview" id="rv-selected-stop-preview"></div>
          <button type="button" class="btn primary" id="rv-add-saved-stop" style="width:100%;margin-top:6px;">${I.plus(14)} Aggiungi tappa selezionata</button>
        </div>
        <div class="rp-add-stop-actions" style="margin-top:6px;">
          <button type="button" class="btn ghost" id="rv-manual-stop-toggle">+ Manuale</button>
        </div>
        <div id="rv-manual-stop-panel" style="display:none;margin-top:8px;">
          <div class="form-grid route-fields">
            <label class="field">Cliente<input id="rv-custom-customer" /></label>
            <label class="field">Sede<input id="rv-custom-location" /></label>
            <label class="field full">Indirizzo<input id="rv-custom-address" /></label>
            ${state.googleMapsKey ? `<div class="field full" style="padding-top:0"><button type="button" class="btn" id="rv-custom-map-btn">${I.map(14)} Scegli sulla mappa</button></div>` : ""}
            <input type="hidden" id="rv-custom-lat" value="" />
            <input type="hidden" id="rv-custom-lng" value="" />
            <label class="field">Durata<input id="rv-custom-duration" type="time" step="300" value="00:45" data-duration-hhmm /></label>
          </div>
          <div class="actions" style="margin-top:8px;">
            <button type="button" class="btn ghost" id="rv-add-temp-stop">+ Usa senza salvare</button>
            <button type="button" class="btn" id="rv-add-custom-stop">+ Salva e aggiungi</button>
          </div>
        </div>
        ${(state.resultPendingStops || []).length ? `
          <div style="margin-top:10px;">
            <p class="rp-label" style="margin-bottom:4px;">In attesa di ricalcolo:</p>
            ${(state.resultPendingStops || []).map((s, i) => `
              <div class="rv-pending-stop">
                <span>${escapeHtml(s.customer)}${s.location ? ` — ${escapeHtml(s.location)}` : ""}</span>
                <button class="btn danger icon-btn" data-rv-remove-pending="${i}">${I.trash(13)}</button>
              </div>`).join("")}
          </div>` : ""}
        ${(state.resultPendingStops || []).length ? `<button type="button" class="btn primary" id="rv-replan-from-add" style="width:100%;margin-top:8px;">${I.navigate(14)} Ricalcola con le nuove tappe</button>` : ""}
      </div>
    </details>

    <details class="rv-panel" id="rv-notes-panel"${state.expandedPanels.has("rv-notes-panel") ? " open" : ""}>
      <summary class="rv-panel-summary">
        ${I.edit(14)} Note giro
      </summary>
      <div class="rv-add-stop-body">
        <textarea id="rv-notes-input" placeholder="Note libere relative a questo giro…" rows="4" style="width:100%;resize:vertical;font-size:0.88rem;padding:8px;border:1px solid var(--line);border-radius:var(--radius);background:var(--bg2);color:var(--text);box-sizing:border-box;">${escapeHtml(result.notes || "")}</textarea>
        <button type="button" class="btn primary" id="rv-notes-save" style="margin-top:6px;">${I.check(14)} Salva note</button>
        <span id="rv-notes-saved" style="font-size:0.8rem;color:var(--muted);margin-left:8px;display:none;">Salvato</span>
      </div>
    </details>`;
}

// ── plan route ────────────────────────────────────────────────────────────────

async function planCurrentRoute() {
  if (state.planning) return;
  updateRouteFromForm();
  if (!state.route.stops.length) { showToast("Aggiungi almeno una tappa"); return; }
  state.planning = true;
  showSpinner("Calcolo percorso…");
  render();
  try {
    const r = state.route;
    state.result = await api("/api/plan", {
      method: "POST",
      body: JSON.stringify({
        name: r.name || "",
        id: state.result?.id || undefined,
        scheduledDate: r.scheduledDate,
        start: { label: r.startLabel, address: r.startAddress },
        end: { sameAsStart: r.endSameAsStart, label: r.endLabel, address: r.endAddress },
        startTime: r.startTime,
        timingMode: r.timingMode,
        arrivalLeadMinutes: r.arrivalLeadMinutes,
        firstArrivalTime: r.firstArrivalTime,
        firstArrivalRequired: r.firstArrivalRequired,
        stops: r.stops, rates: state.settings,
        lunchBreak: r.lunchBreak, lunchBreakMinutes: r.lunchBreakMinutes,
        lunchFixedTime: r.lunchFixedTime || "",
        departureLatest: r.departureLatest || ""
      })
    });
    state.manualOrderRows = null;
    state.expandedStops = new Set();
    state.expandedPanels = new Set();
    state.resultLunchEnabled = null;
    state.showCosts = false;
    state.resultCostRates = null;
    state.dirtyStops = new Set();
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
    defaultDuration: hhmmToMins(v.defaultDuration) || 45,
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
    state.expandedStops = new Set();
    state.expandedPanels = new Set();
    state.resultLunchEnabled = null;
    state.dirtyStops = new Set();
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
      styles: getMapDarkStyles(),
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
      mapTypeControl: false, fullscreenControl: false, streetViewControl: false,
      styles: getMapDarkStyles(),
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

function openMapPickerForField({ labelEl, addressEl, latEl, lngEl, onConfirm, onUseDirectly }) {
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

    // When called from manual stop panel, "Usa" adds stop directly without saving
    const confirmBtn = document.getElementById("map-picker-field-confirm");
    if (onUseDirectly) {
      confirmBtn.textContent = "✓ Usa come tappa";
      confirmBtn.onclick = () => {
        const label = pickedPlace?.name || "";
        const address = pickedPlace?.formatted_address || pickedAddress || "";
        if (!address) { showToast("Seleziona un luogo sulla mappa"); return; }
        onUseDirectly(label, address, pickedLat, pickedLng);
        modal.remove();
      };
    } else {
      confirmBtn.onclick = () => applyPick(false);
    }
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
      if (stop) {
        if (sf.type === "checkbox") stop[key] = sf.checked;
        else if (sf.type === "radio") { stop[key] = sf.value; render(); }
        else {
          // timeFrom/timeTo: aggiorna lo stato ma NON fare render() — il picker iOS
          // verrebbe distrutto mentre l'utente sta ancora scrollando.
          // render() viene chiamato su "change" (evento che si attiva solo alla chiusura del picker).
          stop[key] = key === "durationMinutes" ? hhmmToMins(sf.value) : sf.value;
        }
      }
    }
    // rv-lunch-toggle — abilita/disabilita orario fisso pranzo dalla card tappa
    if (e.target.matches("[data-rv-lunch-toggle]")) {
      const enabled = e.target.checked;
      const timeInput = e.target.closest(".rv-stop-edit-row")?.querySelector("[data-rv-lunch-time]");
      if (timeInput) {
        timeInput.style.display = enabled ? "" : "none";
        timeInput.disabled = !enabled;
      }
      if (state.result) {
        state.result.lunchFixedTime = enabled ? (timeInput?.value || "12:30") : "";
        const btn = e.target.closest(".rv-stop-edit")?.querySelector(".rv-stop-replan-btn");
        if (btn) btn.classList.add("primary");
      }
      return;
    }
    // rv-lunch-time — orario fisso pranzo impostato dalla card tappa
    if (e.target.closest("[data-rv-lunch-time]")) {
      if (state.result) {
        state.result.lunchFixedTime = e.target.value || "";
        const btn = e.target.closest(".rv-stop-edit")?.querySelector(".rv-stop-replan-btn");
        if (btn) btn.classList.add("primary");
      }
      return;
    }
    // rv-stop — per-stop edit in result view
    const rvs = e.target.closest("[data-rv-stop]");
    if (rvs) {
      const [idx, key] = rvs.dataset.rvStop.split(":");
      if (key === "durationMinutes") {
        const row = getRvStopRow(idx);
        if (row) {
          row.durationMinutes = hhmmToMins(rvs.value) || row.durationMinutes;
          state.dirtyStops.add(idx);
          const btn = rvs.closest(".rv-stop-edit")?.querySelector(".rv-stop-replan-btn");
          if (btn) btn.classList.add("primary");
        }
      }
      return;
    }
    // google contacts search
    if (e.target.id === "gc-search" && state.googleContactsData) {
      const q = e.target.value;
      const cursor = e.target.selectionStart;
      state.googleContactsData.search = q;
      render();
      const inp = document.getElementById("gc-search");
      if (inp) { inp.focus(); inp.setSelectionRange(cursor, cursor); }
      return;
    }
    // archive search
    if (e.target.id === "archive-search") {
      const q = e.target.value;
      const cursor = e.target.selectionStart;
      state.addressSearch = q;
      state.archiveShowAll = Boolean(q);
      // Client-side filter from already-loaded list, con ranking di pertinenza
      state.addresses = q ? rankAddressMatches(state.allAddresses, q) : [];
      renderArchive();
      // Restore focus + cursor after DOM replacement
      const inp = document.getElementById("archive-search");
      if (inp) { inp.focus(); inp.setSelectionRange(cursor, cursor); }
      // Then confirm with server (only refreshAddresses, not all data)
      clearTimeout(state._archiveSearchTimer);
      state._archiveSearchTimer = setTimeout(() => {
        refreshAddresses().then(() => {
          renderArchive();
          const inp2 = document.getElementById("archive-search");
          if (inp2 && document.activeElement !== inp2) { inp2.focus(); inp2.setSelectionRange(inp2.value.length, inp2.value.length); }
        });
      }, 300);
    }
    // stop autocomplete
    if (e.target.id === "stop-search") {
      state.stopSearchText = e.target.value;
      state.route.selectedAddressId = "";
      const sug = document.querySelector("#stop-suggestions");
      if (sug) sug.innerHTML = renderStopSuggestions();
    }
    // rv-start-search / rv-end-search: ricerca archivio + sync campi nascosti
    if (e.target.id === "rv-start-search" || e.target.id === "rv-end-search") {
      const isStart = e.target.id === "rv-start-search";
      const q = e.target.value;
      const addrH = document.getElementById(isStart ? "rv-start-addr-h" : "rv-end-addr-h");
      const labelH = document.getElementById(isStart ? "rv-start-label-h" : "rv-end-label-h");
      const suggEl = document.getElementById(isStart ? "rv-start-sugg" : "rv-end-sugg");
      // Testo libero: aggiorna il campo indirizzo nascosto in tempo reale
      if (addrH) addrH.value = q;
      if (labelH) labelH.value = "";
      // Mostra suggerimenti dall'archivio
      if (suggEl) {
        const matches = q.trim().length > 0 ? rankAddressMatches(state.allAddresses, q.trim().toLowerCase()).slice(0, 6) : [];
        suggEl.innerHTML = matches.map(a => `
          <div class="stop-suggestion-item" data-rv-addr-sugg="${isStart ? "start" : "end"}" data-addr-id="${a.id}">
            <span class="stop-suggestion-name">${escapeHtml(addressName(a))}</span>
            <span class="stop-suggestion-addr">${escapeHtml(a.fullAddress || "")}</span>
          </div>`).join("");
      }
      // Sincronizza arrivo se "= partenza" è attivo
      if (isStart && document.getElementById("rv-end-same")?.checked) {
        const endSearch = document.getElementById("rv-end-search");
        const endAddrH = document.getElementById("rv-end-addr-h");
        const endLabelH = document.getElementById("rv-end-label-h");
        if (endSearch) endSearch.value = q;
        if (endAddrH) endAddrH.value = q;
        if (endLabelH) endLabelH.value = "";
      }
    }
    // rv result-view stop autocomplete
    if (e.target.id === "rv-stop-search") {
      const q = e.target.value.trim().toLowerCase();
      const sug = document.getElementById("rv-stop-suggestions");
      if (!sug) return;
      // reset selection when user types again
      document.getElementById("rv-selected-address-id").value = "";
      const addRow = document.getElementById("rv-add-saved-row");
      if (addRow) addRow.style.display = "none";
      if (!q) { sug.innerHTML = ""; return; }
      const matches = rankAddressMatches(state.allAddresses, q).slice(0, 8);
      sug.innerHTML = matches.length
        ? matches.map(a => `
          <div class="stop-suggestion-item" data-rv-suggest-id="${a.id}">
            <span class="stop-suggestion-name">${escapeHtml(addressName(a))}</span>
            <span class="stop-suggestion-addr">${escapeHtml(a.fullAddress || "")}</span>
          </div>`).join("")
        : `<div class="stop-suggestion-empty">Nessun risultato</div>`;
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

  // timeFrom/timeTo stop-form + rv-row: render su "change" (picker iOS chiuso)
  app.addEventListener("change", e => {
    // stop form (nuovo percorso) — solo aggiorna stato, NO render (iOS chiuderebbe il picker)
    const sf = e.target.closest("[data-stop]");
    if (sf) {
      const [uid, key] = sf.dataset.stop.split(":");
      if (key === "timeFrom" || key === "timeTo") {
        const stop = state.route.stops.find(s => s.uid === uid);
        if (stop) stop[key] = sf.value;
        return;
      }
    }
    // rv-row — solo aggiorna stato
    const rv = e.target.closest("[data-rv-row]");
    if (rv && state.result?.rows) {
      const [idx, key] = rv.dataset.rvRow.split(":");
      if (key === "timeFrom" || key === "timeTo") {
        const customerRows = state.result.rows.filter(r => !r.type && (!r.stopPart || r.stopPart === "morning"));
        const targetRow = customerRows[Number(idx)];
        if (targetRow) {
          state.result.rows = state.result.rows.map(r =>
            r === targetRow ? { ...r, [key]: rv.value } : r
          );
        }
        return;
      }
    }
    // rv-stop — per-stop settings in result view
    const rvs = e.target.closest("[data-rv-stop]");
    if (rvs && state.result?.rows) {
      const [idx, key] = rvs.dataset.rvStop.split(":");
      const row = getRvStopRow(idx);
      if (!row) return;
      state.dirtyStops.add(idx);
      if (key === "timeFrom" || key === "timeTo") {
        row[key] = rvs.value;
        // no render here — iOS picker stays open; render on blur
        return;
      }
      if (key === "timeWindowMode") {
        row.timeWindowMode = rvs.value;
        const editBlock = rvs.closest(".rv-stop-edit");
        if (editBlock) {
          const durInp = editBlock.querySelector("[data-rv-stop$=':durationMinutes']");
          if (durInp) {
            const isFixed = rvs.value === "fixed";
            durInp.disabled = isFixed;
            if (isFixed && row.timeFrom && row.timeTo) {
              durInp.value = minsToHHMM(Math.max(0, hhmmToMins(row.timeTo) - hhmmToMins(row.timeFrom)));
            } else if (!isFixed) {
              durInp.value = minsToHHMM(row.durationMinutes);
            }
          }
          // update active class on mode labels
          editBlock.querySelectorAll(".stop-window-mode-opt").forEach(lbl => {
            lbl.classList.toggle("active", lbl.querySelector("input")?.value === rvs.value);
          });
          const btn = editBlock.querySelector(".rv-stop-replan-btn");
          if (btn) btn.classList.add("primary");
        }
        return;
      }
      if (key === "fixedFirst" || key === "ignoreHours") {
        row[key] = rvs.checked;
        // update button style in-place without full render
        const btn = rvs.closest(".rv-stop-edit")?.querySelector(".rv-stop-replan-btn");
        if (btn) btn.classList.add("primary");
        return;
      }
    }
  });

  // render() solo su blur per timeFrom/timeTo — il picker è già chiuso a questo punto
  // render() su blur solo per stop del form percorso (non rv-row: evita tap fantasma su iOS)
  app.addEventListener("blur", e => {
    const sf = e.target.closest("[data-stop]");
    if (sf) {
      const [, key] = sf.dataset.stop.split(":");
      if (key === "timeFrom" || key === "timeTo") render();
    }
    // rv-stop time fields: update duration inline on blur (no render — avoids collapsing panels)
    const rvs = e.target.closest("[data-rv-stop]");
    if (rvs) {
      const [idx, key] = rvs.dataset.rvStop.split(":");
      if (key === "timeFrom" || key === "timeTo") {
        const row = getRvStopRow(idx);
        if (row) {
          const editBlock = rvs.closest(".rv-stop-edit");
          // Enable mode selector as soon as the user has entered any time
          if (row.timeFrom || row.timeTo) {
            const modeContainer = editBlock?.querySelector(".stop-window-mode");
            if (modeContainer) {
              modeContainer.classList.remove("disabled");
              modeContainer.querySelectorAll("input[type=radio]").forEach(r => r.disabled = false);
            }
          }
          // Update duration when mode is fixed and both bounds are known
          if (row.timeWindowMode === "fixed") {
            const durInp = editBlock?.querySelector("[data-rv-stop$=':durationMinutes']");
            if (durInp && row.timeFrom && row.timeTo) {
              durInp.value = minsToHHMM(Math.max(0, hhmmToMins(row.timeTo) - hhmmToMins(row.timeFrom)));
            }
          }
        }
      }
    }
  }, true);


  // Track rv-panel open/close state so render() doesn't collapse them
  app.addEventListener("toggle", e => {
    const panel = e.target.closest(".rv-panel[id]");
    if (panel) {
      if (e.target.open) state.expandedPanels.add(panel.id);
      else state.expandedPanels.delete(panel.id);
    }
  }, true);

  app.addEventListener("change", e => {
    // Guard: only apply route-form handlers when inside #route-form
    if (e.target.name === "endSameAsStart" || e.target.name === "timingMode") {
      if (e.target.closest("#route-form")) {
        updateRouteFromForm();
        render();
      }
    }
    // rv-timing-mode select: update extra fields inline with values from current result
    if (e.target.id === "rv-timing-mode") {
      const mode = e.target.value;
      const extra = document.getElementById("rv-timing-extra");
      if (extra) {
        const res = state.result ? normalizeSavedRoute(state.result) : {};
        extra.innerHTML =
          mode === "first_open_minus" ? `<label class="rp-when-date" style="max-width:160px;"><span class="rp-label">Anticipo</span><input name="arrivalLeadMinutes" type="number" min="0" max="60" step="5" value="${res.arrivalLeadMinutes ?? 10}" /></label>` :
          mode === "arrive_at" ? `<label class="rp-when-time" style="max-width:160px;"><span class="rp-label">Arrivo target</span><input name="firstArrivalTime" type="time" step="300" value="${res.firstArrivalTime || '08:30'}" /></label>` : "";
      }
    }
    if (e.target.name === "lunchBreak") {
      if (e.target.closest("#route-form")) {
        const minutesInput = document.getElementById("lunch-break-minutes");
        if (minutesInput) minutesInput.disabled = !e.target.checked;
        state.route.lunchBreak = e.target.checked;
      } else if (e.target.closest("#rv-settings-form")) {
        state.resultLunchEnabled = e.target.checked;
      }
    }
    if (e.target.id === "rv-costs-check") {
      state.showCosts = e.target.checked;
      if (state.showCosts && !state.resultCostRates) {
        state.resultCostRates = defaultCostRates();
      }
      renderResult();
    }
    if (e.target.dataset.rvRate) {
      const key = e.target.dataset.rvRate;
      const val = Number(e.target.value);
      if (!isNaN(val) && val >= 0) {
        state.resultCostRates = { ...(state.resultCostRates || defaultCostRates()), [key]: val };
        renderResult();
      }
    }
    if (e.target.dataset.rvOpRate !== undefined) {
      const idx = Number(e.target.dataset.rvOpIdx);
      const val = Number(e.target.value);
      if (!isNaN(val) && val >= 0) {
        const r = state.resultCostRates || defaultCostRates();
        const ops = [...(r.operators || [{ workHourRate: r.workHourRate ?? 22 }])];
        ops[idx] = { ...ops[idx], workHourRate: val };
        state.resultCostRates = { ...r, operators: ops };
        renderResult();
      }
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
      if (details) {
        details.hidden = !details.hidden;
        if (details.hidden) state.expandedStops.delete(id);
        else state.expandedStops.add(id);
      }
      return;
    }

    const tabJump = e.target.closest("[data-tab-jump]");
    if (tabJump) { setActiveTab(tabJump.dataset.tabJump); return; }

    // suggestion item selected
    // rv result-view suggestion selected
    const rvSugItem = e.target.closest("[data-rv-suggest-id]");
    if (rvSugItem) {
      const id = rvSugItem.dataset.rvSuggestId;
      const addr = state.allAddresses.find(a => String(a.id) === id);
      if (addr) {
        document.getElementById("rv-selected-address-id").value = id;
        const inp = document.getElementById("rv-stop-search");
        if (inp) inp.value = addressName(addr);
        document.getElementById("rv-stop-suggestions").innerHTML = "";
        const preview = document.getElementById("rv-selected-stop-preview");
        if (preview) preview.textContent = addr.fullAddress || addr.location || "";
        const addRow = document.getElementById("rv-add-saved-row");
        if (addRow) addRow.style.display = "";
      }
      return;
    }

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
      showSpinner(hasLunch ? "Rimozione pranzo…" : "Ricalcolo con pausa pranzo…");
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
            maxReturnTime: result.maxReturnTime,
            rates: state.settings,
            manualOrder: true,
            lunchBreak: !hasLunch,
            lunchBreakMinutes: result.lunchBreakMinutes || state.settings.lunchBreakMinutes || 45,
            stops: customerRows.filter((r, i, arr) => !r.stopPart || arr.findIndex(x => x.stopUid === r.stopUid) === i).map(row => ({
              uid: row.stopUid || crypto.randomUUID(),
              addressId: row.addressId,
              customer: row.customer, location: row.location,
              fullAddress: row.fullAddress || row.address, notes: row.notes,
              openMorning: row.openMorning, closeMorning: row.closeMorning,
              openAfternoon: row.openAfternoon, closeAfternoon: row.closeAfternoon,
              durationMinutes: row.timeWindowMode === "fixed"
                ? Math.max(0, (row.timeTo && row.timeFrom ? hhmmToMins(row.timeTo) - hhmmToMins(row.timeFrom) : 0))
                : (row.stopPart === "morning" ? (customerRows.filter(x => x.stopUid === row.stopUid).reduce((t, x) => t + x.durationMinutes, 0)) : row.durationMinutes),
              timeFrom: row.timeFrom || undefined,
              timeTo: row.timeTo || undefined,
              timeWindowMode: row.timeWindowMode || undefined,
              fixedFirst: row.fixedFirst || undefined,
              ignoreHours: row.ignoreHours || undefined,
              lat: row.lat, lng: row.lng
            }))
          })
        });
        state.manualOrderRows = null;
    state.expandedStops = new Set();
    state.expandedPanels = new Set();
    state.resultLunchEnabled = null;
    state.dirtyStops = new Set();
        if (!hasLunch) {
          const lunchRow = state.result?.rows?.find(r => r.type === "lunch");
          const where = lunchRow?.customer && lunchRow.customer !== "Pausa pranzo" ? ` — ${lunchRow.customer}` : "";
          showToast(`Pausa pranzo aggiunta${where}`);
        } else {
          showToast("Pausa pranzo rimossa");
        }
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

    // ── result-view: salva note ───────────────────────────────────────────────
    if (e.target.closest("#rv-notes-save")) {
      const routeId = state.result?.id;
      const notes = document.getElementById("rv-notes-input")?.value ?? "";
      if (routeId) {
        try {
          await api(`/api/routes/${routeId}`, { method: "PATCH", body: JSON.stringify({ notes }) });
          state.result.notes = notes;
          const saved = document.getElementById("rv-notes-saved");
          if (saved) { saved.style.display = "inline"; setTimeout(() => { saved.style.display = "none"; }, 2000); }
        } catch { showToast("Errore salvataggio note"); }
      } else {
        showToast("Salva prima il giro per poter aggiungere note");
      }
      return;
    }

    // ── result-view: ricalcola ────────────────────────────────────────────────
    if (e.target.closest("#rv-replan-btn") || e.target.closest("#rv-replan-from-add") || e.target.closest("#rv-replan-stopwindow") || e.target.closest(".rv-stop-replan-btn")) {
      await replanFromResult();
      return;
    }

    // Suggerimento partenza/arrivo nel pannello impostazioni giro
    const addrSuggItem = e.target.closest("[data-rv-addr-sugg]");
    if (addrSuggItem) {
      const isStart = addrSuggItem.dataset.rvAddrSugg === "start";
      const addr = state.allAddresses.find(a => String(a.id) === addrSuggItem.dataset.addrId);
      if (!addr) return;
      const searchEl = document.getElementById(isStart ? "rv-start-search" : "rv-end-search");
      const addrH = document.getElementById(isStart ? "rv-start-addr-h" : "rv-end-addr-h");
      const labelH = document.getElementById(isStart ? "rv-start-label-h" : "rv-end-label-h");
      const suggEl = document.getElementById(isStart ? "rv-start-sugg" : "rv-end-sugg");
      const name = addressName(addr);
      if (searchEl) searchEl.value = name;
      if (addrH) addrH.value = addr.fullAddress || "";
      if (labelH) labelH.value = addr.customer || "";
      if (suggEl) suggEl.innerHTML = "";
      if (isStart && document.getElementById("rv-end-same")?.checked) {
        const es = document.getElementById("rv-end-search");
        const ea = document.getElementById("rv-end-addr-h");
        const el = document.getElementById("rv-end-label-h");
        if (es) es.value = name;
        if (ea) ea.value = addr.fullAddress || "";
        if (el) el.value = addr.customer || "";
      }
      return;
    }

    // Pulsante mappa partenza/arrivo nel pannello impostazioni giro
    const mapAddrBtn = e.target.closest(".rv-addr-map-btn[data-rv-addr]");
    if (mapAddrBtn) {
      const isStart = mapAddrBtn.dataset.rvAddr === "start";
      const addrH = document.getElementById(isStart ? "rv-start-addr-h" : "rv-end-addr-h");
      const labelH = document.getElementById(isStart ? "rv-start-label-h" : "rv-end-label-h");
      openMapPickerForField({
        labelEl: labelH,
        addressEl: addrH,
        onConfirm: (label, address) => {
          const searchEl = document.getElementById(isStart ? "rv-start-search" : "rv-end-search");
          if (searchEl) searchEl.value = label || address;
          if (isStart && document.getElementById("rv-end-same")?.checked) {
            const es = document.getElementById("rv-end-search");
            const ea = document.getElementById("rv-end-addr-h");
            const el = document.getElementById("rv-end-label-h");
            if (es) es.value = label || address;
            if (ea) ea.value = address;
            if (el) el.value = label;
          }
        }
      });
      return;
    }

    // timing mode change → refresh extra fields inline

    // end-same-as-start toggle
    if (e.target.id === "rv-end-same") {
      const wrap = document.getElementById("rv-end-addr-wrap");
      if (wrap) wrap.style.display = e.target.checked ? "none" : "";
      // Se si attiva "= partenza", sincronizza subito i campi arrivo
      if (e.target.checked) {
        const startVal = document.getElementById("rv-start-search")?.value || "";
        const startAddr = document.getElementById("rv-start-addr-h")?.value || "";
        const startLabel = document.getElementById("rv-start-label-h")?.value || "";
        const es = document.getElementById("rv-end-search");
        const ea = document.getElementById("rv-end-addr-h");
        const el = document.getElementById("rv-end-label-h");
        if (es) es.value = startVal;
        if (ea) ea.value = startAddr;
        if (el) el.value = startLabel;
      }
      return;
    }

    // rv-lunch-fixed-enabled toggle nel pannello impostazioni giro
    if (e.target.id === "rv-lunch-fixed-enabled") {
      const timeInput = document.getElementById("rv-lunch-fixed-time");
      if (timeInput) {
        timeInput.style.display = e.target.checked ? "" : "none";
        timeInput.disabled = !e.target.checked;
        if (e.target.checked && !timeInput.value) timeInput.value = "12:30";
      }
      if (state.result) state.result.lunchFixedTime = e.target.checked ? (timeInput?.value || "12:30") : "";
      return;
    }

    // rv-add-stop: show manual panel
    if (e.target.closest("#rv-manual-stop-toggle")) {
      const panel = document.getElementById("rv-manual-stop-panel");
      if (panel) panel.style.display = panel.style.display === "none" ? "" : "none";
      return;
    }

    // rv-add-stop: add from archive
    if (e.target.closest("#rv-add-saved-stop")) {
      const id = document.getElementById("rv-selected-address-id")?.value;
      const addr = state.allAddresses.find(a => String(a.id) === String(id));
      if (!addr) { showToast("Seleziona prima un contatto dalla lista"); return; }
      if (!state.resultPendingStops) state.resultPendingStops = [];
      state.resultPendingStops.push(addressToStop(addr));
      state.expandedPanels.add("rv-add-stop-panel");
      document.getElementById("rv-stop-search").value = "";
      document.getElementById("rv-selected-address-id").value = "";
      document.getElementById("rv-stop-suggestions").innerHTML = "";
      showToast(`${addr.customer} aggiunto — premi Ricalcola`);
      renderResult();
      return;
    }

    // rv-add-stop: add temp stop (manual, no archive save)
    if (e.target.closest("#rv-add-temp-stop")) {
      const addr = document.getElementById("rv-custom-address")?.value?.trim();
      if (!addr) { showToast("Indirizzo obbligatorio"); return; }
      const lat = parseFloat(document.getElementById("rv-custom-lat")?.value) || null;
      const lng = parseFloat(document.getElementById("rv-custom-lng")?.value) || null;
      if (!state.resultPendingStops) state.resultPendingStops = [];
      state.resultPendingStops.push({
        uid: crypto.randomUUID(), addressId: null,
        customer: document.getElementById("rv-custom-customer")?.value?.trim() || addr.split(",")[0] || "Tappa provvisoria",
        location: document.getElementById("rv-custom-location")?.value?.trim() || "",
        fullAddress: addr,
        durationMinutes: hhmmToMins(document.getElementById("rv-custom-duration")?.value) || 45,
        weeklyHours: null, lat, lng, recognized: !!lat, temporary: true
      });
      state.expandedPanels.add("rv-add-stop-panel");
      showToast("Tappa aggiunta — premi Ricalcola");
      renderResult();
      return;
    }

    // rv-add-stop: save to archive and add
    if (e.target.closest("#rv-add-custom-stop")) {
      const customer = document.getElementById("rv-custom-customer")?.value?.trim();
      const addr = document.getElementById("rv-custom-address")?.value?.trim();
      if (!customer || !addr) { showToast("Cliente e indirizzo obbligatori"); return; }
      const lat = parseFloat(document.getElementById("rv-custom-lat")?.value) || null;
      const lng = parseFloat(document.getElementById("rv-custom-lng")?.value) || null;
      const duration = hhmmToMins(document.getElementById("rv-custom-duration")?.value) || 45;
      try {
        const saved = await api("/api/addresses", { method: "POST", body: JSON.stringify({
          customer, location: document.getElementById("rv-custom-location")?.value?.trim() || "",
          fullAddress: addr, lat, lng, defaultDuration: duration
        })});
        state.allAddresses.unshift(saved);
        if (!state.resultPendingStops) state.resultPendingStops = [];
        state.resultPendingStops.push(addressToStop(saved));
        state.expandedPanels.add("rv-add-stop-panel");
        showToast(`${customer} salvato — premi Ricalcola`);
        renderResult();
      } catch (err) { showToast(err.message); }
      return;
    }

    // WhatsApp button on result stop cards
    if (e.target.closest(".rc-wa-btn") && state.result?.rows) {
      const uid = e.target.closest(".rc-wa-btn").dataset.waStop;
      const result = normalizeSavedRoute(state.result);
      const row = result.rows.find(r => !r.type && (!r.stopPart || r.stopPart === "morning") &&
        (r.stopUid === uid || r.uid === uid || String(r.stopNumber) === String(uid)));
      if (!row) return;
      const addr = state.allAddresses.find(a => String(a.id) === String(row.addressId));
      const prefPhone = preferredPhone(addr || {});
      const phone = prefPhone?.number || addr?.phone || row.phone || "";
      const waPhone = formatPhoneForWhatsApp(phone);
      const msg = buildWhatsAppMessage(result, row);
      // If no number: open WhatsApp without a recipient so the user can search manually
      const url = waPhone
        ? `https://wa.me/${waPhone}${msg ? "?text=" + encodeURIComponent(msg) : ""}`
        : `https://wa.me/${msg ? "?text=" + encodeURIComponent(msg) : ""}`;
      window.open(url, "_blank", "noopener");
      return;
    }

    // result view: remove stop from current route and replan
    if (e.target.closest(".rc-remove-stop-btn") && state.result?.rows) {
      const uid = e.target.closest(".rc-remove-stop-btn").dataset.removeStop;
      const result = normalizeSavedRoute(state.result);
      // Find the stop to remove (match by uid, stopUid, or stopNumber as fallback)
      const removedRow = result.rows.find(r => !r.type && (!r.stopPart || r.stopPart === "morning") &&
        (r.stopUid === uid || r.uid === uid || String(r.stopNumber) === String(uid)));
      if (!removedRow) return;
      // Remove all parts of this stop (morning + afternoon) by stopUid or stopNumber
      state.result.rows = state.result.rows.filter(r => {
        if (r.type) return true; // keep breaks
        if (removedRow.stopUid) return r.stopUid !== removedRow.stopUid;
        return r.stopNumber !== removedRow.stopNumber;
      });
      showToast(`${removedRow.customer} rimosso — premi Ricalcola`);
      renderResult();
      return;
    }

    // rv-add-stop: remove pending
    const rvRemove = e.target.closest("[data-rv-remove-pending]");
    if (rvRemove) {
      const idx = Number(rvRemove.dataset.rvRemovePending);
      if (state.resultPendingStops) state.resultPendingStops.splice(idx, 1);
      renderResult();
      return;
    }

    // rv-add-stop: map picker
    if (e.target.closest("#rv-custom-map-btn")) {
      openMapPickerForField({
        onPick: ({ lat, lng, address }) => {
          const el = document.getElementById("rv-custom-address");
          const latEl = document.getElementById("rv-custom-lat");
          const lngEl = document.getElementById("rv-custom-lng");
          if (el) el.value = address;
          if (latEl) latEl.value = lat;
          if (lngEl) lngEl.value = lng;
        }
      });
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

    const shareRouteBtn = e.target.closest("[data-share-route]");
    if (shareRouteBtn) {
      await shareRoute(shareRouteBtn.dataset.shareRoute);
      return;
    }

    const renameRoute = e.target.closest("[data-rename-route]");
    if (renameRoute) {
      const id = renameRoute.dataset.renameRoute;
      const current = state.savedRoutes.find(r => String(r.id) === String(id))?.name || "";
      const name = window.prompt("Nuovo nome giro:", current);
      if (!name) return;
      await api(`/api/routes/${id}`, { method: "PUT", body: JSON.stringify({ name }) });
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

    const openRoute = e.target.closest("[data-open-route]");
    if (openRoute) {
      showToast("Carico giro…");
      try {
        const raw = await api(`/api/routes/${openRoute.dataset.openRoute}`);
        state.result = normalizeSavedRoute({ ...raw.payload, id: raw.id, ...raw });
        state.manualOrderRows = null;
    state.expandedStops = new Set();
    state.expandedPanels = new Set();
    state.resultLunchEnabled = null;
    state.dirtyStops = new Set();
        setActiveTab("result");
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

    if (e.target.closest("#add-temp-stop")) {
      updateRouteFromForm();
      if (!state.route.customAddress) { showToast("Indirizzo obbligatorio"); return; }
      const lat = parseFloat(document.getElementById("rp-custom-lat")?.value) || null;
      const lng = parseFloat(document.getElementById("rp-custom-lng")?.value) || null;
      state.route.stops.push({
        uid: crypto.randomUUID(),
        addressId: null,
        customer: state.route.customCustomer || state.route.customAddress.split(",")[0] || "Tappa provvisoria",
        location: state.route.customLocation || "",
        fullAddress: state.route.customAddress,
        durationMinutes: state.route.customDuration || 45,
        weeklyHours: null,
        lat, lng,
        recognized: true,
        temporary: true
      });
      Object.assign(state.route, { customCustomer: "", customLocation: "", customAddress: "", customDuration: 45, customWeeklyHours: null });
      render();
      showToast("Tappa aggiunta (non salvata in archivio)");
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

    // Costs: add operator
    if (e.target.closest("#rv-add-operator")) {
      const r = state.resultCostRates || defaultCostRates();
      const ops = [...(r.operators || [{ workHourRate: r.workHourRate ?? 22 }])];
      if (ops.length < 8) ops.push({ workHourRate: ops[ops.length - 1]?.workHourRate ?? state.settings.workHourRate ?? 22 });
      state.resultCostRates = { ...r, operators: ops };
      renderResult();
      return;
    }
    // Costs: remove operator
    const removeOp = e.target.closest("[data-remove-operator]");
    if (removeOp) {
      const idx = Number(removeOp.dataset.removeOperator);
      const r = state.resultCostRates || defaultCostRates();
      const ops = [...(r.operators || [])];
      if (ops.length > 1) ops.splice(idx, 1);
      state.resultCostRates = { ...r, operators: ops };
      renderResult();
      return;
    }

    // Archive: start select mode
    if (e.target.closest("#archive-start-select")) {
      state.archiveSelectMode = true;
      state.archiveSelected = new Set();
      state.archiveDeletePending = null;
      renderArchive();
      return;
    }
    // Archive: cancel select mode
    if (e.target.closest("#archive-cancel-select")) {
      state.archiveSelectMode = false;
      state.archiveSelected = new Set();
      renderArchive();
      return;
    }
    // Archive: select all
    if (e.target.closest("#archive-select-all")) {
      if (state.archiveSelected.size === state.addresses.length) {
        state.archiveSelected = new Set();
      } else {
        state.archiveSelected = new Set(state.addresses.map(a => String(a.id)));
      }
      renderArchive();
      return;
    }
    // Archive: bulk delete selected
    if (e.target.closest("#archive-delete-selected")) {
      const ids = [...state.archiveSelected];
      if (!ids.length) return;
      try {
        showSpinner(`Eliminazione ${ids.length} contatt${ids.length === 1 ? "o" : "i"}…`);
        await Promise.all(ids.map(id => api(`/api/addresses/${id}`, { method: "DELETE" })));
        state.archiveSelected = new Set();
        state.archiveSelectMode = false;
        await refreshAllData();
        renderArchive();
        showToast(`${ids.length} contatt${ids.length === 1 ? "o eliminato" : "i eliminati"}`);
      } catch (err) {
        showToast("Errore nell'eliminazione: " + err.message);
      } finally {
        hideSpinner();
      }
      return;
    }
    // Archive: toggle card in select mode
    const selCard = e.target.closest("[data-select-address]");
    if (selCard && state.archiveSelectMode) {
      const id = String(selCard.dataset.selectAddress);
      if (state.archiveSelected.has(id)) state.archiveSelected.delete(id);
      else state.archiveSelected.add(id);
      renderArchive();
      return;
    }
    // Archive: single delete (first click → pending confirm)
    const delAddr = e.target.closest("[data-delete-address]");
    if (delAddr) {
      state.archiveDeletePending = String(delAddr.dataset.deleteAddress);
      renderArchive();
      return;
    }
    // Archive: confirm single delete
    const confirmDel = e.target.closest("[data-confirm-delete-address]");
    if (confirmDel) {
      const id = confirmDel.dataset.confirmDeleteAddress;
      try {
        await api(`/api/addresses/${id}`, { method: "DELETE" });
        state.archiveDeletePending = null;
        await refreshAllData();
        renderArchive();
        showToast("Contatto eliminato");
      } catch (err) {
        state.archiveDeletePending = null;
        showToast("Errore: " + err.message);
        renderArchive();
      }
      return;
    }
    // Archive: cancel single delete
    if (e.target.closest("[data-cancel-delete-address]")) {
      state.archiveDeletePending = null;
      renderArchive();
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
        lngEl: document.querySelector("#rp-custom-lng"),
        onUseDirectly: (label, address, lat, lng) => {
          state.route.stops.push({
            uid: crypto.randomUUID(),
            addressId: null,
            customer: label || address.split(",")[0] || "Tappa provvisoria",
            location: "",
            fullAddress: address,
            durationMinutes: state.route.customDuration || 45,
            weeklyHours: null,
            lat, lng,
            recognized: true,
            temporary: true
          });
          Object.assign(state.route, { customCustomer: "", customLocation: "", customAddress: "", customDuration: 45 });
          render();
          showToast("Tappa aggiunta (non salvata in archivio)");
        }
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
    state.expandedStops = new Set();
    state.expandedPanels = new Set();
    state.resultLunchEnabled = null;
    state.dirtyStops = new Set();
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
  return `<form class="auth-form" novalidate>
    <label class="field">Username<input name="username" autocomplete="username" /></label>
    <label class="field">Password<input name="password" type="password" autocomplete="current-password" /></label>
    <label class="auth-remember"><input type="checkbox" name="remember" checked /> Ricordami su questo dispositivo</label>
    <p class="auth-error"></p>
    <button class="btn primary" type="submit" style="width:100%">Accedi</button>
  </form>`;
}

function renderRegisterForm() {
  return `<form class="auth-form" novalidate>
    <label class="field">Username<input name="username" autocomplete="username" /></label>
    <label class="field">Password<input name="password" type="password" autocomplete="new-password" /></label>
    <p class="auth-error"></p>
    <button class="btn primary" type="submit" style="width:100%">Crea account</button>
    <p class="auth-hint">Minimo 6 caratteri per la password</p>
  </form>`;
}

function renderSetupForm() {
  return `<form class="auth-form" novalidate>
    <label class="field">Username<input name="username" autocomplete="username" /></label>
    <label class="field">Password<input name="password" type="password" autocomplete="new-password" /></label>
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
        const username = (form.querySelector("[name=username]")?.value || "").trim();
        const password = form.querySelector("[name=password]")?.value || "";
        const remember = form.querySelector("[name=remember]")?.checked ?? true;
        if (!username || !password) {
          if (errEl) errEl.textContent = "Inserisci username e password.";
          return;
        }
        if ((activeTab === "register" || isSetup) && password.length < 6) {
          if (errEl) errEl.textContent = "La password deve essere di almeno 6 caratteri.";
          return;
        }
        btn.disabled = true;
        try {
          const path = isSetup ? "/api/auth/setup" : activeTab === "login" ? "/api/auth/login" : "/api/auth/register";
          // Use absolute URL to avoid Safari PWA relative-URL bug ("The string did not match the expected pattern.")
          const endpoint = window.location.origin + path;
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password, remember })
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

  // Ripristina la tab e il giro aperti prima del reload (iOS background)
  try {
    const snap = JSON.parse(localStorage.getItem("pl_nav") || "{}");
    if (snap.tab && snap.tab !== "route") {
      state.activeTab = snap.tab;
      document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === snap.tab));
    }
    if (snap.tab === "result" && snap.resultId) {
      // Prova a trovare il giro nella lista già caricata, altrimenti lo scarica
      const cached = state.savedRoutes.find(r => String(r.id) === String(snap.resultId));
      if (cached) {
        state.result = cached;
      } else {
        try {
          const loaded = await api(`/api/routes/${snap.resultId}`);
          if (loaded) state.result = loaded;
        } catch {}
      }
    }
  } catch {}

  render();
}

async function init() {
  try {
    const meRes = await fetch(window.location.origin + '/api/auth/me');
    const me = await meRes.json().catch(() => ({}));
    if (!meRes.ok) {
      hideSplash();
      renderAuthScreen(me.setup === true);
      return;
    }
    state.user = me;
    state._authVerified = true;
    await initApp();
    updateGreeting();
    hideSplash();
    if (!me.nickname) showNicknameSetup();
    // Controlla se l'URL contiene un token di condivisione
    const shareTokenMatch = window.location.pathname.match(/^\/share\/([a-zA-Z0-9_-]+)/);
    if (shareTokenMatch) handleShareImport(shareTokenMatch[1]);
  } catch {
    // Errore di rete (non 401) — riprova una volta dopo 2s prima di mostrare il login
    await new Promise(r => setTimeout(r, 2000));
    try {
      const retryRes = await fetch(window.location.origin + '/api/auth/me');
      const retryMe = await retryRes.json().catch(() => ({}));
      if (!retryRes.ok) { hideSplash(); renderAuthScreen(retryMe.setup === true); return; }
      state.user = retryMe;
      state._authVerified = true;
      await initApp();
      updateGreeting();
      hideSplash();
      if (!retryMe.nickname) showNicknameSetup();
    } catch {
      hideSplash();
      renderAuthScreen(false);
    }
  }
}

applyTheme();
// Follow OS dark/light preference in real time when set to "auto"
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if ((state.themeMode || "auto") === "auto") applyTheme();
});
bindEvents();

// bfcache restore (iOS Safari ripristina la pagina con il vecchio stato JS)
// → ricontrolla sempre la sessione quando la pagina torna visibile dalla cache
window.addEventListener("pageshow", (e) => {
  if (e.persisted) {
    fetch(window.location.origin + "/api/auth/me").then(r => {
      if (!r.ok) {
        state.user = null;
        state._authVerified = false;
        renderAuthScreen(false);
      }
    }).catch(() => {});
  }
});

// Visibilitychange: ricontrolla la sessione quando l'app torna in primo piano
// dopo un lungo periodo in background (es. iOS uccide il tab e lo ripristina)
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.user) {
    fetch(window.location.origin + "/api/auth/me").then(r => {
      if (!r.ok) {
        state.user = null;
        state._authVerified = false;
        renderAuthScreen(false);
      }
    }).catch(() => {});
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  });
}

init().catch(err => {
  app.innerHTML = `<section class="panel"><h2>Errore avvio</h2><div class="empty">${escapeHtml(err.message)}</div></section>`;
});
