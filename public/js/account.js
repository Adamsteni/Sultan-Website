import { api, loadConfig, money, shortDate, dateTime, escapeHtml, config, toast } from "./core.js";
import { mountShell } from "./shell.js";
import { cart } from "./cart.js";
import {
  authProvider,
  currentUser,
  isSignedIn,
  renderGoogleButton,
  signInDemo,
  signInWithPassword,
  signUpWithPassword,
  signOut
} from "./auth.js";

const authCard = document.querySelector("#authCard");
const accountCard = document.querySelector("#accountCard");
const ordersList = document.querySelector("#ordersList");
const ordersEmpty = document.querySelector("#ordersEmpty");
const ordersLoading = document.querySelector("#ordersLoading");
const ordersCount = document.querySelector("#ordersCount");
const message = document.querySelector("#authMessage");

let mode = "signin";
let orders = [];
const params = new URLSearchParams(window.location.search);
let focusOrder = params.get("order");
const justPlaced = params.has("placed");
const nextPage = params.get("next");

const STATUS_COPY = {
  pending: "Awaiting payment",
  confirmed: "Confirmed",
  shipped: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled"
};

function orderCard(order) {
  const address = [order.customer.addressLine1, order.customer.addressLine2, order.customer.city, order.customer.state]
    .filter(Boolean)
    .map(escapeHtml)
    .join(", ");
  const open = focusOrder === order.orderNumber;

  return `
    <article class="order${open ? " is-open" : ""}" data-order="${escapeHtml(order.orderNumber)}">
      <button type="button" class="order-head" data-toggle="${escapeHtml(order.orderNumber)}"
        aria-expanded="${open}">
        <span class="order-ident">
          <span class="order-number">${escapeHtml(order.orderNumber)}</span>
          <span class="order-date">Placed ${escapeHtml(shortDate(order.createdAt))}</span>
        </span>
        <span class="status status-${escapeHtml(order.status)}">${STATUS_COPY[order.status] || escapeHtml(order.status)}</span>
        <span class="order-total">${money(order.totalKobo)}</span>
      </button>

      <div class="order-thumbs">
        ${order.items
          .map(
            (item) => `<a href="./product.html?slug=${encodeURIComponent(item.slug || "")}" class="order-thumb"
              title="${escapeHtml(item.name)}">
              <img src="${escapeHtml(item.image || "")}" width="64" height="84" alt="${escapeHtml(item.name)}" loading="lazy" />
            </a>`
          )
          .join("")}
        <span class="order-items-count">${order.items.reduce((sum, item) => sum + item.quantity, 0)} item${order.items.reduce(
    (sum, item) => sum + item.quantity,
    0
  ) === 1 ? "" : "s"}</span>
      </div>

      <div class="order-detail"${open ? "" : " hidden"}>
        <table class="order-table">
          <thead>
            <tr><th>Item</th><th>Size</th><th>Qty</th><th>Price</th><th>Total</th></tr>
          </thead>
          <tbody>
            ${order.items
              .map(
                (item) => `<tr>
                  <td>${escapeHtml(item.name)}</td>
                  <td>${escapeHtml(item.size || "—")}</td>
                  <td>${item.quantity}</td>
                  <td>${money(item.unitPriceKobo)}</td>
                  <td>${money(item.lineTotalKobo)}</td>
                </tr>`
              )
              .join("")}
          </tbody>
          <tfoot>
            <tr><td colspan="4">Subtotal</td><td>${money(order.subtotalKobo)}</td></tr>
            <tr><td colspan="4">Delivery</td><td>${
              order.deliveryKobo === 0 ? "Free" : money(order.deliveryKobo)
            }</td></tr>
            <tr class="order-grand"><td colspan="4">Total</td><td>${money(order.totalKobo)}</td></tr>
          </tfoot>
        </table>

        <div class="order-meta">
          <div>
            <p class="option-label">Delivering to</p>
            <p>${escapeHtml(order.customer.fullName)}<br>${address}<br>${escapeHtml(order.customer.phone)}</p>
          </div>
          <div>
            <p class="option-label">Payment</p>
            <p>${order.payment.method === "cod" ? "Payment on delivery" : "Card"}<br>${
              order.payment.reference ? escapeHtml(order.payment.reference) : ""
            }</p>
            <p class="auth-intro">Confirmation email ${
              order.confirmationSentAt ? `sent ${escapeHtml(dateTime(order.confirmationSentAt))}` : "not sent yet"
            }</p>
          </div>
        </div>

        <div class="order-actions">
          <button type="button" class="button button-outline" data-resend="${escapeHtml(order.orderNumber)}">
            ${order.confirmationSentAt ? "Resend confirmation" : "Send confirmation"}
          </button>
          <button type="button" class="button button-quiet" data-reorder="${escapeHtml(order.orderNumber)}">Buy again</button>
        </div>
      </div>
    </article>`;
}

