import express from "express";
import fs from "fs/promises";
import fetch from "node-fetch";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(express.json());
app.use(express.static("public"));

const PAYPAL_API = "https://api-m.sandbox.paypal.com"; // Für Test/Sandbox, später auf Live umstellen
const COUNTER_FILE = "./ticketCounter.json";

async function nextTicketNumber() {
  const raw = await fs.readFile(COUNTER_FILE, "utf8");
  const data = JSON.parse(raw);
  data.counter++;
  await fs.writeFile(COUNTER_FILE, JSON.stringify(data));
  return `HAP-MUC-2025-${String(data.counter).padStart(4, "0")}`;
}

async function paypalAccessToken() {
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    body: "grant_type=client_credentials",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization":
        "Basic " +
        Buffer.from(
          process.env.PAYPAL_CLIENT_ID + ":" + process.env.PAYPAL_SECRET
        ).toString("base64"),
    },
  });
  const data = await res.json();
  return data.access_token;
}

async function verifyOrder(orderID) {
  const token = await paypalAccessToken();
  const res = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderID}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.status === "COMPLETED" ? data : null;
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

app.post("/issue-ticket", async (req, res) => {
  try {
    const { orderID, form } = req.body;
    const verified = await verifyOrder(orderID);
    if (!verified) return res.status(400).json({ error: "payment_not_verified" });

    const ticketNo = await nextTicketNumber();

    const html = `
      <p>Hallo ${form.firstName} ${form.lastName},</p>
      <p>vielen Dank für deinen Kauf! Hier sind deine Ticketdaten:</p>
      <ul>
        <li><b>Ticketnummer:</b> ${ticketNo}</li>
        <li><b>Event:</b> Positive-Disziplin-Seminar (München)</li>
        <li><b>Datum/Zeit:</b> 5. Oktober 2025 – Einlass 15:30, Beginn 16:00</li>
        <li><b>Ort:</b> Anton-Fingerle-Zentrum, Schlierseestraße 47, 81539 München</li>
        <li><b>Anzahl:</b> ${form.qty}</li>
      </ul>
      <p>Bitte bringe das Ticket (diese E-Mail reicht) zum Einlass mit.</p>
    `;

    await transporter.sendMail({
      from: process.env.FROM_EMAIL,
      to: form.email,
      subject: `Dein Ticket ${ticketNo} – Positive-Disziplin-Seminar`,
      html,
    });

    res.json({ ok: true, ticketNo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server_error" });
  }
});

app.listen(3000, () =>
  console.log("Server läuft auf http://localhost:3000")
);
