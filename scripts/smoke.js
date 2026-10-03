import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.SMOKE_PORT || "3999";
const base = `http://127.0.0.1:${port}`;
const adminEmail = "owner@sultan.test";
const shopperEmail = "ada@sultan.test";

let passed = 0;
const failures = [];

const check = (label, condition, detail = "") => {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label}${detail ? ` -> ${detail}` : ""}`);
  }
};

const call = async (pathname, { method = "GET", body, token } = {}) => {
  const headers = { accept: "application/json" };
  if (body) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${base}${pathname}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json().catch(() => null);
  return { status: response.status, payload };
};

const server = spawn(process.execPath, ["server/index.js"], {
  cwd: root,
  env: { ...process.env, PORT: port, DEMO_MODE: "true", ADMIN_EMAILS: adminEmail, MAILGUN_API_KEY: "", MAILGUN_DOMAIN: "" },
  stdio: ["ignore", "pipe", "pipe"]
});

let serverLog = "";
server.stdout.on("data", (chunk) => (serverLog += chunk));
server.stderr.on("data", (chunk) => (serverLog += chunk));

const waitForServer = async () => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return true;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
};

const validOrder = (slug) => ({
  items: [{ slug, quantity: 1, size: null }],
  shipping: {
    fullName: "Ada Obi",
    phone: "08031234567",
    addressLine1: "12 Marina Road",
    addressLine2: "",
    city: "Lagos",
    state: "Lagos",
    notes: "Call on arrival"
  },
  payment: { method: "card", cardNumber: "4242 4242 4242 4242", cardName: "ADA OBI", expiry: "12/30", cvc: "123" }
});

try {
  console.log("\nSultan — smoke test\n");

  check("server starts", await waitForServer(), serverLog.slice(-400));

  const health = await call("/api/health");
  check("health reports ok", health.payload?.status === "ok", JSON.stringify(health.payload));
  check("health lists integrations", Array.isArray(health.payload?.integrations));

  const config = await call("/api/config");
  check("config exposes demo provider", config.payload?.authProvider === "demo");
  check("config lists states", (config.payload?.states || []).length > 30);
  check("config exposes free delivery threshold", config.payload?.delivery?.freeThresholdKobo === 15000000);

  const products = await call("/api/products");
  check("catalogue loads from the store", (products.payload?.products || []).length === 8);
  check("prices are in kobo", products.payload?.products?.[0]?.priceKobo === 15000000);

  const single = await call("/api/products/essential-crew");
  check("product detail returns related pieces", Array.isArray(single.payload?.related));

  const missing = await call("/api/products/not-a-real-slug");
  check("unknown product returns 404", missing.status === 404);

  const unauth = await call("/api/orders");
  check("orders require sign-in", unauth.status === 401);

  const badEmail = await call("/api/auth/demo", { method: "POST", body: { email: "nope" } });
  check("demo sign-in validates the email", badEmail.status === 422);

  const shopper = await call("/api/auth/demo", { method: "POST", body: { email: shopperEmail, name: "Ada Obi" } });
  const shopperToken = shopper.payload?.token;
  check("shopper signs in", Boolean(shopperToken));
  check("shopper is not admin", shopper.payload?.user?.isAdmin === false);

  const noCard = await call("/api/orders", {
    method: "POST",
    token: shopperToken,
    body: {
      ...validOrder("essential-crew"),
      payment: { method: "card", cardNumber: "1234", cardName: "", expiry: "01/20", cvc: "1" }
    }
  });
  check("card details are validated", noCard.status === 422 && Boolean(noCard.payload?.fields?.cardNumber));

  const noStock = await call("/api/orders", {
    method: "POST",
    token: shopperToken,
    body: { ...validOrder("essential-crew"), items: [{ slug: "essential-crew", quantity: 99 }] }
  });
  check("quantity above stock is rejected", noStock.status === 422);

  const emptyCart = await call("/api/orders", {
    method: "POST",
    token: shopperToken,
    body: { ...validOrder("essential-crew"), items: [] }
  });
  check("empty cart is rejected", emptyCart.status === 422);

  // ---- cart -------------------------------------------------------------
  // The bag is per account so the website and the phone app agree. These checks cover the
  // two devices' worth of behaviour: adding on one, reading on another, and merging a guest
  // bag in without losing items.
  const cartToken = shopperToken;

  const cartStart = await call("/api/cart", { token: cartToken });
  check("cart starts empty for a new customer", cartStart.status === 200 && cartStart.payload.lines.length === 0);

  const cartAdd = await call("/api/cart/items", {
    method: "POST",
    token: cartToken,
body: { slug: "essential-crew", size: "M", quantity: 2 }
  });
  check("an item can be added to the cart",
    cartAdd.status === 200 && cartAdd.payload.count === 2,
    JSON.stringify(cartAdd.payload).slice(0, 200));

  const cartAddAgain = await call("/api/cart/items", {
    method: "POST",
    token: cartToken,
    body: { slug: "essential-crew", size: "M", quantity: 1 }
  });
  check("adding the same product again raises the quantity",
    cartAddAgain.status === 200 && cartAddAgain.payload.lines[0]?.quantity === 3,
    JSON.stringify(cartAddAgain.payload.lines?.[0] || cartAddAgain.payload).slice(0, 200));

  check("a cart line carries the current price and name",
    cartAddAgain.payload.lines[0]?.name === "Essential Crew" && cartAddAgain.payload.lines[0]?.unitPriceKobo > 0,
    JSON.stringify(cartAddAgain.payload.lines?.[0] || {}).slice(0, 200));

  const cartRead = await call("/api/cart", { token: cartToken });
  check("the cart survives being read again on another device",
    cartRead.status === 200 && cartRead.payload.lines.length === 1 && cartRead.payload.count === 3);

const other = await call("/api/auth/demo", { method: "POST", body: { email: "someone-else@sultan.test" } });
  const otherToken = other.payload?.token;
  const cartOtherUser = await call("/api/cart", { token: otherToken });
  check("one customer's cart is not visible to another",
    cartOtherUser.status === 200 && cartOtherUser.payload.lines.length === 0,
    JSON.stringify(cartOtherUser.payload).slice(0, 200));

  const cartPatch = await call("/api/cart/items", {
    method: "PATCH",
    token: cartToken,
    body: { slug: "essential-crew", size: "M", quantity: 5 }
  });
  check("a quantity can be changed", cartPatch.status === 200 && cartPatch.payload.lines[0]?.quantity === 5);

  // The guest-bag merge: items held on a device before sign-in fold in, quantities add, and
  // anything that no longer exists is dropped rather than breaking the merge.
  const cartMerge = await call("/api/cart/merge", {
    method: "POST",
    token: cartToken,
    body: {
      items: [
        { slug: "essential-crew", size: "M", quantity: 2 },
        { slug: "soft-form-knit", size: "L", quantity: 1 },
        { slug: "no-longer-exists", quantity: 4 }
      ]
    }
  });
  check("a guest bag merges into the account cart",
    cartMerge.status === 200 && cartMerge.payload.lines.length === 2,
    JSON.stringify(cartMerge.payload).slice(0, 250));
  check("merging adds quantities rather than replacing them",
    cartMerge.payload.lines.find((line) => line.slug === "essential-crew")?.quantity === 7,
    JSON.stringify(cartMerge.payload.lines).slice(0, 250));
  check("merging drops products that no longer exist",
    !cartMerge.payload.lines.some((line) => line.slug === "no-longer-exists"));

  const cartCap = await call("/api/cart/items", {
    method: "PATCH",
    token: cartToken,
    body: { slug: "essential-crew", size: "M", quantity: 999 }
  });
  check("a quantity above the per-line cap is clamped to 20",
    cartCap.payload.lines.find((line) => line.slug === "essential-crew")?.quantity === 20,
    JSON.stringify(cartCap.payload.lines).slice(0, 200));

  const cartBadSize = await call("/api/cart/items", {
    method: "POST",
    token: cartToken,
    body: { slug: "soft-form-knit", size: "XXXXL", quantity: 1 }
  });
  check("an invalid size is rejected", cartBadSize.status === 422, JSON.stringify(cartBadSize.payload).slice(0, 200));

  const cartNoSize = await call("/api/cart/items", {
    method: "POST",
    token: cartToken,
    body: { slug: "soft-form-knit", quantity: 1 }
  });
  check("a sized product requires a size", cartNoSize.status === 422);

  const cartBadProduct = await call("/api/cart/items", {
    method: "POST",
    token: cartToken,
    body: { slug: "no-longer-exists", quantity: 1 }
  });
  check("an unknown product is rejected", cartBadProduct.status === 422);

  check("the cart is not readable without a token", (await call("/api/cart", {})).status === 401);
  check("the cart cannot be written without a token",
(await call("/api/cart/items", { method: "POST", body: { slug: "essential-crew", size: "M", quantity: 1 } })).status === 401);

  const cartDelete = await call("/api/cart/items?slug=essential-crew&size=M", { method: "DELETE", token: cartToken });
  check("removing a line leaves the others alone",
    cartDelete.status === 200 && cartDelete.payload.lines.length === 1 && cartDelete.payload.count === 1,
    JSON.stringify(cartDelete.payload).slice(0, 200));

// The remaining cart endpoint: replacing the whole bag in one call, which is what a client
  // does when it needs to push a local bag back up.
  const replace = await call("/api/cart", {
    method: "PUT",
    token: cartToken,
    body: { items: [{ slug: "wide-trouser", size: "UK 8", quantity: 2 }, { slug: "ribbed-tank", size: "M", quantity: 1 }] }
  });
  check("a whole bag can be replaced in one call",
    replace.status === 200 && replace.payload.lines.length === 2 && replace.payload.count === 3,
    JSON.stringify(replace.payload).slice(0, 250));

  const replacedAgain = await call("/api/cart", {
    method: "PUT",
    token: cartToken,
    body: { items: [{ slug: "wide-trouser", size: "UK 8", quantity: 1 }] }
  });
  check("replacing the bag drops what is no longer listed",
    replacedAgain.payload.lines.length === 1 && replacedAgain.payload.count === 1,
    JSON.stringify(replacedAgain.payload).slice(0, 250));

  const emptied = await call("/api/cart", { method: "DELETE", token: cartToken });
  check("the bag can be emptied", emptied.status === 200 && emptied.payload.lines.length === 0);

  const badState = await call("/api/orders", {
    method: "POST",
    token: shopperToken,
    body: {
      ...validOrder("essential-crew"),
      shipping: { ...validOrder("essential-crew").shipping, state: "Wakanda" }
    }
  });
  check("state is validated", badState.status === 422 && Boolean(badState.payload?.fields?.state));

// Put something in the shopper's stored bag so the order below also proves that checking out
  // empties the server copy, which is what stops the phone app showing bought items.
  await call("/api/cart/items", {
    method: "POST",
    token: shopperToken,
    body: { slug: "essential-crew", size: "M", quantity: 1 }
  });

  const placed = await call("/api/orders", { method: "POST", token: shopperToken, body: validOrder("essential-crew") });
  const order = placed.payload?.order;
  check("checking out empties the stored bag", (await call("/api/cart", { token: shopperToken })).payload.count === 0);
  check("order is created", placed.status === 201 && Boolean(order?.orderNumber), JSON.stringify(placed.payload));
  check("order number is formatted", /^SLT-\d{4}-\d{5}$/.test(order?.orderNumber || ""));
  check("order totals are computed", order?.subtotalKobo === 15000000 && order?.totalKobo === 15000000,
    `subtotal ${order?.subtotalKobo} total ${order?.totalKobo}`);
  check("order items are stored", order?.items?.length === 1 && order?.items[0].slug === "essential-crew");
  check("order email result is reported", placed.payload?.email?.sent === false);

  const underThreshold = await call("/api/orders", { method: "POST", token: shopperToken, body: validOrder("ribbed-tank") });
  check("delivery is charged under the threshold", underThreshold.payload?.order?.deliveryKobo === 750000,
    `delivery ${underThreshold.payload?.order?.deliveryKobo}`);
  check("delivery is added to the total", underThreshold.payload?.order?.totalKobo === 6500000 + 750000,
    `total ${underThreshold.payload?.order?.totalKobo}`);

  const myOrders = await call("/api/orders", { token: shopperToken });
  check("shopper sees their orders", myOrders.payload?.orders?.length === 2);

  const oneOrder = await call(`/api/orders/${order.orderNumber}`, { token: shopperToken });
  check("shopper can open one order", oneOrder.payload?.order?.orderNumber === order.orderNumber);

  const resend = await call(`/api/orders/${order.orderNumber}/resend`, { method: "POST", token: shopperToken });
  check("confirmation can be resent", resend.status === 200 && resend.payload?.sent === false);

  const stranger = await call("/api/auth/demo", { method: "POST", body: { email: "mallory@sultan.test" } });
  const stolen = await call(`/api/orders/${order.orderNumber}`, { token: stranger.payload.token });
  check("another shopper cannot read the order", stolen.status === 404);

  const shopperAdmin = await call("/api/admin/overview", { token: shopperToken });
  check("non-admin is blocked from the console", shopperAdmin.status === 403);
  const noTokenAdmin = await call("/api/admin/orders");
  check("console requires sign-in", noTokenAdmin.status === 401);

  const owner = await call("/api/auth/demo", { method: "POST", body: { email: adminEmail, name: "Owner" } });
  const ownerToken = owner.payload?.token;
  check("owner is flagged as admin", owner.payload?.user?.isAdmin === true);

  const overview = await call("/api/admin/overview", { token: ownerToken });
  check("overview counts orders", overview.payload?.stats?.orderCount === 2);
  check(
    "overview totals revenue",
    overview.payload?.stats?.revenueKobo === 15000000 + 6500000 + 750000,
    `revenue ${overview.payload?.stats?.revenueKobo}`
  );
  check("overview reports stock", typeof overview.payload?.stats?.unitsInStock === "number");
  check("overview flags low stock", Array.isArray(overview.payload?.stats?.lowStock));

  const adminOrders = await call("/api/admin/orders", { token: ownerToken });
  check("owner sees every order", adminOrders.payload?.orders?.length === 2);

  const filtered = await call("/api/admin/orders?status=shipped", { token: ownerToken });
  check("status filter works", filtered.payload?.orders?.length === 0);

  const target = adminOrders.payload.orders[0];
  const statusChange = await call(`/api/admin/orders/${target.id}`, {
    method: "PATCH",
    token: ownerToken,
    body: { status: "shipped" }
  });
  check("owner updates order status", statusChange.payload?.order?.status === "shipped");

  const badStatus = await call(`/api/admin/orders/${target.id}`, {
    method: "PATCH",
    token: ownerToken,
    body: { status: "teleported" }
  });
  check("unknown status is rejected", badStatus.status === 422);

  const adminProducts = await call("/api/admin/products", { token: ownerToken });
  check("owner sees inactive products too", adminProducts.payload?.products?.length === 8);

  const product = adminProducts.payload.products.find((entry) => entry.slug === "tailored-overcoat");
  const productUpdate = await call(`/api/admin/products/${product.id}`, {
    method: "PATCH",
    token: ownerToken,
    body: { priceKobo: 42500000, stock: 3 }
  });
  check("owner updates a product", productUpdate.payload?.product?.priceKobo === 42500000);

  const badProduct = await call(`/api/admin/products/${product.id}`, {
    method: "PATCH",
    token: ownerToken,
    body: { stock: -5 }
  });
  check("negative stock is rejected", badProduct.status === 422);

  const csv = await fetch(`${base}/api/admin/orders.csv`, {
    headers: { authorization: `Bearer ${ownerToken}` }
  });
  const csvText = await csv.text();
  check("orders export as CSV", csv.status === 200 && csvText.includes("order_number"));

  const shopProducts = await call("/api/products");
  const updated = shopProducts.payload.products.find((entry) => entry.slug === "tailored-overcoat");
  check("shop reflects the price change", updated.priceKobo === 42500000);

  const newsletter = await call("/api/newsletter", { method: "POST", body: { email: "fan@sultan.test" } });
  check("newsletter signup is stored", newsletter.status === 200 && newsletter.payload?.email === "fan@sultan.test");

  const badNewsletter = await call("/api/newsletter", { method: "POST", body: { email: "not-an-email" } });
  check("newsletter validates the address", badNewsletter.status === 422);

  const subscribers = await call("/api/admin/subscribers", { token: ownerToken });
  check("owner sees subscribers", subscribers.payload?.subscribers?.length === 1);

  const pages = ["/", "/product.html?slug=essential-crew", "/checkout.html", "/account.html", "/admin.html"];
  for (const pathname of pages) {
    const response = await fetch(`${base}${pathname}`);
    check(`page ${pathname} is served`, response.status === 200, `status ${response.status}`);
  }

  const notFound = await fetch(`${base}/nowhere`);
  const notFoundBody = await notFound.text();
  check("unknown page returns the 404 page", notFound.status === 404 && notFoundBody.includes("Sultan"));

  const vendor = await fetch(`${base}/vendor/supabase.js`);
  check("supabase browser client is served locally", vendor.status === 200);

  const secret = await fetch(`${base}/../.env`);
  check(".env is not served", secret.status >= 400, `status ${secret.status}`);

  const mailLogged = serverLog.includes("[mail:demo] ");
  check("confirmation email was attempted and logged", mailLogged);
  check(
    "confirmation email addressed to the customer",
    serverLog.includes(`${shopperEmail} :: Sultan Clothing \u2014 order`),
    serverLog
  );
  check(
    "owner notification is addressed to the shop",
    serverLog.includes("Sultan Clothing order SLT-"),
    serverLog
  );
  check("no email was sent without a recipient", !serverLog.includes("no recipient"));
} finally {
  server.kill();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(`\nFailed: ${failures.join(", ")}`);
  if (serverLog.trim()) console.log(`\n--- server output ---\n${serverLog}`);
  process.exit(1);
}
console.log("");

