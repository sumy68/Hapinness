const PRICE = 20;

paypal.Buttons({
  createOrder: (data, actions) => {
    return actions.order.create({
      purchase_units: [{ amount: { value: PRICE.toFixed(2), currency_code: "EUR" } }]
    });
  },
  onApprove: async (data, actions) => {
    const order = await actions.order.capture();
    const email = document.getElementById("email").value;
    const res = await fetch("/issue-ticket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, orderID: order.id })
    });
    const result = await res.json();
    alert(res.ok ? `✅ Ticket: ${result.ticketNo}` : "❌ Fehler beim Ticketversand");
  }
}).render("#paypal-button-container");
