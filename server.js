import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import nodemailer from "nodemailer";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Ticketzähler laden oder erstellen
const ticketFile = "ticketCounter.json";
if (!fs.existsSync(ticketFile)) {
  fs.writeFileSync(ticketFile, JSON.stringify({ count: 0 }));
}

// PayPal API-Daten
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_SECRET;
const PAYPAL_API = "https://api-m.sandbox.paypal.com"; // Sandbox! Für Live ändern

// E-Mail Transporter einrichten (z.B. Gmail)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

// PayPal-Token holen
async function getAccessToken() {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString("base64");
  const response = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    body: "grant_type=client_credentials",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    }
  });
  const data = await response.json();
  return data.access_token;
}

// Bestellung erstellen
app.post("/create-order", async (req, res) => {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          amount: { currency_code: "EUR", value: "20.00" }
        }]
      })
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).send("Fehler bei Bestellung");
  }
});

// Bestellung erfassen & Ticket senden
app.post("/capture-order", async (req, res) => {
  const { orderID, vorname, nachname, email } = req.body;
  try {
    const accessToken = await getAccessToken();

    // Zahlung bestätigen
    const response = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderID}/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      }
    });
    const data = await response.json();

    if (data.status !== "COMPLETED") {
      return res.status(400).send("Zahlung fehlgeschlagen");
    }

    // Ticketnummer erhöhen
    let counter = JSON.parse(fs.readFileSync(ticketFile));
    counter.count += 1;
    fs.writeFileSync(ticketFile, JSON.stringify(counter));

    const ticketNumber = counter.count;

    // E-Mail mit Ticket senden
    await transporter.sendMail({
      from: `"Event Team" <${process.env.MAIL_USER}>`,
      to: email,
      subject: "Dein Ticket",
      text: `Hallo ${vorname} ${nachname},\n\nVielen Dank für deinen Kauf!\nDeine Ticketnummer lautet: ${ticketNumber}\n\nViel Spaß beim Event!`,
      html: `<p>Hallo ${vorname} ${nachname},</p>
             <p>vielen Dank für deinen Kauf!</p>
             <p><b>Deine Ticketnummer:</b> ${ticketNumber}</p>
             <p>Viel Spaß beim Event!</p>`
    });

    res.json({ ticketNumber });

  } catch (err) {
    console.error(err);
    res.status(500).send("Fehler beim Erfassen der Bestellung");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server läuft auf http://localhost:${PORT}`));
