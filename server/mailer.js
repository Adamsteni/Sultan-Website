import { config } from "./config.js";

export const formatNaira = (kobo) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0
  }).format(kobo / 100);

const money = (row) =>
  `<td style="padding:12px 0;border-bottom:1px solid #E4E1DC;text-align:right;color:#6C6C68;">${formatNaira(
    row.lineTotalKobo
  )}</td>`;

const itemsTable = (order) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:24px 0;">
    <thead>
      <tr>
        <th align="left" style="padding:0 0 10px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#6C6C68;border-bottom:1px solid #141414;">Item</th>
        <th align="right" style="padding:0 0 10px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#6C6C68;border-bottom:1px solid #141414;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${order.items
        .map(
          (item) => `<tr>
            <td style="padding:12px 0;border-bottom:1px solid #E4E1DC;">
              <span style="display:block;font-weight:700;">${escapeHtml(item.name)}</span>
              <span style="font-size:13px;color:#6C6C68;">Qty ${item.quantity}${
                item.size ? ` · Size ${escapeHtml(item.size)}` : ""
              } · ${formatNaira(item.unitPriceKobo)} each</span>
            </td>
            ${money(item)}
          </tr>`
        )
        .join("")}
      <tr>
        <td style="padding:10px 0;color:#6C6C68;">Subtotal</td>
        <td style="padding:10px 0;text-align:right;color:#6C6C68;">${formatNaira(order.subtotalKobo)}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;color:#6C6C68;">Delivery</td>
        <td style="padding:10px 0;text-align:right;color:#6C6C68;">${
          order.deliveryKobo === 0 ? "Free" : formatNaira(order.deliveryKobo)
        }</td>
      </tr>
      <tr>
        <td style="padding:14px 0 0;font-weight:800;font-size:16px;border-top:1px solid #141414;">Total</td>
        <td style="padding:14px 0 0;text-align:right;font-weight:800;font-size:16px;border-top:1px solid #141414;">${formatNaira(
          order.totalKobo
        )}</td>
      </tr>
    </tbody>
  </table>`;

const layout = (heading, intro, body) => `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px 12px;background:#EFEDE9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#141414;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#F6F5F2;border-collapse:collapse;">
          <tr><td style="padding:32px 32px 8px;text-align:center;">
            <p style="margin:0;font-size:24px;font-weight:800;letter-spacing:.3em;text-indent:.3em;text-transform:uppercase;">Sultan</p>
          </td></tr>
          <tr><td style="padding:16px 32px 32px;">
            <h1 style="margin:0 0 12px;font-size:26px;line-height:1.15;">${heading}</h1>
            <p style="margin:0 0 4px;font-size:15px;color:#3C3A37;">${intro}</p>
            ${body}
            <p style="margin:28px 0 0;font-size:12px;color:#6C6C68;line-height:1.6;">
              Questions about this order? Reply to this email or write to
              <a href="mailto:${config.shopEmail}" style="color:#A8874C;">${config.shopEmail}</a>.
            </p>
          </td></tr>
          <tr><td style="padding:20px 32px;background:#141414;text-align:center;">
            <p style="margin:0;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#9C9993;">Sultan Clothing</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

function escapeHtml(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]
  );
}

export function confirmationEmail(order) {
  const address = [
    order.customer.addressLine1,
    order.customer.addressLine2,
    order.customer.city,
    order.customer.state
  ]
    .filter(Boolean)
    .map(escapeHtml)
    .join("<br>");

  const body = `
    <p style="margin:20px 0 0;font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:#6C6C68;">Order ${escapeHtml(
      order.orderNumber
    )}</p>
    ${itemsTable(order)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#EFEDE9;">
      <tr><td style="padding:18px 20px;">
        <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;">Delivering to</p>
        <p style="margin:0;font-size:14px;line-height:1.6;">${escapeHtml(order.customer.fullName)}<br>${address}</p>
        <p style="margin:10px 0 0;font-size:13px;color:#6C6C68;">${escapeHtml(
          order.customer.phone
        )} · ${escapeHtml(order.payment.method === "card" ? "Card payment" : "Payment on delivery")}${
          order.payment.reference ? ` · Ref ${escapeHtml(order.payment.reference)}` : ""
        }</p>
      </td></tr>
    </table>
    <p style="margin:26px 0 0;">
      <a href="${config.siteUrl}/account.html?order=${encodeURIComponent(order.orderNumber)}" style="display:inline-block;padding:14px 30px;background:#141414;color:#F6F5F2;text-decoration:none;font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;">View this order</a>
    </p>`;

  return {
    to: order.email,
    subject: `${config.shopName} — order ${order.orderNumber} confirmed`,
    html: layout(
      "Thank you for your order.",
      `Hi ${escapeHtml(
        order.customer.fullName.split(" ")[0]
      )}, we have your order and it is being prepared.`,
      body
    ),
    text: [
      `Hi ${order.customer.fullName.split(" ")[0]},`,
      "",
      `Order ${order.orderNumber} confirmed.`,
      ...order.items.map(
        (item) =>
          `- ${item.name}${item.size ? ` (${item.size})` : ""} x${item.quantity} — ${formatNaira(
            item.lineTotalKobo
          )}`
      ),
      "",
      `Subtotal: ${formatNaira(order.subtotalKobo)}`,
      `Delivery: ${order.deliveryKobo === 0 ? "Free" : formatNaira(order.deliveryKobo)}`,
      `Total: ${formatNaira(order.totalKobo)}`,
      "",
      `Delivering to ${order.customer.fullName}, ${order.customer.addressLine1}, ${order.customer.city}, ${order.customer.state}`,
      "",
      `Track it here: ${config.siteUrl}/account.html?order=${order.orderNumber}`
    ].join("\n")
  };
}

