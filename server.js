import express from "express";
import fetch from "node-fetch";         // Bei Node 18+ ist fetch global; hier ist es ok
import dotenv from "dotenv";
import nodemailer from "nodemailer";
dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static("public"));

/* ---------- PayPal Grunddaten ---------- */
const MODE = process.env.PAYPAL_MODE === "live" ? "live" : "sandbox";
const PAYPAL_API =
  MODE === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;

/* ---------- Preis-Logik ---------- */
const PRICE_EUR = 20.00;
const MAX_QTY = 20;
const clampQty = (q) => {
  const n = parseInt(q, 10);
  if (Number.isNaN(n)) return 1;
  return Math.max(1, Math.min(MAX_QTY, n));
};

/* ---------- Mailer (Strato / STARTTLS) ---------- */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,           // 587 = STARTTLS → secure:false
  requireTLS: true,        // STARTTLS erzwingen
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// SMTP beim Start prüfen
transporter.verify((err, ok) => {
  if (err) console.error("SMTP verify failed:", err.message || err);
  else console.log("SMTP ready:", ok);
});

/* ---------- PayPal Helper ---------- */
async function getAccessToken() {
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": "Basic " + Buffer
        .from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error("PayPal OAuth fehlgeschlagen: " + await res.text());
  const data = await res.json();
  return data.access_token;
}

/* ---------- API: Order anlegen ---------- */
app.post("/create-order", async (req, res) => {
  try {
    const quantity = clampQty(req.body?.quantity);
    const total = (quantity * PRICE_EUR).toFixed(2);
    const accessToken = await getAccessToken();

    const body = {
      intent: "CAPTURE",
      purchase_units: [{
        amount: {
          currency_code: "EUR",
          value: total,
          breakdown: { item_total: { currency_code: "EUR", value: total } }
        },
        items: [{
          name: "Ticket",
          quantity: String(quantity),
          unit_amount: { currency_code: "EUR", value: PRICE_EUR.toFixed(2) }
        }],
        description: "Tickets"
      }]
    };

    const r = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${accessToken}` },
      body: JSON.stringify(body)
    });
    const order = await r.json();
    if (!r.ok || !order.id) return res.status(400).json(order);
    res.json({ id: order.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "create-order failed" });
  }
});

/* ---------- API: Capture + Mail senden ---------- */
app.post("/capture-order", async (req, res) => {
  try {
    const { orderID, vorname, nachname, alter, email, quantity } = req.body;
    const qty = clampQty(quantity);
    const expectedTotal = (qty * PRICE_EUR).toFixed(2);

    const accessToken = await getAccessToken();
    const capRes = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderID}/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${accessToken}` }
    });
    const capture = await capRes.json();
    if (!capRes.ok) return res.status(400).json(capture);

    const ticketNumber =
      capture?.purchase_units?.[0]?.payments?.captures?.[0]?.id || orderID;

    // Optional Plausibilitätscheck
    const paid = capture?.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value;
    if (paid && Number(paid).toFixed(2) !== expectedTotal) {
      console.warn("Warnung: bezahlter Betrag weicht ab:", paid, "≠", expectedTotal);
    }

    // Mailtext
    const html = `
      <p>Hallo ${vorname} ${nachname},</p>
      <p>vielen Dank für deinen Kauf.</p>
      <p><strong>Ticketnummer:</strong> ${ticketNumber}<br>
         <strong>Anzahl:</strong> ${qty}<br>
         <strong>Gesamt:</strong> ${expectedTotal} €</p>
      <p>Viel Spaß beim Event!</p>
    `;

    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,  // Fail-safe
      to: email,
      subject: `Deine Tickets (${ticketNumber})`,
      html
    });
    console.log("Mail sent:", info.messageId, info.response);

    res.json({ ticketNumber, mailed: true });
  } catch (e) {
    console.error("capture-order failed:", e);
    res.status(500).json({ error: String(e?.message || e), mailed: false });
  }
});

/* ---------- Diagnose: Test-Mail ohne PayPal ---------- */
app.post("/test-email", async (req, res) => {
  try {
    const { to } = req.body;
    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to,
      subject: "Testmail – Ticket-App",
      text: "Wenn du das lesen kannst, funktioniert SMTP ✓"
    });
    res.json({ ok: true, messageId: info.messageId });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.listen(3000, () => {
  console.log("Server läuft auf http://localhost:3000 (Mode:", MODE, ")");
});
