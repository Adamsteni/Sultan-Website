// Set before the app is imported. Static imports are hoisted, so a static import here would read
// .env and pick up real credentials before these overrides could apply. A test must never send
// real mail through a live provider.
process.env.DEMO_MODE = "true";
process.env.ADMIN_EMAILS = "owner@sultan.test";
process.env.MAILGUN_API_KEY = "";
process.env.MAILGUN_DOMAIN = "";
process.env.SUPABASE_URL = "";
process.env.SUPABASE_ANON_KEY = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";

const { handler } = await import("../netlify/functions/api.js");

// Netlify invokes a function as: handler(event, context) -> { statusCode, headers, body, isBase64Encoded }
// with event.path carrying the original /api/* path. This exercises that exact contract.
const call = async (path, { method = "GET", body, token } = {}) => {
  const headers = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await handler(
    {
      path,
      httpMethod: method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      isBase64Encoded: false,
      queryStringParameters: {}
    },
    {}
  );

  const text = response.isBase64Encoded
    ? Buffer.from(response.body, "base64").toString("utf8")
    : response.body ?? "";
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not json
  }
  return { status: response.statusCode, headers: response.headers, text, json };
};

let passed = 0;
const failures = [];
const check = (label, condition, detail = "") => {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label}${detail ? ` -> ${String(detail).slice(0, 300)}` : ""}`);
  }
};

console.log("\nSultan — Netlify function\n");

const health = await call("/api/health");
check("the function answers /api/health", health.status === 200, health.text.slice(0, 200));
check("health reports demo mode in tests", health.json?.mode === "demo", health.text.slice(0, 200));

const config = await call("/api/config");
check("the function answers /api/config", config.status === 200 && config.json?.shopName === "Sultan Clothing", config.text.slice(0, 200));
check("config exposes the browser-safe supabase keys only", config.json?.supabase && "serviceRoleKey" in config.json.supabase === false, JSON.stringify(config.json?.supabase));

const catalogue = await call("/api/products");
check("the function lists products", catalogue.json?.count === 8, catalogue.json?.count);
const product = catalogue.json.products[0];

const detail = await call(`/api/products/${product.slug}`);
check("a single product loads", detail.json?.product?.slug === product.slug, detail.text.slice(0, 200));

const signIn = await call("/api/auth/demo", { method: "POST", body: { email: "ada@sultan.test", name: "Ada Obi" } });
check("demo sign in works through the function", signIn.status === 200 && Boolean(signIn.json?.token), signIn.text.slice(0, 200));
const token = signIn.json?.token;

const guarded = await call("/api/orders");
check("orders require a session", guarded.status === 401, `${guarded.status} ${guarded.text.slice(0, 120)}`);

const emptyOrder = await call("/api/orders", {
  method: "POST",
  token,
  body: { shipping: {}, payment: { method: "card" }, items: [] }
});
check("an invalid order is rejected with field errors", emptyOrder.status === 422 && Boolean(emptyOrder.json?.fields), `${emptyOrder.status} ${emptyOrder.text.slice(0, 160)}`);

const placed = await call("/api/orders", {
  method: "POST",
  token,
  body: {
    shipping: {
      fullName: "Ada Obi",
      phone: "08031234567",
      addressLine1: "12 Marina Road",
      city: "Lagos",
      state: "Lagos"
    },
    payment: { method: "card", cardNumber: "4242424242424242", cardName: "ADA OBI", expiry: "12/30", cvc: "123" },
    items: [{ slug: product.slug, quantity: 2, size: product.sizes?.[0] || null }]
  }
});
check("an order can be placed through the function", placed.status === 201 && /^SLT-/.test(placed.json?.order?.orderNumber || ""), `${placed.status} ${placed.text.slice(0, 200)}`);
const orderNumber = placed.json?.order?.orderNumber;

const mine = await call("/api/orders", { token });
check("the shopper sees the order", mine.json?.orders?.length === 1 && mine.json.orders[0].orderNumber === orderNumber, mine.text.slice(0, 200));

const oneOrder = await call(`/api/orders/${orderNumber}`, { token });
check("a single order loads", oneOrder.json?.order?.orderNumber === orderNumber, oneOrder.text.slice(0, 160));

const resend = await call(`/api/orders/${orderNumber}/resend`, { method: "POST", token });
check("the confirmation can be resent", resend.status === 200 && resend.json?.sent !== undefined, resend.text.slice(0, 160));

const blockedAdmin = await call("/api/admin/overview", { token });
check("a shopper cannot reach the admin api", blockedAdmin.status === 403, `${blockedAdmin.status} ${blockedAdmin.text.slice(0, 120)}`);

const ownerSignIn = await call("/api/auth/demo", { method: "POST", body: { email: "owner@sultan.test" } });
const ownerToken = ownerSignIn.json?.token;
const overview = await call("/api/admin/overview", { token: ownerToken });
check("the owner reaches the admin api", overview.status === 200 && overview.json?.stats?.orderCount === 1, `${overview.status} ${overview.text.slice(0, 160)}`);

const adminOrders = await call("/api/admin/orders", { token: ownerToken });
check("the owner lists orders", adminOrders.json?.orders?.length === 1, adminOrders.text.slice(0, 160));

const patched = await call(`/api/admin/products/${product.id}`, {
  method: "PATCH",
  token: ownerToken,
  body: { stock: 7 }
});
check("the owner can edit a product", patched.status === 200 && patched.json?.product?.stock === 7, `${patched.status} ${patched.text.slice(0, 160)}`);

const negative = await call(`/api/admin/products/${product.id}`, {
  method: "PATCH",
  token: ownerToken,
  body: { stock: -1 }
});
check("invalid edits are rejected", negative.status === 422, `${negative.status} ${negative.text.slice(0, 120)}`);

const csv = await call("/api/admin/orders.csv", { token: ownerToken });
check("csv export works", csv.status === 200 && csv.text.includes("order_number"), `${csv.status} ${csv.text.slice(0, 120)}`);

const newsletter = await call("/api/newsletter", { method: "POST", body: { email: "not-an-email" } });
check("bad newsletter addresses are rejected", newsletter.status === 422, `${newsletter.status} ${newsletter.text.slice(0, 120)}`);

const subscribed = await call("/api/newsletter", { method: "POST", body: { email: "friend@example.com" } });
check("a subscriber is stored", subscribed.status === 200 && subscribed.json?.email === "friend@example.com", subscribed.text.slice(0, 160));

const subscribers = await call("/api/admin/subscribers", { token: ownerToken });
check("the owner lists subscribers", subscribers.json?.subscribers?.length >= 1, subscribers.text.slice(0, 160));

const unknown = await call("/api/nope");
check("unknown api routes return json 404", unknown.status === 404 && Boolean(unknown.json?.error), `${unknown.status} ${unknown.text.slice(0, 120)}`);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(`\nFailed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("");