function renderOrders() {
  ordersLoading.hidden = true;
  ordersList.innerHTML = orders.map(orderCard).join("");
  ordersEmpty.hidden = orders.length > 0;
  ordersCount.textContent = orders.length
    ? `${orders.length} order${orders.length === 1 ? "" : "s"}`
    : "";
}

async function loadOrders() {
  ordersLoading.hidden = false;
  try {
    const payload = await api("/api/orders");
    orders = payload.orders;
    renderOrders();
  } catch (error) {
    ordersLoading.hidden = true;
    ordersEmpty.hidden = true;
    ordersCount.textContent = "";
    ordersList.innerHTML = `<p class="cart-empty">${escapeHtml(error.message)}</p>`;
  }
}

function renderAuthForm() {
  const signup = mode === "signup";
  document.querySelector("#nameField").hidden = !signup;
  document.querySelector("#authName").required = signup;
  document.querySelector("#authSubmit").textContent = signup ? "Create account" : "Sign in";
  document.querySelector("#authPassword").setAttribute(
    "autocomplete",
    signup ? "new-password" : "current-password"
  );
  document.querySelector("#switchPrompt").textContent = signup
    ? "Already have an account?"
    : "New to Sultan?";
  document.querySelector("#authToggle").textContent = signup ? "Sign in" : "Create an account";
  document.querySelector("#authHeading").textContent = signup
    ? "Create your Sultan account"
    : "Sign in to see your orders";
  message.hidden = true;
  document.querySelectorAll("[data-email-only]").forEach((node) => {
    node.hidden = authProvider() !== "supabase";
  });
  document.querySelectorAll("[data-google-only]").forEach((node) => {
    node.hidden = authProvider() !== "supabase";
  });
  renderGoogleButton(document.querySelector("#googleWrap"), onGoogleResult);
}

function onGoogleResult(error) {
  if (error) {
    message.textContent = error.message || "Google sign-in did not complete.";
    message.hidden = false;
    return;
  }
  toast(`Welcome back, ${(currentUser().name || currentUser().email).split(" ")[0]}.`, { tone: "success" });
  onSignedIn();
}

async function onSignedIn() {
  authCard.hidden = true;
  accountCard.hidden = false;
  renderProfile();
  await loadOrders();
  showPlacedBanner();
  if (nextPage && nextPage.startsWith("/")) {
    window.location.replace(nextPage);
  }
}

function showPlacedBanner() {
  if (!justPlaced) return;
  const banner = document.querySelector("#placedBanner");
  const placed = orders.find((entry) => entry.orderNumber === focusOrder);
  banner.textContent = placed
    ? `Thank you. Order ${placed.orderNumber} is confirmed${
        config().mailgunConfigured ? " and a confirmation email is on its way." : "."
      }`
    : "Thank you. Your order is confirmed.";
  banner.hidden = false;
}

function renderProfile() {
  const user = currentUser();
  if (!user) return;
  document.querySelector("#accountName").textContent = user.name || user.email;
  document.querySelector("#accountEmail").textContent = user.email;
  document.querySelector("#adminLinkCard").hidden = !user.isAdmin;
  document.querySelector("#ownerBadge").hidden = !user.isAdmin;
}

function friendly(error) {
  const text = String(error.message || "Something went wrong.");
  if (/invalid login credentials/i.test(text)) return "That email and password do not match an account.";
  if (/already registered|already been registered/i.test(text)) return "An account already uses that email.";
  if (/password should be at least/i.test(text)) return "Choose a password of at least 6 characters.";
  if (/rate limit|too many|requested more than/i.test(text)) return "Too many attempts. Wait a minute and try again.";
  if (/fetch|network|failed to fetch/i.test(text)) return "Could not reach the server. Check your connection.";
  return text;
}

