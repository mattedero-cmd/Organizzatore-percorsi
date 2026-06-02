(() => {
  const STORAGE_KEY = "routeNavigatorPreference";
  const nativeFetch = window.fetch.bind(window);
  let lastResult = null;
  let lastRenderedKey = "";

  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const url = String(args[0]?.url || args[0] || "");

    if (/\/api\/(plan|routes\/\d+)(\?|$)/.test(url)) {
      try {
        const data = await response.clone().json();
        if (data && Array.isArray(data.rows)) {
          lastResult = data;
          window.setTimeout(injectRoutePanel, 120);
        }
      } catch {
        // The original response still goes back to the app.
      }
    }

    return response;
  };

  function navigatorPreference() {
    return localStorage.getItem(STORAGE_KEY) === "apple" ? "apple" : "google";
  }

  function setNavigatorPreference(value) {
    localStorage.setItem(STORAGE_KEY, value === "apple" ? "apple" : "google");
    injectRoutePanel(true);
  }

  function injectRoutePanel(force = false) {
    if (!lastResult || !Array.isArray(lastResult.rows)) return;
    const app = document.querySelector("#app");
    if (!app || !/Risultato percorso/.test(app.textContent || "")) return;

    const anchor = document.querySelector("#manual-order-panel") || document.querySelector(".mobile-result") || document.querySelector(".table-wrap");
    if (!anchor) return;

    const points = buildRoutePoints(lastResult);
    if (points.length < 2) return;

    const key = `${resultKey(lastResult)}|${navigatorPreference()}`;
    const current = document.querySelector("#route-map-panel");
    if (!force && current?.dataset.mapKey === key) return;

    const template = document.createElement("template");
    template.innerHTML = renderRoutePanel(lastResult, points, key);
    const next = template.content.firstElementChild;

    if (current) current.replaceWith(next);
    else anchor.insertAdjacentElement("beforebegin", next);
  }

  function injectNavigatorSettings() {
    const settingsPanel = [...document.querySelectorAll(".panel")]
      .find((panel) => /Impostazioni tariffe/i.test(panel.textContent || ""));
    if (!settingsPanel || settingsPanel.querySelector("#navigator-preference-settings")) return;

    const preference = navigatorPreference();
    const template = document.createElement("template");
    template.innerHTML = `
      <div class="navigator-settings-block">
        <h3>Navigazione</h3>
        <label class="field">
          Navigatore preferito
          <select id="navigator-preference-settings">
            <option value="google" ${preference === "google" ? "selected" : ""}>Google Maps</option>
            <option value="apple" ${preference === "apple" ? "selected" : ""}>Mappe Apple</option>
          </select>
        </label>
      </div>
    `;
    settingsPanel.append(template.content.firstElementChild);
  }

  function renderRoutePanel(result, points, key) {
    const preference = navigatorPreference();
    const navigatorName = preference === "apple" ? "Mappe Apple" : "Google Maps";
    return `
      <section class="panel route-map-panel route-navigation-panel" id="route-map-panel" data-map-key="${escapeHtml(key)}">
        <div class="section-head compact">
          <div>
            <h2>Navigazione percorso</h2>
            <p class="section-copy">Mappa interna disattivata: usa il navigatore scelto per il percorso reale. ${Number(result.summary?.totalKm || 0).toFixed(1)} km · arrivo ${escapeHtml(result.summary?.dayEnd || "--:--")}</p>
          </div>
          <a class="btn primary" href="${navigationUrl(points, preference)}" target="_blank" rel="noopener">↗ Apri percorso</a>
        </div>
        <div class="navigator-setting-inline">
          <label class="field">
            Navigatore preferito
            <select id="navigator-preference-inline">
              <option value="google" ${preference === "google" ? "selected" : ""}>Google Maps</option>
              <option value="apple" ${preference === "apple" ? "selected" : ""}>Mappe Apple</option>
            </select>
          </label>
          <span class="badge">Attivo: ${escapeHtml(navigatorName)}</span>
        </div>
      </section>
    `;
  }

  function buildRoutePoints(result) {
    const start = result.start || {};
    const end = result.end || {};
    const rows = Array.isArray(result.rows) ? result.rows : [];
    return [
      {
        type: "start",
        shortLabel: "P",
        label: start.label || "Partenza",
        address: start.address || start.fullAddress || "",
        street: start.street,
        city: start.city,
        province: start.province,
        postalCode: start.postalCode,
        country: start.country,
        lat: start.lat,
        lng: start.lng
      },
      ...rows.map((row) => ({
        type: "stop",
        shortLabel: String(row.stopNumber || ""),
        label: `${row.customer || "Tappa"} ${row.location || ""}`.trim(),
        address: row.address || row.fullAddress || "",
        street: row.street,
        city: row.city,
        province: row.province,
        postalCode: row.postalCode,
        country: row.country,
        lat: row.lat,
        lng: row.lng
      })),
      {
        type: "end",
        shortLabel: "F",
        label: end.label || "Arrivo finale",
        address: end.address || end.fullAddress || "",
        street: end.street,
        city: end.city,
        province: end.province,
        postalCode: end.postalCode,
        country: end.country,
        lat: end.lat,
        lng: end.lng
      }
    ].filter((point) => point.address || point.label);
  }

  function navigationUrl(points, preference = navigatorPreference()) {
    if (preference === "apple") return appleMapsUrl(points);
    return googleMapsUrl(points);
  }

  function googleMapsUrl(points) {
    if (points.length === 1) return googleDestinationUrl(points[0]);
    const origin = points[0];
    const destination = points[points.length - 1];
    const waypoints = points.slice(1, -1).map(pointAddress).filter(Boolean);
    const url = new URL("https://www.google.com/maps/dir/");
    url.searchParams.set("api", "1");
    url.searchParams.set("travelmode", "driving");
    url.searchParams.set("origin", pointAddress(origin));
    url.searchParams.set("destination", pointAddress(destination));
    if (waypoints.length) url.searchParams.set("waypoints", waypoints.join("|"));
    return escapeHtml(url.toString());
  }

  function googleDestinationUrl(point) {
    const url = new URL("https://www.google.com/maps/dir/");
    url.searchParams.set("api", "1");
    url.searchParams.set("travelmode", "driving");
    url.searchParams.set("destination", pointAddress(point));
    return escapeHtml(url.toString());
  }

  function appleMapsUrl(points) {
    const url = new URL("https://maps.apple.com/");
    if (points.length === 1) {
      url.searchParams.set("daddr", pointAddress(points[0]));
      url.searchParams.set("dirflg", "d");
      return escapeHtml(url.toString());
    }
    url.searchParams.set("saddr", pointAddress(points[0]));
    url.searchParams.set("daddr", points.slice(1).map(pointAddress).filter(Boolean).join(" to:"));
    url.searchParams.set("dirflg", "d");
    return escapeHtml(url.toString());
  }

  function pointAddress(point) {
    const structured = [
      point.street,
      [point.postalCode, point.city].filter(Boolean).join(" "),
      point.province,
      point.country || "Italia"
    ].filter(Boolean).join(", ");
    return structured || point.address || point.label || "";
  }

  function resultKey(result) {
    const rows = result.rows || [];
    return [
      result.generatedAt || "",
      result.manualOrder ? "manual" : "auto",
      rows.map((row) => row.stopUid || row.address || row.customer).join(">")
    ].join("|");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  document.addEventListener("change", (event) => {
    if (event.target?.id === "navigator-preference-inline" || event.target?.id === "navigator-preference-settings") {
      setNavigatorPreference(event.target.value);
    }
  });

  const observer = new MutationObserver(injectRoutePanel);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const settingsObserver = new MutationObserver(injectNavigatorSettings);
  settingsObserver.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("load", injectNavigatorSettings);
})();