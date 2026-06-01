(() => {
  const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
  const nativeFetch = window.fetch.bind(window);
  let lastResult = null;
  let lastRenderedKey = "";
  let leafletPromise = null;
  let activeMap = null;

  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const url = String(args[0]?.url || args[0] || "");

    if (/\/api\/(plan|routes\/\d+)(\?|$)/.test(url)) {
      try {
        const data = await response.clone().json();
        if (data && Array.isArray(data.rows)) {
          lastResult = data;
          window.setTimeout(injectRouteMap, 120);
        }
      } catch {
        // The original response still goes back to the app.
      }
    }

    return response;
  };

  async function injectRouteMap() {
    if (!lastResult || !Array.isArray(lastResult.rows)) return;
    const app = document.querySelector("#app");
    if (!app || !/Risultato percorso/.test(app.textContent || "")) return;

    const anchor = document.querySelector("#manual-order-panel") || document.querySelector(".table-wrap") || document.querySelector(".mobile-result");
    if (!anchor) return;

    const points = buildRoutePoints(lastResult);
    if (points.length < 2) return;

    const key = resultKey(lastResult);
    const current = document.querySelector("#route-map-panel");
    if (current?.dataset.mapKey === key) return;

    const template = document.createElement("template");
    template.innerHTML = renderRouteMap(lastResult, points, key);
    const next = template.content.firstElementChild;

    if (current) current.replaceWith(next);
    else anchor.insertAdjacentElement("beforebegin", next);

    await renderLeafletMap(points);
  }

  async function renderLeafletMap(points) {
    const container = document.querySelector("#route-leaflet-map");
    if (!container) return;

    try {
      await ensureLeaflet();
      const shape = await requestRouteShape(points);
      const L = window.L;
      if (activeMap) {
        activeMap.remove();
        activeMap = null;
      }

      activeMap = L.map(container, {
        zoomControl: true,
        scrollWheelZoom: false,
        tap: true
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap"
      }).addTo(activeMap);

      const markerPoints = shape.points?.length ? shape.points : points;
      markerPoints.forEach((point, index) => {
        if (!isCoordinate(point)) return;
        const marker = L.marker([Number(point.lat), Number(point.lng)]).addTo(activeMap);
        marker.bindPopup(`<strong>${escapeHtml(point.label)}</strong><br>${escapeHtml(point.address || "")}<br><a href="${googleDestinationUrl(point)}" target="_blank" rel="noopener">Naviga</a>`);
        marker.bindTooltip(point.shortLabel || String(index + 1), { permanent: true, direction: "top", offset: [0, -10] });
      });

      const coordinates = Array.isArray(shape.coordinates) && shape.coordinates.length
        ? shape.coordinates
        : markerPoints.filter(isCoordinate).map((point) => [Number(point.lat), Number(point.lng)]);

      if (coordinates.length >= 2) {
        const line = L.polyline(coordinates, {
          color: "#20bdb2",
          weight: 6,
          opacity: 0.9
        }).addTo(activeMap);
        activeMap.fitBounds(line.getBounds(), { padding: [24, 24] });
      } else if (markerPoints.some(isCoordinate)) {
        const first = markerPoints.find(isCoordinate);
        activeMap.setView([Number(first.lat), Number(first.lng)], 12);
      }

      const status = document.querySelector("#route-map-status");
      if (status) status.textContent = shape.source === "mapquest" ? "Percorso stradale MapQuest" : "Percorso stimato su mappa";
    } catch (error) {
      const status = document.querySelector("#route-map-status");
      if (status) status.textContent = "Mappa non caricata";
      container.innerHTML = `<div class="map-error">Mappa non disponibile ora. Puoi comunque aprire il percorso con Maps.</div>`;
    }
  }

  function ensureLeaflet() {
    if (window.L) return Promise.resolve();
    if (leafletPromise) return leafletPromise;

    leafletPromise = new Promise((resolve, reject) => {
      if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = LEAFLET_CSS;
        document.head.appendChild(link);
      }

      const script = document.createElement("script");
      script.src = LEAFLET_JS;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Leaflet non caricato"));
      document.head.appendChild(script);
    });

    return leafletPromise;
  }

  async function requestRouteShape(points) {
    const response = await nativeFetch("/api/route-shape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points })
    });
    if (!response.ok) throw new Error("Percorso non disponibile");
    return response.json();
  }

  function resultKey(result) {
    const rows = result.rows || [];
    return [
      result.generatedAt || "",
      result.manualOrder ? "manual" : "auto",
      rows.map((row) => row.stopUid || row.address || row.customer).join(">")
    ].join("|");
  }

  function renderRouteMap(result, points, key) {
    lastRenderedKey = key;
    return `
      <section class="panel route-map-panel" id="route-map-panel" data-map-key="${escapeHtml(lastRenderedKey)}">
        <div class="section-head compact">
          <div>
            <h2>Mappa percorso</h2>
            <p class="section-copy"><span id="route-map-status">Carico mappa e percorso...</span> · ${Number(result.summary?.totalKm || 0).toFixed(1)} km · arrivo ${escapeHtml(result.summary?.dayEnd || "--:--")}</p>
          </div>
          <a class="btn primary" href="${googleMapsUrl(points)}" target="_blank" rel="noopener">↗ Apri Maps</a>
        </div>
        <div class="route-map real-map" id="route-leaflet-map"></div>
        <div class="route-map-list">
          ${points.map((point, index) => `
            <div class="route-map-stop">
              <span class="route-map-bullet ${point.type}">${escapeHtml(point.shortLabel || String(index + 1))}</span>
              <div>
                <strong>${escapeHtml(point.label)}</strong>
                <span>${escapeHtml(point.address || "")}</span>
                <div class="map-stop-actions">
                  <a class="btn tiny" href="${googleDestinationUrl(point)}" target="_blank" rel="noopener">Google</a>
                  <a class="btn tiny" href="${appleDestinationUrl(point)}" target="_blank" rel="noopener">Mappe</a>
                </div>
              </div>
            </div>
          `).join("")}
        </div>
      </section>
    `;
  }

  function buildRoutePoints(result) {
    const start = result.start || {};
    const end = result.end || {};
    const rows = Array.isArray(result.rows) ? result.rows : [];
    return [
      { type: "start", shortLabel: "P", label: start.label || "Partenza", address: start.address || start.fullAddress || "", lat: start.lat, lng: start.lng },
      ...rows.map((row) => ({ type: "stop", shortLabel: String(row.stopNumber || ""), label: `${row.customer || "Tappa"} ${row.location || ""}`.trim(), address: row.address || row.fullAddress || "", lat: row.lat, lng: row.lng })),
      { type: "end", shortLabel: "F", label: end.label || "Arrivo finale", address: end.address || end.fullAddress || "", lat: end.lat, lng: end.lng }
    ].filter((point) => point.address || point.label);
  }

  function googleMapsUrl(points) {
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

  function appleDestinationUrl(point) {
    const url = new URL("https://maps.apple.com/");
    url.searchParams.set("daddr", pointAddress(point));
    url.searchParams.set("dirflg", "d");
    return escapeHtml(url.toString());
  }

  function pointAddress(point) {
    return point.address || point.label || "";
  }

  function isCoordinate(point) {
    return Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  const observer = new MutationObserver(injectRouteMap);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
