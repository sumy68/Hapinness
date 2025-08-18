<script>
  const PRICE = 20.00;
  const $ = (id) => document.getElementById(id);

  function validEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
  function sanitizeQty(v){
    let n = parseInt(v,10);
    if (Number.isNaN(n)) n = 1;
    return Math.max(1, Math.min(20, n));
  }

  // Optional: Gesamtpreis-Anzeige aktualisieren (falls du ein #qty und #total hast)
  // $("#qty").addEventListener("input", () => { $("#total").textContent = (sanitizeQty($("#qty").value)*PRICE).toFixed(2) + " €"; });

  paypal.Buttons({
    style: { layout: "vertical", color: "gold", shape: "rect", label: "paypal" },

    onClick: (data, actions) => {
      const email = ($("#email")?.value || "").trim();
      const qty = sanitizeQty($("#qty")?.value || "1");
      if (!validEmail(email)) { alert("Bitte eine gültige E-Mail eingeben."); return actions.reject(); }
      if (qty < 1) { alert("Bitte mindestens 1 Ticket wählen."); return actions.reject(); }
      return actions.resolve();
    },

    // ⚠️ Clientseitige Demo — für Produktion besser serverseitig erstellen!
    createOrder: (data, actions) => {
      const qty = sanitizeQty($("#qty").value);
      const total = (qty * PRICE).toFixed(2);

      return actions.order.create({
        intent: "CAPTURE",
        purchase_units: [{
          amount: {
            currency_code: "EUR",
            value: total,
            breakdown: {
              item_total: { currency_code: "EUR", value: total }
            }
          },
          items: [{
            name: "Ticket",
            quantity: String(qty),
            unit_amount: { currency_code: "EUR", value: PRICE.toFixed(2) }
          }],
          description: "Tickets"
        }]
      });

      // 🔒 Servervariante (empfohlen):
      // return fetch("/create-order", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ quantity: qty }) })
      //   .then(r => r.json()).then(d => d.id);
    },

    onApprove: async (data, actions) => {
      try {
        // ⚠️ Clientseitig capturen (Demo). Serverseitig ist sicherer.
        const order = await actions.order.capture();

        const email = ($("#email")?.value || "").trim();
        const qty = sanitizeQty($("#qty")?.value || "1");
        const total = (qty * PRICE).toFixed(2);

        // Ticket ausstellen / E-Mail versenden (Server macht das)
        const res = await fetch("/issue-ticket", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            quantity: qty,
            total,
            orderID: order.id
          })
        });

        const result = await res.json();
        if (!res.ok) throw new Error(result?.error || "Serverfehler");
        alert(`✅ Zahlung ok. Ticket: ${result.ticketNo}\nGesamt: ${total} €\nE-Mail an: ${email}`);

        // 🔒 Empfohlen: Statt clientseitig zu capturen:
        // const res = await fetch("/capture-order", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ orderID: data.orderID, email, quantity: qty }) });
        // const result = await res.json(); if (!res.ok) throw new Error(result?.error || "Serverfehler");
        // alert(`✅ Ticket: ${result.ticketNumber}`);

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
