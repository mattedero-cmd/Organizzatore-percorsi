(() => {
  function enhanceSavedRoutes() {
    document.querySelectorAll(".saved-card").forEach((card) => {
      const openButton = card.querySelector("[data-open-route]");
      const actions = card.querySelector(".actions");
      if (!openButton || !actions || actions.querySelector("[data-delete-route]")) return;

      const routeId = openButton.dataset.openRoute;
      actions.insertAdjacentHTML("beforeend", `
        <button class="btn" data-rename-route="${escapeHtml(routeId)}">✎ Rinomina</button>
        <button class="btn danger" data-delete-route="${escapeHtml(routeId)}">× Elimina</button>
      `);
    });
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Operazione non riuscita");
    return data;
  }

  document.addEventListener("click", async (event) => {
    const renameButton = event.target.closest("[data-rename-route]");
    if (renameButton) {
      event.preventDefault();
      const card = renameButton.closest(".saved-card");
      const title = card?.querySelector(".stop-title");
      const nextName = window.prompt("Nuovo nome del giro", title?.textContent?.trim() || "Giro salvato");
      if (!nextName || !nextName.trim()) return;

      try {
        await requestJson(`/api/routes/${renameButton.dataset.renameRoute}`, {
          method: "PUT",
          body: JSON.stringify({ name: nextName.trim() })
        });
        if (title) title.textContent = nextName.trim();
        showToast("Giro rinominato");
      } catch (error) {
        showToast(error.message);
      }
      return;
    }

    const deleteButton = event.target.closest("[data-delete-route]");
    if (deleteButton) {
      event.preventDefault();
      const card = deleteButton.closest(".saved-card");
      const title = card?.querySelector(".stop-title")?.textContent?.trim() || "questo giro";
      if (!window.confirm(`Eliminare "${title}"?`)) return;

      try {
        await requestJson(`/api/routes/${deleteButton.dataset.deleteRoute}`, { method: "DELETE" });
        card?.remove();
        showToast("Giro eliminato");
      } catch (error) {
        showToast(error.message);
      }
    }
  });

  function showToast(message) {
    const toast = document.querySelector("#toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    window.setTimeout(() => toast.classList.remove("show"), 2400);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  const observer = new MutationObserver(enhanceSavedRoutes);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  enhanceSavedRoutes();
})();
