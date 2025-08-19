// ------- Config & Helpers -------
const PRICE_EUR = 20.00;
const MAX_QTY   = 20;
const $  = (id) => document.getElementById(id);
const eur = (x) => Number(x).toLocaleString("de-DE",{ style:"currency", currency:"EUR" });
const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v||"").trim());
const clampQty = (v) => {
  let n = parseInt(v,10);
  if (Number.isNaN(n)) n = 1;
  return Math.max(1, Math.min(MAX_QTY, n));
};

function showMsg(text, type="info") {
  const box = $("msg");
  box.className = type;
  box.textContent = text;
  box.style.display = "block";
}

function formValid() {
  const vorname = $("vorname").value.trim();
  const nachname = $("nachname").value.trim();
  const geburtsdatum = $("geburtsdatum").value.trim();
  const email = $("email").value.trim();
  const qty = clampQty($("qty").value);
  return !!(vorname && nachname && geburtsdatum && validEmail(email) && qty >= 1);
}

function formPayload(quantityOnly=false) {
  const payload = {
    quantity: clampQty($("qty").value)
  };
  if (!quantityOnly) {
    Object.assign(payload, {
      vorname:  $("vorname").value.trim(),
      nachname: $("nachname").value.trim(),
      alter:    $("geburtsdatum").value.trim(), // optional fürs Logging
      email:    $("email").value.trim()
    });
  }
  return payload;
}

// Preis live anzeigen
$("qty").addEventListener("input", () => {
  const q = clampQty($("qty").value);
  $("qty").value = q;
  $("total").textContent = "Gesamt: " + eur(q * PRICE_EUR);
});

// ------- PayPal Buttons (Server Flow) -------
paypal.Buttons({
  style: { layout: "vertical", color: "gold", shape: "rect", label: "paypal" },

  onClick: (data, actions) => {
    if (!formValid()) {
      alert("Bitte alle Felder korrekt ausfüllen (Vorname, Nachname, Geburtsdatum, E-Mail, Anzahl).");
      return actions.reject();
    }
    showMsg("⏳ Bestellung wird erstellt ...", "info");
    return actions.resolve();
  },

  // 1) Order auf dem Server erstellen
  createOrder: () => {
    const payload = formPayload(true);
    return fetch("/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    .then(async (res) => {
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json?.error || json?.message || `HTTP ${res.status}`;
        showMsg("❌ Bestellung konnte nicht erstellt werden: " + msg, "error");
        throw new Error(msg);
      }
      const orderId = json?.id || json?.orderID;
      if (!orderId) {
        showMsg("❌ Unerwartete Server-Antwort: Keine Order-ID gefunden.", "error");
        throw new Error("No order id in response");
      }
      return orderId;
    })
    .catch((err) => {
      console.error("create-order error:", err);
      throw err;
    });
  },

  // 2) Nach Genehmigung: Server capturen + Mail versenden
  onApprove: (data) => {
    const payload = { orderID: data.orderID, ...formPayload(false) };
    return fetch("/capture-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    .then(async (res) => {
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = result?.error || result?.message || `HTTP ${res.status}`;
        showMsg("❌ Fehler beim Abschluss / Mailversand: " + msg, "error");
        throw new Error(msg);
      }
      if (!result.ticketNumber) {
        showMsg("❌ Abschluss ok, aber keine Ticketnummer erhalten.", "error");
        throw new Error("No ticketNumber");
      }
      showMsg(
        "✅ Zahlung erfolgreich!\n\n" +
        "Ticketnummer: " + result.ticketNumber + "\n" +
        "Tickets: " + payload.quantity + " × " + eur(PRICE_EUR) + " = " + eur(payload.quantity * PRICE_EUR) + "\n" +
        "Bestätigung an: " + payload.email,
        "success"
      );
    })
    .catch((err) => {
      console.error("capture-order error:", err);
      throw err;
    });
  },

  onError: (err) => {
    console.error("PayPal SDK error:", err);
    showMsg("❌ PayPal-Fehler. Bitte erneut versuchen.", "error");
  }
}).render("#paypal-button-container");
