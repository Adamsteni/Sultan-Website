import path from "node:path";
import express from "express";
import { config, adminChecklist } from "./config.js";
import { attachUser, requireUser, requireAdmin, issueDemoToken } from "./auth.js";
import { createSupabaseRepository } from "./repositories/supabase.js";
import { createMemoryRepository } from "./repositories/memory.js";
import { createMailer } from "./mailer.js";
import {
  ValidationError,
  validateShipping,
  validatePayment,
  validateCart,
  validateAdminProductPatch,
  NIGERIAN_STATES
} from "./validate.js";
import { deliveryFor, FREE_DELIVERY_THRESHOLD_KOBO, DELIVERY_FEE_KOBO } from "./data/catalogue.js";

// Netlify bundles this file as CommonJS, where `import.meta` does not exist, so the module
// path cannot be derived from it. process.cwd() is the repo root locally and /var/task on a
// function, and the static routes below are only reached when a real filesystem is present.
const here = process.cwd();
const root = path.resolve(here);
const publicDir = path.join(root, "public");
const vendorDir = path.join(root, "node_modules", "@supabase", "supabase-js", "dist", "umd");

const repository = config.demoMode ? createMemoryRepository() : createSupabaseRepository();
const mailer = createMailer();
const app = express();

app.set("trust proxy", true);
app.use(express.json({ limit: "64kb" }));
app.use(attachUser);
app.disable("x-powered-by");

const ok = (res, payload) => res.json(payload);
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

app.get("/api/health", wrap(async (_req, res) => {
  if (config.isServerless && config.demoMode) {
    return res.status(503).json({
      status: "misconfigured",
      mode: "demo",
      error:
        "The shop is deployed without SUPABASE_SERVICE_ROLE_KEY, so orders cannot be stored. Set the Supabase variables in the Netlify site settings.",
      database: { ok: false, detail: "in-memory demo store is not usable on serverless hosting" },
      mailgun: { configured: mailer.enabled },
      integrations: adminChecklist,
      time: new Date().toISOString()
    });
  }

  let database = { ok: false, detail: repository.mode === "memory" ? "in-memory demo store" : "unreachable" };
  if (repository.mode === "supabase") {
    try {
      await repository.ping();
      database = { ok: true, detail: "supabase" };
    } catch (error) {
      database = { ok: false, detail: error.message };
    }
  } else {
    database.ok = true;
  }
  ok(res, {
    status: database.ok ? "ok" : "degraded",
    mode: config.demoMode ? "demo" : "live",
    database,
    mailgun: { configured: mailer.enabled },
    integrations: adminChecklist,
    time: new Date().toISOString()
  });
}));

app.get("/api/config", (req, res) => {
  ok(res, {
    shopName: config.shopName,
    shopEmail: config.shopEmail,
    demoMode: config.demoMode,
    authProvider: config.demoMode ? "demo" : "supabase",
    googleClientId: config.google.clientId,
    supabase: { url: config.supabase.url, anonKey: config.supabase.anonKey },
    mailgunConfigured: mailer.enabled,
    delivery: {
      freeThresholdKobo: FREE_DELIVERY_THRESHOLD_KOBO,
      feeKobo: DELIVERY_FEE_KOBO
    },
    states: NIGERIAN_STATES,
    user: req_user(req)
  });
});

function req_user(req) {
  return req.user ? { email: req.user.email, name: req.user.name, isAdmin: req.user.isAdmin } : null;
}

app.get("/api/me", (req, res) => ok(res, { user: req_user(req) }));

// Demo sign-in, only mounted when Supabase is not configured.
app.post("/api/auth/demo", wrap(async (req, res) => {
  if (!config.demoMode) return res.status(404).json({ error: "Not available." });
  const email = String(req.body?.email || "").trim().toLowerCase();
  const name = String(req.body?.name || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError({ email: "Enter a valid email address." });
  }
  const user = {
    id: `demo-${Buffer.from(email).toString("base64url").slice(0, 24)}`,
    email,
    name: name || email.split("@")[0]
  };
  ok(res, { token: issueDemoToken(user), user: { ...user, isAdmin: config.adminEmails.includes(email) } });
}));

app.get("/api/products", wrap(async (req, res) => {
  const products = await repository.listProducts({
    category: req.query.category,
    search: req.query.search
  });
  ok(res, { products, count: products.length });
}));

