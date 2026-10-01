import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const chromePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = process.env.SMOKE_PORT || "3998";
const base = `http://127.0.0.1:${port}`;
const adminEmail = "owner@sultan.test";
const shopperEmail = "ada@sultan.test";

if (!existsSync(chromePath)) {
  console.log("  skip  Chrome not found at " + chromePath);
  process.exit(0);
}

let passed = 0;
const failures = [];
const check = (label, condition, detail = "") => {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label}${detail ? ` -> ${String(detail).slice(0, 400)}` : ""}`);
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

const waitForServer = async () => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  return false;
};

const profile = mkdtempSync(path.join(tmpdir(), "sultan-chrome-"));

function runChrome(url, { extraArgs = [] } = {}) {
  const output = mkdtempSync(path.join(tmpdir(), "sultan-dump-"));
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-extensions",
    "--virtual-time-budget=6000",
    "--run-all-compositor-stages-before-draw",
    `--user-data-dir=${profile}`,
    `--dump-dom`,
    url,
    ...extraArgs
  ];
  return new Promise((resolve) => {
    const child = spawn(chromePath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let dom = "";
    let errors = "";
    child.stdout.on("data", (chunk) => (dom += chunk));
    child.stderr.on("data", (chunk) => (errors += chunk));
    child.on("close", () => {
      rmSync(output, { recursive: true, force: true });
      resolve({ dom, errors });
    });
  });
}

try {
  console.log("\nSultan — browser test\n");
  check("server starts", await waitForServer(), serverLog.slice(-300));

  const home = await runChrome(`${base}/index.html`);
  if (process.env.DUMP) writeFileSync(path.join(process.env.DUMP, "home.html"), home.dom);
  check("no module load errors on the home page", !/Failed to load module script|is not defined|Uncaught/.test(home.errors), home.errors);
  check("catalogue renders from the API", (home.dom.match(/class="product"/g) || []).length === 8,
    (home.dom.match(/class="product"/g) || []).length);
  check("prices are formatted in naira", home.dom.includes("₦150,000"), home.dom.slice(0, 200));
  check("result count is shown", /8 pieces/.test(home.dom));
  const countMatch = home.dom.match(/<em id="[a-zA-Z]+Count"[^>]*>[^<]*<\/em>/g) || [];
  check("cart and wishlist counters render", countMatch.length === 2, countMatch.join(" | ") || "no counters");
  check("counters do not animate on load", !home.dom.includes('id="cartCount" class="bump"'), countMatch.join(" | "));
  check("filter chips render", (home.dom.match(/class="chip/g) || []).length >= 5);

  const product = await runChrome(`${base}/product.html?slug=soft-form-knit`);
  check("product detail renders", /Soft Form Knit/.test(product.dom));
  check("size picker renders", (product.dom.match(/data-size="/g) || []).length === 4);
  check("product description renders", /merino blend/i.test(product.dom));
  check("related pieces render", /You may also like/.test(product.dom));

  const unknown = await runChrome(`${base}/product.html?slug=nope`);
  check("unknown product shows a message", /could not find that piece/i.test(unknown.dom));

  const checkoutEmpty = await runChrome(`${base}/checkout.html`);
  check("empty bag blocks checkout", /Your bag is empty, so there is nothing to check out/.test(checkoutEmpty.dom));

  const accountSignedOut = await runChrome(`${base}/account.html`);
  check("account page asks for sign-in", /Sign in to see your orders/.test(accountSignedOut.dom));
  check("orders are hidden when signed out", /id="ordersList" class="orders"><\/div>/.test(accountSignedOut.dom));

  const adminSignedOut = await runChrome(`${base}/admin.html`);
  check("console is locked when signed out", /Shop owner sign-in required/.test(adminSignedOut.dom));
} finally {
  server.kill();
  rmSync(profile, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(`\nFailed: ${failures.join(", ")}`);
  console.log(`\n--- server output ---\n${serverLog}`);
  process.exit(1);
}
console.log("");
