(function () {
  const state = {
    mountedPanel: null,
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

  function addStyles() {
    if (document.querySelector("#archive-filter-enhancer-style")) return;
    const style = document.createElement("style");
    style.id = "archive-filter-enhancer-style";
    style.textContent = `
      .archive-filter-panel {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        padding: 12px;
        margin-bottom: 12px;
        border: 1px solid var(--line);
        border-radius: var(--radius);
        background: var(--surface-2);
      }

      .archive-filter-toolbar {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 9px;
        margin-bottom: 12px;
      }

      .archive-filter-count {
        min-height: 42px;
        display: inline-flex;
        align-items: center;
        flex: 1 1 210px;
        color: var(--muted);
        font-size: 0.88rem;
        font-weight: 800;
      }

      .archive-filter-hidden {
        display: none !important;
      }

      @media (max-width: 900px) {
        .archive-filter-panel {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.append(style);
  }

  function archivePanel() {
    const title = [...document.querySelectorAll("h2")]
      .find((item) => /Archivio indirizzi/i.test(item.textContent || ""));
    return title?.closest(".panel") || null;
  }

  function cardText(card) {
    return normalize(card.textContent || "");
  }

  function cardCityText(card) {
    const text = cardText(card);
    const pieces = text.split(/\s+/);
    return normalize([
      text,
      pieces.includes("tn") ? "trento tn" : "",
      pieces.includes("bz") ? "bolzano bz" : "",
      pieces.includes("vr") ? "verona vr" : ""
    ].join(" "));
  }

  function visibleCards(panel) {
    return [...panel.querySelectorAll(".archive-card")];
  }

  function applyFilters(panel) {
    if (!panel) return;
    const cards = visibleCards(panel);
    const hasFilter = Boolean(state.name || state.city || state.showAll);
    let visible = 0;

    cards.forEach((card) => {
      const matchesName = !state.name || cardText(card).includes(normalize(state.name));
      const matchesCity = !state.city || cardCityText(card).includes(normalize(state.city));
      const show = hasFilter && matchesName && matchesCity;
      card.classList.toggle("archive-filter-hidden", !show);
      if (show) visible += 1;
    });

    let empty = panel.querySelector("#archive-filter-empty");
    if (!empty) {
      empty = document.createElement("div");
      empty.id = "archive-filter-empty";
      empty.className = "empty";
      const list = panel.querySelector(".archive-list");
      list?.prepend(empty);
    }
    empty.textContent = hasFilter
      ? "Nessun indirizzo trovato con questi filtri."
      : "Cerca per cliente, attività, locale o città. La lista resta chiusa per rendere l'archivio più leggero da usare.";
    empty.hidden = hasFilter ? visible > 0 : false;

    const count = panel.querySelector("#archive-filter-count");
    if (count) {
      count.textContent = hasFilter
        ? `${visible} risultati su ${cards.length} contatti`
        : `${cards.length} contatti salvati`;
    }
  }

  function mountArchiveFilters() {
    addStyles();
    const panel = archivePanel();
    if (!panel || panel === state.mountedPanel && panel.querySelector("#archive-filter-name")) {
      if (panel) applyFilters(panel);
      return;
    }

    state.mountedPanel = panel;
    const originalRow = panel.querySelector(".row.wrap");
    const originalSearch = panel.querySelector("#archive-search");
    if (originalSearch) originalSearch.classList.add("archive-filter-hidden");

    const filterPanel = document.createElement("div");
    filterPanel.className = "archive-filter-panel";
    filterPanel.innerHTML = `
      <label class="field">
        Cliente, attività o locale
        <input id="archive-filter-name" value="${state.name.replaceAll('"', "&quot;")}" placeholder="Es. Fineco, Mediolanum, bar..." autocomplete="off" />
      </label>
      <label class="field">
        Città o sede
        <input id="archive-filter-city" value="${state.city.replaceAll('"', "&quot;")}" placeholder="Es. Trento, Rovereto..." autocomplete="off" />
      </label>
    `;

    const toolbar = document.createElement("div");
    toolbar.className = "archive-filter-toolbar";
    toolbar.innerHTML = `
      <div class="archive-filter-count" id="archive-filter-count"></div>
      <button class="btn ghost" type="button" id="archive-filter-show-all">Mostra tutti</button>
      <button class="btn ghost" type="button" id="archive-filter-clear">Pulisci filtri</button>
    `;

    panel.insertBefore(filterPanel, originalRow || panel.firstChild);
    if (originalRow) originalRow.insertAdjacentElement("afterend", toolbar);
    else filterPanel.insertAdjacentElement("afterend", toolbar);
    applyFilters(panel);
  }

  document.addEventListener("input", (event) => {
    if (event.target.id === "archive-filter-name") {
      state.name = event.target.value;
      state.showAll = false;
      applyFilters(archivePanel());
    }
    if (event.target.id === "archive-filter-city") {
      state.city = event.target.value;
      state.showAll = false;
      applyFilters(archivePanel());
    }
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest("#archive-filter-show-all")) {
      state.name = "";
      state.city = "";
      state.showAll = true;
      mountArchiveFilters();
      const nameInput = document.querySelector("#archive-filter-name");
      const cityInput = document.querySelector("#archive-filter-city");
      if (nameInput) nameInput.value = "";
      if (cityInput) cityInput.value = "";
      applyFilters(archivePanel());
    }
    if (event.target.closest("#archive-filter-clear")) {
      state.name = "";
      state.city = "";
      state.showAll = false;
      const nameInput = document.querySelector("#archive-filter-name");
      const cityInput = document.querySelector("#archive-filter-city");
      if (nameInput) nameInput.value = "";
      if (cityInput) cityInput.value = "";
      applyFilters(archivePanel());
    }
  });

  const observer = new MutationObserver(() => mountArchiveFilters());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("load", mountArchiveFilters);
})();