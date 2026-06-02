(function () {
  const state = {
    importMounted: false,
    seeding: false,
    seeded: false
  };

  function showToast(message) {
    const toast = document.querySelector("#toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 3200);
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Errore richiesta");
    return payload;
  }

  function unescapeVcardValue(value) {
    return String(value || "")
      .replace(/\\n/gi, " ")
      .replace(/\\,/g, ",")
      .replace(/\\;/g, ";")
      .replace(/\s+/g, " ")
      .trim();
  }

  function readVcardField(card, field) {
    const match = card.match(new RegExp(`^${field}(?:;[^:]*)?:(.*)$`, "im"));
    return match ? unescapeVcardValue(match[1]) : "";
  }

  function readVcardAddress(card) {
    const raw = readVcardField(card, "ADR");
    if (!raw) return {};
    const parts = raw.split(";").map(unescapeVcardValue);
    return {
      street: parts[2] || "",
      city: parts[3] || "",
      province: parts[4] || "",
      postalCode: parts[5] || "",
      country: parts[6] || "Italia"
    };
  }

  function fullAddressFrom(contact) {
    return [
      contact.street,
      [contact.postalCode, contact.city].filter(Boolean).join(" "),
      contact.province,
      contact.country || "Italia"
    ].filter(Boolean).join(", ");
  }

  function parseVcardContacts(text) {
    return String(text || "")
      .split(/END:VCARD/i)
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => `${chunk}\nEND:VCARD`)
      .map((card) => {
        const name = readVcardField(card, "FN");
        const organization = readVcardField(card, "ORG");
        const address = readVcardAddress(card);
        return {
          customer: organization || name || "Contatto senza nome",
          location: address.city || "",
          fullAddress: fullAddressFrom(address),
          notes: [
            name && organization ? `Contatto: ${name}` : "",
            readVcardField(card, "TEL") ? `Tel: ${readVcardField(card, "TEL")}` : "",
            readVcardField(card, "EMAIL") ? `Email: ${readVcardField(card, "EMAIL")}` : ""
          ].filter(Boolean).join(" - ") || "Importato da rubrica",
          defaultDuration: 45
        };
      });
  }

  function parseCsvRows(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let index = 0; index < String(text || "").length; index += 1) {
      const char = text[index];
      if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) {
        row.push(cell.trim());
        cell = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        if (cell || row.length) rows.push([...row, cell.trim()]);
        row = [];
        cell = "";
      } else {
        cell += char;
      }
    }
    if (cell || row.length) rows.push([...row, cell.trim()]);
    return rows;
  }

  function normalizeHeader(value) {
    return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\W+/g, "");
  }

  function pick(record, names) {
    for (const name of names) {
      const value = record[normalizeHeader(name)];
      if (value) return value;
    }
    return "";
  }

  function parseCsvContacts(text) {
    const rows = parseCsvRows(text);
    if (rows.length < 2) return [];
    const headers = rows[0].map(normalizeHeader);
    return rows.slice(1).map((row) => {
      const record = Object.fromEntries(headers.map((header, index) => [header, row[index] || ""]));
      const street = pick(record, ["via", "street", "indirizzo via", "indirizzo"]);
      const city = pick(record, ["citta", "comune", "city"]);
      const province = pick(record, ["provincia", "province", "pr"]);
      const postalCode = pick(record, ["cap", "postalcode", "zip"]);
      const country = pick(record, ["nazione", "country"]) || "Italia";
      const fullAddress = pick(record, ["indirizzo completo", "fulladdress", "address"])
        || fullAddressFrom({ street, city, province, postalCode, country });
      return {
        customer: pick(record, ["attivita", "locale", "business", "azienda", "societa", "cliente", "nome", "name", "contatto"]) || "Contatto senza nome",
        location: pick(record, ["sede", "descrizione", "location"]) || city,
        fullAddress,
        notes: [
          pick(record, ["cliente", "nome", "name", "contatto"]) ? `Contatto: ${pick(record, ["cliente", "nome", "name", "contatto"])}` : "",
          pick(record, ["alias", "parole chiave", "keywords"]) ? `Alias: ${pick(record, ["alias", "parole chiave", "keywords"])}` : "",
          pick(record, ["telefono", "phone", "tel", "cellulare"]) ? `Tel: ${pick(record, ["telefono", "phone", "tel", "cellulare"])}` : "",
          pick(record, ["email", "mail"]) ? `Email: ${pick(record, ["email", "mail"])}` : "",
          pick(record, ["note", "notes"])
        ].filter(Boolean).join(" - ") || "Importato da CSV",
        defaultDuration: Number(pick(record, ["durata", "duration"]) || 45)
      };
    });
  }

  async function importContactsFile(file) {
    const text = await file.text();
    const contacts = file.name.toLowerCase().endsWith(".csv")
      ? parseCsvContacts(text)
      : parseVcardContacts(text);
    const existing = await api("/api/addresses");
    const existingKeys = new Set(existing.map((item) => `${item.customer}|${item.fullAddress}`.toLowerCase()));
    const importable = contacts.filter((contact) => contact.fullAddress);
    let imported = 0;
    for (const contact of importable) {
      const key = `${contact.customer}|${contact.fullAddress}`.toLowerCase();
      if (existingKeys.has(key)) continue;
      await api("/api/addresses", { method: "POST", body: JSON.stringify(contact) });
      existingKeys.add(key);
      imported += 1;
    }
    showToast(`Importati ${imported} contatti`);
    window.location.reload();
  }

  async function seedExcelArchive() {
    if (state.seeding || state.seeded) return;
    state.seeding = true;
    try {
      const [existing, seeds] = await Promise.all([
        api("/api/addresses"),
        fetch("/seed-addresses.json?v=20260602-3").then((response) => response.json())
      ]);
      const existingKeys = new Set(existing.map((item) => `${item.customer}|${item.fullAddress}`.toLowerCase()));
      let imported = 0;
      for (const seed of seeds) {
        const contact = {
          customer: seed.customer,
          location: seed.location,
          fullAddress: seed.fullAddress,
          notes: seed.notes || "",
          openMorning: seed.openMorning || "",
          closeMorning: seed.closeMorning || "",
          openAfternoon: seed.openAfternoon || "",
          closeAfternoon: seed.closeAfternoon || "",
          defaultDuration: seed.defaultDuration || 45,
          lat: seed.lat ?? null,
          lng: seed.lng ?? null
        };
        const key = `${contact.customer}|${contact.fullAddress}`.toLowerCase();
        if (existingKeys.has(key)) continue;
        await api("/api/addresses", { method: "POST", body: JSON.stringify(contact) });
        existingKeys.add(key);
        imported += 1;
      }
      state.seeded = true;
      if (imported > 0) {
        showToast(`Archivio Excel caricato: ${imported} clienti`);
        window.setTimeout(() => window.location.reload(), 900);
      }
    } catch (error) {
      console.warn(error);
    } finally {
      state.seeding = false;
    }
  }

  function mountImportButton() {
    const archiveTitle = [...document.querySelectorAll("h2")].find((title) => /Archivio indirizzi/i.test(title.textContent || ""));
    const row = archiveTitle?.parentElement?.querySelector(".row.wrap");
    if (!row || row.querySelector("#contacts-import-enhanced")) return;

    const label = document.createElement("label");
    label.className = "btn ghost";
    label.htmlFor = "contacts-import-enhanced";
    label.textContent = "Importa contatti";

    const input = document.createElement("input");
    input.id = "contacts-import-enhanced";
    input.type = "file";
    input.accept = ".vcf,.vcard,.csv,text/vcard,text/csv";
    input.hidden = true;
    input.addEventListener("change", () => {
      if (input.files?.[0]) importContactsFile(input.files[0]).catch((error) => showToast(error.message));
      input.value = "";
    });

    row.append(label, input);
    seedExcelArchive();
  }

  function focusAddressForm() {
    window.setTimeout(() => {
      const form = document.querySelector("#address-form");
      if (!form) return;
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      form.style.outline = "3px solid rgba(37, 99, 235, 0.35)";
      form.style.outlineOffset = "4px";
      window.setTimeout(() => {
        form.style.outline = "";
        form.style.outlineOffset = "";
      }, 1800);
      showToast("Scheda pronta per la modifica");
    }, 120);
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-edit-address]")) {
      focusAddressForm();
    }
  }, true);

  const observer = new MutationObserver(() => mountImportButton());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("load", mountImportButton);
})();