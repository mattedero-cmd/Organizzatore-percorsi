(function () {
  const filterState = {
    name: "",
    city: "",
    showAll: false
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

  function archiveCards(panel) {
    return [...(panel?.querySelectorAll(".archive-card") || [])];
  }

  function cardText(card) {
    return normalize(card.textContent || "");
  }

  function applyFilters() {
    const panel = archivePanel();
    if (!panel) return;

    const cards = archiveCards(panel);
    const hasFilter = Boolean(filterState.name || filterState.city || filterState.showAll);
    let visible = 0;

    cards.forEach((card) => {
      const text = cardText(card);
      const matchesName = !filterState.name || text.includes(normalize(filterState.name));
      const matchesCity = !filterState.city || text.includes(normalize(filterState.city));
      const show = hasFilter && matchesName && matchesCity;
      card.hidden = !show;
      if (show) visible += 1;
    });

    let empty = panel.querySelector("#archive-filter-lite-empty");
    if (!empty) {
      empty = document.createElement("div");
      empty.id = "archive-filter-lite-empty";
      empty.className = "empty";
      panel.querySelector(".archive-list")?.prepend(empty);
    }
    empty.textContent = hasFilter
      ? "Nessun indirizzo trovato con questi filtri."
      : "Cerca per cliente, attivita, locale o citta. La lista resta chiusa per rendere l'archivio piu leggero da usare.";
    empty.hidden = hasFilter && visible > 0;

    const count = panel.querySelector("#archive-filter-lite-count");
    if (count) {
      count.textContent = hasFilter
        ? `${visible} risultati su ${cards.length} contatti`
        : `${cards.length} contatti salvati`;
    }
  }

  function mountArchiveFilters() {
    const panel = archivePanel();
    if (!panel) return;

    const originalSearch = panel.querySelector("#archive-search");
    if (!originalSearch) return;
    originalSearch.placeholder = "Es. Fineco, Mediolanum...";
    originalSearch.value = filterState.name;

    if (!panel.querySelector("#archive-filter-lite-city")) {
      const cityInput = document.createElement("input");
      cityInput.id = "archive-filter-lite-city";
      cityInput.placeholder = "Citta o sede, es. Trento";
      cityInput.autocomplete = "off";

      const toolbar = document.createElement("div");
      toolbar.className = "row wrap";
      toolbar.style.marginTop = "10px";
      toolbar.innerHTML = `
        <div id="archive-filter-lite-count" class="stop-meta" style="flex:1 1 190px;font-weight:800;"></div>
        <button class="btn ghost" type="button" id="archive-filter-lite-show-all">Mostra tutti</button>
        <button class="btn ghost" type="button" id="archive-filter-lite-clear">Pulisci filtri</button>
      `;

      originalSearch.insertAdjacentElement("afterend", cityInput);
      panel.querySelector(".row.wrap")?.insertAdjacentElement("afterend", toolbar);
    }

    const cityInput = panel.querySelector("#archive-filter-lite-city");
    if (cityInput) cityInput.value = filterState.city;
    applyFilters();
  }

  document.addEventListener("input", (event) => {
    if (event.target.id === "archive-search") {
      event.stopImmediatePropagation();
      filterState.name = event.target.value;
      filterState.showAll = false;
      applyFilters();
    }

    if (event.target.id === "archive-filter-lite-city") {
      event.stopImmediatePropagation();
      filterState.city = event.target.value;
      filterState.showAll = false;
      applyFilters();
    }
  }, true);

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-tab='archive']")) {
      window.setTimeout(mountArchiveFilters, 80);
    }

    if (event.target.closest("#archive-filter-lite-show-all")) {
      filterState.name = "";
      filterState.city = "";
      filterState.showAll = true;
      mountArchiveFilters();
    }

    if (event.target.closest("#archive-filter-lite-clear")) {
      filterState.name = "";
      filterState.city = "";
      filterState.showAll = false;
      mountArchiveFilters();
    }
  });

  window.addEventListener("load", () => window.setTimeout(mountArchiveFilters, 200));
})();
