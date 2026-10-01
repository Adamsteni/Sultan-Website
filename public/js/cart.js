import { config, money, deliveryFor, readStorage, writeStorage, toast, escapeHtml } from "./core.js";

const CART_KEY = "sultan.cart";
const WISH_KEY = "sultan.wishlist";

const lineKey = (slug, size) => `${slug}|${size || "-"}`;
const announce = () => document.dispatchEvent(new CustomEvent("sultan:cart"));

const state = {
  cart: readStorage(CART_KEY, []),
  wishlist: readStorage(WISH_KEY, [])
};

const persist = () => {
  writeStorage(CART_KEY, state.cart);
  writeStorage(WISH_KEY, state.wishlist);
  announce();
};

export const cart = {
  get lines() {
    return state.cart;
  },
  get count() {
    return state.cart.reduce((sum, line) => sum + line.quantity, 0);
  },
  get subtotalKobo() {
    return state.cart.reduce((sum, line) => sum + line.unitPriceKobo * line.quantity, 0);
  },
  get deliveryKobo() {
    return deliveryFor(this.subtotalKobo);
  },
  get totalKobo() {
    return this.subtotalKobo + this.deliveryKobo;
  },
  has(slug, size) {
    return state.cart.some((line) => line.slug === slug && (line.size || "-") === (size || "-"));
  },
  quantityOf(slug, size) {
    const line = state.cart.find((entry) => entry.slug === slug && (entry.size || "-") === (size || "-"));
    return line ? line.quantity : 0;
  },
  add(product, { size = null, quantity = 1 } = {}) {
    const key = lineKey(product.slug, size);
    const line = state.cart.find((entry) => lineKey(entry.slug, entry.size) === key);
    if (line) line.quantity = Math.min(line.quantity + quantity, 20);
    else {
      state.cart.push({
        slug: product.slug,
        name: product.name,
        image: product.image,
        size,
        unitPriceKobo: product.priceKobo,
        stock: product.stock,
        quantity: Math.min(quantity, 20)
      });
    }
    persist();
  },
  setQuantity(slug, size, quantity) {
    const key = lineKey(slug, size);
    const index = state.cart.findIndex((entry) => lineKey(entry.slug, entry.size) === key);
    if (index === -1) return;
    const next = Math.min(Math.max(quantity, 0), 20);
    if (next === 0) state.cart.splice(index, 1);
    else state.cart[index].quantity = next;
    persist();
  },
  remove(slug, size) {
    state.cart = state.cart.filter((entry) => lineKey(entry.slug, entry.size) !== lineKey(slug, size));
    persist();
  },
  clear() {
    state.cart = [];
    persist();
  },
  toPayload() {
    return state.cart.map((line) => ({ slug: line.slug, quantity: line.quantity, size: line.size }));
  }
};

export const wishlist = {
  get slugs() {
    return state.wishlist;
  },
  has(slug) {
    return state.wishlist.includes(slug);
  },
  toggle(slug) {
    state.wishlist = wishlist.has(slug)
      ? state.wishlist.filter((entry) => entry !== slug)
      : [...state.wishlist, slug];
    persist();
    return wishlist.has(slug);
  }
};

const bagIcon = `<svg viewBox="0 0 24 24"><path d="M5 8h14l-1 13H6L5 8Z"></path><path d="M9 9V6a3 3 0 0 1 6 0v3"></path></svg>`;
const heartIcon = `<svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.7-7.5 1.1-1.1a5.5 5.5 0 0 0 0-7.8Z"></path></svg>`;

let catalog = [];
export const setCatalog = (products) => {
  catalog = products;
};

const drawerMarkup = (id, title, emptyText) => `
  <div class="drawer-backdrop" data-drawer-backdrop="${id}"></div>
  <aside class="cart-drawer" id="${id}" aria-label="${title}" aria-hidden="true">
    <div class="cart-header">
      <h2>${title}</h2>
      <button type="button" class="icon-button cart-close" data-drawer-close="${id}" aria-label="Close ${title.toLowerCase()}">&times;</button>
    </div>
    <div class="cart-items" data-drawer-items="${id}"></div>
    <p class="cart-empty" data-drawer-empty="${id}">${emptyText}</p>
    <div class="cart-footer" data-drawer-footer="${id}" hidden>
      <div class="cart-subtotal"><span>Subtotal</span><span data-drawer-subtotal="${id}"></span></div>
      <p class="cart-note" data-drawer-note="${id}"></p>
      <a class="button button-dark cart-checkout" href="./checkout.html">Checkout</a>
    </div>
  </aside>`;

const mountDrawer = (id) => {
  if (document.getElementById(id)) return;
  const host = document.createElement("div");
  host.innerHTML = drawerMarkup(id, id === "cartDrawer" ? "Your bag" : "Wishlist", "");
  document.body.append(...host.children);
  document
    .querySelector(`[data-drawer-close="${id}"]`)
    .addEventListener("click", () => closeDrawer(id));
  document.querySelector(`[data-drawer-backdrop="${id}"]`).addEventListener("click", () => closeDrawer(id));
};

export const openDrawer = (id) => {
  closeDrawers();
  document.body.classList.add("drawer-open");
  const drawer = document.getElementById(id);
  if (!drawer) return;
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  document.querySelector(`[data-drawer-backdrop="${id}"]`)?.classList.add("open");
  if (id === "cartDrawer") renderCartDrawer();
  if (id === "wishlistDrawer") renderWishlistDrawer();
};