document.querySelector("#authToggle").addEventListener("click", () => {
  mode = mode === "signup" ? "signin" : "signup";
  renderAuthForm();
  document.querySelector("#authEmail").focus();
});

document.querySelector("#authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = document.querySelector("#authSubmit");
  const name = document.querySelector("#authName").value.trim();
  const email = document.querySelector("#authEmail").value.trim();
  const password = document.querySelector("#authPassword").value;
  message.hidden = true;
  submit.disabled = true;

  try {
    if (authProvider() === "demo") {
      await signInDemo({ email, name: name || email.split("@")[0] });
    } else if (mode === "signup") {
      const result = await signUpWithPassword({ name, email, password });
      if (result.needsConfirmation) {
        message.textContent = "Check your inbox to confirm the address, then sign in.";
        message.classList.add("is-success");
        message.hidden = false;
        mode = "signin";
        renderAuthForm();
        return;
      }
    } else {
      await signInWithPassword(email, password);
    }
    form.reset();
    toast(`Welcome, ${(currentUser().name || currentUser().email).split(" ")[0]}.`, { tone: "success" });
    onSignedIn();
  } catch (error) {
    message.textContent = friendly(error);
    message.classList.remove("is-success");
    message.hidden = false;
  } finally {
    submit.disabled = false;
  }
});

document.querySelector("#logoutButton").addEventListener("click", async () => {
  try {
    await signOut();
  } catch (error) {
    console.error(error);
  }
  orders = [];
  focusOrder = null;
  // Clear the order details from the page too, so addresses and phone numbers
  // do not stay in the DOM after sign out.
  ordersList.replaceChildren();
  ordersCount.textContent = "";
  ordersEmpty.hidden = true;
  ordersLoading.hidden = true;
  authCard.hidden = false;
  accountCard.hidden = true;
  mode = "signin";
  renderAuthForm();
  toast("You have been signed out. Sign back in to see your orders again.");
});

ordersList.addEventListener("click", async (event) => {
  const toggle = event.target.closest("[data-toggle]");
  const resend = event.target.closest("[data-resend]");
  const reorder = event.target.closest("[data-reorder]");

  if (toggle) {
    const card = toggle.closest(".order");
    const detail = card.querySelector(".order-detail");
    const open = detail.hidden;
    detail.hidden = !open;
    card.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    return;
  }

  if (resend) {
    const orderNumber = resend.dataset.resend;
    resend.disabled = true;
    resend.textContent = "Sending…";
    try {
      const result = await api(`/api/orders/${encodeURIComponent(orderNumber)}/resend`, { method: "POST" });
      toast(
        result.sent
          ? `Confirmation email sent for ${orderNumber}.`
          : `Mailgun is not configured yet, so no email was sent.`,
        { tone: result.sent ? "success" : "info" }
      );
      const order = orders.find((entry) => entry.orderNumber === orderNumber);
      if (order && result.sent) order.confirmationSentAt = new Date().toISOString();
      renderOrders();
    } catch (error) {
      toast(error.message, { tone: "error" });
      resend.disabled = false;
      resend.textContent = "Resend confirmation";
    }
    return;
  }

  if (reorder) {
    const order = orders.find((entry) => entry.orderNumber === reorder.dataset.reorder);
    if (!order) return;
    const { products } = await api("/api/products");
    let added = 0;
    for (const item of order.items) {
      const product = products.find((entry) => entry.slug === item.slug && entry.stock > 0);
      if (!product) continue;
      cart.add(product, { size: item.size, quantity: item.quantity });
      added += 1;
    }
    if (added) {
      toast(`${added} piece${added === 1 ? "" : "s"} added back to your bag.`, { tone: "success" });
      window.location.href = "./checkout.html";
    } else {
      toast("None of those pieces are available right now.", { tone: "error" });
    }
  }
});

await loadConfig();
await mountShell();

if (isSignedIn()) await onSignedIn();
else {
  authCard.hidden = false;
  renderAuthForm();
}

document.addEventListener("sultan:auth", (event) => {
  if (event.detail) onSignedIn();
});
