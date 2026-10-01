import { api, isAdmin, toast, escapeHtml, money } from "./core.js";
import {
  initAuth,
  onAuthChange,
  currentUser
} from "./auth.js";
import { cart, wishlist, setCatalog, openDrawer, closeDrawers, mountDrawers, bagIcon } from "./cart.js";

const $ = (selector) => document.querySelector(selector);

const el = {};

let catalog = [];

export function loadCatalog() {
  return api("/api/products").then(({ products }) => {
    catalog = products;
    setCatalog(products);
    return products;
  });
}

function wireHeader() {
  el.cartButton = $("#cartButton");
  el.cartCount = $("#cartCount");
  el.wishlistButton = $("#wishlistButton");
  el.wishlistCount = $("#wishlistCount");
  el.accountButton = $("#accountButton") || $("#loginButton");
  el.adminLink = $("#adminLink");
  el.ordersLink = $("#ordersLink");

  const menu = $("#menuButton");
  const mobileNav = $("#mobileNav");
  menu?.addEventListener("click", () => {
    const open = mobileNav.classList.toggle("open");
    menu.classList.toggle("open", open);
    menu.setAttribute("aria-expanded", String(open));
    menu.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  });
  mobileNav?.querySelectorAll("a").forEach((link) =>
    link.addEventListener("click", () => {
      mobileNav.classList.remove("open");
      menu.classList.remove("open");
      menu.setAttribute("aria-expanded", "false");
    })
  );

  el.cartButton?.addEventListener("click", () => openDrawer("cartDrawer"));
  el.wishlistButton?.addEventListener("click", () => openDrawer("wishlistDrawer"));
  $("#searchButton")?.addEventListener("click", openSearch);
  $("#searchClose")?.addEventListener("click", closeDrawers);
  $("#searchBackdrop")?.addEventListener("click", closeDrawers);
  $("#searchInput")?.addEventListener("input", (event) => renderSearch(event.currentTarget.value));

  document.addEventListener("sultan:cart", renderCounts);
  document.addEventListener("sultan:wishlist", renderCounts);
  renderCounts();
}

function renderCounts() {
  if (el.cartCount) {
    const count = cart.count;
    el.cartCount.textContent = String(count);
    el.cartButton?.setAttribute("aria-label", `Shopping bag with ${count} items`);
    if (lastCartCount !== null && lastCartCount !== count) bump(el.cartCount);
    lastCartCount = count;
  }
  if (el.wishlistCount) {
    el.wishlistCount.textContent = String(wishlist.slugs.length);
    el.wishlistButton?.setAttribute("aria-label", `Wishlist with ${wishlist.slugs.length} items`);
  }
}

let lastCartCount = null;

function bump(node) {
  node.classList.remove("bump");
  void node.offsetWidth;
  node.classList.add("bump");
}

function openSearch() {
  closeDrawers();
  document.body.classList.add("drawer-open");
  const drawer = $("#searchDrawer");
  if (!drawer) return;
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  $("#searchBackdrop").classList.add("open");
  renderSearch($("#searchInput").value);
  $("#searchInput").focus();
}

function renderSearch(query) {
  const host = $("#searchResults");
  if (!host) return;
  const term = query.trim().toLowerCase();
  const matches = term
    ? catalog.filter((product) =>
        `${product.name} ${product.tagline} ${product.category}`.toLowerCase().includes(term)
      )
    : catalog.slice(0, 4);
  host.innerHTML = matches
    .map(
      (product) => `
      <article class="cart-item">
        <a href="./product.html?slug=${encodeURIComponent(product.slug)}">
          <img src="${escapeHtml(product.image || "")}" width="72" height="96" alt="${escapeHtml(product.name)}" loading="lazy" />
        </a>
        <div>
          <h3><a href="./product.html?slug=${encodeURIComponent(product.slug)}">${escapeHtml(product.name)}</a></h3>
          <p class="cart-item-price">${escapeHtml(product.category)} · ${money(product.priceKobo)}</p>
        </div>
        <div class="wish-actions">
          <button type="button" class="icon-button" data-search-add="${escapeHtml(product.slug)}" aria-label="Add ${escapeHtml(product.name)} to bag">${bagIcon}</button>
        </div>
      </article>`
    )
    .join("");
  $("#searchEmpty").hidden = matches.length > 0;
  host.querySelectorAll("[data-search-add]").forEach((button) =>
    button.addEventListener("click", () => {
      const product = catalog.find((entry) => entry.slug === button.dataset.searchAdd);
      if (!product) return;
      cart.add(product, { size: product.sizes?.[0] || null });
      toast(`${product.name} added to your bag.`, { tone: "success" });
    })
  );
}

function renderAccountButton(user) {
  const label = user ? (user.name || user.email).split(" ")[0] : "Sign in";
  if (el.accountButton) {
    const text = el.accountButton.querySelector("span");
    if (text) text.textContent = label;
    el.accountButton.setAttribute("aria-label", user ? `Your account, ${label}` : "Sign in");
  }
  if (el.adminLink) el.adminLink.hidden = !user?.isAdmin;
  if (el.ordersLink) el.ordersLink.hidden = !user;
}

function wireNewsletter() {
  const form = $("#newsletterForm");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = form.querySelector("input");
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      const result = await api("/api/newsletter", { method: "POST", body: { email: input.value.trim() } });
      form.hidden = true;
      const message = $("#successMessage");
      message.hidden = false;
      message.textContent = result.welcomeSent
        ? "You're on the list. Check your inbox for a welcome note."
        : "You're on the list. Welcome to Sultan.";
    } catch (error) {
      toast(error.fields?.email || error.message, { tone: "error" });
    } finally {
      button.disabled = false;
    }
  });
}

export async function mountShell() {
  wireHeader();
  wireNewsletter();
  mountDrawers();
  let products = [];
  try {
    products = await loadCatalog();
  } catch (error) {
    console.error("[catalog]", error);
    toast("The catalogue could not be loaded. Is the server running?", { tone: "error" });
  }
  await initAuth();
  onAuthChange((user) => {
    renderAccountButton(user);
    document.body.dataset.signedIn = user ? "true" : "false";
    document.dispatchEvent(new CustomEvent("sultan:auth", { detail: user }));
  });
  if (isAdmin() && $("#adminNotice")) $("#adminNotice").hidden = false;
  return products;
}

export { currentUser };
