"use strict";

/**
 * YPM Support Ticket System — webhook backend (Resend API version)
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { Resend } = require("resend");

// --- Routing map (authoritative) ---
const ROUTING = Object.freeze({
  TCR: "theclosingroom@yourpracticemastered.com",
  TSR: "thestaffingroom@yourpracticemastered.com",
  TIR: "theintakeroom@yourpracticemastered.com",
  DASH: "cst@yourpracticemastered.com",
});

const PRODUCT_NAMES = Object.freeze({
  TCR: "The Closing Room",
  TSR: "The Staffing Room",
  TIR: "The Intake Room",
  DASH: "Dashboard / Events",
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PORT = process.env.PORT || 3000;

// Inicializa el cliente oficial de Resend vía API (HTTPS)
const resend = new Resend(process.env.SMTP_PASS);

const app = express();
app.use(express.json({ limit: "16kb" }));
app.use(
  cors({
    origin: "*",
    methods: ["POST", "GET", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

function newTicketId() {
  const d = new Date();
  const stamp =
    d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0");
  return "TKT-" + stamp + "-" + crypto.randomBytes(3).toString("hex");
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

app.post("/ticket", async (req, res) => {
  const body = req.body || {};
  const product = String(body.product || "").trim();
  const clientEmail = String(body.client_email || "").trim();
  const situation = String(body.situation || "").trim();
  const problem = String(body.problem || "").trim();

  if (!product || !ROUTING[product]) {
    return res.status(400).json({ ok: false, error: "Unknown or missing product code." });
  }
  if (!EMAIL_RE.test(clientEmail)) {
    return res.status(400).json({ ok: false, error: "Invalid client email." });
  }
  if (!situation) {
    return res.status(400).json({ ok: false, error: "Situation is required." });
  }
  if (!problem) {
    return res.status(400).json({ ok: false, error: "Problem is required." });
  }

  const routedTo = ROUTING[product];
  const productName = PRODUCT_NAMES[product];
  const ticketId = newTicketId();

  const subject = `[${product}] ${situation} — ${clientEmail} (${ticketId})`;
  const text =
    `Ticket: ${ticketId}\n` +
    `Product: ${productName} (${product})\n` +
    `Situation: ${situation}\n` +
    `Client email: ${clientEmail}\n\n` +
    `Problem:\n${problem}\n`;
  const html =
    `<h2 style="margin:0 0 8px">New ticket — ${esc(productName)}</h2>` +
    `<p style="margin:0 0 12px;color:#5b6472">${esc(ticketId)}</p>` +
    `<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">` +
    `<tr><td style="padding:4px 12px 4px 0;color:#5b6472">Situation</td><td>${esc(situation)}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#5b6472">Client email</td><td>${esc(clientEmail)}</td></tr>` +
    `</table>` +
    `<p style="margin:14px 0 4px;color:#5b6472">Problem</p>` +
    `<p style="margin:0;white-space:pre-wrap">${esc(problem)}</p>`;

  try {
    // Envío seguro a través de la API HTTPS de Resend
    await resend.emails.send({
      from: process.env.FROM_EMAIL,
      to: [routedTo],
      replyTo: clientEmail,
      subject,
      text,
      html,
    });

    return res.json({ ok: true, routed_to: routedTo, ticket_id: ticketId });
  } catch (err) {
    console.error("[ticket] send failed:", err.message);
    return res.status(502).json({ ok: false, error: "Could not dispatch the ticket email." });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`YPM ticket webhook listening on :${PORT}`);
});
