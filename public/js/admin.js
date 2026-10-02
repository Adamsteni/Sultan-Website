import { api, loadConfig, money, shortDate, dateTime, escapeHtml, config, toast } from "./core.js";
import { mountShell } from "./shell.js";
import { currentUser, isSignedIn, authProvider, renderGoogleButton, signInDemo, signInWithPassword, signOut } from "./auth.js";

const lock = document.querySelector("#adminLock");
const body = document.querySelector("#adminBody");
const gateMessage = document.querySelector("#gateMessage");

let statusFilter = "all";
let products = [];
let orders = [];

const STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled"];

function statCards(stats) {
  const cards = [
    { label: "Orders", value: String(stats.orderCount) },
    { label: "Revenue", value: money(stats.revenueKobo) },
    { label: "Live products", value: String(stats.productCount) },
    { label: "Units in stock", value: String(stats.unitsInStock) },
    { label: "Stock value", value: money(stats.inventoryValueKobo) },
    { label: "Subscribers", value: String(stats.subscriberCount || 0) }
  ];
  document.querySelector("#statGrid").innerHTML = cards
    .map(
      (card) => `<div class="stat">
        <p class="stat-label">${escapeHtml(card.label)}</p>
        <p class="stat-value">${escapeHtml(card.value)}</p>
      </div>`
    )
    .join("");
}

function renderOrders() {
  const body = document.querySelector("#ordersBody");
  document.querySelector("#ordersNone").hidden = orders.length > 0;
  body.innerHTML = orders
    .map(
      (order) => `
      <tr data-order="${escapeHtml(order.id)}">
        <td><strong>${escapeHtml(order.orderNumber)}</strong><br><span class="muted">${escapeHtml(
          order.payment.reference || ""
        )}</span></td>
        <td>${escapeHtml(dateTime(order.createdAt))}</td>
        <td>${escapeHtml(order.customer.fullName)}<br><span class="muted">${escapeHtml(order.email)}<br>${escapeHtml(
          order.customer.phone
        )}</span></td>
        <td>${escapeHtml(order.customer.addressLine1)}${
          order.customer.addressLine2 ? `<br>${escapeHtml(order.customer.addressLine2)}` : ""
        }<br>${escapeHtml(order.customer.city)}, ${escapeHtml(order.customer.state)}</td>
        <td>${order.items
          .map((item) => `<span class="muted">${escapeHtml(item.name)} ×${item.quantity}</span>`)
          .join("<br>")}</td>
        <td><strong>${money(order.totalKobo)}</strong><br><span class="muted">${escapeHtml(
          order.payment.method === "cod" ? "on delivery" : "card"
        )}</span></td>
        <td>
          <select class="status-select" data-status-for="${escapeHtml(order.id)}" aria-label="Status for ${escapeHtml(order.orderNumber)}">
            ${STATUSES.map(
              (status) =>
                `<option value="${status}"${status === order.status ? " selected" : ""}>${status}</option>`
            ).join("")}
          </select>
        </td>
        <td>${order.confirmationSentAt ? escapeHtml(shortDate(order.confirmationSentAt)) : "<span class=\"muted\">not sent</span>"}</td>
      </tr>`
    )
    .join("");

  body.querySelectorAll("[data-status-for]").forEach((select) =>
    select.addEventListener("change", async () => {
      select.disabled = true;
      try {
        await api(`/api/admin/orders/${encodeURIComponent(select.dataset.statusFor)}`, {
          method: "PATCH",
          body: { status: select.value }
        });
        toast(`${select.closest("tr").querySelector("strong").textContent} is now ${select.value}. The customer has been emailed.`, {
          tone: "success"
        });
        await refresh();
      } catch (error) {
        toast(error.message, { tone: "error" });
        select.disabled = false;
      }
    })
  );
}

