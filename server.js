// ===================== Setup =====================
import dotenv from "dotenv";
dotenv.config({ override: true });

import express from "express";
import fetch from "node-fetch";
import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from "url";
import ticketMailTemplate from "./mailTemplate.js";

// Pfade für static files
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // dient index.html, script.js, css …

// ===================== PayPal =====================
const MODE = (process.env.PAYPAL_MODE || "sandbox").toLowerCase() === "live" ? "live" : "sandbox";
const PAYPAL_API =
  MODE === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;

// ===================== Ticket Config =====================
const PRICE_EUR = 20.0;
const MAX_QTY = 20;
const clampQty = (q) => {
  const n = parseInt(q, 10);
  if (Number.isNaN(n)) return 1;
  return Math.max(1, Math.min(MAX_QTY, n));
};

// ===================== SMTP =====================
const secureFlag = String(process.env.SMTP_SECURE).toLowerCase() === "true";
const smtpAuthMethod = (process.env.SMTP_AUTH || "LOGIN").toUpperCase();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || (secureFlag ? 465 : 587)),
  secure: secureFlag,
  requireTLS: !secureFlag,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  authMethod: smtpAuthMethod,
  logger: true,
  debug: true,
});

// optional prüfen
transporter.verify((err) => {
  if (err) console.error("SMTP verify failed:", err);
  else console.log("SMTP ready: true");
});

// ===================== PayPal Helper =====================
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

// ===================== API: Order anlegen =====================
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

// ===================== API: Capture + Mail =====================
app.post("/capture-order", async (req, res) => {
  try {
    const { orderID, vorname, nachname, email, quantity } = req.body;
    const qty = clampQty(quantity);

    const accessToken = await getAccessToken();
    const capRes = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderID}/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const capture = await capRes.json();
    if (!capRes.ok) return res.status(400).json(capture);

    const ticketNumber =
      capture?.purchase_units?.[0]?.payments?.captures?.[0]?.id || orderID;

    // Mail
    const html = ticketMailTemplate({
      vorname,
      nachname,
      ticketNumber,
      quantity: qty,
      totalEUR: qty * PRICE_EUR,
    });

    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: email,
      subject: `🎟️ Ihr Ticket (${ticketNumber}) – Happiness e.V.`,
      html,
    });
    console.log("Mail sent:", info.messageId, info.response);

    res.json({ ticketNumber, mailed: true });
  } catch (e) {
    console.error("capture-order failed:", e);
    res.status(500).json({ error: String(e?.message || e), mailed: false });
  }
});

// ===================== Healthcheck =====================
app.get("/health", (_req, res) => {
  res.json({ ok: true, mode: MODE });
});

// ===================== Start =====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT} (Mode: ${MODE})`);
});
