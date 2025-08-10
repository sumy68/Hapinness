const PRICE_EUR = 20;
const form = document.getElementById("ticket-form");
const msgOk = document.getElementById("msg-ok");
const msgErr = document.getElementById("msg-err");

function getFormData() {
  const fd = new FormData(form);
  return Object.fromEntries(fd.entries());
}

paypal.Buttons({
  style: {
    shape: 'pill',
    color: 'gold',
    layout: 'vertical',
    label: 'paypal',
    height: 45
  },
  onInit: (data, actions) => {
    actions.disable();
    form.addEventListener("input", () => {
      form.checkValidity() ? actions.enable() : actions.disable();
    });
  },
  createOrder: (data, actions) => {
    const { qty } = getFormData();
    const total = (parseInt(qty, 10) * PRICE_EUR).toFixed(2);
    return actions.order.create({
      purchase_units: [
        { amount: { currency_code: "EUR", value: total } }
      ]
    });
  },
  onApprove: async (data, actions) => {
    try {
      const order = await actions.order.capture();
      const res = await fetch("/issue-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderID: order.id, form: getFormData() }),
      });
      if (!res.ok) throw new Error("Ticketversand fehlgeschlagen");
      msgOk.style.display = "block";
    } catch (err) {
      msgErr.style.display = "block";
    }
  }
}).render("#paypal-button-container");
