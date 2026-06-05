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

function phoneIcon(type) {
  if (type === "fisso") return "☎";
  if (type === "altro") return "📞";
  return "📱";
}

function preferredPhone(a) {
  if (a.phonePreferred === "phone2" && a.phone2) return { number: a.phone2, type: a.phone2Type, name: a.phone2Name };
  if (a.phone) return { number: a.phone, type: a.phoneType, name: a.phoneName };
  if (a.phone2) return { number: a.phone2, type: a.phone2Type, name: a.phone2Name };
  return null;
}

function addressName(a) {
  return `${a.customer || ""}${a.location ? ` — ${a.location}` : ""}`.trim();
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove("show"), 2800);
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
  if (!res.ok) throw new Error(payload.error || `Errore ${res.status}`);
  return payload;
}

// ── state ────────────────────────────────────────────────────────────────────

const emptyForm = {
  id: null, customer: "", location: "", fullAddress: "",
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
  activeTab: "route",
  theme: "day",
  themePref: "auto",
  googleMapsKey: "",
  googleMapsReady: false,
  navigatorPref: localStorage.getItem("navigatorPref") || "google",
  mapApiConfigured: false,
  addresses: [],
  allAddresses: [],
  savedRoutes: [],
  addressSearch: "",
  archiveShowAll: false,
  stopSearchText: "",
  addressForm: { ...emptyForm },
  settings: { kmRate: 0.65, driveHourRate: 22, workHourRate: 60 },
  route: {
    scheduledDate: new Date().toISOString().slice(0, 10),
    startLabel: "Casa",
    startAddress: "Via Vittoria 11, 38049, Altopiano della Vigolana, TN",
    startTime: "07:00",
    timingMode: "first_open_minus",
    arrivalLeadMinutes: 10,
    firstArrivalTime: "08:30",
    endSameAsStart: true,
    endLabel: "Casa",
    endAddress: "Via Vittoria 11, 38049, Altopiano della Vigolana, TN",
    firstArrivalRequired: "",
    selectedAddressId: "",
    customCustomer: "", customLocation: "", customAddress: "",
    customDuration: 45,
    customOpenMorning: "08:30", customCloseMorning: "12:30",
    customOpenAfternoon: "14:30", customCloseAfternoon: "18:00",
    stops: [],
    transcript: "",
    lunchBreak: true,
    lunchBreakMinutes: 45
  },
  result: null,
  manualOrderRows: null,
  planning: false,
  stopFilter: "",
  whisperConfigured: false,
  voiceRecording: false,
  _mediaRecorder: null,
  _audioChunks: []
};

// ── theme ────────────────────────────────────────────────────────────────────

function applyTheme() {
  if (state.themePref === "dark") {
    state.theme = "night";
  } else if (state.themePref === "light") {
    state.theme = "day";
  } else {
    const h = new Date().getHours();
    state.theme = (h >= 19 || h < 7) ? "night" : "day";
  }
  document.documentElement.dataset.theme = state.theme;
}

function setActiveTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  render();
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
  state.settings = settings;
  state.navigatorPref = settings.navigatorPref || localStorage.getItem("navigatorPref") || "google";
  state.themePref = settings.themePref || "auto";
  state.route.lunchBreak = settings.lunchBreakEnabled !== false;
  state.route.lunchBreakMinutes = settings.lunchBreakMinutes || 45;
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
      totalDriveMinutes: Number(summary.totalDriveMinutes || 0),
      totalWorkMinutes: Number(summary.totalWorkMinutes || rows.reduce((t, r) => t + Number(r.durationMinutes || 0), 0)),
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

