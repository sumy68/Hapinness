export default function ticketMailTemplate({ vorname, nachname, ticketNumber, quantity, totalEUR }) {
    return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5;color:#111">
      <h2>Danke für Ihren Kauf, ${vorname} ${nachname}!</h2>
      <p>Ihre Ticketnummer lautet: <strong>${ticketNumber}</strong></p>
      <p>Menge: <strong>${quantity}</strong><br>
         Gesamt: <strong>${totalEUR.toFixed(2)} €</strong></p>
      <p>Viel Spaß wünscht<br>Happiness e.V.</p>
    </div>`;
  }
  