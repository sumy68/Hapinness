// mailTemplate.js (ESM)
const fmtEUR = (n) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
  
  export default function ticketMailTemplate({
    vorname = "",
    nachname = "",
    ticketNumber = "",
    quantity = 1,
    totalEUR = 0,
  }) {
    const fullName = [vorname, nachname].filter(Boolean).join(" ");
  
    return `<!doctype html>
  <html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="color-scheme" content="light only">
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Ihr Ticket – ${ticketNumber}</title>
    <style>
      body { margin:0; padding:0; background:#f6f7f9; font-family: Arial, Helvetica, sans-serif; color:#333; }
      .wrap { max-width:640px; margin:24px auto; background:#fff; border:1px solid #e6e8eb; border-radius:12px; overflow:hidden; }
      .hdr  { padding:20px 24px; background:#0b6b3a; color:#fff; }
      .hdr h1 { margin:0; font-size:20px; }
      .cnt  { padding:24px; }
      .ticket { background:#f8faf9; border:1px dashed #9bb7a6; padding:16px; border-radius:10px; margin:14px 0; }
      .row { margin:6px 0; }
      .lbl { display:inline-block; min-width:140px; color:#555; }
      .ftr  { padding:16px 24px; font-size:12px; color:#666; border-top:1px solid #e6e8eb; }
      .muted{ color:#666; }
      a { color:#0b6b3a; text-decoration:none; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="hdr">
        <h1>🎟️ Ihr Ticket – Happiness e.V.</h1>
      </div>
      <div class="cnt">
        <p>Hallo ${fullName || "Ticketkäufer/in"},</p>
        <p>vielen Dank für Ihren Kauf! Hier sind Ihre Bestelldaten:</p>
  
        <div class="ticket">
          <div class="row"><span class="lbl">Ticketnummer:</span> <strong>${ticketNumber}</strong></div>
          <div class="row"><span class="lbl">Anzahl:</span> ${quantity}</div>
          <div class="row"><span class="lbl">Gesamtbetrag:</span> <strong>${fmtEUR(totalEUR)}</strong></div>
        </div>
  
        <p>Bitte bringen Sie dieses Ticket (digital oder ausgedruckt) zur Veranstaltung mit.</p>
  
        <p class="muted">Diese E-Mail wurde automatisch erstellt. Antworten auf diese Nachricht werden nicht gelesen.</p>
      </div>
      <div class="ftr">
        Happiness e.V.
      </div>
    </div>
  </body>
  </html>`;
  }
  