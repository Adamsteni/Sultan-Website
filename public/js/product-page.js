import { api, loadConfig, money, escapeHtml, toast, config } from "./core.js";
import { mountShell } from "./shell.js";
import { cart, wishlist, bagIcon, heartIcon } from "./cart.js";

const host = document.querySelector("#productDetail");
const relatedSection = document.querySelector("#related");
const relatedGrid = document.querySelector("#relatedGrid");

let product = null;
let selectedSize = null;
let quantity = 1;

const card = (item) => `
  <article class="product">
    <div class="product-image">
      <a href="./product.html?slug=${encodeURIComponent(item.slug)}" tabindex="-1" aria-hidden="true">
        <img src="${escapeHtml(item.image || "")}" width="912" height="1200" loading="lazy" alt="${escapeHtml(item.name)}" />
      </a>
      <button class="icon-button favorite" data-related-wish="${escapeHtml(item.slug)}" aria-pressed="false"
        aria-label="Add ${escapeHtml(item.name)} to wishlist">${heartIcon}</button>
    </div>
    <p class="product-label">${escapeHtml(item.category)}</p>
    <div class="product-details">
      <div>
        <h3><a href="./product.html?slug=${encodeURIComponent(item.slug)}">${escapeHtml(item.name)}</a></h3>
        <p>${money(item.priceKobo)}</p>
      </div>
      <button class="icon-button add-cart" data-related-add="${escapeHtml(item.slug)}"
        aria-label="Add ${escapeHtml(item.name)} to bag">${bagIcon}</button>
    </div>
  </article>`;

function render() {
  document.title = `${product.name} — Sultan Clothing`;
  document.querySelector("#crumbName").textContent = product.name;

  const sizes = product.sizes || [];
  const saved = wishlist.has(product.slug);
  const { freeThresholdKobo, feeKobo } = config().delivery;

  host.innerHTML = `
    <div class="product-gallery">
      <div class="product-large">
        <img src="${escapeHtml(product.image || "")}" width="912" height="1200" alt="${escapeHtml(product.name)}" />
        ${product.stock > 0 && product.stock <= 10 ? `<span class="stock-flag">${product.stock} left</span>` : ""}
      </div>
    </div>

    <div class="product-info">
      <p class="product-label">${escapeHtml(product.category)}</p>
      <h1>${escapeHtml(product.name)}</h1>
      <p class="product-tagline">${escapeHtml(product.tagline || "")}</p>
      <p class="product-price">${money(product.priceKobo)}</p>

      <p class="product-description">${escapeHtml(product.description || "")}</p>

      ${
        sizes.length
          ? `<div class="option">
              <p class="option-label">Choose a size</p>
              <div class="size-grid" role="group" aria-label="Size">
                ${sizes
                  .map(
                    (size) => `<button type="button" class="size${size === selectedSize ? " active" : ""}"
                      data-size="${escapeHtml(size)}" aria-pressed="${size === selectedSize}">${escapeHtml(size)}</button>`
                  )
                  .join("")}
              </div>
              <p class="field-error" data-error="size" hidden>Choose a size to continue.</p>
            </div>`
          : ""
      }

      <div class="option">
        <p class="option-label">Quantity</p>
        <div class="cart-item-qty">
          <button type="button" data-qty="dec" aria-label="Decrease quantity">&minus;</button>
          <span data-qty-value>${quantity}</span>
          <button type="button" data-qty="inc" aria-label="Increase quantity">+</button>
        </div>
      </div>

      <div class="product-actions">
        <button type="button" class="button button-dark" data-add-to-bag ${product.stock <= 0 ? "disabled" : ""}>
          ${product.stock <= 0 ? "Out of stock" : "Add to bag"}
        </button>
        <button type="button" class="button button-outline${saved ? " active" : ""}" data-wish
          aria-pressed="${saved}">${saved ? "Saved" : "Save"}</button>
      </div>

      <ul class="product-facts">
        <li>${
          product.stock <= 0
            ? "<strong>Out of stock</strong> — back soon"
            : product.stock <= 10
              ? `<strong>Low stock</strong> — only ${product.stock} left`
              : "<strong>In stock</strong> — ships within 48 hours"
        }</li>
        <li><strong>Free delivery</strong> on orders above ${money(freeThresholdKobo)}, otherwise ${money(feeKobo)}</li>
        <li><strong>30 days</strong> to exchange anything unworn</li>
      </ul>
    </div>`;

  const wishButton = host.querySelector("[data-wish]");
  wishButton.addEventListener("click", () => {
    const on = wishlist.toggle(product.slug);
    wishButton.classList.toggle("active", on);
    wishButton.textContent = on ? "Saved" : "Save";
    wishButton.setAttribute("aria-pressed", String(on));
    toast(on ? "Saved to your wishlist." : "Removed from your wishlist.");
  });

  host.querySelectorAll("[data-size]").forEach((button) =>
    button.addEventListener("click", () => {
      selectedSize = button.dataset.size;
      host.querySelectorAll("[data-size]").forEach((node) => {
        node.classList.toggle("active", node === button);
        node.setAttribute("aria-pressed", String(node === button));
      });
      host.querySelector('[data-error="size"]').hidden = true;
    })
  );

  host.querySelector('[data-qty="inc"]').addEventListener("click", () => {
    quantity = Math.min(quantity + 1, Math.min(product.stock, 20));
    host.querySelector("[data-qty-value]").textContent = String(quantity);
  });
  host.querySelector('[data-qty="dec"]').addEventListener("click", () => {
    quantity = Math.max(quantity - 1, 1);
    host.querySelector("[data-qty-value]").textContent = String(quantity);
  });

  host.querySelector("[data-add-to-bag]").addEventListener("click", () => {
    if (product.sizes?.length && !selectedSize) {
      host.querySelector('[data-error="size"]').hidden = false;
      toast("Choose a size first.", { tone: "error" });
      return;
    }
    cart.add(product, { size: selectedSize, quantity });
    toast(`${product.name} added to your bag.`, { tone: "success" });
  });
}

function renderRelated(items) {
  if (!items.length) return;
  relatedSection.hidden = false;
  relatedGrid.innerHTML = items.map(card).join("");
  relatedGrid.addEventListener("click", (event) => {
    const add = event.target.closest("[data-related-add]");
    const wish = event.target.closest("[data-related-wish]");
    if (add) {
      const item = items.find((entry) => entry.slug === add.dataset.relatedAdd);
      cart.add(item, { size: item.sizes?.[0] || null });
      toast(`${item.name} added to your bag.`, { tone: "success" });
    }
    if (wish) {
      const on = wishlist.toggle(wish.dataset.relatedWish);
      wish.classList.toggle("active", on);
      wish.setAttribute("aria-pressed", String(on));
    }
  });
}

async function start() {
  await loadConfig();
  await mountShell();

  const slug = new URLSearchParams(window.location.search).get("slug");
  if (!slug) {
    window.location.replace("./index.html#shop");
  } else {
    try {
      const { product: found, related } = await api(`/api/products/${encodeURIComponent(slug)}`);
      product = found;
      render();
      renderRelated(related);
    } catch (error) {
      host.innerHTML = `<p class="cart-empty">${escapeHtml(error.message)}</p>
        <p class="cart-empty"><a class="button-link" href="./index.html#shop">Back to the shop</a></p>`;
    }
  }
}

start();
