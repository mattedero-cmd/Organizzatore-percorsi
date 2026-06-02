(function () {
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const url = String(args[0]?.url || args[0] || "");

    if (!/\/api\/routes\/\d+(\?|$)/.test(url) || !response.ok) {
      return response;
    }

    try {
      const data = await response.clone().json();
      const normalized = normalizeSavedRoute(data);
      return new Response(JSON.stringify(normalized), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    } catch {
      return response;
    }
  };

  function normalizeSavedRoute(route) {
    const rows = Array.isArray(route?.rows) ? route.rows : [];
    const lastRow = rows[rows.length - 1] || {};
    const finalLeg = route?.finalLeg || {};
    const summary = route?.summary || {};

    return {
      ...route,
      rows,
      weather: Array.isArray(route?.weather) ? route.weather : [],
      start: route?.start || {
        label: route?.startLabel || "Partenza",
        address: route?.startAddress || ""
      },
      end: route?.end || {
        label: route?.endLabel || "Arrivo",
        address: route?.endAddress || ""
      },
      finalLeg: {
        departureTime: finalLeg.departureTime || lastRow.serviceEndTime || lastRow.arrivalTime || "",
        driveMinutes: Number(finalLeg.driveMinutes || 0),
        km: Number(finalLeg.km || 0),
        arrivalTime: finalLeg.arrivalTime || finalLeg.departureTime || lastRow.serviceEndTime || ""
      },
      summary: {
        totalKm: Number(summary.totalKm ?? route?.totalKm ?? 0),
        totalDriveMinutes: Number(summary.totalDriveMinutes || 0),
        totalWorkMinutes: Number(summary.totalWorkMinutes || rows.reduce((total, row) => total + Number(row.durationMinutes || 0), 0)),
        dayStart: summary.dayStart || route?.startTime || "--:--",
        dayEnd: summary.dayEnd || finalLeg.arrivalTime || lastRow.serviceEndTime || "--:--",
        costKm: Number(summary.costKm || 0),
        costDrive: Number(summary.costDrive || 0),
        costWork: Number(summary.costWork || 0),
        totalCost: Number(summary.totalCost ?? route?.totalCost ?? 0),
        warnings: Array.isArray(summary.warnings) ? summary.warnings : []
      }
    };
  }
})();