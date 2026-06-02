const api = async (path, options = {}) => {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Errore richiesta");
  return payload;
};

const emptyAddressForm = {
  id: null,
  customer: "",
  location: "",
  fullAddress: "",
  notes: "",
  openMorning: "08:30",
  closeMorning: "12:30",
  openAfternoon: "14:30",
  closeAfternoon: "18:00",
  defaultDuration: 45,
  lat: "",
  lng: ""
};

const state = {
  activeTab: "route",
  theme: "day",
  mapApiConfigured: false,
  addresses: [],
  savedRoutes: [],
  addressSearch: "",
  addressForm: { ...emptyAddressForm },
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
    customCustomer: "",
    customLocation: "",
    customAddress: "",
    customDuration: 45,
    customOpenMorning: "08:30",
    customCloseMorning: "12:30",
    customOpenAfternoon: "14:30",
    customCloseAfternoon: "18:00",
    stops: [],
    transcript: ""
  },
  result: null,
  planning: false
};

const app = document.querySelector("#app");
const toast = document.querySelector("#toast");

function euro(value) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(value || 0));
}

function minutesLabel(minutes) {
  const value = Number(minutes || 0);
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  if (!hours) return `${mins} min`;
  if (!mins) return `${hours} h`;
  return `${hours} h ${mins} min`;
}

function addressName(address) {
  return `${address.customer || ""}${address.location ? ` - ${address.location}` : ""}`.trim();
}

function optionLabel(address) {
  return `${addressName(address)} | ${address.fullAddress}`;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2800);
}

