// Sends one real order-shaped message through the real Mailgun integration, without creating an
// order in the database. Proves delivery, templates and the live credentials in one step.
// Usage: node scripts/mail-check.js <recipient-email>
import "dotenv/config";
import { createMailer } from "../server/mailer.js";
import { config } from "../server/config.js";

const to = process.argv[2];

if (!to) {
  console.error("\n  Usage: node scripts/mail-check.js <recipient-email>\n");
  process.exit(1);
}

const mailer = createMailer();

console.log(`\n  Mailgun delivery check`);
console.log(`  recipient : ${to}`);
console.log(`  domain    : ${config.mailgun.domain}`);
console.log(`  from      : ${config.mailgun.from}`);
console.log(`  enabled   : ${mailer.enabled}\n`);

if (!mailer.enabled) {
  console.error("  Mailgun is not configured. Set MAILGUN_API_KEY and MAILGUN_DOMAIN in .env\n");
  process.exit(1);
}

const fakeOrder = {
  orderNumber: "SLT-TEST-00001",
  userId: null,
  email: to,
  status: "confirmed",
  payment: { method: "card", reference: null },
  subtotalKobo: 6500000,
  deliveryKobo: 0,
  totalKobo: 6500000,
  createdAt: new Date().toISOString(),
  customer: {
    fullName: "Kingteni",
    phone: "08031234567",
    addressLine1: "12 Marina Road",
    addressLine2: "",
    city: "Lagos",
    state: "Lagos",
    notes: ""
  },
  items: [
    { name: "Ribbed Tank", size: "M", quantity: 1, unitPriceKobo: 6500000, lineTotalKobo: 6500000, imageUrl: "" }
  ]
};

const results = [];

for (const [label, run] of [
  ["order confirmation", () => mailer.sendOrderConfirmation(fakeOrder)],
  ["owner notification", () => mailer.sendOwnerNotification(fakeOrder)],
  ["status update", () => mailer.sendStatusUpdate(fakeOrder)],
  ["newsletter welcome", () => mailer.sendWelcome(to)]
]) {
  try {
    const outcome = await run();
    results.push({ label, ...outcome });
    console.log(`  ok    ${label.padEnd(20)} sent=${outcome.sent} ${outcome.id || outcome.reason || ""}`);
  } catch (error) {
    results.push({ label, sent: false, reason: error.message });
    console.log(`  FAIL  ${label.padEnd(20)} ${error.message}`);
  }
}

const delivered = results.filter((item) => item.sent).length;
console.log(`\n  ${delivered}/${results.length} accepted by Mailgun`);
console.log(`  Check ${to} and the Mailgun log at https://app.mailgun.com → Sending → Logs\n`);
if (delivered !== results.length) process.exit(1);