app.get("/api/products/:slug", wrap(async (req, res) => {
  const product = await repository.getProductBySlug(req.params.slug);
  if (!product || !product.active) return res.status(404).json({ error: "We could not find that piece." });
  const all = await repository.listProducts({});
  const related = all
    .filter((entry) => entry.slug !== product.slug && entry.category === product.category)
    .slice(0, 4);
  ok(res, { product, related });
}));

app.post("/api/newsletter", wrap(async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 200) {
    throw new ValidationError({ email: "Enter a valid email address." });
  }
  await repository.subscribe(email, req.user?.id || null);
  let welcomeSent = false;
  try {
    welcomeSent = (await mailer.sendWelcome(email)).sent;
    if (welcomeSent) await repository.markSubscriberWelcomed(email);
  } catch (error) {
    console.error("[mail] welcome failed:", error.message);
  }
  ok(res, { email, welcomeSent });
}));

app.post("/api/orders", requireUser, wrap(async (req, res) => {
  const items = validateCart(req.body?.items);
  const shipping = validateShipping(req.body?.shipping);
  const payment = validatePayment(req.body?.payment, { requireCard: true });

  const lines = [];
  for (const item of items) {
    const product = await repository.getProductBySlug(item.slug);
    if (!product || !product.active) {
      throw new ValidationError({ cart: `${item.slug} is no longer available. Please remove it from your bag.` });
    }
    if (product.stock < item.quantity) {
      throw new ValidationError({ cart: `Only ${product.stock} left of ${product.name}.` });
    }
    if (item.size && product.sizes.length && !product.sizes.includes(item.size)) {
      throw new ValidationError({ cart: `Please choose a size for ${product.name}.` });
    }
    lines.push({ ...item, priceKobo: product.priceKobo, name: product.name });
  }

  const subtotalKobo = lines.reduce((sum, line) => sum + line.priceKobo * line.quantity, 0);
  const order = await repository.placeOrder({
    userId: req.user.id,
    email: req.user.email,
    shipping,
    payment,
    items: lines,
    deliveryKobo: deliveryFor(subtotalKobo)
  });

  let email = { sent: false, reason: "not-attempted" };
  try {
    const [customer, owner] = await Promise.all([
      mailer.sendOrderConfirmation(order),
      mailer.sendOwnerNotification(order)
    ]);
    email = { sent: customer.sent, reason: customer.reason, ownerNotified: owner.sent };
    if (customer.sent) await repository.markConfirmationSent(order.id, new Date().toISOString());
  } catch (error) {
    console.error("[mail] order confirmation failed:", error.message);
    email = { sent: false, reason: error.message };
  }

  return res.status(201).json({ order: { ...order, confirmationSentAt: email.sent ? new Date().toISOString() : null }, email });
}));

app.get("/api/orders", requireUser, wrap(async (req, res) => {
  const orders = await repository.listOrdersForUser(req.user.id);
  ok(res, { orders, count: orders.length });
}));

app.get("/api/orders/:orderNumber", requireUser, wrap(async (req, res) => {
  const order = await repository.getOrderForUser(req.params.orderNumber, req.user.id);
  if (!order) return res.status(404).json({ error: "We could not find that order on your account." });
  ok(res, { order });
}));

app.post("/api/orders/:orderNumber/resend", requireUser, wrap(async (req, res) => {
  const order = await repository.getOrderForUser(req.params.orderNumber, req.user.id);
  if (!order) return res.status(404).json({ error: "We could not find that order on your account." });
  const result = await mailer.sendOrderConfirmation(order);
  if (result.sent) await repository.markConfirmationSent(order.id, new Date().toISOString());
  ok(res, { sent: result.sent, reason: result.reason });
}));

app.get("/api/admin/overview", requireAdmin, wrap(async (_req, res) => {
  const [stats, orders] = await Promise.all([repository.stats(), repository.listAllOrders({})]);
  ok(res, {
    stats: { ...stats, lowStock: (stats.lowStock || []).map(({ id, slug, name, stock }) => ({ id, slug, name, stock })) },
    orders: orders.slice(0, 8)
  });
}));

app.get("/api/admin/orders", requireAdmin, wrap(async (req, res) => {
  const orders = await repository.listAllOrders({ status: req.query.status });
  ok(res, { orders, count: orders.length });
}));

