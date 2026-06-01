(() => {
  let lastResult = null;
  let orderRows = [];
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const url = String(args[0]?.url || args[0] || "");
    if (/\/api\/plan$/.test(url) || /\/api\/routes\/\d+$/.test(url)) {
      response.clone().json().then((payload) => {
        if (payload?.rows?.length) {
          lastResult = payload;
          orderRows = payload.rows.map((row) => ({ ...row }));
          window.setTimeout(injectOrderPanel, 80);
        }
      }).catch(() => {});
    }
    return response;
  };

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

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function icon(value) {
    return `<span class="btn-icon" aria-hidden="true">${value}</span>`;
  }

  function rowToStop(row) {
    return {
      uid: row.stopUid || row.uid || crypto.randomUUID(),
      addressId: row.addressId || null,
      customer: row.customer || "",
      location: row.location || "",
      fullAddress: row.address || row.fullAddress || "",
      notes: row.notes || "",
      openMorning: row.openMorning || "",
      closeMorning: row.closeMorning || "",
      openAfternoon: row.openAfternoon || "",
      closeAfternoon: row.closeAfternoon || "",
      durationMinutes: Number(row.durationMinutes || 45),
      lat: row.lat ?? null,
      lng: row.lng ?? null,
      recognized: Boolean(row.addressId)
    };
  }

  function renderOrderPanel() {
    if (!lastResult?.rows?.length) return "";
    return `
      <section class="panel order-panel" id="manual-order-panel">
        <div class="section-head compact">
          <div>
            <h2>Ordine tappe</h2>
            <p class="section-copy">Sposta le tappe e ricalcola: tempi, km, orari, meteo e costi vengono aggiornati senza cambiare la sequenza scelta.</p>
          </div>
          <span class="badge ${lastResult.manualOrder ? "ok" : ""}">${lastResult.manualOrder ? "Bloccato" : "Ottimizzato"}</span>
        </div>
        <div class="order-list">
          ${orderRows.map((row, index) => `
            <article class="order-item">
              <div class="order-index">${index + 1}</div>
              <div>
                <p class="stop-title">${escapeHtml(row.customer)} ${escapeHtml(row.location || "")}</p>
                <div class="stop-meta">${escapeHtml(row.address)}</div>
              </div>
              <div class="order-actions">
                <button class="btn icon-btn" data-order-move="${index}:up" ${index === 0 ? "disabled" : ""} title="Sposta su">↑</button>
                <button class="btn icon-btn" data-order-move="${index}:down" ${index === orderRows.length - 1 ? "disabled" : ""} title="Sposta giù">↓</button>
              </div>
            </article>
          `).join("")}
        </div>
        <div class="actions">
          <button class="btn primary" id="manual-order-replan">${icon("✓")}Ricalcola con questo ordine</button>
          <button class="btn" id="optimized-order-replan">${icon("↻")}Ritorna a percorso ottimizzato</button>
        </div>
      </section>
    `;
  }

  function renderWarnings(warnings) {
    if (!warnings?.length) return `<span class="badge ok">OK</span>`;
    return warnings.map((warning) => `<span class="badge warning">${escapeHtml(warning)}</span>`).join(" ");
  }

  function weatherIcon(weather) {
    const text = `${weather.description || ""} ${(weather.warnings || []).join(" ")}`.toLowerCase();
    if (text.includes("temporale")) return "!";
    if (text.includes("vento")) return "~";
    if (text.includes("ghiaccio") || text.includes("neve")) return "*";
    if (text.includes("piogg") || text.includes("rovesci") || text.includes("precip")) return "/";
    if (text.includes("nuvol")) return "o";
    if (text.includes("nebb")) return "=";
    return "+";
  }

  function renderWeatherForStop(result, stopNumber) {
    const weather = (result.weather || []).find((item) => Number(item.stopNumber) === Number(stopNumber));
    if (!weather) return `<span class="badge">meteo non caricato</span>`;
    const temp = weather.temperatureC === null || weather.temperatureC === undefined ? "--" : `${Math.round(weather.temperatureC)}°C`;
    const rain = weather.precipitationMm === null || weather.precipitationMm === undefined ? "--" : `${Number(weather.precipitationMm).toFixed(1)} mm`;
    const wind = weather.windKmh === null || weather.windKmh === undefined ? "--" : `${Math.round(weather.windKmh)} km/h`;
    return `
      <div class="weather-pill">
        <strong><span class="weather-icon">${weatherIcon(weather)}</span>${escapeHtml(temp)}</strong>
        <span>${escapeHtml(weather.description || "")}</span>
        <small>Pioggia ${escapeHtml(rain)} · Vento ${escapeHtml(wind)}</small>
        ${(weather.warnings || []).map((warning) => `<span class="badge warning">! ${escapeHtml(warning)}</span>`).join("")}
      </div>
    `;
  }

  function renderSummary(summary, mapMode) {
    return `
      <div class="summary-grid">
        <div class="metric"><div class="metric-label">Km totali</div><div class="metric-value">${Number(summary.totalKm || 0).toFixed(1)}</div></div>
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
        ${(summary.warnings || []).map((warning) => `<span class="badge warning">${escapeHtml(warning)}</span>`).join("")}
      </div>
    `;
  }

  function renderManualResult() {
    const result = lastResult;
    const app = document.querySelector("#app");
    if (!app || !result) return;
    app.innerHTML = `
      <section>
        <div class="section-head">
          <div>
            <h2>Risultato percorso</h2>
            <p class="section-copy">${escapeHtml(result.scheduledDate || "")} · ${result.manualOrder ? "Ordine manuale bloccato" : "Ordine ottimizzato"} · Meteo: ${escapeHtml(result.weatherMode || "previsione")} · aggiornato ${escapeHtml(result.weatherCapturedAt ? new Date(result.weatherCapturedAt).toLocaleString("it-IT") : "")}</p>
          </div>
          <button class="btn" data-tab-jump="saved">${icon("▣")}Giri salvati</button>
        </div>
        <div class="manual-result-note">${renderOrderPanel()}</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Cliente</th><th>Indirizzo</th><th>Partenza</th><th>Guida</th><th>Km</th><th>Arrivo</th><th>Orari sede</th><th>Intervento</th><th>Fine</th><th>Meteo</th><th>Avvisi</th></tr></thead>
            <tbody>
              ${result.rows.map((row) => `
                <tr>
                  <td>${row.stopNumber}</td>
                  <td>${escapeHtml(row.customer)}<br><span class="stop-meta">${escapeHtml(row.location || "")}</span></td>
                  <td>${escapeHtml(row.address)}</td>
                  <td>${escapeHtml(row.departureTime)}</td>
                  <td>${minutesLabel(row.driveMinutes)}<br><span class="stop-meta">+${minutesLabel(row.driveBufferMinutes || 0)} margine</span></td>
                  <td>${Number(row.km || 0).toFixed(1)}</td>
                  <td>${escapeHtml(row.arrivalTime)}</td>
                  <td>${escapeHtml(row.openingHours)}</td>
                  <td>${minutesLabel(row.durationMinutes)}</td>
                  <td>${escapeHtml(row.serviceEndTime)}</td>
                  <td>${renderWeatherForStop(result, row.stopNumber)}</td>
                  <td>${renderWarnings(row.warnings)}</td>
                </tr>
              `).join("")}
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
                <div><div class="metric-label">Km</div><strong>${Number(row.km || 0).toFixed(1)}</strong></div>
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

  function injectOrderPanel() {
    if (!lastResult?.rows?.length) return;
    const app = document.querySelector("#app");
    if (!app || !/Risultato percorso/.test(app.textContent || "")) return;
    const current = document.querySelector("#manual-order-panel");
    if (current) {
      current.outerHTML = renderOrderPanel();
      return;
    }
    const table = app.querySelector(".table-wrap");
    if (table) table.insertAdjacentHTML("beforebegin", renderOrderPanel());
  }

  async function replan(manualOrder) {
    if (!lastResult?.rows?.length) return;
    const rows = orderRows.length === lastResult.rows.length ? orderRows : lastResult.rows;
    const stops = manualOrder
      ? rows.map(rowToStop)
      : (lastResult.plannedStops?.length ? lastResult.plannedStops : lastResult.rows.map(rowToStop));
    const payload = {
      start: lastResult.start,
      end: lastResult.end,
      scheduledDate: lastResult.scheduledDate,
      timingMode: lastResult.timingMode,
      arrivalLeadMinutes: lastResult.arrivalLeadMinutes,
      firstArrivalTime: lastResult.firstArrivalTime,
      firstArrivalRequired: lastResult.firstArrivalRequired,
      startTime: lastResult.startTime,
      rates: lastResult.rates,
      stops,
      manualOrder
    };
    const response = await originalFetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const payloadResult = await response.json();
    if (!response.ok) throw new Error(payloadResult.error || "Errore ricalcolo");
    lastResult = payloadResult;
    orderRows = payloadResult.rows.map((row) => ({ ...row }));
    renderManualResult();
  }

  document.addEventListener("click", async (event) => {
    const move = event.target.closest("[data-order-move]");
    if (move) {
      const [rawIndex, direction] = move.dataset.orderMove.split(":");
      const index = Number(rawIndex);
      const target = direction === "up" ? index - 1 : index + 1;
      if (target >= 0 && target < orderRows.length) {
        [orderRows[index], orderRows[target]] = [orderRows[target], orderRows[index]];
        orderRows = orderRows.map((row, rowIndex) => ({ ...row, stopNumber: rowIndex + 1 }));
        injectOrderPanel();
      }
      return;
    }

    if (event.target.closest("#manual-order-replan")) {
      try { await replan(true); } catch (error) { alert(error.message); }
      return;
    }

    if (event.target.closest("#optimized-order-replan")) {
      try { await replan(false); } catch (error) { alert(error.message); }
    }
  });

  new MutationObserver(injectOrderPanel).observe(document.documentElement, { childList: true, subtree: true });
})();
