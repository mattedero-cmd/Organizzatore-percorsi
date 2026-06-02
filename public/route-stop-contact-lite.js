(function () {
  let addresses = [];
  let scheduled = false;

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[.,;:]/g, "")
      .trim();
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

  function contactMeta(address) {
    const notes = address?.notes || "";
    return {
      phone: address?.phone || extractPhone(notes),
      email: address?.email || extractEmail(notes)
    };
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function formatDateLabel(value) {
    const match = String(value || "").match(/\d{4}-\d{2}-\d{2}/);
    if (!match) return value || "giorno programmato";
    const date = new Date(`${match[0]}T12:00:00`);
    return new Intl.DateTimeFormat("it-IT", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric"
    }).format(date);
  }

  function routeDate() {
    const copy = document.querySelector(".section-copy")?.textContent || "";
    return copy.match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";
  }

  function stopLabelFromAddress(address) {
    return `${address?.customer || ""} ${address?.location || ""}`.replace(/\s+/g, " ").trim();
  }

  function findAddress({ address, label }) {
    const normalizedAddress = normalizeText(address);
    const normalizedLabel = normalizeText(label);
    return addresses.find((item) => normalizeText(item.fullAddress) === normalizedAddress)
      || addresses.find((item) => normalizedAddress && normalizeText(item.fullAddress).includes(normalizedAddress))
      || addresses.find((item) => normalizedLabel && normalizeText(stopLabelFromAddress(item)).includes(normalizedLabel))
      || null;
  }

  function mailHref({ email, label, dateValue, arrivalTime }) {
    const dateLabel = formatDateLabel(dateValue);
    const subject = `Appuntamento ${label} - ${dateLabel} ore ${arrivalTime}`;
    const body = [
      "Buongiorno,",
      "",
      `la avviso che sarò presso la vostra sede il giorno ${dateLabel} alle ore ${arrivalTime} per il lavoro: [compilare lavoro].`,
      "",
      "Cordiali saluti"
    ].join("\n");
    return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  function actionHtml({ phone, email, label, dateValue, arrivalTime }) {
    if (!phone && !email) return "";
    return `
      <div class="actions route-contact-actions" data-route-contact-actions="1">
        ${phone ? `<a class="btn ghost" href="tel:${normalizePhone(phone)}">Chiama</a>` : ""}
        ${email ? `<a class="btn ghost" href="${mailHref({ email, label, dateValue, arrivalTime })}">Email precompilata</a>` : ""}
      </div>
    `;
  }

  function enhanceTableRows(dateValue) {
    document.querySelectorAll(".table-wrap tbody tr").forEach((row) => {
      if (row.querySelector("[data-route-contact-actions]")) return;
      const cells = row.querySelectorAll("td");
      if (cells.length < 8 || cells[0]?.textContent.trim() === "F") return;

      const label = cells[1]?.textContent.replace(/\s+/g, " ").trim() || "cliente";
      const addressText = cells[2]?.textContent.trim() || "";
      const arrivalTime = cells[6]?.textContent.trim() || "--:--";
      const address = findAddress({ address: addressText, label });
      if (!address) return;

      const { phone, email } = contactMeta(address);
      const html = actionHtml({ phone, email, label, dateValue, arrivalTime });
      if (!html) return;
      cells[1].insertAdjacentHTML("beforeend", html);
    });
  }

  function arrivalFromMobileCard(card) {
    const labels = [...card.querySelectorAll(".metric-label")];
    const arrival = labels.find((item) => item.textContent.trim().toLowerCase() === "arrivo");
    return arrival?.parentElement?.querySelector("strong")?.textContent.trim() || "--:--";
  }

  function enhanceMobileCards(dateValue) {
    document.querySelectorAll(".mobile-result .card").forEach((card) => {
      if (card.querySelector("[data-route-contact-actions]")) return;
      const title = card.querySelector(".stop-title")?.textContent.replace(/^\s*\d+\.\s*/, "").trim() || "cliente";
      const addressText = card.querySelector(".stop-meta")?.textContent.trim() || "";
      const address = findAddress({ address: addressText, label: title });
      if (!address) return;

      const { phone, email } = contactMeta(address);
      const html = actionHtml({
        phone,
        email,
        label: title,
        dateValue,
        arrivalTime: arrivalFromMobileCard(card)
      });
      if (!html) return;
      card.insertAdjacentHTML("beforeend", html);
    });
  }

  async function refreshAddresses() {
    try {
      const response = await fetch("/api/addresses");
      const payload = await response.json();
      addresses = Array.isArray(payload) ? payload : [];
    } catch (error) {
      console.warn(error);
    }
  }

  async function enhance() {
    if (!document.querySelector(".mobile-result, .table-wrap")) return;
    if (!addresses.length) await refreshAddresses();
    const dateValue = routeDate();
    enhanceTableRows(dateValue);
    enhanceMobileCards(dateValue);
  }

  function scheduleEnhance() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(async () => {
      scheduled = false;
      await enhance();
    });
  }

  window.addEventListener("load", async () => {
    await refreshAddresses();
    const app = document.querySelector("#app");
    if (app) new MutationObserver(scheduleEnhance).observe(app, { childList: true, subtree: true });
    window.setTimeout(scheduleEnhance, 300);
  });
})();