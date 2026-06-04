(function () {
  function showToast(message) {
    const toast = document.querySelector("#toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 3200);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function minutesLabel(minutes) {
    const value = Number(minutes || 0);
    const hours = Math.floor(value / 60);
    const mins = value % 60;
    if (!hours) return `${mins} min`;
    if (!mins) return `${hours} h`;
    return `${hours} h ${mins} min`;
  }

  function euro(value) {
    return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(value || 0));
  }

  function normalizeRoute(route) {
    const rows = Array.isArray(route?.rows) ? route.rows : [];
    const finalLeg = route?.finalLeg || {};
    const summary = route?.summary || {};
    return {
      ...route,
      rows,
      finalLeg,
      summary: {
        totalKm: Number(summary.totalKm ?? route?.totalKm ?? 0),
        totalDriveMinutes: Number(summary.totalDriveMinutes ?? route?.totalDriveMinutes ?? 0),
        totalWorkMinutes: Number(summary.totalWorkMinutes ?? route?.totalWorkMinutes ?? 0),
        dayStart: summary.dayStart || route?.startTime || "--:--",
        dayEnd: summary.dayEnd || finalLeg.arrivalTime || "--:--",
        costKm: Number(summary.costKm || 0),
        costDrive: Number(summary.costDrive || 0),
        costWork: Number(summary.costWork || 0),
        totalCost: Number(summary.totalCost ?? route?.totalCost ?? 0)
      }
    };
  }

  async function fetchRoute(routeId) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`/api/routes/${routeId}`, { signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Giro non caricato");
      return normalizeRoute(data);
    } finally {
      window.clearTimeout(timer);
    }
  }

  function setResultTabActive() {
    document.querySelectorAll(".tab").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === "result");
    });
  }

  function renderWeather(route, stopNumber) {
    const weather = (route.weather || []).find((item) => Number(item.stopNumber) === Number(stopNumber));
    if (!weather) return `<span class="badge">meteo non caricato</span>`;
    const temp = weather.temperatureC === null || weather.temperatureC === undefined ? "--" : `${Math.round(weather.temperatureC)}°C`;
    const rain = weather.precipitationMm === null || weather.precipitationMm === undefined ? "--" : `${Number(weather.precipitationMm).toFixed(1)} mm`;
    return `
      <div class="weather-pill">
        <strong>${escapeHtml(temp)}</strong>
        <span>${escapeHtml(weather.description || "")}</span>
        <small>Pioggia ${escapeHtml(rain)}</small>
      </div>
    `;
  }

  function renderWarnings(warnings) {
    if (!warnings?.length) return `<span class="badge ok">OK</span>`;
    return warnings.map((warning) => `<span class="badge warning">${escapeHtml(warning)}</span>`).join(" ");
  }

  function renderSummary(summary, mapMode) {
    return `
      <div class="summary-grid">
        <div class="metric"><div class="metric-label">Km totali</div><div class="metric-value">${summary.totalKm.toFixed(1)}</div></div>
        <div class="metric"><div class="metric-label">Ore guida</div><div class="metric-value">${minutesLabel(summary.totalDriveMinutes)}</div></div>
        <div class="metric"><div class="metric-label">Ore lavoro</div><div class="metric-value">${minutesLabel(summary.totalWorkMinutes)}</div></div>
        <div class="metric"><div class="metric-label">Giornata</div><div class="metric-value">${escapeHtml(summary.dayStart)}-${escapeHtml(summary.dayEnd)}</div></div>
        <div class="metric"><div class="metric-label">Costo km</div><div class="metric-value">${euro(summary.costKm)}</div></div>
        <div class="metric"><div class="metric-label">Costo guida</div><div class="metric-value">${euro(summary.costDrive)}</div></div>
        <div class="metric"><div class="metric-label">Costo lavoro</div><div class="metric-value">${euro(summary.costWork)}</div></div>
        <div class="metric"><div class="metric-label">Totale</div><div class="metric-value">${euro(summary.totalCost)}</div></div>
      </div>
      <div class="actions"><span class="badge">Distanze: ${escapeHtml(mapMode || "locale")}</span></div>
    `;
  }

  function renderRoute(route) {
    const app = document.querySelector("#app");
    if (!app) return;
    setResultTabActive();
    app.innerHTML = `
      <section>
        <div class="section-head">
          <div>
            <h2>Risultato percorso</h2>
            <p class="section-copy">${escapeHtml(route.scheduledDate || "")} · Giro salvato · Meteo: ${escapeHtml(route.weatherMode || "previsione")}</p>
          </div>
          <button class="btn" id="saved-route-lite-back">▣ Giri salvati</button>
        </div>
        <div class="mobile-result">
          ${route.rows.map((row) => `
            <article class="card">
              <p class="stop-title">${escapeHtml(row.stopNumber || "")}. ${escapeHtml(row.customer)} ${escapeHtml(row.location || "")}</p>
              <div class="stop-meta">${escapeHtml(row.address || row.fullAddress || "")}</div>
              <div class="form-grid three" style="margin-top: 10px;">
                <div><div class="metric-label">Partenza</div><strong>${escapeHtml(row.departureTime || "")}</strong></div>
                <div><div class="metric-label">Arrivo</div><strong>${escapeHtml(row.arrivalTime || "")}</strong></div>
                <div><div class="metric-label">Fine</div><strong>${escapeHtml(row.serviceEndTime || "")}</strong></div>
                <div><div class="metric-label">Guida</div><strong>${minutesLabel(row.driveMinutes)}</strong></div>
                <div><div class="metric-label">Km</div><strong>${Number(row.km || 0).toFixed(1)}</strong></div>
                <div><div class="metric-label">Intervento</div><strong>${minutesLabel(row.durationMinutes)}</strong></div>
              </div>
              <div style="margin-top: 9px;">${renderWarnings(row.warnings)}</div>
              <div style="margin-top: 9px;">${renderWeather(route, row.stopNumber)}</div>
            </article>
          `).join("") || `<div class="empty">Questo giro non contiene tappe leggibili.</div>`}
        </div>
        ${renderSummary(route.summary, route.mapMode)}
      </section>
    `;
  }

  document.addEventListener("click", async (event) => {
    const openButton = event.target.closest("[data-open-route]");
    if (!openButton) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    showToast("Carico giro e meteo");

    try {
      const route = await fetchRoute(openButton.dataset.openRoute);
      renderRoute(route);
      showToast("Giro caricato");
    } catch (error) {
      showToast(error.name === "AbortError" ? "Caricamento giro troppo lento" : error.message);
    }
  }, true);

  document.addEventListener("click", (event) => {
    if (!event.target.closest("#saved-route-lite-back")) return;
    document.querySelector('[data-tab="saved"]')?.click();
  });
})();