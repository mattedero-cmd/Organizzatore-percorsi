(function () {
  let addresses = [];
  let editAddressId = null;
  let scheduled = false;

  function showToast(message) {
    const toast = document.querySelector("#toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 3000);
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

  function normalizePhone(value) {
    return String(value || "").replace(/[^\d+]/g, "");
  }

  function extractEmail(text) {
    return String(text || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
  }

  function extractPhone(text) {
    const raw = String(text || "");
    const labelled = raw.match(/(?:tel|telefono|cell|cellulare)\s*:?\s*(\+?\d[\d\s./-]{5,}\d)/i);
    if (labelled) return labelled[1].trim();
    const cleaned = raw.replace(/^\s*\d+(?:\+\d+)?\s+/, "");
    const candidates = cleaned.match(/\+?\d[\d\s./-]{5,}\d/g) || [];
    return candidates[candidates.length - 1]?.trim() || "";
  }

  function stripContactLines(notes) {
    return String(notes || "")
      .split(/\s+-\s+|\n/)
      .map((line) => line.trim())
      .filter((line) => line && !/^(tel|telefono|cell|cellulare|email|mail)\s*:/i.test(line))
      .join(" - ");
  }

  function contactMeta(address) {
    const notes = address?.notes || "";
    return {
      phone: address?.phone || extractPhone(notes),
      email: address?.email || extractEmail(notes)
    };
  }

  function notesWithContact(notes, phone, email) {
    return [
      stripContactLines(notes),
      phone ? `Tel: ${phone}` : "",
      email ? `Email: ${email}` : ""
    ].filter(Boolean).join(" - ");
  }

  function form() {
    return document.querySelector("#address-form");
  }

  function ensureFields() {
    const currentForm = form();
    if (!currentForm || currentForm.querySelector("#contact-lite-phone")) return;

    const notes = currentForm.querySelector("[name='notes']");
    const anchor = notes?.closest(".field") || currentForm.querySelector(".form-grid")?.lastElementChild;
    if (!anchor) return;

    const phoneField = document.createElement("label");
    phoneField.className = "field";
    phoneField.innerHTML = `
      Telefono
      <input id="contact-lite-phone" name="contactPhone" type="tel" autocomplete="tel" />
    `;

    const emailField = document.createElement("label");
    emailField.className = "field";
    emailField.innerHTML = `
      Email
      <input id="contact-lite-email" name="contactEmail" type="email" autocomplete="email" />
    `;

    anchor.insertAdjacentElement("afterend", emailField);
    anchor.insertAdjacentElement("afterend", phoneField);
    fillFieldsFromCurrentAddress();
  }

  function fillFieldsFromCurrentAddress() {
    const currentForm = form();
    if (!currentForm) return;
    const phoneInput = currentForm.querySelector("#contact-lite-phone");
    const emailInput = currentForm.querySelector("#contact-lite-email");
    if (!phoneInput || !emailInput) return;

    const current = addresses.find((item) => String(item.id) === String(editAddressId));
    const notes = currentForm.querySelector("[name='notes']")?.value || current?.notes || "";
    const meta = contactMeta(current || { notes });
    phoneInput.value = meta.phone || "";
    emailInput.value = meta.email || "";
  }

  function enhanceCards() {
    const cards = [...document.querySelectorAll(".archive-card")];
    cards.forEach((card) => {
      if (card.querySelector("[data-contact-lite-actions]")) return;
      const id = card.querySelector("[data-edit-address]")?.dataset.editAddress;
      const address = addresses.find((item) => String(item.id) === String(id));
      if (!address) return;
      const { phone, email } = contactMeta(address);
      if (!phone && !email) return;

      const actions = card.querySelector(".actions");
      if (!actions) return;
      const quick = document.createElement("div");
      quick.className = "actions";
      quick.dataset.contactLiteActions = "1";
      quick.style.marginTop = "8px";
      quick.innerHTML = `
        ${phone ? `<a class="btn ghost" href="tel:${normalizePhone(phone)}">Chiama</a>` : ""}
        ${email ? `<a class="btn ghost" href="mailto:${email}">Email</a>` : ""}
      `;
      actions.insertAdjacentElement("beforebegin", quick);
    });
  }

  async function refreshAddresses() {
    try {
      const payload = await api("/api/addresses");
      addresses = Array.isArray(payload) ? payload : [];
    } catch (error) {
      console.warn(error);
    }
  }

  function scheduleEnhance() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(async () => {
      scheduled = false;
      if (!addresses.length) await refreshAddresses();
      ensureFields();
      enhanceCards();
    });
  }

  document.addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit-address]");
    if (edit) {
      editAddressId = edit.dataset.editAddress;
      window.setTimeout(() => {
        ensureFields();
        fillFieldsFromCurrentAddress();
      }, 150);
      return;
    }

    if (event.target.closest("#new-address") || event.target.closest("#reset-address-form")) {
      editAddressId = null;
      window.setTimeout(() => {
        ensureFields();
        fillFieldsFromCurrentAddress();
      }, 150);
    }
  }, true);

  document.addEventListener("submit", async (event) => {
    const currentForm = event.target.closest("#address-form");
    if (!currentForm) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const values = Object.fromEntries(new FormData(currentForm).entries());
    const notes = notesWithContact(values.notes, values.contactPhone, values.contactEmail);
    const payload = {
      customer: values.customer,
      location: values.location,
      fullAddress: values.fullAddress,
      notes,
      openMorning: values.openMorning,
      closeMorning: values.closeMorning,
      openAfternoon: values.openAfternoon,
      closeAfternoon: values.closeAfternoon,
      defaultDuration: Number(values.defaultDuration || 45),
      lat: values.lat ? Number(values.lat) : null,
      lng: values.lng ? Number(values.lng) : null,
      phone: values.contactPhone || "",
      email: values.contactEmail || ""
    };

    try {
      if (editAddressId) {
        await api(`/api/addresses/${editAddressId}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await api("/api/addresses", { method: "POST", body: JSON.stringify(payload) });
      }
      showToast("Contatto salvato");
      window.setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      showToast(error.message);
    }
  }, true);

  window.addEventListener("load", async () => {
    await refreshAddresses();
    const app = document.querySelector("#app");
    if (app) new MutationObserver(scheduleEnhance).observe(app, { childList: true });
    window.setTimeout(scheduleEnhance, 250);
  });
})();
