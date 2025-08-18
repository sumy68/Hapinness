<script>
  // --- Konfiguration ---
  const PRICE_EUR = 20.00; // Preis pro Ticket in EUR
  const MAX_QTY   = 20;    // max. Anzahl erlaubter Tickets

  // Mini-Helper
  const $ = (id) => document.getElementById(id);
  const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v||"").trim());
  const sanitizeQty = (v) => {
    const n = parseInt(String(v).replace(/[^\d]/g, ""), 10);
    if (Number.isNaN(n)) return 1;
    return Math.max(1, Math.min(MAX_QTY, n));
  };
  const calcTotal = () => (sanitizeQty($("#qty")?.value) * PRICE_EUR).toFixed(2);

  // (Optional) Live-Update der Gesamtsumme, falls du ein #total-Element hast
  if ($("#qty") && $("#total")) {
    $("#qty").addEventListener("input", () => { $("#total").textContent = calcTotal() + " €"; });
    $("#total").textContent = calcTotal() + " €";
  }

  // PayPal-Buttons initialisieren (rein clientseitig)
  paypal.Buttons({
    style: { layout: "vertical", color: "gold", shape: "rect", label: "paypal" },

    // Vorprüfungen beim Klick (Form-Validierung)
    onClick: (data, actions) => {
      const email = ($("#email")?.value || "").trim();
      const qty   = sanitizeQty($("#qty")?.value);

      if (!validEmail(email)) {
        alert("Bitte eine gültige E-Mail eingeben.");
        return actions.reject();
      }
      if (!qty || qty < 1) {
        alert("Bitte mindestens 1 Ticket wählen.");
        return actions.reject();
      }
      return actions.resolve();
    },

    // Bestellung erstellen (Client)
    createOrder: (data, actions) => {
      const qty   = sanitizeQty($("#qty")?.value);
      const total = (qty * PRICE_EUR).toFixed(2);

      return actions.order.create({
        intent: "CAPTURE",
        purchase_units: [{
          description: `Happiness e.V. – Tickets (${qty} × ${PRICE_EUR.toFixed(2)} €)`,
          amount: {
            currency_code: "EUR",
            value: total,
            breakdown: {
              item_total: { currency_code: "EUR", value: total }
            }
          },
          items: [{
            name: "Happiness e.V. Ticket",
            quantity: String(qty),
            unit_amount: { currency_code: "EUR", value: PRICE_EUR.toFixed(2) }
          }]
        }]
      });
    },

    // Zahlung autorisiert → erfassen (Client)
    onApprove: async (data, actions) => {
      try {
        const details = await actions.order.capture(); // Zahlung capturen
        const payer   = details?.payer?.name?.given_name || "Kunde";
        const email   = ($("#email")?.value || "").trim();
        const qty     = sanitizeQty($("#qty")?.value);
        const total   = (qty * PRICE_EUR).toFixed(2);

        // ✅ Erfolgsmeldung (clientseitig)
        alert(`Vielen Dank, ${payer}! Ihre Zahlung über ${total} € war erfolgreich.\nBestell-Nr.: ${details.id}\nBestätigungs-E-Mail: ${email}`);

        // TODO (optional): Hier könntest du eine Bestätigungs-Mail mit einem
        // reinen Client-Dienst schicken (z. B. EmailJS/Formspree) oder einen
        // eigenen Backend-Endpunkt verwenden. Auf GitHub Pages gibt es KEIN Backend.
      } catch (err) {
        console.error(err);
        alert("❌ Fehler beim Abschluss. Bitte erneut versuchen.");
      }
    },

    onError: (err) => {
      console.error(err);
      alert("❌ PayPal-Fehler. Bitte erneut versuchen.");
    }
  }).render("#paypal-button-container");
</script>
