// --- Konfiguration ---
const PRICE_EUR = 20.00; // Preis pro Ticket in EUR
const MAX_QTY   = 20;    // max. Anzahl erlaubter Tickets

// Mini-Helper
const $ = (id) => document.getElementById(id);
const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v || "").trim());
const sanitizeQty = (v) => {
  const n = parseInt(String(v).replace(/[^\d]/g, ""), 10);
  if (Number.isNaN(n)) return 1;
  return Math.max(1, Math.min(MAX_QTY, n));
};
const eur = (x) => x.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

// Live-Update der Gesamtsumme (falls #qty / #total existieren)
function updateTotal() {
  if (!$("#qty") || !$("#total")) return;
  const q = sanitizeQty($("#qty").value);
  $("#qty").value = q;
  $("#total").textContent = eur(q * PRICE_EUR);
}
if ($("#qty") && $("#total")) {
  $("#qty").addEventListener("input", updateTotal);
  updateTotal();
}

// Form-Validierung
function formValid() {
  const vorname = ($("#vorname")?.value || "").trim();
  const nachname = ($("#nachname")?.value || "").trim();
  const alter = parseInt($("#alter")?.value, 10);
  const email = ($("#email")?.value || "").trim();
  const qty = sanitizeQty($("#qty")?.value);

  if (!vorname || !nachname) return false;
  if (!Number.isFinite(alter) || alter < 0 || alter > 120) return false;
  if (!validEmail(email)) return false;
  if (!qty || qty < 1) return false;
  return true;
}

// Feedback-Helfer
function showMsg(html) {
  if ($("#msg")) { $("#msg").innerHTML = html; }
  else { alert(html.replace(/<[^>]+>/g, "")); }
}

// --- PayPal Buttons (Server-Variante) ---
paypal.Buttons({
  style: { layout: "vertical", color: "gold", shape: "rect", label: "paypal" },

  onClick: (data, actions) => {
    if (!formValid()) {
      alert("Bitte alle Felder korrekt ausfüllen (Vorname, Nachname, Alter, E-Mail, Anzahl).");
      return actions.reject();
    }
    return actions.resolve();
  },

  // Bestellung serverseitig erstellen (Manipulationsschutz)
  createOrder: () => {
    const quantity = sanitizeQty($("#qty")?.value);
    return fetch("/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity })
    })
    .then(res => {
      if (!res.ok) throw new Error("create-order fehlgeschlagen");
      return res.json();
    })
    .then(data => data.id);
  },

  // Zahlung genehmigt -> Server capturen + Ticketmail senden
  onApprove: (data) => {
    const payload = {
      orderID: data.orderID,
      vorname: ($("#vorname")?.value || "").trim(),
      nachname: ($("#nachname")?.value || "").trim(),
      alter: ($("#alter")?.value || "").trim(),
      email: ($("#email")?.value || "").trim(),  // muss NICHT = PayPal-Mail sein
      quantity: sanitizeQty($("#qty")?.value)
    };

    return fetch("/capture-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    .then(async (res) => {
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result?.error || "capture-order fehlgeschlagen");
      if (!result.ticketNumber) throw new Error("Keine Ticketnummer erhalten.");
      showMsg(
        "✅ Zahlung erfolgreich!<br>" +
        "Ticketnummer: <strong>" + result.ticketNumber + "</strong><br>" +
        "Tickets: " + payload.quantity + " × " + eur(PRICE_EUR) + " = <strong>" + eur(payload.quantity * PRICE_EUR) + "</strong><br>" +
        "Bestätigung an: <strong>" + payload.email + "</strong>"
      );
    })
    .catch((err) => {
      console.error(err);
      alert("❌ Fehler beim Abschluss / Mailversand: " + (err?.message || err));
    });
  },

  onError: (err) => {
    console.error(err);
    alert("❌ PayPal-Fehler. Bitte erneut versuchen.");
  }
}).render("#paypal-button-container");