function normalizeList(payload, keys = []) {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function normalizeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeRouteResult(result) {
  const rows = normalizeList(result?.rows);
  const weather = normalizeList(result?.weather);
  const lastRow = rows[rows.length - 1] || {};
  const finalLeg = result?.finalLeg || {
    departureTime: lastRow.serviceEndTime || "",
    driveMinutes: 0,
    km: 0,
    arrivalTime: lastRow.serviceEndTime || ""
  };
  const summary = {
    totalKm: 0,
    totalDriveMinutes: 0,
    totalWorkMinutes: 0,
    dayStart: "",
    dayEnd: "",
    costKm: 0,
    costDrive: 0,
    costWork: 0,
    totalCost: 0,
    warnings: [],
    ...(result?.summary || {})
  };

  return {
    ...(result || {}),
    rows,
    weather,
    finalLeg,
    summary,
    end: result?.end || {}
  };
}

function icon(value) {
  return `<span class="btn-icon" aria-hidden="true">${value}</span>`;
}

function applyTheme() {
  const hour = new Date().getHours();
  state.theme = hour >= 19 || hour < 7 ? "night" : "day";
  document.documentElement.dataset.theme = state.theme;
}

function setActiveTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll(".tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  render();
}

async function refreshAddresses() {
  try {
    const payload = await api(`/api/addresses?search=${encodeURIComponent(state.addressSearch)}`);
    state.addresses = normalizeList(payload, ["addresses"]);
  } catch (error) {
    console.warn("Archivio indirizzi non caricato", error);
    state.addresses = [];
  }
}

async function refreshSavedRoutes() {
  try {
    const payload = await api("/api/routes");
    state.savedRoutes = normalizeList(payload, ["routes"]);
  } catch (error) {
    console.warn("Giri salvati non caricati", error);
    state.savedRoutes = [];
  }
}

async function loadInitialData() {
  const [health, settings] = await Promise.all([
    api("/api/health"),
    api("/api/settings")
  ]);
  state.mapApiConfigured = health.mapApiConfigured;
  state.settings = settings;
  document.querySelector("#map-status").textContent = health.mapApiConfigured
    ? "Mappe API"
    : "Stima locale";
  await Promise.all([refreshAddresses(), refreshSavedRoutes()]);
}

function renderAddressOptions() {
  return normalizeList(state.addresses)
    .map((address) => `<option value="${address.id}">${escapeHtml(optionLabel(address))}</option>`)
    .join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function readForm(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function addressToStop(address, duration = null) {
  return {
    uid: crypto.randomUUID(),
    addressId: address.id,
    customer: address.customer,
    location: address.location,
    fullAddress: address.fullAddress,
    notes: address.notes,
    openMorning: address.openMorning,
    closeMorning: address.closeMorning,
    openAfternoon: address.openAfternoon,
    closeAfternoon: address.closeAfternoon,
    durationMinutes: Number(duration || address.defaultDuration || 45),
    lat: address.lat,
    lng: address.lng,
    recognized: true
  };
}

function addStop(stop) {
  state.route.stops.push({ ...stop, uid: stop.uid || crypto.randomUUID() });
}

function updateRouteFromForm() {
  const form = document.querySelector("#route-form");
  if (!form) return;
  const values = readForm(form);
  Object.assign(state.route, {
    startLabel: values.startLabel,
    scheduledDate: values.scheduledDate,
    startAddress: values.startAddress,
    startTime: values.startTime,
    timingMode: values.timingMode,
    arrivalLeadMinutes: Number(values.arrivalLeadMinutes || 10),
    firstArrivalTime: values.firstArrivalTime,
    endSameAsStart: Boolean(values.endSameAsStart),
    endLabel: values.endLabel,
    endAddress: values.endAddress,
    firstArrivalRequired: values.firstArrivalRequired,
    selectedAddressId: values.selectedAddressId,
    customCustomer: values.customCustomer,
    customLocation: values.customLocation,
    customAddress: values.customAddress,
    customDuration: Number(values.customDuration || 45),
    customOpenMorning: values.customOpenMorning,
    customCloseMorning: values.customCloseMorning,
    customOpenAfternoon: values.customOpenAfternoon,
    customCloseAfternoon: values.customCloseAfternoon,
    transcript: values.transcript || ""
  });
}

function renderRoute() {
  const route = state.route;
  app.innerHTML = `
    <section class="grid">
      <form class="panel" id="route-form">
        <div class="route-strip" aria-hidden="true">
          <span class="route-dot active"></span>
          <span class="route-dot active"></span>
          <span class="route-dot"></span>
          <span class="route-dot"></span>
          <span class="route-dot"></span>
        </div>
        <h2>Nuovo percorso</h2>
        <div class="form-grid route-fields">
          <label class="field">
            Data giro
            <input name="scheduledDate" type="date" value="${escapeHtml(route.scheduledDate)}" />
          </label>
          <label class="field">
            Punto di partenza
            <input name="startLabel" value="${escapeHtml(route.startLabel)}" autocomplete="off" />
          </label>
          <label class="field">
            Orario partenza manuale
            <input name="startTime" type="time" value="${escapeHtml(route.startTime)}" />
          </label>
          <label class="field">
            Regola orario
            <select name="timingMode">
              <option value="first_open_minus" ${route.timingMode === "first_open_minus" ? "selected" : ""}>Arriva prima apertura</option>
              <option value="arrive_at" ${route.timingMode === "arrive_at" ? "selected" : ""}>Arriva a orario specifico</option>
              <option value="depart_at" ${route.timingMode === "depart_at" ? "selected" : ""}>Parti a orario specifico</option>
            </select>
          </label>
          <label class="field">
            Minuti prima apertura
            <input name="arrivalLeadMinutes" type="number" min="0" max="60" step="5" value="${escapeHtml(route.arrivalLeadMinutes)}" ${route.timingMode !== "first_open_minus" ? "disabled" : ""} />
          </label>
          <label class="field">
            Orario arrivo target
            <input name="firstArrivalTime" type="time" value="${escapeHtml(route.firstArrivalTime)}" ${route.timingMode !== "arrive_at" ? "disabled" : ""} />
          </label>
          <label class="field full">
            Indirizzo partenza
            <input name="startAddress" value="${escapeHtml(route.startAddress)}" autocomplete="street-address" />
          </label>
          <label class="field checkbox-field full">
            <input name="endSameAsStart" type="checkbox" ${route.endSameAsStart ? "checked" : ""} />
            <span>Arrivo finale uguale alla partenza</span>
          </label>
          <label class="field">
            Punto finale
            <input name="endLabel" value="${escapeHtml(route.endLabel)}" ${route.endSameAsStart ? "disabled" : ""} />
          </label>
          <label class="field full">
            Indirizzo finale
            <input name="endAddress" value="${escapeHtml(route.endAddress)}" ${route.endSameAsStart ? "disabled" : ""} />
          </label>
        </div>

        <h3>Archivio</h3>
        <div class="form-grid">
          <label class="field full">
            Indirizzo salvato
            <select name="selectedAddressId">
              <option value="">Seleziona indirizzo</option>
              ${renderAddressOptions()}
            </select>
          </label>
        </div>
        <div class="actions">
          <button type="button" class="btn" id="add-saved-stop">${icon("+")}Aggiungi da archivio</button>
        </div>

        <h3>Nuova tappa</h3>
        <div class="form-grid">
          <label class="field">
            Cliente/lavoro
            <input name="customCustomer" value="${escapeHtml(route.customCustomer)}" />
          </label>
          <label class="field">
            Sede
            <input name="customLocation" value="${escapeHtml(route.customLocation)}" />
          </label>
          <label class="field full">
            Indirizzo completo
            <input name="customAddress" value="${escapeHtml(route.customAddress)}" />
          </label>
          <label class="field">
            Durata intervento
            <input name="customDuration" type="number" min="5" step="5" value="${escapeHtml(route.customDuration)}" />
          </label>
          <label class="field">
            Apertura mattina
            <input name="customOpenMorning" type="time" value="${escapeHtml(route.customOpenMorning)}" />
          </label>
          <label class="field">
            Chiusura mattina
            <input name="customCloseMorning" type="time" value="${escapeHtml(route.customCloseMorning)}" />
          </label>
          <label class="field">
            Apertura pomeriggio
            <input name="customOpenAfternoon" type="time" value="${escapeHtml(route.customOpenAfternoon)}" />
          </label>
          <label class="field">
            Chiusura pomeriggio
            <input name="customCloseAfternoon" type="time" value="${escapeHtml(route.customCloseAfternoon)}" />
          </label>
        </div>
        <div class="actions">
          <button type="button" class="btn" id="add-custom-stop">${icon("+")}Aggiungi tappa</button>
          <button type="button" class="btn primary" id="plan-route">${icon("→")}${state.planning ? "Calcolo..." : "Ottimizza e salva"}</button>
        </div>

        <h3>Voce</h3>
        <div class="form-grid">
          <label class="field full">
            Comando
            <textarea name="transcript" id="transcript">${escapeHtml(route.transcript)}</textarea>
          </label>
        </div>
        <div class="actions">
          <button type="button" class="btn" id="listen-command">${icon("●")}Avvia voce</button>
          <button type="button" class="btn" id="apply-command">${icon("✓")}Applica comando</button>
        </div>
      </form>

      <aside class="panel">
        <h2>Tappe</h2>
        ${renderStops()}
      </aside>
    </section>
  `;
}

function renderStops() {
  if (!state.route.stops.length) {
    return `<div class="empty">Nessuna tappa inserita.</div>`;
  }
  return `
    <div class="stop-list">
      ${state.route.stops.map((stop, index) => `
        <article class="card stop-card">
          <div class="stop-head">
            <div>
              <p class="stop-title">${index + 1}. ${escapeHtml(stop.customer)} ${escapeHtml(stop.location || "")}</p>
              <div class="stop-meta">${escapeHtml(stop.fullAddress)}</div>
            </div>
            <button class="btn danger icon-btn" data-remove-stop="${stop.uid}" title="Rimuovi">×</button>
          </div>
          <div class="form-grid three">
            <label class="field">
              Durata
              <input type="number" min="5" step="5" value="${escapeHtml(stop.durationMinutes)}" data-stop-field="${stop.uid}:durationMinutes" />
            </label>
            <label class="field">
              Mattina
              <input type="time" value="${escapeHtml(stop.openMorning || "")}" data-stop-field="${stop.uid}:openMorning" />
            </label>
            <label class="field">
              Chiusura
              <input type="time" value="${escapeHtml(stop.closeMorning || "")}" data-stop-field="${stop.uid}:closeMorning" />
            </label>
            <label class="field">
              Pomeriggio
              <input type="time" value="${escapeHtml(stop.openAfternoon || "")}" data-stop-field="${stop.uid}:openAfternoon" />
            </label>
            <label class="field">
              Chiusura
              <input type="time" value="${escapeHtml(stop.closeAfternoon || "")}" data-stop-field="${stop.uid}:closeAfternoon" />
            </label>
            <div class="field">
              <span class="badge ${stop.recognized ? "ok" : "warning"}">${stop.recognized ? "Archivio" : "Da confermare"}</span>
            </div>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderArchive() {
  const form = state.addressForm;
  const addresses = normalizeList(state.addresses);
  app.innerHTML = `
    <section class="grid">
      <div class="panel">
        <h2>Archivio indirizzi</h2>
        <div class="row wrap">
          <input id="archive-search" placeholder="Cerca cliente, sede o indirizzo" value="${escapeHtml(state.addressSearch)}" />
          <button class="btn" id="new-address">Nuovo</button>
        </div>
        <div class="archive-list" style="margin-top: 14px;">
          ${addresses.map((address) => `
            <article class="card archive-card">
              <div>
                <p class="stop-title">${escapeHtml(addressName(address))}</p>
                <div class="stop-meta">${escapeHtml(address.fullAddress)}</div>
                <div class="stop-meta">${escapeHtml(address.openMorning || "--:--")}-${escapeHtml(address.closeMorning || "--:--")} / ${escapeHtml(address.openAfternoon || "--:--")}-${escapeHtml(address.closeAfternoon || "--:--")}</div>
              </div>
              <div class="actions">
                <button class="btn" data-edit-address="${address.id}">Modifica</button>
                <button class="btn danger" data-delete-address="${address.id}">Elimina</button>
              </div>
            </article>
          `).join("") || `<div class="empty">Nessun indirizzo trovato.</div>`}
        </div>
      </div>

      <form class="panel" id="address-form">
        <h2>${form.id ? "Modifica indirizzo" : "Aggiungi indirizzo"}</h2>
        <div class="form-grid">
          <label class="field">
            Cliente/lavoro
            <input name="customer" value="${escapeHtml(form.customer)}" required />
          </label>
          <label class="field">
            Sede/descrizione
            <input name="location" value="${escapeHtml(form.location)}" />
          </label>
          <label class="field full">
            Indirizzo completo
            <input name="fullAddress" value="${escapeHtml(form.fullAddress)}" required />
          </label>
          <label class="field full">
            Note
            <textarea name="notes">${escapeHtml(form.notes)}</textarea>
          </label>
          <label class="field">
            Apertura mattina
            <input name="openMorning" type="time" value="${escapeHtml(form.openMorning)}" />
          </label>
          <label class="field">
            Chiusura mattina
            <input name="closeMorning" type="time" value="${escapeHtml(form.closeMorning)}" />
          </label>
          <label class="field">
            Apertura pomeriggio
            <input name="openAfternoon" type="time" value="${escapeHtml(form.openAfternoon)}" />
          </label>
          <label class="field">
            Chiusura pomeriggio
            <input name="closeAfternoon" type="time" value="${escapeHtml(form.closeAfternoon)}" />
          </label>
          <label class="field">
            Durata abituale
            <input name="defaultDuration" type="number" min="5" step="5" value="${escapeHtml(form.defaultDuration)}" />
          </label>
          <label class="field">
            Latitudine
            <input name="lat" type="number" step="0.000001" value="${escapeHtml(form.lat ?? "")}" />
          </label>
          <label class="field">
            Longitudine
            <input name="lng" type="number" step="0.000001" value="${escapeHtml(form.lng ?? "")}" />
          </label>
        </div>
        <div class="actions">
          <button class="btn primary" type="submit">Salva</button>
          <button class="btn ghost" type="button" id="reset-address-form">Annulla</button>
        </div>
      </form>
    </section>
  `;
}

function renderSavedRoutes() {
  const savedRoutes = normalizeList(state.savedRoutes);
  app.innerHTML = `
    <section class="panel">
      <div class="section-head">
        <div>
          <h2>Giri salvati</h2>
          <p class="section-copy">Ogni giro viene salvato quando calcoli il percorso. Aprendolo, il meteo viene ricalcolato se il giro e oggi o futuro; per i giri passati resta memorizzato lo storico.</p>
        </div>
        <button class="btn" id="refresh-routes">${icon("↻")}Aggiorna</button>
      </div>
      <div class="saved-list">
        ${savedRoutes.map((route) => `
          <article class="card saved-card">
            <div>
              <p class="stop-title">${escapeHtml(route.name)}</p>
              <div class="stop-meta">${escapeHtml(route.scheduledDate || "Senza data")} · ${escapeHtml(route.startTime || "--:--")} · ${normalizeNumber(route.totalKm).toFixed(1)} km · ${euro(route.totalCost)}</div>
              <div class="stop-meta">${escapeHtml(route.startLabel || "Partenza")} → ${escapeHtml(route.endLabel || "Arrivo")}</div>
            </div>
            <div class="actions">
              <button class="btn primary" data-open-route="${route.id}">${icon("→")}Apri</button>
            </div>
          </article>
        `).join("") || `<div class="empty">Nessun giro salvato.</div>`}
      </div>
    </section>
  `;
}

function renderResult() {
  if (!state.result) {
    app.innerHTML = `<section class="panel"><h2>Risultato percorso</h2><div class="empty">Nessun percorso calcolato.</div></section>`;
    return;
  }
  const result = normalizeRouteResult(state.result);
  app.innerHTML = `
    <section>
      <div class="section-head">
        <div>
          <h2>Risultato percorso</h2>
          <p class="section-copy">${escapeHtml(result.scheduledDate || "")} · Meteo: ${escapeHtml(result.weatherMode || "previsione")} · aggiornato ${escapeHtml(result.weatherCapturedAt ? new Date(result.weatherCapturedAt).toLocaleString("it-IT") : "")}</p>
        </div>
        <button class="btn" data-tab-jump="saved">${icon("▣")}Giri salvati</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Cliente</th>
              <th>Indirizzo</th>
              <th>Partenza</th>
              <th>Guida</th>
              <th>Km</th>
              <th>Arrivo</th>
              <th>Orari sede</th>
              <th>Intervento</th>
              <th>Fine</th>
              <th>Meteo</th>
              <th>Avvisi</th>
            </tr>
          </thead>
          <tbody>
            ${result.rows.map((row) => `
              <tr>
                <td>${row.stopNumber}</td>
                <td>${escapeHtml(row.customer)}<br><span class="stop-meta">${escapeHtml(row.location || "")}</span></td>
                <td>${escapeHtml(row.address)}</td>
                <td>${escapeHtml(row.departureTime)}</td>
                <td>${minutesLabel(row.driveMinutes)}<br><span class="stop-meta">+${minutesLabel(row.driveBufferMinutes || 0)} margine</span></td>
                <td>${normalizeNumber(row.km).toFixed(1)}</td>
                <td>${escapeHtml(row.arrivalTime)}</td>
                <td>${escapeHtml(row.openingHours)}</td>
                <td>${minutesLabel(row.durationMinutes)}</td>
                <td>${escapeHtml(row.serviceEndTime)}</td>
                <td>${renderWeatherForStop(result, row.stopNumber)}</td>
                <td>${renderWarnings(row.warnings)}</td>
              </tr>
            `).join("")}
            <tr>
              <td>F</td>
              <td>Arrivo finale</td>
              <td>${escapeHtml(result.end?.address || result.end?.fullAddress || "")}</td>
              <td>${escapeHtml(result.finalLeg.departureTime)}</td>
              <td>${minutesLabel(result.finalLeg.driveMinutes)}</td>
              <td>${normalizeNumber(result.finalLeg.km).toFixed(1)}</td>
              <td>${escapeHtml(result.finalLeg.arrivalTime)}</td>
              <td></td>
              <td></td>
              <td>${escapeHtml(result.finalLeg.arrivalTime)}</td>
              <td></td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mobile-result">
        ${result.rows.map((row) => `
          <article class="card">
            <p class="stop-title">${row.stopNumber}. ${escapeHtml(row.customer)} ${escapeHtml(row.location || "")}</p>
            <div class="stop-meta">${escapeHtml(row.address)}</div>
            <div class="form-grid three" style="margin-top: 10px;">
              <div><div class="metric-label">Partenza</div><strong>${escapeHtml(row.departureTime)}</strong></div>
              <div><div class="metric-label">Arrivo</div><strong>${escapeHtml(row.arrivalTime)}</strong></div>
              <div><div class="metric-label">Fine</div><strong>${escapeHtml(row.serviceEndTime)}</strong></div>
              <div><div class="metric-label">Guida</div><strong>${minutesLabel(row.driveMinutes)}</strong></div>
              <div><div class="metric-label">Km</div><strong>${normalizeNumber(row.km).toFixed(1)}</strong></div>
              <div><div class="metric-label">Intervento</div><strong>${minutesLabel(row.durationMinutes)}</strong></div>
            </div>
            <div style="margin-top: 9px;">${renderWarnings(row.warnings)}</div>
            <div style="margin-top: 9px;">${renderWeatherForStop(result, row.stopNumber)}</div>
          </article>
        `).join("")}
      </div>

      ${renderSummary(result.summary, result.mapMode)}
    </section>
  `;
}

function renderWeatherForStop(result, stopNumber) {
  const weather = normalizeList(result.weather).find((item) => Number(item.stopNumber) === Number(stopNumber));
  if (!weather) return `<span class="badge">meteo non caricato</span>`;
  const temp = weather.temperatureC === null || weather.temperatureC === undefined ? "--" : `${Math.round(weather.temperatureC)}°C`;
  const rain = weather.precipitationMm === null || weather.precipitationMm === undefined ? "--" : `${normalizeNumber(weather.precipitationMm).toFixed(1)} mm`;
  const wind = weather.windKmh === null || weather.windKmh === undefined ? "--" : `${Math.round(weather.windKmh)} km/h`;
  return `
    <div class="weather-pill">
      <strong><span class="weather-icon">${weatherIcon(weather)}</span>${escapeHtml(temp)}</strong>
      <span>${escapeHtml(weather.description || "")}</span>
      <small>Pioggia ${escapeHtml(rain)} · Vento ${escapeHtml(wind)}</small>
      ${normalizeList(weather.warnings).map((warning) => `<span class="badge warning">! ${escapeHtml(warning)}</span>`).join("")}
    </div>
  `;
}

function weatherIcon(weather) {
  const text = `${weather.description || ""} ${normalizeList(weather.warnings).join(" ")}`.toLowerCase();
  if (text.includes("temporale")) return "!";
  if (text.includes("vento")) return "~";
  if (text.includes("ghiaccio") || text.includes("neve")) return "*";
  if (text.includes("piogg") || text.includes("rovesci") || text.includes("precip")) return "/";
  if (text.includes("nuvol")) return "o";
  if (text.includes("nebb")) return "=";
  return "+";
}

function renderWarnings(warnings) {
  const list = normalizeList(warnings);
  if (!list.length) return `<span class="badge ok">OK</span>`;
  return list.map((warning) => `<span class="badge warning">${escapeHtml(warning)}</span>`).join(" ");
}

function renderSummary(summary, mapMode) {
  return `
    <div class="summary-grid">
      <div class="metric"><div class="metric-label">Km totali</div><div class="metric-value">${normalizeNumber(summary.totalKm).toFixed(1)}</div></div>
      <div class="metric"><div class="metric-label">Ore guida</div><div class="metric-value">${minutesLabel(summary.totalDriveMinutes)}</div></div>
      <div class="metric"><div class="metric-label">Ore lavoro</div><div class="metric-value">${minutesLabel(summary.totalWorkMinutes)}</div></div>
      <div class="metric"><div class="metric-label">Giornata</div><div class="metric-value">${escapeHtml(summary.dayStart)}-${escapeHtml(summary.dayEnd)}</div></div>
      <div class="metric"><div class="metric-label">Costo km</div><div class="metric-value">${euro(summary.costKm)}</div></div>
      <div class="metric"><div class="metric-label">Costo guida</div><div class="metric-value">${euro(summary.costDrive)}</div></div>
      <div class="metric"><div class="metric-label">Costo lavoro</div><div class="metric-value">${euro(summary.costWork)}</div></div>
      <div class="metric"><div class="metric-label">Totale</div><div class="metric-value">${euro(summary.totalCost)}</div></div>
    </div>
    <div class="actions">
      <span class="badge">Distanze: ${escapeHtml(mapMode || "locale")}</span>
      ${normalizeList(summary.warnings).map((warning) => `<span class="badge warning">${escapeHtml(warning)}</span>`).join("")}
    </div>
  `;
}

function renderSettings() {
  app.innerHTML = `
    <section class="panel">
      <h2>Impostazioni tariffe</h2>
      <form id="settings-form" class="form-grid">
        <label class="field">
          Euro per km
          <input name="kmRate" type="number" min="0" step="0.01" value="${escapeHtml(state.settings.kmRate)}" />
        </label>
        <label class="field">
          Euro/ora guida
          <input name="driveHourRate" type="number" min="0" step="0.01" value="${escapeHtml(state.settings.driveHourRate)}" />
        </label>
        <label class="field">
          Euro/ora lavoro
          <input name="workHourRate" type="number" min="0" step="0.01" value="${escapeHtml(state.settings.workHourRate)}" />
        </label>
        <div class="actions field full">
          <button class="btn primary" type="submit">Salva tariffe</button>
        </div>
      </form>
    </section>
  `;
}

function render() {
  if (state.activeTab === "route") renderRoute();
  if (state.activeTab === "saved") renderSavedRoutes();
  if (state.activeTab === "archive") renderArchive();
  if (state.activeTab === "result") renderResult();
  if (state.activeTab === "settings") renderSettings();
}

async function planCurrentRoute() {
  updateRouteFromForm();
  if (!state.route.stops.length) {
    showToast("Aggiungi almeno una tappa");
    return;
  }
  state.planning = true;
  render();
  try {
    const payload = {
      start: {
        label: state.route.startLabel,
        address: state.route.startAddress
      },
      scheduledDate: state.route.scheduledDate,
      timingMode: state.route.timingMode,
      arrivalLeadMinutes: state.route.arrivalLeadMinutes,
      firstArrivalTime: state.route.firstArrivalTime,
      end: {
        sameAsStart: state.route.endSameAsStart,
        label: state.route.endLabel,
        address: state.route.endAddress
      },
      startTime: state.route.startTime,
      firstArrivalRequired: state.route.firstArrivalRequired,
      stops: state.route.stops,
      rates: state.settings
    };
    state.result = normalizeRouteResult(await api("/api/plan", {
      method: "POST",
      body: JSON.stringify(payload)
    }));
    await refreshSavedRoutes();
    setActiveTab("result");
    showToast("Percorso calcolato e salvato");
  } catch (error) {
    showToast(error.message);
  } finally {
    state.planning = false;
    render();
  }
}

async function applyVoiceCommand() {
  updateRouteFromForm();
  if (!state.route.transcript.trim()) return;
  const parsed = await api("/api/voice/parse", {
    method: "POST",
    body: JSON.stringify({ text: state.route.transcript })
  });

  if (parsed.start) {
    state.route.startLabel = parsed.start.label || state.route.startLabel;
    state.route.startAddress = parsed.start.address || state.route.startAddress;
  }
  if (parsed.startTime) state.route.startTime = parsed.startTime;
  if (parsed.end) {
    state.route.endSameAsStart = false;
    state.route.endLabel = parsed.end.label || state.route.endLabel;
    state.route.endAddress = parsed.end.address || state.route.endAddress;
  }
  if (parsed.firstArrivalRequired) state.route.firstArrivalRequired = parsed.firstArrivalRequired;
  for (const stop of parsed.stops || []) addStop(stop);

  showToast(parsed.needsConfirmation?.length ? `Da confermare: ${parsed.needsConfirmation.join(", ")}` : "Comando applicato");
  if (parsed.action === "optimize") await planCurrentRoute();
  else render();
}

function startSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast("Riconoscimento vocale non disponibile");
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = "it-IT";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    const textarea = document.querySelector("#transcript");
    if (textarea) textarea.value = transcript;
    state.route.transcript = transcript;
    showToast("Voce acquisita");
  };
  recognition.onerror = () => showToast("Voce non acquisita");
  recognition.start();
}

async function saveAddressForm(form) {
  const values = readForm(form);
  const payload = {
    customer: values.customer,
    location: values.location,
    fullAddress: values.fullAddress,
    notes: values.notes,
    openMorning: values.openMorning,
    closeMorning: values.closeMorning,
    openAfternoon: values.openAfternoon,
    closeAfternoon: values.closeAfternoon,
    defaultDuration: Number(values.defaultDuration || 45),
    lat: values.lat ? Number(values.lat) : null,
    lng: values.lng ? Number(values.lng) : null
  };
  if (state.addressForm.id) {
    await api(`/api/addresses/${state.addressForm.id}`, { method: "PUT", body: JSON.stringify(payload) });
  } else {
    await api("/api/addresses", { method: "POST", body: JSON.stringify(payload) });
  }
  state.addressForm = { ...emptyAddressForm };
  await refreshAddresses();
  render();
  showToast("Indirizzo salvato");
}

function bindEvents() {
  document.querySelector(".tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-tab]");
    if (button) {
      updateRouteFromForm();
      setActiveTab(button.dataset.tab);
    }
  });

  app.addEventListener("input", (event) => {
    const field = event.target.closest("[data-stop-field]");
    if (field) {
      const [uid, key] = field.dataset.stopField.split(":");
      const stop = state.route.stops.find((item) => item.uid === uid);
      if (stop) stop[key] = key === "durationMinutes" ? Number(field.value || 0) : field.value;
    }
  });

  app.addEventListener("change", (event) => {
    if (event.target.name === "endSameAsStart" || event.target.name === "timingMode") {
      updateRouteFromForm();
      render();
    }
  });

  app.addEventListener("click", async (event) => {
    const tabJump = event.target.closest("[data-tab-jump]");
    if (tabJump) {
      setActiveTab(tabJump.dataset.tabJump);
      return;
    }

    if (event.target.closest("#refresh-routes")) {
      await refreshSavedRoutes();
      render();
      showToast("Giri aggiornati");
      return;
    }

    const openRoute = event.target.closest("[data-open-route]");
    if (openRoute) {
      try {
        showToast("Carico giro e meteo");
        state.result = normalizeRouteResult(await api(`/api/routes/${openRoute.dataset.openRoute}`));
        await refreshSavedRoutes();
        setActiveTab("result");
      } catch (error) {
        showToast(error.message);
      }
      return;
    }

    const removeStop = event.target.closest("[data-remove-stop]");
    if (removeStop) {
      state.route.stops = state.route.stops.filter((stop) => stop.uid !== removeStop.dataset.removeStop);
      render();
      return;
    }

    if (event.target.closest("#add-saved-stop")) {
      updateRouteFromForm();
      const address = normalizeList(state.addresses).find((item) => String(item.id) === String(state.route.selectedAddressId));
      if (!address) return showToast("Seleziona un indirizzo");
      addStop(addressToStop(address));
      render();
      return;
    }

    if (event.target.closest("#add-custom-stop")) {
      updateRouteFromForm();
      if (!state.route.customAddress || !state.route.customCustomer) {
        showToast("Cliente e indirizzo obbligatori");
        return;
      }
      const saved = await api("/api/addresses", {
        method: "POST",
        body: JSON.stringify({
          customer: state.route.customCustomer,
          location: state.route.customLocation,
          fullAddress: state.route.customAddress,
          openMorning: state.route.customOpenMorning,
          closeMorning: state.route.customCloseMorning,
          openAfternoon: state.route.customOpenAfternoon,
          closeAfternoon: state.route.customCloseAfternoon,
          defaultDuration: state.route.customDuration
        })
      });
      await refreshAddresses();
      addStop({
        ...addressToStop(saved, state.route.customDuration),
        customer: state.route.customCustomer,
        location: state.route.customLocation,
        fullAddress: state.route.customAddress,
        durationMinutes: state.route.customDuration,
        openMorning: state.route.customOpenMorning,
        closeMorning: state.route.customCloseMorning,
        openAfternoon: state.route.customOpenAfternoon,
        closeAfternoon: state.route.customCloseAfternoon,
        recognized: true
      });
      Object.assign(state.route, {
        customCustomer: "",
        customLocation: "",
        customAddress: "",
        customDuration: 45
      });
      render();
      showToast("Tappa salvata in archivio");
      return;
    }

    if (event.target.closest("#plan-route")) {
      await planCurrentRoute();
      return;
    }

    if (event.target.closest("#listen-command")) {
      startSpeechRecognition();
      return;
    }

    if (event.target.closest("#apply-command")) {
      try {
        await applyVoiceCommand();
      } catch (error) {
        showToast(error.message);
      }
      return;
    }

    const editAddress = event.target.closest("[data-edit-address]");
    if (editAddress) {
      const address = normalizeList(state.addresses).find((item) => String(item.id) === editAddress.dataset.editAddress);
      state.addressForm = { ...address };
      render();
      return;
    }

    const deleteAddress = event.target.closest("[data-delete-address]");
    if (deleteAddress) {
      await api(`/api/addresses/${deleteAddress.dataset.deleteAddress}`, { method: "DELETE" });
      await refreshAddresses();
      render();
      showToast("Indirizzo eliminato");
      return;
    }

    if (event.target.closest("#new-address") || event.target.closest("#reset-address-form")) {
      state.addressForm = { ...emptyAddressForm };
      render();
    }
  });

  app.addEventListener("input", async (event) => {
    if (event.target.id === "archive-search") {
      state.addressSearch = event.target.value;
      await refreshAddresses();
      renderArchive();
    }
  });

  app.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (event.target.id === "address-form") {
      try {
        await saveAddressForm(event.target);
      } catch (error) {
        showToast(error.message);
      }
    }
    if (event.target.id === "settings-form") {
      const values = readForm(event.target);
      state.settings = await api("/api/settings", {
        method: "PUT",
        body: JSON.stringify({
          kmRate: Number(values.kmRate),
          driveHourRate: Number(values.driveHourRate),
          workHourRate: Number(values.workHourRate)
        })
      });
      showToast("Tariffe salvate");
      render();
    }
  });
}

applyTheme();
window.setInterval(applyTheme, 60_000);
bindEvents();
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  });
}
loadInitialData()
  .then(render)
  .catch((error) => {
    app.innerHTML = `<section class="panel"><h2>Errore</h2><div class="empty">${escapeHtml(error.message)}</div></section>`;
  });