app.patch("/api/admin/orders/:id", requireAdmin, wrap(async (req, res) => {
  const status = String(req.body?.status || "");
  if (!["pending", "confirmed", "shipped", "delivered", "cancelled"].includes(status)) {
    throw new ValidationError({ status: "Unknown order status." });
  }
  const order = await repository.updateOrderStatus(req.params.id, status);
  if (!order) return res.status(404).json({ error: "Order not found." });
  try {
    await mailer.sendStatusUpdate(order);
  } catch (error) {
    console.error("[mail] status update failed:", error.message);
  }
  ok(res, { order });
}));

app.get("/api/admin/products", requireAdmin, wrap(async (_req, res) => {
  const products = await repository.listProducts({ includeInactive: true });
  ok(res, { products, count: products.length });
}));

app.get("/api/admin/subscribers", requireAdmin, wrap(async (_req, res) => {
  const subscribers = await repository.listSubscribers();
  ok(res, { subscribers, count: subscribers.length });
}));

app.patch("/api/admin/products/:id", requireAdmin, wrap(async (req, res) => {
  const patch = validateAdminProductPatch(req.body || {});
  const product = await repository.updateProduct(req.params.id, patch);
  if (!product) return res.status(404).json({ error: "Product not found." });
  ok(res, { product });
}));

app.get("/api/admin/orders.csv", requireAdmin, wrap(async (_req, res) => {
  const orders = await repository.listAllOrders({});
  const escapeCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const header = [
    "order_number", "created_at", "status", "customer", "email", "phone", "city", "state",
    "items", "subtotal_kobo", "delivery_kobo", "total_kobo", "payment_method", "payment_reference",
    "confirmation_sent_at"
  ];
  const rows = orders.map((order) => [
    order.orderNumber, order.createdAt, order.status, order.customer.fullName, order.email,
    order.customer.phone, order.customer.city, order.customer.state,
    order.items.map((item) => `${item.name} x${item.quantity}`).join(" | "),
    order.subtotalKobo, order.deliveryKobo, order.totalKobo, order.payment.method,
    order.payment.reference, order.confirmationSentAt
  ]);
  const csv = [header, ...rows].map((row) => row.map(escapeCell).join(",")).join("\r\n");
  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="sultan-orders-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
}));

// Locally the SDK is served from node_modules; on Netlify it is copied into public/vendor
// by `npm run vendor` and served as a static file, since functions cannot expose node_modules.
app.use("/vendor", express.static(vendorDir, { immutable: true, maxAge: "7d" }));
app.use("/vendor", express.static(path.join(publicDir, "vendor"), { immutable: true, maxAge: "7d" }));
app.use(express.static(publicDir, { extensions: ["html"] }));

app.use("/api", (_req, res) => res.status(404).json({ error: "Unknown endpoint." }));
app.use((_req, res) => res.status(404).sendFile(path.join(publicDir, "404.html"), (error) => {
  if (error) res.status(404).type("txt").send("Not found");
}));

app.use((error, req, res, _next) => {
  const status = error.status || 500;
  if (status >= 500) console.error(`[error] ${req.method} ${req.originalUrl}:`, error);
  res.status(status).json({
    error: status >= 500 ? "Something went wrong on our side. Please try again." : error.message,
    fields: error.fields,
    code: error.code
  });
});

export { app, repository, mailer };

// Listen only when this file is the process entry point. Netlify imports it and hands `app` to
// a function, where binding a port would fail, and tests import it too, which must not open a
// socket. `import.meta` is unavailable in the CommonJS bundle, so compare argv against the path
// this module is reached by.
const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
const isDirectRun = Boolean(entry) && /server[/\\]index\.js$/.test(entry);

if (isDirectRun) {
  app.listen(config.port, () => {
    const banner = config.demoMode
      ? "demo mode (in-memory store, mail logged to console)"
      : `live (supabase, mail ${mailer.enabled ? "on" : "off"})`;
    console.log(`\n  ${config.shopName} — ${banner}`);
    console.log(`  http://localhost:${config.port}\n`);
    for (const item of adminChecklist) {
      console.log(`  ${item.ok ? "[ok]  " : "[todo]"} ${item.name}${item.ok ? "" : ` — ${item.hint}`}`);
    }
    if (config.adminEmails.length) console.log(`\n  Shop owner: ${config.adminEmails.join(", ")}`);
    console.log("");
  });
}