function renderProducts() {
  const body = document.querySelector("#productsBody");
  body.innerHTML = products
    .map(
      (product) => `
      <tr data-product="${escapeHtml(product.id)}">
        <td><strong>${escapeHtml(product.name)}</strong><br><span class="muted">${escapeHtml(product.slug)}<br>${money(
          product.priceKobo
        )}</span></td>
        <td>${escapeHtml(product.category)}</td>
        <td><input type="number" min="0" step="100" value="${product.priceKobo}" data-field="priceKobo" aria-label="Price in kobo for ${escapeHtml(product.name)}" /></td>
        <td><input type="number" min="0" step="1" value="${product.stock}" data-field="stock" aria-label="Stock for ${escapeHtml(product.name)}" /></td>
        <td><input type="checkbox" data-field="featured" ${product.featured ? "checked" : ""} aria-label="Feature ${escapeHtml(product.name)}" /></td>
        <td><input type="checkbox" data-field="active" ${product.active ? "checked" : ""} aria-label="Show ${escapeHtml(product.name)} in the shop" /></td>
        <td><button type="button" class="button button-outline" data-save>Save</button></td>
      </tr>`
    )
    .join("");

  body.querySelectorAll("[data-product]").forEach((row) =>
    row.querySelector("[data-save]").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const patch = {};
      row.querySelectorAll("[data-field]").forEach((input) => {
        patch[input.dataset.field] = input.type === "checkbox" ? input.checked : Number(input.value);
      });
      button.disabled = true;
      try {
        const { product } = await api(`/api/admin/products/${encodeURIComponent(row.dataset.product)}`, {
          method: "PATCH",
          body: patch
        });
        const index = products.findIndex((entry) => entry.id === product.id);
        products[index] = product;
        toast(`${product.name} updated.`, { tone: "success" });
        renderProducts();
        await refreshStats();
      } catch (error) {
        toast(error.fields?.priceKobo || error.fields?.stock || error.message, { tone: "error" });
        button.disabled = false;
      }
    })
  );
}

async function renderSubscribers() {
  const { subscribers, count } = await api("/api/admin/subscribers");
  document.querySelector("#subscriberCount").textContent = `${count} on the list`;
  document.querySelector("#subscribersNone").hidden = count > 0;
  document.querySelector("#subscribersBody").innerHTML = subscribers
    .map(
      (entry) => `<tr>
        <td>${escapeHtml(entry.email)}</td>
        <td>${escapeHtml(shortDate(entry.createdAt))}</td>
        <td>${entry.welcomedAt ? escapeHtml(shortDate(entry.welcomedAt)) : "<span class=\"muted\">not sent</span>"}</td>
      </tr>`
    )
    .join("");
}

async function renderHealth() {
  const health = await api("/api/health");
  const rows = [
    { label: "Server", ok: true, detail: `${config().shopName} · ${health.mode} mode` },
    { label: "Database (Supabase)", ok: health.database.ok, detail: health.database.detail },
    { label: "Mailgun", ok: health.mailgun.configured, detail: health.mailgun.configured ? "Sending" : "Not configured" },
    ...health.integrations.map((item) => ({ label: item.name, ok: item.ok, detail: item.ok ? "Configured" : item.hint }))
  ];
  document.querySelector("#healthBody").innerHTML = rows
    .map(
      (row) => `<tr>
        <td>${escapeHtml(row.label)}</td>
        <td><span class="status status-${row.ok ? "delivered" : "cancelled"}">${row.ok ? "Ready" : "Action needed"}</span></td>
        <td>${escapeHtml(row.detail)}</td>
      </tr>`
    )
    .join("");
}

async function refreshStats() {
  const { stats } = await api("/api/admin/overview");
  statCards(stats);
}

async function refresh() {
  const [orderPayload] = await Promise.all([
    api(`/api/admin/orders${statusFilter === "all" ? "" : `?status=${statusFilter}`}`),
    products.length ? Promise.resolve(null) : api("/api/admin/products")
  ]);
  orders = orderPayload.orders;
  renderOrders();
  await refreshStats();
}

