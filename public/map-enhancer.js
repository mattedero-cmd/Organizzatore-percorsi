(() => {
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
          window.setTimeout(injectRouteMap, 120);
        }
      } catch {
        // The original response still goes back to the app.
      }
    }

    return response;
  };

  function injectRouteMap() {
    if (!lastResult || !Array.isArray(lastResult.rows)) return;
    const app = document.querySelector("#app");
    if (!app || !/Risultato percorso/.test(app.textContent || "")) return;

    const anchor = document.querySelector("#manual-order-panel") || document.querySelector(".table-wrap") || document.querySelector(".mobile-result");
    if (!anchor) return;

    const key = resultKey(lastResult);
    const current = document.querySelector("#route-map-panel");
    if (current?.dataset.mapKey === key) return;

    const template = document.createElement("template");
    template.innerHTML = renderRouteMap(lastResult, key);
    const next = template.content.firstElementChild;

    if (current) {
      current.replaceWith(next);
      return;
    }

    anchor.insertAdjacentElement("beforebegin", next);
  }

  function resultKey(result) {
    const rows = result.rows || [];
    return [
      result.generatedAt || "",
      result.manualOrder ? "manual" : "auto",
      rows.map((row) => row.stopUid || row.address || row.customer).join(">")
    ].join("|");
  }

  function renderRouteMap(result, key) {
    const points = buildRoutePoints(result);
    if (points.length < 2) return "";
    lastRenderedKey = key;
    return `
      <section class="panel route-map-panel" id="route-map-panel" data-map-key="${escapeHtml(lastRenderedKey)}">
        <div class="section-head compact">
          <div>
            <h2>Mappa percorso</h2>
            <p class="section-copy">${points.length} punti · ${Number(result.summary?.totalKm || 0).toFixed(1)} km · arrivo ${escapeHtml(result.summary?.dayEnd || "--:--")}</p>
          </div>
          <a class="btn primary" href="${googleMapsUrl(points)}" target="_blank" rel="noopener">↗ Apri Maps</a>
        </div>
        <div class="route-map">
          ${renderRouteSvg(points)}
        </div>
        <div class="route-map-list">
          ${points.map((point, index) => `
            <div class="route-map-stop">
              <span class="route-map-bullet ${point.type}">${escapeHtml(point.shortLabel || String(index + 1))}</span>
              <div>
                <strong>${escapeHtml(point.label)}</strong>
                <span>${escapeHtml(point.address || "")}</span>
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
      {
        type: "start",
        shortLabel: "P",
        label: start.label || "Partenza",
        address: start.address || start.fullAddress || "",
        lat: start.lat,
        lng: start.lng
      },
      ...rows.map((row) => ({
        type: "stop",
        shortLabel: String(row.stopNumber || ""),
        label: `${row.customer || "Tappa"} ${row.location || ""}`.trim(),
        address: row.address || row.fullAddress || "",
        lat: row.lat,
        lng: row.lng
      })),
      {
        type: "end",
        shortLabel: "F",
        label: end.label || "Arrivo finale",
        address: end.address || end.fullAddress || "",
        lat: end.lat,
        lng: end.lng
      }
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

  function pointAddress(point) {
    return point.address || point.label || "";
  }

  function renderRouteSvg(points) {
    const width = 720;
    const height = 300;
    const padding = 34;
    const projected = projectRoutePoints(points, width, height, padding);
    const path = projected.map((point) => `${point.x},${point.y}`).join(" ");

    return `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Anteprima percorso">
        <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="8" class="route-map-bg"></rect>
        <polyline points="${path}" class="route-line"></polyline>
        ${projected.map((point, index) => `
          <g class="route-point">
            <circle cx="${point.x}" cy="${point.y}" r="${point.type === "stop" ? 14 : 16}" class="${point.type}"></circle>
            <text x="${point.x}" y="${point.y + 4}" text-anchor="middle">${escapeHtml(point.shortLabel || String(index + 1))}</text>
            <text x="${labelX(point.x, width)}" y="${labelY(point.y, height)}" text-anchor="${point.x > width - 160 ? "end" : "start"}" class="route-label">${escapeHtml(point.label)}</text>
          </g>
        `).join("")}
      </svg>
    `;
  }

  function projectRoutePoints(points, width, height, padding) {
    const coordinatePoints = points
      .map((point) => ({ ...point, lat: Number(point.lat), lng: Number(point.lng) }))
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));

    if (coordinatePoints.length >= 2) {
      const lats = coordinatePoints.map((point) => point.lat);
      const lngs = coordinatePoints.map((point) => point.lng);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      const latRange = maxLat - minLat || 0.01;
      const lngRange = maxLng - minLng || 0.01;

      return points.map((point, index) => {
        const lat = Number(point.lat);
        const lng = Number(point.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          return {
            ...point,
            x: padding + ((lng - minLng) / lngRange) * (width - padding * 2),
            y: height - padding - ((lat - minLat) / latRange) * (height - padding * 2)
          };
        }
        return schematicPoint(point, index, points.length, width, height, padding);
      });
    }

    return points.map((point, index) => schematicPoint(point, index, points.length, width, height, padding));
  }

  function schematicPoint(point, index, total, width, height, padding) {
    const usable = width - padding * 2;
    const step = total > 1 ? usable / (total - 1) : 0;
    const wave = index % 2 === 0 ? -34 : 34;
    return {
      ...point,
      x: padding + step * index,
      y: height / 2 + wave
    };
  }

  function labelX(x, width) {
    if (x > width - 160) return x - 20;
    return x + 20;
  }

  function labelY(y, height) {
    if (y < 48) return y + 38;
    if (y > height - 48) return y - 28;
    return y - 20;
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