export function ownerNotificationEmail(order) {
  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:20px 0;background:#EFEDE9;">
      <tr><td style="padding:18px 20px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;">Customer</p>
        <p style="margin:0;font-size:14px;line-height:1.6;">${escapeHtml(order.customer.fullName)}<br>${escapeHtml(
          order.email
        )}<br>${escapeHtml(order.customer.phone)}</p>
        <p style="margin:12px 0 0;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;">Deliver to</p>
        <p style="margin:0;font-size:14px;line-height:1.6;">${escapeHtml(order.customer.addressLine1)}${
          order.customer.addressLine2 ? `<br>${escapeHtml(order.customer.addressLine2)}` : ""
        }<br>${escapeHtml(order.customer.city)}, ${escapeHtml(order.customer.state)}</p>
        ${
          order.customer.notes
            ? `<p style="margin:12px 0 0;font-size:14px;"><em>Note: ${escapeHtml(order.customer.notes)}</em></p>`
            : ""
        }
      </td></tr>
    </table>
    ${itemsTable(order)}`;

  return {
    to: config.shopEmail,
    subject: `New ${config.shopName} order ${order.orderNumber} — ${formatNaira(order.totalKobo)}`,
    html: layout(
      `Order ${escapeHtml(order.orderNumber)} received`,
      `${order.items.length} item${order.items.length === 1 ? "" : "s"} from ${escapeHtml(
        order.customer.fullName
      )}.`,
      body
    ),
    text: [
      `New order ${order.orderNumber} from ${order.customer.fullName} (${order.email})`,
      ...order.items.map(
        (item) => `- ${item.name} x${item.quantity} — ${formatNaira(item.lineTotalKobo)}`
      ),
      `Total: ${formatNaira(order.totalKobo)}`
    ].join("\n")
  };
}

export function statusEmail(order) {
  return {
    to: order.email,
    subject: `${config.shopName} — order ${order.orderNumber} is now ${order.status}`,
    html: layout(
      `Your order is ${escapeHtml(order.status)}.`,
      `Order ${escapeHtml(order.orderNumber)} has been updated to <strong>${escapeHtml(
        order.status
      )}</strong>.`,
      `<p style="margin:24px 0 0;"><a href="${config.siteUrl}/account.html?order=${encodeURIComponent(
        order.orderNumber
      )}" style="display:inline-block;padding:14px 30px;background:#141414;color:#F6F5F2;text-decoration:none;font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;">View this order</a></p>`
    ),
    text: `Order ${order.orderNumber} is now ${order.status}. Track it at ${config.siteUrl}/account.html?order=${order.orderNumber}`
  };
}

export function welcomeEmail(email) {
  return {
    subject: `Welcome to ${config.shopName}`,
    html: layout(
      "You're on the list.",
      "Thank you for subscribing. We only write when something new lands, and we will never share your address.",
      `<p style="margin:24px 0 0;"><a href="${config.siteUrl}/" style="display:inline-block;padding:14px 30px;background:#141414;color:#F6F5F2;text-decoration:none;font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;">Start shopping</a></p>`
    ),
    text: `Thanks for subscribing to ${config.shopName}. Shop at ${config.siteUrl}`
  };
}

export function createMailer() {
  const enabled = Boolean(config.mailgun.apiKey && config.mailgun.domain);
  const from = config.mailgun.from || `Sultan <postmaster@${config.mailgun.domain || "example.com"}>`;

  async function send({ to, subject, html, text }, tag = "order") {
    if (!to) {
      console.error(`[mail] ${tag}: no recipient for "${subject}"`);
      return { sent: false, reason: "no-recipient" };
    }
    if (!enabled) {
      console.log(`[mail:demo] ${to} :: ${subject}`);
      return { sent: false, reason: "mailgun-not-configured" };
    }

    const body = new URLSearchParams({ from, to, subject, html, text });
    const response = await fetch(`${config.mailgun.apiBase}/${config.mailgun.domain}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${config.mailgun.apiKey}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const failure = new Error(payload.message || `Mailgun responded with ${response.status}`);
      failure.status = 502;
      throw failure;
    }
    console.log(`[mail:${tag}] ${to} :: ${subject} (${payload.id})`);
    return { sent: true, id: payload.id };
  }

  return {
    enabled,
    send,
    sendOrderConfirmation: (order) => send(confirmationEmail(order), "confirmation"),
    sendOwnerNotification: (order) => send(ownerNotificationEmail(order), "owner"),
    sendStatusUpdate: (order) => send(statusEmail(order), "status"),
    sendWelcome: (email) => send({ ...welcomeEmail(email), to: email }, "welcome")
  };
}
