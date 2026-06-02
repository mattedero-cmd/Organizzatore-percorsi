(function () {
  let scheduled = false;

  function savedPanel() {
    const title = [...document.querySelectorAll("h2")]
      .find((item) => /Giri salvati/i.test(item.textContent || ""));
    return title?.closest(".panel") || null;
  }

  function routeCards(panel) {
    return [...(panel?.querySelectorAll("[data-open-route]") || [])]
      .map((button) => button.closest(".saved-card, .card"))
      .filter(Boolean);
  }

  function routeId(card) {
    return card.querySelector("[data-open-route]")?.dataset.openRoute || "";
  }

  function routeName(card) {
    return card.querySelector(".stop-title")?.textContent?.trim() || "Giro salvato";
  }

  function refreshSavedRoutes() {
    const refresh = document.querySelector("#refresh-routes");
    if (refresh) {
      refresh.click();
      window.setTimeout(scheduleEnhance, 180);
    }
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Operazione non riuscita");
    return payload;
  }

  function enhanceSavedRoutes() {
    const panel = savedPanel();
    if (!panel) return;

    routeCards(panel).forEach((card) => {
      const id = routeId(card);
      const actions = card.querySelector(".actions");
      if (!id || !actions || actions.querySelector("[data-lite-rename-route]")) return;

      const rename = document.createElement("button");
      rename.className = "btn";
      rename.type = "button";
      rename.dataset.liteRenameRoute = id;
      rename.textContent = "Rinomina";

      const remove = document.createElement("button");
      remove.className = "btn danger";
      remove.type = "button";
      remove.dataset.liteDeleteRoute = id;
      remove.textContent = "Elimina";

      actions.append(rename, remove);
    });
  }

  function scheduleEnhance() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      enhanceSavedRoutes();
    });
  }

  document.addEventListener("click", async (event) => {
    if (event.target.closest("[data-tab='saved']")) {
      window.setTimeout(scheduleEnhance, 140);
      return;
    }

    const rename = event.target.closest("[data-lite-rename-route]");
    if (rename) {
      const card = rename.closest(".saved-card, .card");
      const currentName = routeName(card);
      const nextName = window.prompt("Nuovo nome del giro", currentName);
      if (!nextName?.trim()) return;
      try {
        await api(`/api/routes/${rename.dataset.liteRenameRoute}`, {
          method: "PUT",
          body: JSON.stringify({ name: nextName.trim() })
        });
        refreshSavedRoutes();
      } catch (error) {
        window.alert(error.message);
      }
      return;
    }

    const remove = event.target.closest("[data-lite-delete-route]");
    if (remove) {
      const card = remove.closest(".saved-card, .card");
      const currentName = routeName(card);
      if (!window.confirm(`Eliminare "${currentName}"?`)) return;
      try {
        await api(`/api/routes/${remove.dataset.liteDeleteRoute}`, { method: "DELETE" });
        card?.remove();
        refreshSavedRoutes();
      } catch (error) {
        window.alert(error.message);
      }
    }
  });

  window.addEventListener("load", () => {
    const app = document.querySelector("#app");
    if (app) new MutationObserver(scheduleEnhance).observe(app, { childList: true });
    window.setTimeout(scheduleEnhance, 250);
  });
})();