async function loadGoogleMapsScript() {
  if (state.googleMapsReady) return true;
  if (!state.googleMapsKey) return false;
  return new Promise(resolve => {
    if (window.google?.maps) { state.googleMapsReady = true; resolve(true); return; }
    window.__gMapsCb = () => { state.googleMapsReady = true; resolve(true); };
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${state.googleMapsKey}&libraries=places&callback=__gMapsCb`;
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
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
    [a.customer, a.location, a.fullAddress].some(v => (v || "").toLowerCase().includes(q))
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
        [s.customer, s.location, s.fullAddress].some(v => (v || "").toLowerCase().includes(q)))
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
        <button class="btn danger icon-btn" data-remove-stop="${stop.uid}">×</button>
      </div>
      <div class="form-grid three">
        <label class="field">Durata (min)<input type="number" min="5" step="5" value="${escapeHtml(stop.durationMinutes)}" data-stop="${stop.uid}:durationMinutes" /></label>
        <div class="field">${stopHoursHint(stop, state.route.scheduledDate)}</div>
        <div class="field"><span class="badge ${stop.recognized ? "ok" : "warning"}">${stop.recognized ? "Archivio" : "Da confermare"}</span></div>
      </div>
    </article>`;
  }).join("")}</div>`;
}

function renderRoute() {
  const r = state.route;
  const dm = r.timingMode;
  app.innerHTML = `
    <section class="grid">
      <form class="panel" id="route-form">
        <h2>Nuovo percorso</h2>
        <div class="form-grid route-fields">
          <label class="field">Data<input name="scheduledDate" type="date" value="${escapeHtml(r.scheduledDate)}" /></label>
          <label class="field">Orario partenza<input name="startTime" type="time" value="${escapeHtml(r.startTime)}" /></label>
          <label class="field full">Partenza (nome)<input name="startLabel" value="${escapeHtml(r.startLabel)}" autocomplete="off" /></label>
          <label class="field full">Indirizzo partenza<input name="startAddress" value="${escapeHtml(r.startAddress)}" /></label>
          <label class="field full">Regola orario<select name="timingMode">
            <option value="first_open_minus" ${dm === "first_open_minus" ? "selected" : ""}>Prima dell'apertura</option>
            <option value="arrive_at" ${dm === "arrive_at" ? "selected" : ""}>Arrivo a orario fisso</option>
            <option value="depart_at" ${dm === "depart_at" ? "selected" : ""}>Partenza a orario fisso</option>
          </select></label>
          <label class="field">Anticipo (min)<input name="arrivalLeadMinutes" type="number" min="0" max="60" step="5" value="${escapeHtml(r.arrivalLeadMinutes)}" ${dm !== "first_open_minus" ? "disabled" : ""} /></label>
          <label class="field">Arrivo target<input name="firstArrivalTime" type="time" value="${escapeHtml(r.firstArrivalTime)}" ${dm !== "arrive_at" ? "disabled" : ""} /></label>
          <label class="field checkbox-field full">
            <input name="endSameAsStart" type="checkbox" ${r.endSameAsStart ? "checked" : ""} />
            <span>Arrivo finale = partenza</span>
          </label>
          <label class="field">Arrivo (nome)<input name="endLabel" value="${escapeHtml(r.endLabel)}" ${r.endSameAsStart ? "disabled" : ""} /></label>
          <label class="field full">Indirizzo arrivo<input name="endAddress" value="${escapeHtml(r.endAddress)}" ${r.endSameAsStart ? "disabled" : ""} /></label>
        </div>

        <div class="form-grid route-fields" style="margin-top:12px;">
          <label class="field checkbox-field">
            <input name="lunchBreak" type="checkbox" ${r.lunchBreak ? "checked" : ""} id="lunch-break-check" />
            <span>Pausa pranzo</span>
          </label>
          <label class="field">Durata pranzo (min)<input name="lunchBreakMinutes" type="number" min="15" max="120" step="5" value="${escapeHtml(r.lunchBreakMinutes)}" ${!r.lunchBreak ? "disabled" : ""} id="lunch-break-minutes" /></label>
        </div>

        <div class="stop-add-row">
          <div style="position:relative;flex:1;">
            <input id="stop-search" placeholder="Cerca cliente o città…" value="${escapeHtml(state.stopSearchText)}" autocomplete="off" />
            <input type="hidden" name="selectedAddressId" value="${escapeHtml(state.route.selectedAddressId)}" id="selected-address-id" />
            <div id="stop-suggestions" class="stop-suggestions">${renderStopSuggestions()}</div>
          </div>
          <button type="button" class="btn" id="add-saved-stop">+ Archivio</button>
        </div>

        <details class="panel-details">
          <summary>+ Nuova tappa manuale</summary>
          <div class="form-grid route-fields" style="margin-top:8px;">
            <label class="field">Cliente<input name="customCustomer" value="${escapeHtml(r.customCustomer)}" /></label>
            <label class="field">Sede<input name="customLocation" value="${escapeHtml(r.customLocation)}" /></label>
            <label class="field full">Indirizzo completo<input name="customAddress" value="${escapeHtml(r.customAddress)}" /></label>
            <label class="field">Durata (min)<input name="customDuration" type="number" min="5" step="5" value="${escapeHtml(r.customDuration)}" /></label>
            <label class="field"></label>
            <label class="field">Apr. mattina<input name="customOpenMorning" type="time" value="${escapeHtml(r.customOpenMorning)}" /></label>
            <label class="field">Ch. mattina<input name="customCloseMorning" type="time" value="${escapeHtml(r.customCloseMorning)}" /></label>
            <label class="field">Apr. pomeriggio<input name="customOpenAfternoon" type="time" value="${escapeHtml(r.customOpenAfternoon)}" /></label>
            <label class="field">Ch. pomeriggio<input name="customCloseAfternoon" type="time" value="${escapeHtml(r.customCloseAfternoon)}" /></label>
          </div>
          <div class="actions" style="margin-top:8px;">
            <button type="button" class="btn" id="add-custom-stop">+ Salva e aggiungi</button>
          </div>
        </details>

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
            <button type="button" class="btn${state.voiceRecording ? " recording" : ""}" id="listen-command">${state.voiceRecording ? "■ Stop" : "● Avvia"}</button>
            <button type="button" class="btn" id="apply-command">✓ Applica</button>
          </div>
        </details>

        <div class="actions" style="margin-top:12px;">
          <button type="button" class="btn primary" id="plan-route" style="width:100%">${state.planning ? "Calcolo in corso…" : "→ Ottimizza e salva"}</button>
        </div>
      </form>

      <aside class="panel" id="stops-aside">
        <div class="section-head" style="margin-bottom:10px;">
          <h2 style="margin-bottom:0">Tappe (${state.route.stops.length})</h2>
        </div>
        <div class="row" style="gap:8px;margin-bottom:10px;">
          <input id="stop-filter" placeholder="Cerca tappa per nome o città…" value="${escapeHtml(state.stopFilter)}" style="flex:1" />
        </div>
        ${renderStops()}
      </aside>
    </section>`;
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
    return `<tr class="wh-row" data-day="${d}">
      <td class="wh-day">${DAYS_IT[d]}</td>
      <td><label><input type="checkbox" class="wh-closed" ${closed} /> Ch.</label></td>
      <td><label><input type="checkbox" class="wh-cont" ${cont} ${dis} /> Cont.</label></td>
      <td><input type="time" class="wh-om" value="${h.openMorning || ""}" ${dis} /></td>
      <td><input type="time" class="wh-cm" value="${h.closeMorning || ""}" ${dis || (h.continuous ? "disabled" : "")} /></td>
      <td><input type="time" class="wh-oa" value="${h.openAfternoon || ""}" ${dis || (h.continuous ? "disabled" : "")} /></td>
      <td><input type="time" class="wh-ca" value="${h.closeAfternoon || ""}" ${dis} /></td>
    </tr>`;
  }).join("");
  return `<div class="field full">
    <label class="wh-label">Orari settimanali</label>
    <div class="wh-table-wrap">
      <table class="wh-table">
        <thead><tr><th></th><th></th><th></th><th>Apertura</th><th>Ch. matt.</th><th>Apr. pom.</th><th>Chiusura</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
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
        <button class="btn" id="refresh-routes">↻ Aggiorna</button>
      </div>
      <div class="saved-list">
        ${state.savedRoutes.map(route => `
          <article class="card saved-card">
            <p class="stop-title">${escapeHtml(route.name)}</p>
            <div class="stop-meta">${escapeHtml(route.scheduledDate || "Senza data")} · ${escapeHtml(route.startTime || "--:--")} · ${Number(route.totalKm).toFixed(1)} km · ${euro(route.totalCost)}</div>
            <div class="stop-meta">${escapeHtml(route.startLabel || "—")} → ${escapeHtml(route.endLabel || "—")}</div>
            ${route.plannedStops?.length ? `<div class="saved-stops-list">${route.plannedStops.filter((s, i, arr) => !s.stopPart || s.stopPart === "morning" || arr.findIndex(x => x.addressId === s.addressId) === i).map((s, i) => `<span class="saved-stop-chip">${i + 1}. ${escapeHtml(s.customer)}${s.location ? ` <span style="opacity:.6">— ${escapeHtml(s.location)}</span>` : ""}</span>`).join("")}</div>` : ""}
            <div class="actions">
              <button class="btn primary" data-open-route="${route.id}">→ Apri</button>
              <button class="btn" data-rename-route="${route.id}">✎</button>
              <button class="btn danger" data-delete-route="${route.id}">×</button>
            </div>
          </article>`).join("") || `<div class="empty">Nessun giro salvato.</div>`}
      </div>
    </section>`;
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
            <button class="btn" id="import-contacts">📱 Importa</button>
            <button class="btn" id="new-address">+ Nuovo</button>
          </div>
        </div>
        <div class="row" style="gap:8px; margin-bottom:10px;">
          <input id="archive-search" placeholder="Cerca per nome, città, indirizzo…" value="${escapeHtml(state.addressSearch)}" style="flex:1" autocomplete="off" />
          ${showingResults
            ? `<button class="btn" id="hide-all-addresses">× Nascondi</button>`
            : `<button class="btn" id="show-all-addresses">Mostra tutti</button>`}
        </div>
        <input id="vcf-input" type="file" accept=".vcf,.vcard,.csv" style="display:none" />
        <div class="archive-list">
          ${!showingResults
            ? `<div class="empty" style="grid-column:1/-1">Cerca un contatto per nome o città, oppure premi <b>Mostra tutti</b>.</div>`
            : state.addresses.map(a => `
            <article class="card archive-card">
              <p class="stop-title">${a.addressType === "rest" ? "☕ " : ""}${escapeHtml(addressName(a))}</p>
              <div class="stop-meta">${escapeHtml(a.fullAddress)}</div>
              ${a.phone ? `<div class="stop-meta">${phoneIcon(a.phoneType)} ${escapeHtml(a.phone)}${a.phoneName ? ` <span class="phone-name-badge">${escapeHtml(a.phoneName)}</span>` : ""}${a.phonePreferred === "phone" && a.phone2 ? " ★" : ""}</div>` : ""}
              ${a.phone2 ? `<div class="stop-meta">${phoneIcon(a.phone2Type)} ${escapeHtml(a.phone2)}${a.phone2Name ? ` <span class="phone-name-badge">${escapeHtml(a.phone2Name)}</span>` : ""}${a.phonePreferred === "phone2" ? " ★" : ""}</div>` : ""}
              ${a.email ? `<div class="stop-meta">✉ ${escapeHtml(a.email)}</div>` : ""}
              <div class="stop-meta">${weeklyHoursSummary(a)}</div>
              <div class="actions">
                ${a.phone ? `<a class="btn" href="tel:${escapeHtml(a.phone)}" title="${escapeHtml(a.phoneName || a.phone)}">${phoneIcon(a.phoneType)}</a>` : ""}
                ${a.phone2 ? `<a class="btn" href="tel:${escapeHtml(a.phone2)}" title="${escapeHtml(a.phone2Name || a.phone2)}">${phoneIcon(a.phone2Type)}</a>` : ""}
                ${a.email ? `<a class="btn" href="mailto:${escapeHtml(a.email)}">✉</a>` : ""}
                <button class="btn" data-edit-address="${a.id}">Modifica</button>
                <button class="btn danger" data-delete-address="${a.id}">×</button>
              </div>
            </article>`).join("") || `<div class="empty" style="grid-column:1/-1">Nessun contatto trovato.</div>`}
        </div>
      </div>

      <form class="panel" id="address-form">
        <h2>${form.id ? "Modifica contatto" : "Nuovo contatto"}</h2>
        <div class="form-grid">
          <label class="field">Cliente / nome<input name="customer" value="${escapeHtml(form.customer)}" required /></label>
          <label class="field">Sede<input name="location" value="${escapeHtml(form.location)}" /></label>
          <label class="field full">Indirizzo completo<input name="fullAddress" value="${escapeHtml(form.fullAddress)}" required /></label>
          <div class="field full phone-group">
            <div class="phone-label-row">
              <span class="phone-label">Telefono 1</span>
            </div>
            <div class="phone-row">
              <label class="phone-pref-label phone-pref-inline"><input type="radio" name="phonePreferred" value="phone" ${form.phonePreferred !== "phone2" ? "checked" : ""} /> Preferito</label>
              <select name="phoneType" class="phone-type-select">
                <option value="cell" ${form.phoneType === "cell" ? "selected" : ""}>📱 Cell</option>
                <option value="fisso" ${form.phoneType === "fisso" ? "selected" : ""}>☎ Fisso</option>
                <option value="altro" ${form.phoneType === "altro" ? "selected" : ""}>Altro</option>
              </select>
              <input name="phone" type="tel" value="${escapeHtml(form.phone)}" placeholder="Numero" style="flex:1" />
              <input name="phoneName" value="${escapeHtml(form.phoneName)}" placeholder="Nome (es. Mario)" style="flex:1" />
            </div>
          </div>
          <div class="field full phone-group">
            <div class="phone-label-row">
              <span class="phone-label">Telefono 2</span>
            </div>
            <div class="phone-row">
              <label class="phone-pref-label phone-pref-inline"><input type="radio" name="phonePreferred" value="phone2" ${form.phonePreferred === "phone2" ? "checked" : ""} /> Preferito</label>
              <select name="phone2Type" class="phone-type-select">
                <option value="cell" ${form.phone2Type === "cell" ? "selected" : ""}>📱 Cell</option>
                <option value="fisso" ${form.phone2Type === "fisso" ? "selected" : ""}>☎ Fisso</option>
                <option value="altro" ${form.phone2Type === "altro" ? "selected" : ""}>Altro</option>
              </select>
              <input name="phone2" type="tel" value="${escapeHtml(form.phone2)}" placeholder="Numero" style="flex:1" />
              <input name="phone2Name" value="${escapeHtml(form.phone2Name)}" placeholder="Nome (es. Ufficio)" style="flex:1" />
            </div>
          </div>
          <label class="field">Tipo contatto<select name="addressType">
            <option value="customer" ${form.addressType !== "rest" ? "selected" : ""}>👤 Cliente</option>
            <option value="rest" ${form.addressType === "rest" ? "selected" : ""}>☕ Sosta (bar/autogrill)</option>
          </select></label>
          <label class="field">Email<input name="email" type="email" value="${escapeHtml(form.email)}" /></label>
          <label class="field full">Note<textarea name="notes" id="contact-notes">${escapeHtml(form.notes)}</textarea></label>
          ${renderWeeklyHoursSection(form.weeklyHours)}
          <label class="field">Durata abituale (min)<input name="defaultDuration" type="number" min="5" step="5" value="${escapeHtml(form.defaultDuration)}" /></label>
          <div class="field full">
            <label>Coordinate GPS</label>
            <div class="coord-actions">
              <button type="button" class="btn" id="use-current-pos">📍 Posizione attuale</button>
              ${state.googleMapsKey ? `<button type="button" class="btn" id="open-map-picker">🗺 Scegli sulla mappa</button>` : ""}
            </div>
            <div class="form-grid" style="margin-top:8px;">
              <label class="field">Latitudine<input name="lat" id="coord-lat" type="number" step="0.000001" value="${escapeHtml(form.lat ?? "")}" /></label>
              <label class="field">Longitudine<input name="lng" id="coord-lng" type="number" step="0.000001" value="${escapeHtml(form.lng ?? "")}" /></label>
            </div>
          </div>
        </div>
        <div class="actions">
          <button class="btn primary" type="submit">Salva</button>
          <button class="btn ghost" type="button" id="cancel-address">Annulla</button>
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
    parts.push(`<div class="stop-detail-section"><span class="st-label">Meteo</span> <span class="stop-weather-full">${weatherIcon(w)} <strong>${temp}</strong> ${escapeHtml(w.description || "")}${humidity}${wind}${alerts ? " " + alerts : ""}</span></div>`);
  }

  // Full weekly hours — 3 cols: day | am | pm
  const wh = addr?.weeklyHours || row.weeklyHours;
  if (wh) {
    const scheduledDow = result.scheduledDate ? new Date(result.scheduledDate + "T12:00:00").getDay() : -1;
    const dayRows = [1,2,3,4,5,6,0].map(d => {
      const h = wh[d] || wh[String(d)] || { closed: true };
      const isToday = d === scheduledDow;
      const tr = isToday ? `<tr class="wh-today">` : `<tr>`;
      if (h.closed) return `${tr}<td class="wh-day">${DAYS_IT[d]}</td><td class="wh-hours wh-muted" colspan="2">Chiuso</td></tr>`;
      if (h.continuous) return `${tr}<td class="wh-day">${DAYS_IT[d]}</td><td class="wh-hours" colspan="2">${h.openMorning}–${h.closeAfternoon}</td></tr>`;
      const am = (h.openMorning && h.closeMorning) ? `${h.openMorning}–${h.closeMorning}` : "—";
      const pm = (h.openAfternoon && h.closeAfternoon) ? `${h.openAfternoon}–${h.closeAfternoon}` : "";
      return `${tr}<td class="wh-day">${DAYS_IT[d]}</td><td class="wh-hours">${am}</td><td class="wh-hours wh-muted">${pm}</td></tr>`;
    }).join("");
    parts.push(`<div class="stop-detail-section"><span class="st-label">Orari settimanali</span><table class="wh-inline"><colgroup><col class="wh-col-day"><col class="wh-col-am"><col class="wh-col-pm"></colgroup><tbody>${dayRows}</tbody></table></div>`);
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
  const rows = (state.manualOrderRows || result.rows).filter(r => !r.type);
  return `
    <details class="panel order-panel" ${state.manualOrderRows ? "open" : ""}>
      <summary>Riordina tappe manualmente</summary>
      <div class="order-list" style="margin-top:10px;">
        ${rows.filter(r => !r.stopPart || r.stopPart === "morning").map((row, i) => `
          <div class="order-item">
            <span class="order-num">${i + 1}</span>
            <span>${escapeHtml(row.customer)} ${escapeHtml(row.location || "")}</span>
            <div class="row">
              ${i > 0 ? `<button class="btn" data-move-up="${i}">↑</button>` : ""}
              ${i < rows.length - 1 ? `<button class="btn" data-move-down="${i}">↓</button>` : ""}
            </div>
          </div>`).join("")}
      </div>
      <div class="actions">
        <button class="btn primary" id="replan-order">✓ Ricalcola con quest'ordine</button>
        <button class="btn" id="reset-order">↻ Ottimizzato</button>
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
            <h2 style="margin:0;">${escapeHtml(result.name || ("Percorso — " + (result.scheduledDate || "")))}</h2>
            ${result.id ? `<button class="btn" style="padding:2px 8px;font-size:0.85rem;" data-rename-current-route="${result.id}">✎</button>` : ""}
          </div>
          <div class="stop-meta">${escapeHtml(summary.dayStart)} → ${escapeHtml(summary.dayEnd)} · ${summary.totalKm.toFixed(1)} km · ${euro(summary.totalCost)}</div>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap;">
          <button class="btn" data-tab-jump="saved">▣ Giri</button>
          <button class="btn${result.rows?.some(r => r.type === "lunch") ? " primary" : ""}" id="toggle-lunch-break" title="${result.rows?.some(r => r.type === "lunch") ? "Rimuovi pausa pranzo" : "Aggiungi pausa pranzo"}">🍽 ${result.rows?.some(r => r.type === "lunch") ? "Togli pranzo" : "Aggiungi pranzo"}</button>
        </div>
      </div>

      ${state.googleMapsKey ? `<div id="route-map" style="height:280px;border-radius:8px;border:1px solid var(--line);margin-bottom:14px;"></div>` : ""}

      <div class="nav-panel">
        <a class="btn primary" href="${navUrl(result, pref)}" target="_blank" rel="noopener">↗ Apri percorso completo</a>
      </div>

      ${renderManualOrder(result)}

      <div class="result-list">
        ${rows.map(row => {
          // Special row: lunch break
          if (row.type === "lunch") return `
          <article class="card result-card break-card lunch-card">
            <div class="break-row">
              <span class="break-icon">🍽</span>
              <div>
                <p class="stop-title" style="margin:0">Pausa pranzo</p>
                <div class="stop-meta">${escapeHtml(row.serviceStartTime)} – ${escapeHtml(row.serviceEndTime)} · ${minutesLabel(row.durationMinutes)}</div>
              </div>
            </div>
          </article>`;

          // Special row: rest stop
          if (row.type === "rest") {
            const restNavUrl = row.lat && row.lng
              ? (state.navigatorPref === "apple"
                  ? `http://maps.apple.com/?ll=${row.lat},${row.lng}&q=${encodeURIComponent(row.customer)}`
                  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(row.customer)}&query_place_id=&center=${row.lat},${row.lng}`)
              : stopNavUrl(row, state.navigatorPref);
            return `
          <article class="card result-card break-card rest-card">
            <div class="break-row">
              <span class="break-icon">☕</span>
              <div style="flex:1;min-width:0">
                <p class="stop-title" style="margin:0">${escapeHtml(row.customer)}${row.location ? ` — ${escapeHtml(row.location)}` : ""}</p>
                <div class="stop-meta">${escapeHtml(row.serviceStartTime)} – ${escapeHtml(row.serviceEndTime)} · ${minutesLabel(row.durationMinutes)}</div>
                ${row.address ? `<div class="stop-meta" style="font-size:0.8rem">${escapeHtml(row.address)}</div>` : ""}
              </div>
            </div>
            <div style="display:flex;gap:8px;margin-top:8px;">
              <a class="btn primary" href="${restNavUrl}" target="_blank" rel="noopener" style="flex:1;text-align:center">↗ Naviga</a>
              ${row.lat && row.lng ? `<a class="btn" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(row.customer + " " + (row.location || ""))}&center=${row.lat},${row.lng}" target="_blank" rel="noopener" title="Vedi su Google Maps">🔍 Maps</a>` : ""}
            </div>
          </article>`;
          }

          const addr = state.allAddresses.find(a => String(a.id) === String(row.addressId));
          const pref = preferredPhone(addr || {});
          const phone = addr?.phone || row.phone || "";
          const phone2 = addr?.phone2 || row.phone2 || "";
          const email = addr?.email || row.email || "";
          const emailSubject = encodeURIComponent(`Appuntamento ${row.customer} - ${result.scheduledDate || ""} ore ${row.arrivalTime}`);
          const partBadge = row.stopPart === "morning" ? `<span class="badge" style="background:color-mix(in srgb,#3b82f6 15%,var(--surface));color:#1d4ed8">mattina</span> ` : row.stopPart === "afternoon" ? `<span class="badge" style="background:color-mix(in srgb,#f97316 15%,var(--surface));color:#c2410c">pomeriggio</span> ` : "";
          const stopTitle = `${row.stopNumber}. ${escapeHtml(row.customer)}${row.location ? ` — ${escapeHtml(row.location)}` : ""}`;
          const phoneBtn = pref ? `<a class="btn" href="tel:${escapeHtml(pref.number)}" title="${escapeHtml(pref.name || pref.number)}">${phoneIcon(pref.type)}</a>` : "";
          const warnLevel = worstWarningLevel(row.warnings);
          const cardClass = warnLevel === "error" ? " card-error" : warnLevel === "warn" ? " card-warn" : "";
          const errorBadge = warnLevel === "error"
            ? `<span class="badge badge-error" style="margin-top:3px;display:inline-block">${escapeHtml(row.warnings.find(w => (w.level||"") === "error" || /(chiusa|dopo|oltre)/.test(w.msg||w))?.msg || "⚠")}</span>`
            : warnLevel === "warn"
            ? `<span class="badge badge-warn" style="margin-top:3px;display:inline-block">${escapeHtml(row.warnings.find(w => (w.level||"") === "warn")?.msg || "⚠")}</span>`
            : "";
          return `
          <article class="card result-card${cardClass}">
            <div class="stop-compact-head" data-expand-stop="${row.stopNumber}${row.stopPart ? "-" + row.stopPart : ""}">
              <div class="stop-compact-title">${partBadge}<span class="stop-title">${stopTitle}</span></div>
              ${errorBadge}
              <div class="stop-meta stop-compact-addr">${escapeHtml(row.address)}</div>
              ${weatherCompact(result, row.stopNumber)}
            </div>
            <div class="stop-actions-big">
              ${row.stopPart !== "afternoon" ? `<a class="btn primary" href="${stopNavUrl(row, state.navigatorPref)}" target="_blank" rel="noopener">↗ Naviga</a>` : ""}
              ${phoneBtn}
              ${email && !row.stopPart ? `<a class="btn" href="mailto:${escapeHtml(email)}?subject=${emailSubject}">✉</a>` : ""}
            </div>
            <div class="stop-details" data-stop-details="${row.stopNumber}${row.stopPart ? "-" + row.stopPart : ""}" hidden>
              <div class="stop-times-row">
                ${row.stopPart !== "afternoon" ? `<span><span class="st-label">Partenza</span> <strong>${escapeHtml(row.departureTime)}</strong></span>` : ""}
                ${row.stopPart !== "afternoon" ? `<span><span class="st-label">Guida</span> <strong>${minutesLabel(row.driveMinutes)} · ${row.km.toFixed(1)} km</strong></span>` : ""}
                <span><span class="st-label">${row.stopPart === "afternoon" ? "Riprende" : "Arrivo"}</span> <strong>${escapeHtml(row.stopPart === "afternoon" ? row.serviceStartTime : row.arrivalTime)}</strong></span>
                <span><span class="st-label">Interv.</span> <strong>${minutesLabel(row.durationMinutes)}</strong></span>
                <span><span class="st-label">Fine</span> <strong>${escapeHtml(row.serviceEndTime)}</strong></span>
              </div>
              ${phone && !row.stopPart ? `<div class="stop-contact-row">${phoneIcon(addr?.phoneType)} <a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a>${addr?.phoneName ? ` <span class="phone-name-badge">${escapeHtml(addr.phoneName)}</span>` : ""}${addr?.phonePreferred !== "phone2" && phone2 ? " ★" : ""}</div>` : ""}
              ${phone2 && !row.stopPart ? `<div class="stop-contact-row">${phoneIcon(addr?.phone2Type)} <a href="tel:${escapeHtml(phone2)}">${escapeHtml(phone2)}</a>${addr?.phone2Name ? ` <span class="phone-name-badge">${escapeHtml(addr.phone2Name)}</span>` : ""}${addr?.phonePreferred === "phone2" ? " ★" : ""}</div>` : ""}
              ${email && !row.stopPart ? `<div class="stop-contact-row">✉ <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></div>` : ""}
              ${row.notes && !row.stopPart ? `<div class="stop-meta stop-notes">${escapeHtml(row.notes)}</div>` : ""}
              ${warningBadges(row.warnings)}
              ${!row.stopPart ? stopDetailExtra(result, row, addr) : ""}
            </div>
          </article>`;
        }).join("")}

        <article class="card result-card">
          <p class="stop-title">↩ ${escapeHtml(result.end?.label || "Arrivo finale")}</p>
          <div class="stop-meta">${escapeHtml(result.end?.address || result.end?.fullAddress || "")}</div>
          <div class="stop-times-row" style="border:none;margin:0;padding-top:4px;">
            <span><span class="st-label">Partenza</span> <strong>${escapeHtml(finalLeg.departureTime)}</strong></span>
            <span><span class="st-label">Guida</span> <strong>${minutesLabel(finalLeg.driveMinutes)} · ${finalLeg.km.toFixed(1)} km</strong></span>
            <span><span class="st-label">Arrivo</span> <strong>${escapeHtml(finalLeg.arrivalTime)}</strong></span>
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

// ── render: settings tab ──────────────────────────────────────────────────────

function renderSettings() {
  const nav = state.navigatorPref;
  const theme = state.themePref;
  app.innerHTML = `
    <section class="panel">
      <h2>Impostazioni</h2>
      <form id="settings-form">
        <h3 class="settings-section-title">Tariffe</h3>
        <div class="form-grid">
          <label class="field">€ per km<input name="kmRate" type="number" min="0" step="0.01" value="${escapeHtml(state.settings.kmRate)}" /></label>
          <label class="field">€/ora guida<input name="driveHourRate" type="number" min="0" step="0.01" value="${escapeHtml(state.settings.driveHourRate)}" /></label>
          <label class="field full">€/ora lavoro<input name="workHourRate" type="number" min="0" step="0.01" value="${escapeHtml(state.settings.workHourRate)}" /></label>
        </div>

        <h3 class="settings-section-title">Navigatore</h3>
        <div class="settings-radio-group">
          <label class="settings-radio"><input type="radio" name="navigatorPref" value="google" ${nav === "google" ? "checked" : ""} /> Google Maps</label>
          <label class="settings-radio"><input type="radio" name="navigatorPref" value="apple" ${nav === "apple" ? "checked" : ""} /> Apple Mappe</label>
          <label class="settings-radio"><input type="radio" name="navigatorPref" value="waze" ${nav === "waze" ? "checked" : ""} /> Waze</label>
        </div>

        <h3 class="settings-section-title">Tema</h3>
        <div class="settings-radio-group">
          <label class="settings-radio"><input type="radio" name="themePref" value="auto" ${theme === "auto" ? "checked" : ""} /> 🔄 Automatico (segue l'orario)</label>
          <label class="settings-radio"><input type="radio" name="themePref" value="light" ${theme === "light" ? "checked" : ""} /> ☀️ Chiaro</label>
          <label class="settings-radio"><input type="radio" name="themePref" value="dark" ${theme === "dark" ? "checked" : ""} /> 🌙 Scuro</label>
        </div>

        <h3 class="settings-section-title">Pianificazione</h3>
        <div class="form-grid">
          <label class="field checkbox-field full">
            <input type="checkbox" name="lunchBreakEnabled" ${state.settings.lunchBreakEnabled !== false ? "checked" : ""} />
            <span>Pausa pranzo di default</span>
          </label>
          <label class="field">Durata pranzo (min)<input name="lunchBreakMinutes" type="number" min="15" max="120" step="5" value="${escapeHtml(state.settings.lunchBreakMinutes || 45)}" /></label>
        </div>
        <p class="stop-meta" style="margin-top:6px;">Puoi sempre modificarla o saltarla al momento della pianificazione. Le soste automatiche si inseriscono aggiungendo contatti di tipo "☕ Sosta" nell'archivio.</p>

        <div class="actions" style="margin-top:16px;"><button class="btn primary" type="submit">Salva impostazioni</button></div>
      </form>
    </section>`;
}

// ── render dispatch ───────────────────────────────────────────────────────────

function render() {
  if (state.activeTab === "route") renderRoute();
  else if (state.activeTab === "saved") renderSaved();
  else if (state.activeTab === "archive") renderArchive();
  else if (state.activeTab === "result") renderResult();
  else if (state.activeTab === "settings") renderSettings();
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
    customOpenMorning: v.customOpenMorning, customCloseMorning: v.customCloseMorning,
    customOpenAfternoon: v.customOpenAfternoon, customCloseAfternoon: v.customCloseAfternoon,
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
  render();
  try {
    const r = state.route;
    state.result = await api("/api/plan", {
      method: "POST",
      body: JSON.stringify({
        name: r.name || "Percorso giornaliero",
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
    await refreshSavedRoutes();
    setActiveTab("result");
    showToast("Percorso calcolato e salvato");
  } catch (e) {
    showToast(e.message);
  } finally {
    state.planning = false;
    if (state.activeTab === "route") render();
  }
}

// ── voice ─────────────────────────────────────────────────────────────────────

function updateVoiceButton() {
  const btn = document.querySelector("#listen-command");
  if (!btn) return;
  if (state.voiceRecording) {
    btn.textContent = "■ Stop";
    btn.classList.add("recording");
  } else {
    btn.textContent = "● Avvia";
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
          if (state.whisperConfigured) {
            showToast("Elaboro il comando…");
            await applyVoiceCommand();
          } else {
            showToast("Testo acquisito — premi Applica");
          }
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

async function importFromContactPicker() {
  if (!("contacts" in navigator && navigator.contacts?.select)) {
    document.querySelector("#vcf-input")?.click();
    return;
  }
  try {
    const contacts = await navigator.contacts.select(["name", "address", "tel", "email"], { multiple: true });
    if (!contacts.length) { showToast("Nessun contatto selezionato"); return; }
    let added = 0;
    for (const c of contacts) {
      const name = c.name?.[0] || "";
      if (!name) continue;
      const existing = state.addresses.find(a => a.customer.toLowerCase() === name.toLowerCase());
      if (existing) continue;
      const addrObj = c.address?.[0];
      const fullAddress = addrObj
        ? [addrObj.streetAddress, addrObj.city, addrObj.postalCode].filter(Boolean).join(", ")
        : "";
      const phone = c.tel?.[0]?.value || c.tel?.[0] || "";
      const email = c.email?.[0] || "";
      await api("/api/addresses", {
        method: "POST",
        body: JSON.stringify({ customer: name, fullAddress: fullAddress || name, phone: String(phone), email: String(email) })
      });
      added++;
    }
    await refreshAllData();
    render();
    showToast(added ? `${added} contatti importati` : "Nessun nuovo contatto da aggiungere");
  } catch (e) {
    showToast("Importazione non riuscita");
  }
}

function parseVcf(text) {
  return text.split(/BEGIN:VCARD/gi).slice(1).flatMap(vcard => {
    const lines = vcard.split(/\r?\n/);
    let name = "", phone = "", email = "", street = "", city = "", zip = "";
    for (const line of lines) {
      const [key, ...rest] = line.split(":");
      const val = rest.join(":").trim();
      const k = key.split(";")[0].toUpperCase();
      if (k === "FN" && !name) name = val;
      else if ((k === "TEL" || k.startsWith("TEL;")) && !phone) phone = val;
      else if ((k === "EMAIL" || k.startsWith("EMAIL;")) && !email) email = val;
      else if (k === "ADR" || k.startsWith("ADR;")) {
        const parts = val.split(";");
        street = parts[2] || ""; city = parts[3] || ""; zip = parts[5] || "";
      }
    }
    if (!name) return [];
    const fullAddress = [street, zip, city].filter(Boolean).join(", ");
    return [{ customer: name, fullAddress: fullAddress || name, phone, email }];
  });
}

async function importFromVcf(file) {
  const text = await file.text();
  const contacts = file.name.endsWith(".csv") ? parseCsv(text) : parseVcf(text);
  if (!contacts.length) { showToast("Nessun contatto trovato nel file"); return; }
  let added = 0;
  for (const c of contacts) {
    if (!c.customer) continue;
    const exists = state.addresses.find(a => a.customer.toLowerCase() === c.customer.toLowerCase());
    if (exists) continue;
    await api("/api/addresses", { method: "POST", body: JSON.stringify(c) });
    added++;
  }
  await refreshAllData();
  render();
  showToast(`${added} contatti importati da file`);
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").toLowerCase().trim());
  return lines.slice(1).flatMap(line => {
    const vals = line.split(",").map(v => v.replace(/^"|"$/g, "").trim());
    const row = Object.fromEntries(headers.map((h, i) => [h, vals[i] || ""]));
    const customer = row.name || row.nome || row.customer || row.cliente || "";
    if (!customer) return [];
    return [{
      customer,
      location: row.sede || row.location || "",
      fullAddress: row.address || row.indirizzo || row.full_address || customer,
      phone: row.phone || row.tel || row.telefono || "",
      email: row.email || ""
    }];
  });
}

// ── save address form ─────────────────────────────────────────────────────────

async function saveAddressForm(form) {
  const v = readForm(form);
  const payload = {
    customer: v.customer, location: v.location, fullAddress: v.fullAddress,
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
  state.addressForm = { ...emptyForm };
  await refreshAllData();
  render();
  showToast("Contatto salvato");
}

// ── manual order replan ───────────────────────────────────────────────────────

async function replanWithOrder(manualOrder) {
  const result = normalizeSavedRoute(state.result);
  const rows = manualOrder ? (state.manualOrderRows || result.rows) : result.rows;
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
          fullAddress: row.address, notes: row.notes,
          openMorning: row.openMorning, closeMorning: row.closeMorning,
          openAfternoon: row.openAfternoon, closeAfternoon: row.closeAfternoon,
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


function openMapPicker() {
  const latEl = document.querySelector("#coord-lat");
  const lngEl = document.querySelector("#coord-lng");
  const startLat = Number(latEl?.value) || 46.07;
  const startLng = Number(lngEl?.value) || 11.12;
  let pickedLat = startLat, pickedLng = startLng;
  let pickedPlace = null; // full place data when selected via search

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
        const addr = st === "OK" && res[0] ? res[0].formatted_address : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        updateMarker(lat, lng, addr);
        pickedPlace = null; // tapped manually — no structured place data
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
          const whContainer = document.querySelector("#address-form .wh-table-wrap");
          if (whContainer) {
            const tempDiv = document.createElement("div");
            tempDiv.innerHTML = renderWeeklyHoursSection(byDay);
            const newTable = tempDiv.querySelector(".wh-table-wrap");
            if (newTable) whContainer.replaceWith(newTable);
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

// ── events ────────────────────────────────────────────────────────────────────

function bindEvents() {
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
    // archive search
    if (e.target.id === "archive-search") {
      state.addressSearch = e.target.value;
      state.archiveShowAll = Boolean(e.target.value);
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
    // accordion expand/collapse for result stop cards
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

    if (e.target.closest("#toggle-lunch-break")) {
      if (!state.result) return;
      const hasLunch = state.result.rows?.some(r => r.type === "lunch");
      // Toggle lunch break by replanning with inverted setting
      const result = normalizeSavedRoute(state.result);
      const customerRows = result.rows.filter(r => !r.type);
      state.planning = true;
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
              fullAddress: row.address, notes: row.notes,
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
      const saved = await api("/api/addresses", {
        method: "POST",
        body: JSON.stringify({
          customer: state.route.customCustomer, location: state.route.customLocation,
          fullAddress: state.route.customAddress,
          openMorning: state.route.customOpenMorning, closeMorning: state.route.customCloseMorning,
          openAfternoon: state.route.customOpenAfternoon, closeAfternoon: state.route.customCloseAfternoon,
          defaultDuration: state.route.customDuration
        })
      }).catch(() => null);
      await refreshAllData();
      state.route.stops.push({
        uid: crypto.randomUUID(),
        addressId: saved?.id, customer: state.route.customCustomer, location: state.route.customLocation,
        fullAddress: state.route.customAddress, durationMinutes: state.route.customDuration,
        openMorning: state.route.customOpenMorning, closeMorning: state.route.customCloseMorning,
        openAfternoon: state.route.customOpenAfternoon, closeAfternoon: state.route.customCloseAfternoon,
        recognized: true
      });
      Object.assign(state.route, { customCustomer: "", customLocation: "", customAddress: "", customDuration: 45 });
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

    if (e.target.closest("#new-address") || e.target.closest("#cancel-address")) {
      state.addressForm = { ...emptyForm };
      render();
      return;
    }

    if (e.target.closest("#use-current-pos")) { useCurrentPosition(); return; }
    if (e.target.closest("#open-map-picker")) { openMapPicker(); return; }

    // Weekly hours: toggle disabled state
    if (e.target.classList.contains("wh-closed") || e.target.classList.contains("wh-cont")) {
      const row = e.target.closest(".wh-row");
      if (row) {
        const closed = row.querySelector(".wh-closed")?.checked;
        const cont = row.querySelector(".wh-cont")?.checked;
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

    // manual order controls
    const moveUp = e.target.closest("[data-move-up]");
    if (moveUp) {
      const i = Number(moveUp.dataset.moveUp);
      const result = normalizeSavedRoute(state.result);
      const rows = state.manualOrderRows ? [...state.manualOrderRows] : [...result.rows];
      [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]];
      state.manualOrderRows = rows;
      render();
      return;
    }

    const moveDown = e.target.closest("[data-move-down]");
    if (moveDown) {
      const i = Number(moveDown.dataset.moveDown);
      const result = normalizeSavedRoute(state.result);
      const rows = state.manualOrderRows ? [...state.manualOrderRows] : [...result.rows];
      [rows[i], rows[i + 1]] = [rows[i + 1], rows[i]];
      state.manualOrderRows = rows;
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
  });

  app.addEventListener("submit", async e => {
    e.preventDefault();
    if (e.target.id === "address-form") {
      try { await saveAddressForm(e.target); } catch (err) { showToast(err.message); }
    }
    if (e.target.id === "settings-form") {
      const v = readForm(e.target);
      state.settings = await api("/api/settings", { method: "PUT", body: JSON.stringify({
        kmRate: Number(v.kmRate), driveHourRate: Number(v.driveHourRate), workHourRate: Number(v.workHourRate),
        navigatorPref: v.navigatorPref || "google", themePref: v.themePref || "auto",
        lunchBreakMinutes: Number(v.lunchBreakMinutes || 45),
        lunchBreakEnabled: v.lunchBreakEnabled === "on" || v.lunchBreakEnabled === true
      }) });
      state.navigatorPref = state.settings.navigatorPref;
      localStorage.setItem("navigatorPref", state.navigatorPref);
      state.themePref = state.settings.themePref;
      state.route.lunchBreak = state.settings.lunchBreakEnabled !== false;
      state.route.lunchBreakMinutes = state.settings.lunchBreakMinutes || 45;
      applyTheme();
      showToast("Impostazioni salvate");
    }
  });
}

// ── init ──────────────────────────────────────────────────────────────────────

applyTheme();
setInterval(applyTheme, 60_000);
bindEvents();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/service-worker.js").catch(() => {}));
}

loadInitialData().then(render).catch(err => {
  app.innerHTML = `<section class="panel"><h2>Errore avvio</h2><div class="empty">${escapeHtml(err.message)}</div></section>`;
});
