import {
  config,
  money,
  deliveryFor,
  readStorage,
  writeStorage,
  toast,
  escapeHtml,
  api,
  broadcastCart,
  onCartBroadcast
} from "./core.js";

const CART_KEY = "sultan.cart";
const WISH_KEY = "sultan.wishlist";

const lineKey = (slug, size) => `${slug}|${size || "-"}`;
const announce = () => document.dispatchEvent(new CustomEvent("sultan:cart"));

const state = {
  cart: readStorage(CART_KEY, []),
  wishlist: readStorage(WISH_KEY, [])
};

// Which storage layer is authoritative. "local" until the visitor signs in, then "server".
// Signing in flips this and calls syncFromServer(), so the bag on this device and the bag on
// the phone converge rather than one silently overwriting the other.
let source = "local";

// Bumped on every local edit so a cross-device pull can tell whether anything changed here while it
// was in flight. If so its result is stale and must not replace the newer local edit.
let localRevision = 0;
const noteLocalChange = () => {
  localRevision += 1;
};

export const cartRevision = () => localRevision;

// Server writes are queued rather than gated by a "busy" flag. A boolean guard dropped every
// request raised while one was already in flight, so two quick clicks sent only the first and the
// two devices drifted apart. Chaining the promises keeps them in order and loses none.
let queue = Promise.resolve();

const persist = () => {
  writeStorage(CART_KEY, state.cart);
  writeStorage(WISH_KEY, state.wishlist);
  announce();
  broadcastCart(state.cart);
};

// Writes to the server and adopts whatever it returns, so the response is the source of truth.
// Queued rather than run concurrently: a second change made while the first is in flight is still
// sent, just after it. A network failure leaves the local bag alone: it is still in localStorage
// and will be reconciled on the next successful call rather than lost.
const push = (path, options) => {
  if (source !== "server") return;
  queue = queue.then(async () => {
    try {
      const payload = await api(path, options);
      if (payload?.lines) {
        // "synced" marks these lines as already known to the account, so a later sign-in does not
        // merge them into the account bag a second time and inflate the quantities.
        state.cart = payload.lines.map((line) => ({ ...line, synced: true }));
        persist();
      }
    } catch {
      // The local bag is still in localStorage and reconciles on the next successful call.
    }
  });
};

// Applies a change locally first so the drawer updates instantly, then reconciles with the
// server. localStorage stays written so a signed-out guest, or a failed request, is not lost.
const commit = (path, options) => {
  noteLocalChange();
  persist();
  if (source === "server") push(path, options);
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
    commit("/api/cart/items", { method: "POST", body: { slug: product.slug, size, quantity } });
  },
  setQuantity(slug, size, quantity) {
    const key = lineKey(slug, size);
    const index = state.cart.findIndex((entry) => lineKey(entry.slug, entry.size) === key);
    if (index === -1) return;
    const next = Math.min(Math.max(quantity, 0), 20);
    if (next === 0) state.cart.splice(index, 1);
    else state.cart[index].quantity = next;
    commit("/api/cart/items", {
      method: "PATCH",
      body: { slug, size, quantity: next }
    });
  },
  remove(slug, size) {
    state.cart = state.cart.filter((entry) => lineKey(entry.slug, entry.size) !== lineKey(slug, size));
    const query = new URLSearchParams({ slug });
    if (size) query.set("size", size);
    commit(`/api/cart/items?${query}`, { method: "DELETE" });
  },
  clear() {
    state.cart = [];
    commit("/api/cart", { method: "DELETE" });
  },
  // Every line, for placing an order.
  toPayload() {
    return state.cart.map((line) => ({ slug: line.slug, quantity: line.quantity, size: line.size }));
  },

  // Only lines this device added while signed out, for a merge. merge_cart adds quantities rather
  // than replacing them, so sending lines the server already knows would inflate them.
  toMergePayload() {
    return state.cart
      .filter((line) => line.slug && !line.synced)
      .map((line) => ({ slug: line.slug, quantity: line.quantity, size: line.size }));
  },

  // Called after sign-in: fold whatever this device was holding as a guest into the account's
  // cart, then take the merged result. Quantities add rather than replace, so nothing is lost.
  async syncFromServer() {
    source = "server";
    // Lets any queued writes land first, so this pull cannot race ahead of them and overwrite
    // them with the server's older copy.
    await queue.catch(() => {});
    // Only lines added on this device while signed out are merged. merge_cart adds quantities
    // rather than replacing them, so re-merging lines that already came back from the server
    // would inflate the bag on every page load. Lines adopted from a response are excluded.
    const guestLines = state.cart.filter((line) => line.slug && !line.synced);
    try {
      const payload = guestLines.length
        ? await api("/api/cart/merge", { method: "POST", body: { items: cart.toMergePayload() } })
        : await api("/api/cart");
      if (payload?.lines) {
        state.cart = payload.lines.map((line) => ({ ...line, synced: true }));
      }
      persist();
      return state.cart;
    } catch {
      // Signed in but the cart call failed: stay on the local copy and retry on next action.
      return state.cart;
    }
  },

  // Called on sign-out so the next guest on this device starts from an empty bag rather than
  // inheriting the previous customer's items.
  resetToLocal() {
    source = "local";
    state.cart = [];
    persist();
  },

  // Pulls the account's bag again, for when the change was made on another device. Only safe once
  // signed in: it replaces local state wholesale, so calling it as a guest would discard the bag
  // held in this browser.
  refresh() {
    if (source !== "server") return Promise.resolve(state.cart);
    return this.syncFromServer();
  },

  isServerBacked() {
    return source === "server";
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
    .addEventListener("click", () => closeDrawers());
  document.querySelector(`[data-drawer-backdrop="${id}"]`).addEventListener("click", () => closeDrawers());
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
