import dotenv from "dotenv";
// vorher: dotenv.config();
dotenv.config({ override: true }); // <-- .env-Werte überschreiben bestehende ENV



// server.js (ESM)
// Voraussetzungen: package.json mit { "type": "module" }
// .env: PAYPAL_*, SMTP_*, MAIL_FROM usw.

import express from "express";
import fetch from "node-fetch";            // (ok, auch auf Node >=18)
import dotenv from "dotenv";
import nodemailer from "nodemailer";

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static("public"));         // /public für index.html, script.js, css …

/* ===================== PayPal ===================== */
const MODE = process.env.PAYPAL_MODE === "live" ? "live" : "sandbox";
const PAYPAL_API =
  MODE === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;

/* ===================== Preise / Tickets ===================== */
const PRICE_EUR = 20.0;
const MAX_QTY = 20;
const clampQty = (q) => {
  const n = parseInt(q, 10);
  if (Number.isNaN(n)) return 1;
  return Math.max(1, Math.min(MAX_QTY, n));
};

/* ===================== SMTP (ALL-INKL / KAS) ===================== */
/*
  Beispiel .env (ALL-INKL):
  SMTP_HOST=w01aa1bb.kasserver.com
  SMTP_PORT=587
  SMTP_SECURE=false
  SMTP_USER=m06XXXXX            # KAS Mailbox-Login (nicht die E-Mail!)
  SMTP_PASS=DEIN_POSTFACH_PASS
  MAIL_FROM=info@happiness-ev.com
  SMTP_AUTH=LOGIN               # optional: LOGIN (Standard) oder PLAIN

  Für SSL direkt:
  SMTP_PORT=465
  SMTP_SECURE=true
*/
const secureFlag = String(process.env.SMTP_SECURE).toLowerCase() === "true";
const smtpAuthMethod = (process.env.SMTP_AUTH || "LOGIN").toUpperCase();

console.log(
  "SMTP cfg => host=%s port=%s secure=%s user=%s auth=%s",
  process.env.SMTP_HOST,
  process.env.SMTP_PORT,
  process.env.SMTP_SECURE,
  process.env.SMTP_USER,
  smtpAuthMethod
);
console.log("MAIL_FROM =", process.env.MAIL_FROM || process.env.SMTP_USER);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || (secureFlag ? 465 : 587)),
  secure: secureFlag,                 // true -> 465 (SSL), false -> 587 (STARTTLS)
  requireTLS: !secureFlag,            // STARTTLS nur bei 587 erzwingen
  auth: {
    user: process.env.SMTP_USER,      // ALL-INKL: m06… Login (nicht die E-Mail!)
    pass: process.env.SMTP_PASS
  },
  authMethod: smtpAuthMethod,
  logger: true,
  debug: true,
  // tls: { rejectUnauthorized: false } // nur falls Zertifikat-Probleme auftreten
});

// SMTP beim Start prüfen – zeigt exakte Ursache, falls Login/Port/TLS falsch ist
transporter.verify((err, ok) => {
  if (err) console.error("SMTP verify failed:", err);
  else console.log("SMTP ready:", ok);
});

/* ===================== PayPal Helper ===================== */
async function getAccessToken() {
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error("PayPal OAuth fehlgeschlagen: " + (await res.text()));
  const data = await res.json();
  return data.access_token;
}

/* ===================== API: Order anlegen ===================== */
app.post("/create-order", async (req, res) => {
  try {
    const quantity = clampQty(req.body?.quantity);
    const total = (quantity * PRICE_EUR).toFixed(2);
    const accessToken = await getAccessToken();

    const body = {
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: "EUR",
            value: total,
            breakdown: { item_total: { currency_code: "EUR", value: total } },
          },
          items: [
            {
              name: "Ticket",
              quantity: String(quantity),
              unit_amount: { currency_code: "EUR", value: PRICE_EUR.toFixed(2) },
            },
          ],
          description: "Tickets",
        },
      ],
    };

    const r = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
    const order = await r.json();
    if (!r.ok || !order.id) return res.status(400).json(order);
    res.json({ id: order.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "create-order failed" });
  }
});

/* ===================== API: Capture + Mail senden ===================== */
app.post("/capture-order", async (req, res) => {
  try {
    const { orderID, vorname, nachname, alter, email, quantity } = req.body;
    const qty = clampQty(quantity);
    const expectedTotal = (qty * PRICE_EUR).toFixed(2);

    const accessToken = await getAccessToken();
    const capRes = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderID}/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    });
    const capture = await capRes.json();
    if (!capRes.ok) return res.status(400).json(capture);

    const ticketNumber =
      capture?.purchase_units?.[0]?.payments?.captures?.[0]?.id || orderID;

    // Optional: Plausibilitätscheck Betrag
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
      from: process.env.MAIL_FROM || process.env.SMTP_USER, // Fallback
      to: email,
      subject: `Deine Tickets (${ticketNumber})`,
      html,
    });
    console.log("Mail sent:", info.messageId, info.response);

    res.json({ ticketNumber, mailed: true });
  } catch (e) {
    console.error("capture-order failed:", e);
    res.status(500).json({ error: String(e?.message || e), mailed: false });
  }
});

/* ===================== Diagnose: Test-Mail ohne PayPal ===================== */
app.post("/test-email", async (req, res) => {
  try {
    const { to } = req.body;
    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to,
      subject: "Testmail – Ticket-App",
      text: "Wenn du das lesen kannst, funktioniert SMTP ✓",
    });
    res.json({ ok: true, messageId: info.messageId });
  } catch (e) {
    console.error("Test mail failed:", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/* ===================== Healthcheck ===================== */
app.get("/health", (_req, res) => {
  res.json({ ok: true, mode: MODE });
});

/* ===================== Start ===================== */
app.listen(3000, () => {
  console.log("Server läuft auf http://localhost:3000 (Mode:", MODE, ")");
});
