import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const chromePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = process.env.SMOKE_PORT || "3995";
const debugPort = process.env.CDP_PORT || "9333";
const base = `http://127.0.0.1:${port}`;
const shopperEmail = "ada@sultan.test";
const adminEmail = "owner@sultan.test";

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

const server = spawn(process.execPath, ["server/index.js"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: port, DEMO_MODE: "true", ADMIN_EMAILS: adminEmail },
  stdio: ["ignore", "pipe", "pipe"]
});
let serverLog = "";
server.stdout.on("data", (chunk) => (serverLog += chunk));
server.stderr.on("data", (chunk) => (serverLog += chunk));

const waitFor = async (fn, tries = 80) => {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      if (await fn()) return true;
    } catch {
      // keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
};

let chrome;
let socket;
let messageId = 0;
const pageErrors = [];
const pending = new Map();
let navigating = false;

function send(method, params = {}) {
  const id = ++messageId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`${method} timed out`));
      }
    }, 30000);
  });
}

async function evaluate(expression, tries = 8) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const result = await send("Runtime.evaluate", {
        expression: `(async () => { ${expression} })()`,
        awaitPromise: true,
        returnByValue: true
      });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description || "evaluate failed");
      }
      return result.result.value;
    } catch (error) {
      // A page that navigates mid-call tears down its execution context, which the protocol
      // reports as an error. Retry briefly so a redirect settles instead of failing the run.
      if (attempt >= tries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
}

const collectRejections = async () => {
  try {
    return await evaluate("return window.__rejections || [];");
  } catch {
    return [];
  }
};

const waitHelper = `const waitForIt = async (fn, tries = 80) => {
  for (let i = 0; i < tries; i += 1) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
};`;

async function navigate(url) {
  // Page.navigate resolves on commit, so the previous document can still be live and report
  // readyState === "complete". Wait for the expected path to actually be the one on screen.
  const wanted = new URL(url).pathname + new URL(url).search;
  navigating = true;
  await send("Page.navigate", { url });
  await new Promise((resolve) => setTimeout(resolve, 300));
  navigating = false;
  const settled = await waitFor(async () => {
    try {
      const here = await evaluate(
        `return document.readyState === "complete" ? location.pathname + location.search : "";`
      );
      return here === wanted;
    } catch {
      return false;
    }
  }, 120);
  if (!settled) throw new Error(`navigation to ${wanted} did not settle (still on ${await evaluate("return location.pathname;").catch(() => "?")})`);
}

let step = "startup";
const at = (label) => {
  step = label;
  return label;
};

const profile = mkdtempSync(path.join(tmpdir(), "sultan-journey-"));

try {
  console.log("\nSultan — customer journey\n");

  check("server starts", await waitFor(async () => (await fetch(`${base}/api/health`)).ok), serverLog.slice(-300));
  if (!existsSync(chromePath)) throw new Error("Chrome not found at " + chromePath);

  chrome = spawn(
    chromePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-extensions",
      "--disable-dev-shm-usage",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profile}`,
      "about:blank"
    ],
    { stdio: ["ignore", "ignore", "ignore"] }
  );

  const ready = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
    return response.ok;
  }, 60);
  check("chrome devtools is reachable", ready);

  const target = await (
    await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" })
  ).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error("devtools socket failed"));
  });
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result);
      return;
    }
    if (message.method === "Runtime.exceptionThrown") {
      const detail = message.params.exceptionDetails;
      pageErrors.push(detail.exception?.description || detail.text);
    }
    if (message.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(message.params.type)) {
      pageErrors.push(message.params.args.map((arg) => arg.value ?? arg.description ?? "").join(" "));
    }
  };

await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.setLifecycleEventsEnabled", { enabled: true });

  // Unhandled promise rejections never surface through Runtime.exceptionThrown, so trap them
  // in every document before its scripts run.
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.__rejections = [];
      addEventListener("unhandledrejection", (event) => {
        window.__rejections.push(String((event.reason && event.reason.stack) || event.reason));
      });
      addEventListener("error", (event) => {
        window.__rejections.push(String(event.message));
      });`
  });

  at("sign-in");
  await navigate(`${base}/account.html`);
  const signIn = await evaluate(`${waitHelper}
    const email = document.querySelector("#authEmail");
    email.value = "${shopperEmail}";
    document.querySelector("#authName").value = "Ada Obi";
    document.querySelector("#authForm").requestSubmit();
    const ok = await waitForIt(() => !document.querySelector("#accountCard").hidden);
    return { ok, name: document.querySelector("#accountName")?.textContent || "" };
  `);
  check("shopper can sign in", signIn.ok, JSON.stringify(signIn));
  check("signed-in name is shown", signIn.name === "Ada Obi", signIn.name);

  at("add to bag");
  await navigate(`${base}/index.html`);
  const added = await evaluate(`${waitHelper}
    const ready = await waitForIt(() => document.querySelectorAll(".product").length > 0);
    document.querySelector("[data-add]").click();
    const counted = await waitForIt(() => document.querySelector("#cartCount").textContent === "1");
    const stored = JSON.parse(localStorage.getItem("sultan.cart") || "[]");
    return { ready, counted, lines: stored.length, slug: stored[0]?.slug || "", size: stored[0]?.size || null };
  `);
  check("add to bag updates the header", added.counted, JSON.stringify(added));
  check("the bag survives a page load", added.lines === 1, JSON.stringify(added));
  check("a size is stored with the line", added.size === "S", JSON.stringify(added));

  at("cart drawer");
  const drawer = await evaluate(`${waitHelper}
    document.querySelector("#cartButton").click();
    const opened = await waitForIt(() => document.querySelector("#cartDrawer").classList.contains("open"));
    document.querySelector('#cartDrawer [data-act="inc"]').click();
    const qty = await waitForIt(() => JSON.parse(localStorage.getItem("sultan.cart"))[0].quantity === 2);
    const subtotal = document.querySelector('[data-drawer-subtotal="cartDrawer"]').textContent;
    return { opened, qty, subtotal };
  `);
  check("cart drawer opens", drawer.opened, JSON.stringify(drawer));
  check("quantity can be increased", drawer.qty, JSON.stringify(drawer));
  check("subtotal is calculated", drawer.subtotal === "₦300,000", drawer.subtotal);

  at("checkout summary");
  await navigate(`${base}/checkout.html`);
  const summary = await evaluate(`${waitHelper}
    const shown = await waitForIt(() => !document.querySelector("#checkout").hidden);
    return {
      shown,
      total: document.querySelector("#summaryTotal").textContent,
      delivery: document.querySelector("#summaryDelivery").textContent,
      button: document.querySelector("#placeOrder").textContent,
      states: document.querySelectorAll("#state option").length
    };
  `);
  check("checkout opens for a signed-in shopper", summary.shown, JSON.stringify(summary));
  check("delivery is free over the threshold", summary.delivery === "Free", JSON.stringify(summary));
  check("checkout total matches the bag", summary.total === "₦300,000", JSON.stringify(summary));
  check("nigerian states are listed", summary.states > 30, JSON.stringify(summary));

  at("empty form validation");
  const invalid = await evaluate(`${waitHelper}
    document.querySelector("#placeOrder").click();
    const flagged = await waitForIt(() => document.querySelector('[data-error="phone"]')?.hidden === false);
    return {
      flagged,
      phone: document.querySelector('[data-error="phone"]')?.textContent || "",
      address: document.querySelector('[data-error="addressLine1"]')?.textContent || "",
      city: document.querySelector('[data-error="city"]')?.textContent || "",
      state: document.querySelector('[data-error="state"]')?.textContent || "",
      toast: document.querySelector(".toast")?.textContent || ""
    };
  `);
  const checkoutErrors = [...pageErrors, ...(await collectRejections())];
  check("checkout blocks an incomplete form", invalid.flagged, JSON.stringify(invalid) + " errors=" + JSON.stringify(checkoutErrors));
  check("each empty field is explained", /phone number/i.test(invalid.phone) && /street address/i.test(invalid.address) && /city/i.test(invalid.city) && /state/i.test(invalid.state), JSON.stringify(invalid));
  check("no javascript errors on checkout", checkoutErrors.length === 0, JSON.stringify(checkoutErrors));

  at("placing the order");
  const order = await evaluate(`${waitHelper}
    const set = (id, value) => {
      const node = document.querySelector(id);
      node.value = value;
      node.dispatchEvent(new Event("input", { bubbles: true }));
    };
    set("#fullName", "Ada Obi");
    set("#phone", "08031234567");
    set("#addressLine1", "12 Marina Road");
    set("#city", "Lagos");
    set("#state", "Lagos");
    set("#cardNumber", "4242424242424242");
    set("#cardName", "ADA OBI");
    set("#expiry", "1230");
    set("#cvc", "123");
    return { expiry: document.querySelector("#expiry").value };
  `);
  check("the card number is formatted as it is typed", order.expiry === "12/30", order.expiry);

  // Kick the order off without awaiting it: a successful order navigates away, which destroys
  // the execution context this call is running in.
  await evaluate(`document.querySelector("#placeOrder").click(); return true;`);
  const landed = await waitFor(async () => {
    try {
      return (await evaluate("return location.pathname + location.search;")).includes("account.html?");
    } catch {
      return false;
    }
  });
  const landing = await evaluate("return location.pathname + location.search;");
  check("order is placed and lands on the account", landed && landing.includes("placed=1"), landing);
  const orderNumber = decodeURIComponent((landing.match(/order=([^&]+)/) || [])[1] || "");
  check("an order number is issued", /^SLT-\d{4}-\d{5}$/.test(orderNumber), orderNumber);
  const banner = await evaluate(`${waitHelper}
    const shown = await waitForIt(() => !document.querySelector("#placedBanner").hidden);
    return { shown, text: document.querySelector("#placedBanner").textContent };
  `);
  check("the confirmation is acknowledged on screen", banner.shown && /confirmed/i.test(banner.text), JSON.stringify(banner));

  at("bag emptied after checkout");
  const emptied = await evaluate(`${waitHelper}
    return { cart: JSON.parse(localStorage.getItem("sultan.cart") || "[]").length, url: location.pathname };
  `);
  check("the bag is emptied after checkout", emptied.cart === 0, JSON.stringify(emptied));

  at("session survives reload");
  await navigate(`${base}/index.html`);
  const reopened = await evaluate(`${waitHelper}
    const ready = await waitForIt(() => document.body.dataset.signedIn !== undefined);
    return {
      signedIn: document.body.dataset.signedIn,
      ordersLink: !document.querySelector("#ordersLink").hidden,
      account: document.querySelector("#accountButton span").textContent
    };
  `);
  check("session survives closing and reopening the page", reopened.signedIn === "true", JSON.stringify(reopened));
  check("the orders link appears when signed in", reopened.ordersLink, JSON.stringify(reopened));
  check("the header greets the shopper", reopened.account === "Ada", JSON.stringify(reopened));

  at("orders after reload");
  await navigate(`${base}/account.html`);
  const ordersAfterReload = await evaluate(`${waitHelper}
    const ready = await waitForIt(() => document.querySelectorAll(".order").length > 0);
    return {
      ready,
      count: document.querySelectorAll(".order").length,
      first: document.querySelector(".order-number")?.textContent || "",
      label: document.querySelector("#ordersCount").textContent
    };
  `);
  check("the order is listed after a reload", ordersAfterReload.ready, JSON.stringify(ordersAfterReload));
  check("the right order is listed", ordersAfterReload.first === orderNumber, ordersAfterReload.first);
  check("the order count is shown", ordersAfterReload.label === "1 order", ordersAfterReload.label);

  at("sign out and back in");
  const signedOut = await evaluate(`${waitHelper}
    document.querySelector("#logoutButton").click();
    const gone = await waitForIt(() => !document.querySelector("#authCard").hidden);
    return { gone, stored: localStorage.getItem("sultan.session"), body: document.body.dataset.signedIn };
  `);
  check("signing out returns to the sign-in card", signedOut.gone, JSON.stringify(signedOut));
  check("signing out clears the stored session", signedOut.stored === null, String(signedOut.stored));

  at("orders hidden while signed out");
  const ordersWhileOut = await evaluate(`${waitHelper}
    const cleared = await waitForIt(() => document.querySelectorAll(".order").length === 0);
    return { cleared, list: document.querySelector("#ordersList").innerHTML.trim() };
  `);
  check("orders are not shown while signed out", ordersWhileOut.cleared, ordersWhileOut.list);

  const signedBackIn = await evaluate(`${waitHelper}
    document.querySelector("#authEmail").value = "${shopperEmail}";
    document.querySelector("#authForm").requestSubmit();
    const back = await waitForIt(() => document.querySelectorAll(".order").length > 0);
    return {
      back,
      first: document.querySelector(".order-number")?.textContent || "",
      total: document.querySelector(".order-total")?.textContent || "",
      status: document.querySelector(".status")?.textContent || ""
    };
  `);
  check("signing in again restores the orders", signedBackIn.back, JSON.stringify(signedBackIn));
  check("the same order comes back", signedBackIn.first === orderNumber, signedBackIn.first);
  check("the order total is correct", signedBackIn.total === "₦300,000", signedBackIn.total);
  check("the order status is shown", /confirmed/i.test(signedBackIn.status), signedBackIn.status);

  at("resend confirmation");
  const resend = await evaluate(`${waitHelper}
    document.querySelector("[data-toggle]").click();
    const opened = await waitForIt(() => !document.querySelector(".order-detail").hidden);
    document.querySelector("[data-resend]").click();
    const done = await waitForIt(() => /confirmation|mailgun/i.test(document.querySelector(".toast")?.textContent || ""));
    return {
      opened,
      toast: document.querySelector(".toast")?.textContent || "",
      button: document.querySelector("[data-resend]")?.textContent.trim() || ""
    };
  `);
  check("order details expand", resend.opened, JSON.stringify(resend));
  check("the confirmation can be resent", /confirmation|mailgun/i.test(resend.toast), resend.toast);
  check("the resend button resets", resend.button !== "Sending…", resend.button);

  at("owner lock");
  at("owner lock");
  let adminProbe = null;
  try {
    await navigate(`${base}/admin.html`);
    adminProbe = await evaluate(`
      return {
        url: location.pathname,
        hasLock: Boolean(document.querySelector("#adminLock")),
        hasGate: Boolean(document.querySelector("#gateEmail")),
        ids: [...document.querySelectorAll("[id]")].map((n) => n.id).slice(0, 20)
      };
    `);
  } catch (error) {
    adminProbe = { navigateFailed: error.message };
  }
  // The gate reloads the page on submit, so fire it without awaiting and poll afterwards.
  await evaluate(`
    document.querySelector("#gateEmail").value = "${shopperEmail}";
    document.querySelector("#gateForm").requestSubmit();
    return true;
  `);
  await waitFor(async () => {
    try {
      return await evaluate(`return Boolean(document.querySelector("#lockReason")?.textContent?.trim());`);
    } catch {
      return false;
    }
  });
  const locked = await evaluate(`
    const panel = document.querySelector("#adminLock");
    return {
      hasLock: Boolean(panel),
      stillLocked: Boolean(panel) && !panel.hidden,
      formHidden: document.querySelector("#gateForm")?.hidden,
      reason: document.querySelector("#lockReason")?.textContent || "",
      rejections: window.__rejections || []
    };
  `);
  check("a normal shopper stays locked out of the console", locked.stillLocked, JSON.stringify(locked));
  check("the reason explains how to get access", /ADMIN_EMAILS/.test(locked.reason), locked.reason);

  at("owner console");
  const console_ = await evaluate(`${waitHelper}
    document.querySelector("#gateEmail").value = "${adminEmail}";
    document.querySelector("#gateForm").requestSubmit();
    const entered = await waitForIt(() => !document.querySelector("#adminBody").hidden, 100);
    const ordersReady = await waitForIt(() => document.querySelectorAll("#ordersBody tr").length > 0, 100);
    return {
      entered,
      ordersReady,
      stats: [...document.querySelectorAll(".stat-value")].map((n) => n.textContent),
      rows: document.querySelectorAll("#ordersBody tr").length,
      firstOrder: document.querySelector("#ordersBody strong")?.textContent || ""
    };
  `);
  check("the owner can open the console", console_.entered, JSON.stringify(console_));
  check("orders appear in the console", console_.ordersReady, JSON.stringify(console_));
  check("the customer order is visible to the owner", console_.firstOrder === orderNumber, console_.firstOrder);
  check("revenue is totalled", console_.stats[1] === "₦300,000", JSON.stringify(console_.stats));

  at("owner edits a product");
  const updated = await evaluate(`${waitHelper}
    document.querySelector('[data-tab="products"]').click();
    const loaded = await waitForIt(() => document.querySelectorAll("#productsBody tr").length > 0, 100);
    const row = document.querySelector('#productsBody tr[data-product]');
    row.querySelector('[data-field="stock"]').value = "42";
    row.querySelector("[data-save]").click();
    const saved = await waitForIt(() => /updated/.test(document.querySelector(".toast")?.textContent || ""));
    return { loaded, saved, toast: document.querySelector(".toast")?.textContent || "" };
  `);
  check("products load in the console", updated.loaded, JSON.stringify(updated));
  check("stock can be edited and saved", updated.saved, JSON.stringify(updated));

  at("owner changes a status");
  const statusUpdate = await evaluate(`${waitHelper}
    document.querySelector('[data-tab="orders"]').click();
    const ready = await waitForIt(() => document.querySelectorAll("#ordersBody tr").length > 0, 100);
    const select = document.querySelector(".status-select");
    select.value = "shipped";
    select.dispatchEvent(new Event("change"));
    const done = await waitForIt(() => document.querySelector("#ordersBody .status-select")?.value === "shipped", 100);
    return { ready, done };
  `);
  check("an order status can be changed", statusUpdate.done, JSON.stringify(statusUpdate));

  at("shopper sees the new status");
  await navigate(`${base}/account.html`);
  // The console signed in as the owner, so switch back to the shopper to check their view.
  const signedBackInAsShopper = await evaluate(`${waitHelper}
    document.querySelector("#logoutButton").click();
    const out = await waitForIt(() => !document.querySelector("#authCard").hidden);
    document.querySelector("#authEmail").value = "${shopperEmail}";
    document.querySelector("#authForm").requestSubmit();
    const ready = await waitForIt(() => !document.querySelector("#accountCard").hidden, 100);
    const orders = await waitForIt(() => document.querySelectorAll(".order").length > 0, 100);
    return {
      out,
      ready,
      orders,
      status: document.querySelector(".status")?.textContent || "",
      statusClass: document.querySelector(".status")?.className || ""
    };
  `);
  check(
    "the shopper sees the new status",
    signedBackInAsShopper.status === "On the way" && /status-shipped/.test(signedBackInAsShopper.statusClass),
    JSON.stringify(signedBackInAsShopper)
  );

  const serverHasBothMails = /is now shipped/.test(serverLog);
  check("the status change emailed the customer", serverHasBothMails, serverLog.slice(-400));
} catch (error) {
  failures.push(`journey crashed while: ${step}`);
  console.log(`  FAIL  journey crashed while: ${step} -> ${error.message}`);
  console.log(`\n--- server output ---\n${serverLog.slice(-1500)}`);
} finally {
  try {
    socket?.close();
  } catch {
    // already closed
  }
  chrome?.kill();
  server.kill();
  await new Promise((resolve) => setTimeout(resolve, 800));
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch {
    console.log(`  note  left the temporary chrome profile at ${profile}`);
  }
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(`\nFailed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("");