export const closeDrawers = () => {
  document.body.classList.remove("drawer-open");
  document.querySelectorAll(".cart-drawer, .drawer-backdrop").forEach((node) => {
    node.classList.remove("open");
    if (node.classList.contains("cart-drawer")) node.setAttribute("aria-hidden", "true");
  });
};

const lineRow = (line, { wishlist = false } = {}) => `
  <article class="cart-item" data-line="${escapeHtml(lineKey(line.slug, line.size))}">
    <a href="./product.html?slug=${encodeURIComponent(line.slug)}">
      <img src="${escapeHtml(line.image || "")}" width="72" height="96" alt="${escapeHtml(line.name)}" loading="lazy" />
    </a>
    <div>
      <h3><a href="./product.html?slug=${encodeURIComponent(line.slug)}">${escapeHtml(line.name)}</a></h3>
      <p class="cart-item-price">${line.size ? `Size ${escapeHtml(line.size)} · ` : ""}${money(line.unitPriceKobo)}</p>
      ${
        wishlist
          ? ""
          : `<div class="cart-item-qty">
               <button type="button" data-act="dec" aria-label="Decrease quantity of ${escapeHtml(line.name)}">&minus;</button>
               <span>${line.quantity}</span>
               <button type="button" data-act="inc" aria-label="Increase quantity of ${escapeHtml(line.name)}">+</button>
             </div>`
      }
    </div>
    <div class="wish-actions">
      <button type="button" class="icon-button" data-act="bag" aria-label="Add ${escapeHtml(line.name)} to bag">${bagIcon}</button>
      <button type="button" class="icon-button cart-item-remove" data-act="remove" aria-label="Remove ${escapeHtml(line.name)}">&times;</button>
    </div>
  </article>`;

const findLine = (node) => {
  const key = node.closest("[data-line]")?.dataset.line || "";
  const [slug, size] = key.split("|");
  return { slug, size: size === "-" ? null : size };
};

export function renderCartDrawer() {
  const host = document.querySelector('[data-drawer-items="cartDrawer"]');
  if (!host) return;
  const lines = cart.lines;
  host.innerHTML = lines.map((line) => lineRow(line)).join("");
  document.querySelector('[data-drawer-empty="cartDrawer"]').hidden = lines.length > 0;
  const footer = document.querySelector('[data-drawer-footer="cartDrawer"]');
  footer.hidden = lines.length === 0;
  document.querySelector('[data-drawer-subtotal="cartDrawer"]').textContent = money(cart.subtotalKobo);
  const note = document.querySelector('[data-drawer-note="cartDrawer"]');
  const { freeThresholdKobo } = config().delivery;
  const remaining = freeThresholdKobo - cart.subtotalKobo;
  note.textContent =
    remaining > 0
      ? `${money(remaining)} more for free delivery. Delivery is ${money(config().delivery.feeKobo)} otherwise.`
      : "Free delivery applied.";
}

export function renderWishlistDrawer() {
  const host = document.querySelector('[data-drawer-items="wishlistDrawer"]');
  if (!host) return;
  const saved = state.wishlist
    .map((slug) => catalog.find((product) => product.slug === slug))
    .filter(Boolean);
  host.innerHTML = saved.length
    ? saved.map((product) => lineRow({ ...product, unitPriceKobo: product.priceKobo, size: null })).join("")
    : "";
  document.querySelector('[data-drawer-empty="wishlistDrawer"]').hidden = saved.length > 0;
  document.querySelector('[data-drawer-footer="wishlistDrawer"]').hidden = true;
}

function wireDrawerActions() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-act]");
    const scope = event.target.closest("#cartDrawer, #wishlistDrawer");
    if (!button || !scope) return;
    const { slug, size } = findLine(button);
    const wish = scope.id === "wishlistDrawer";

    if (button.dataset.act === "bag") {
      const product = catalog.find((entry) => entry.slug === slug);
      if (!product) return;
      cart.add(product, { size: wish ? product.sizes?.[0] || null : size });
      toast(`${product.name} added to your bag.`, { tone: "success" });
      if (wish) {
        wishlist.toggle(slug);
        renderWishlistDrawer();
        document.dispatchEvent(new CustomEvent("sultan:wishlist"));
      }
      renderCartDrawer();
      return;
    }

    if (button.dataset.act === "inc") cart.setQuantity(slug, size, cart.quantityOf(slug, size) + 1);
    if (button.dataset.act === "dec") cart.setQuantity(slug, size, cart.quantityOf(slug, size) - 1);
    if (button.dataset.act === "remove") {
      if (wish) {
        wishlist.toggle(slug);
        document.dispatchEvent(new CustomEvent("sultan:wishlist"));
        renderWishlistDrawer();
      } else {
        cart.remove(slug, size);
        toast("Removed from your bag.");
      }
    }
    if (scope.id === "cartDrawer") renderCartDrawer();
  });
}

export function mountDrawers() {
  mountDrawer("cartDrawer");
  mountDrawer("wishlistDrawer");
  document
    .querySelector('[data-drawer-empty="cartDrawer"]')
    .replaceChildren("Your bag is empty.");
  document
    .querySelector('[data-drawer-empty="wishlistDrawer"]')
    .replaceChildren("Your wishlist is empty. Tap the heart on any piece to save it here.");
  wireDrawerActions();
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDrawers();
  });
  document.addEventListener("sultan:cart", renderCartDrawer);
}

export { bagIcon, heartIcon };