async function loadProducts() {
  const payload = await api("/api/admin/products");
  products = payload.products;
  renderProducts();
}

function wireTabs() {
  document.querySelectorAll(".tab").forEach((tab) =>
    tab.addEventListener("click", async () => {
      document.querySelectorAll(".tab").forEach((node) => {
        node.classList.toggle("active", node === tab);
        node.setAttribute("aria-selected", String(node === tab));
      });
      document.querySelectorAll(".admin-panel").forEach((panel) => {
        panel.hidden = panel.dataset.panel !== tab.dataset.tab;
      });
      if (tab.dataset.tab === "products" && !products.length) await loadProducts();
      if (tab.dataset.tab === "subscribers") await renderSubscribers();
      if (tab.dataset.tab === "health") await renderHealth();
    })
  );
}

document.querySelector("#orderFilters").addEventListener("click", async (event) => {
  const chip = event.target.closest("[data-status]");
  if (!chip) return;
  statusFilter = chip.dataset.status;
  document.querySelectorAll("#orderFilters .chip").forEach((node) => {
    node.classList.toggle("active", node === chip);
  });
  await refresh();
});

document.querySelector("#refreshButton").addEventListener("click", async () => {
  try {
    await refresh();
    await loadProducts();
    toast("Console refreshed.", { tone: "success" });
  } catch (error) {
    toast(error.message, { tone: "error" });
  }
});

document.querySelector("#logoutButton").addEventListener("click", async () => {
  await signOut();
  window.location.href = "./index.html";
});

document.querySelector("#gateForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.querySelector("#gateEmail").value.trim();
  const password = document.querySelector("#gatePassword").value;
  gateMessage.hidden = true;
  try {
    if (authProvider() === "demo") await signInDemo({ email, name: email.split("@")[0] });
    else await signInWithPassword(email, password);
    window.location.reload();
  } catch (error) {
    gateMessage.textContent = error.message;
    gateMessage.hidden = false;
  }
});

function renderGate() {
  const supabase = authProvider() === "supabase";
  document.querySelectorAll("[data-email-only]").forEach((node) => {
    node.hidden = !supabase;
  });
  document.querySelectorAll("[data-google-only]").forEach((node) => {
    node.hidden = !supabase;
  });
  if (!supabase) {
    document.querySelector("#lockReason").textContent = config().demoMode
      ? "Demo mode is on, so any email can sign in — but only an address listed in ADMIN_EMAILS is treated as the shop owner. Add yours to .env and restart."
      : "This console is only for the shop owner. Add your Google account to ADMIN_EMAILS in .env and sign in.";
  }
  renderGoogleButton(document.querySelector("#googleWrap"), (error) => {
    if (error) {
      gateMessage.textContent = error.message;
      gateMessage.hidden = false;
      return;
    }
    window.location.reload();
  });
}

async function enter() {
  const user = currentUser();
  if (!user) {
    lock.hidden = false;
    renderGate();
    return;
  }
  if (!user.isAdmin) {
    document.querySelector("#lockReason").textContent =
      `You are signed in as ${user.email}, which is not listed in ADMIN_EMAILS. Add that address to .env to open this console.`;
    lock.hidden = false;
    document.querySelector("#googleWrap").closest(".auth-social").hidden = true;
    document.querySelector("#gateForm").hidden = true;
    return;
  }
  body.hidden = false;
  document.querySelector("#ownerBadge").textContent = `Shop owner · ${user.email}`;

  try {
    await refresh();
    await loadProducts();
  } catch (error) {
    toast(error.message, { tone: "error" });
  }
}

async function start() {
  await loadConfig();
  await mountShell();
  wireTabs();

  if (isSignedIn()) await enter();
  else {
    lock.hidden = false;
    renderGate();
  }
}

start();
