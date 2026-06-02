(function () {
  const state = {
    city: "",
    showAll: false,
    scheduled: false
  };

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function archivePanel() {
    const title = [...document.querySelectorAll("h2")]
      .find((item) => /Archivio indirizzi/i.test(item.textContent || ""));
    return title?.closest(".panel") || null;
  }

  function archiveSearch(panel) {
    return panel?.querySelector("#archive-search") || null;
  }

  function archiveCards(panel) {
    return [...(panel?.querySelectorAll(".archive-card") || [])];
  }

  function hasFilter(panel) {
    return Boolean(normalize(archiveSearch(panel)?.value) || normalize(state.city) || state.showAll);
  }

  function cardMatches(card, panel) {
    const text = normalize(card.textContent || "");
    const name = normalize(archiveSearch(panel)?.value);
    const city = normalize(state.city);
    return (!name || text.includes(name)) && (!city || text.includes(city));
  }

  function ensureControls(panel) {
    const row = panel.querySelector(".row.wrap");
    if (!row || panel.querySelector("#archive-filter-lite-city")) return;

    const city = document.createElement("input");
    city.id = "archive-filter-lite-city";
    city.placeholder = "Citta o sede, es. Trento";
    city.autocomplete = "off";
    city.value = state.city;
    row.insertAdjacentElement("afterend", city);

    const toolbar = document.createElement("div");
    toolbar.className = "archive-toolbar";
    toolbar.innerHTML = `
      <div id="archive-filter-lite-count" class="archive-count"></div>
      <button class="btn ghost" type="button" id="archive-filter-lite-show-all">Elenco completo</button>
      <button class="btn ghost" type="button" id="archive-filter-lite-clear">Pulisci filtri</button>
    `;
    city.insertAdjacentElement("afterend", toolbar);
  }

  function ensureEmpty(panel) {
    const list = panel.querySelector(".archive-list");
    if (!list) return null;
    let empty = panel.querySelector("#archive-filter-lite-empty");
    if (!empty) {
      empty = document.createElement("div");
      empty.id = "archive-filter-lite-empty";
      empty.className = "empty";
      list.prepend(empty);
    }
    return empty;
  }

  function applyArchiveFilter() {
    const panel = archivePanel();
    if (!panel) return;

    ensureControls(panel);

    const cards = archiveCards(panel);
    const active = hasFilter(panel);
    let visible = 0;

    cards.forEach((card) => {
      const show = active && cardMatches(card, panel);
      card.style.display = show ? "" : "none";
      if (show) visible += 1;
    });

    const empty = ensureEmpty(panel);
    if (empty) {
      empty.textContent = active
        ? "Nessun indirizzo trovato con questi filtri."
        : "Cerca per cliente, sede o citta. Oppure apri Elenco completo per vedere tutti i contatti con Modifica ed Elimina.";
      empty.style.display = active && visible > 0 ? "none" : "";
    }

    const count = panel.querySelector("#archive-filter-lite-count");
    if (count) {
      count.textContent = active
        ? `${visible} contatti visibili`
        : `${cards.length} contatti salvati`;
    }
  }

  function scheduleApply() {
    if (state.scheduled) return;
    state.scheduled = true;
    window.requestAnimationFrame(() => {
      state.scheduled = false;
      applyArchiveFilter();
    });
  }

  document.addEventListener("input", (event) => {
    if (event.target.id === "archive-filter-lite-city") {
      state.city = event.target.value;
      state.showAll = false;
      applyArchiveFilter();
      return;
    }

    if (event.target.id === "archive-search") {
      state.showAll = false;
      window.setTimeout(scheduleApply, 0);
    }
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-tab='archive']")) {
      window.setTimeout(scheduleApply, 120);
      return;
    }

    if (event.target.closest("#archive-filter-lite-show-all")) {
      state.city = "";
      state.showAll = true;
      const search = archiveSearch(archivePanel());
      if (search) {
        search.value = "";
        search.dispatchEvent(new Event("input", { bubbles: true }));
      }
      window.setTimeout(scheduleApply, 0);
      return;
    }

    if (event.target.closest("#archive-filter-lite-clear")) {
      state.city = "";
      state.showAll = false;
      const search = archiveSearch(archivePanel());
      if (search) {
        search.value = "";
        search.dispatchEvent(new Event("input", { bubbles: true }));
      }
      window.setTimeout(scheduleApply, 0);
    }
  });

  window.addEventListener("load", () => {
    const app = document.querySelector("#app");
    if (app) {
      new MutationObserver(scheduleApply).observe(app, { childList: true });
    }
    window.setTimeout(scheduleApply, 250);
  });
})();
