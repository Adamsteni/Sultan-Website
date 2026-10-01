import { loadConfig, money, escapeHtml, toast } from "./core.js";
import { mountShell } from "./shell.js";
import { cart, wishlist, bagIcon, heartIcon } from "./cart.js";

const grid = document.querySelector("#productGrid");
const chipsHost = document.querySelector("#filterChips");
const countLabel = document.querySelector("#resultCount");
const sortSelect = document.querySelector("#sortSelect");
const emptyLabel = document.querySelector("#gridEmpty");

let catalogue = [];
let activeFilter = "";
let searchTerm = "";

const CATEGORIES = ["", "Men", "Women", "Essentials", "New in"];

const stockNote = (product) => {
  if (product.stock <= 0) return `<p class="product-stock is-out">Out of stock</p>`;
  if (product.stock <= 10) return `<p class="product-stock is-low">Only ${product.stock} left</p>`;
  return `<p class="product-stock">In stock</p>`;
};

function productCard(product) {
  const saved = wishlist.has(product.slug);
  const href = `./product.html?slug=${encodeURIComponent(product.slug)}`;
  return `
    <article class="product" data-slug="${escapeHtml(product.slug)}">
      <div class="product-image">
        <a href="${href}" tabindex="-1" aria-hidden="true">
          <img src="${escapeHtml(product.image || "")}" width="912" height="1200" loading="lazy"
            alt="${escapeHtml(product.name)} by Sultan" />
        </a>
        <button class="icon-button favorite${saved ? " active" : ""}" data-wish="${escapeHtml(product.slug)}"
          aria-pressed="${saved}"
          aria-label="${saved ? "Remove" : "Add"} ${escapeHtml(product.name)} ${saved ? "from" : "to"} wishlist">${heartIcon}</button>
        ${product.stock > 0 && product.stock <= 10 ? `<span class="stock-flag">${product.stock} left</span>` : ""}
      </div>
      <p class="product-label">${escapeHtml(product.category)}</p>
      <div class="product-details">
        <div>
          <h3><a href="${href}">${escapeHtml(product.name)}</a></h3>
          <p>${money(product.priceKobo)}</p>
          ${stockNote(product)}
        </div>
        <button class="icon-button add-cart" data-add="${escapeHtml(product.slug)}"
          aria-label="Add ${escapeHtml(product.name)} to bag" ${product.stock <= 0 ? "disabled" : ""}>${bagIcon}</button>
      </div>
    </article>`;
}

function visibleProducts() {
  const term = searchTerm.toLowerCase();
  const filtered = catalogue.filter((product) => {
    const matchesCategory = !activeFilter || product.category === activeFilter;
    const matchesTerm =
      !term ||
      `${product.name} ${product.tagline} ${product.category}`.toLowerCase().includes(term);
    return matchesCategory && matchesTerm;
  });

  const sort = sortSelect.value;
  return [...filtered].sort((a, b) => {
    if (sort === "price-asc") return a.priceKobo - b.priceKobo;
    if (sort === "price-desc") return b.priceKobo - a.priceKobo;
    if (sort === "name") return a.name.localeCompare(b.name);
    return Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name);
  });
}

function renderGrid() {
  const products = visibleProducts();
  grid.innerHTML = products.map(productCard).join("");
  emptyLabel.hidden = products.length > 0;
  countLabel.textContent = `${products.length} piece${products.length === 1 ? "" : "s"}`;
}

function renderChips() {
  chipsHost.innerHTML = CATEGORIES.map(
    (category) => `
      <button type="button" class="chip${category === activeFilter ? " active" : ""}" data-category="${escapeHtml(category)}"
        aria-pressed="${category === activeFilter}">${category || "All"}</button>`
  ).join("");
}

function setFilter(category) {
  activeFilter = category;
  renderChips();
  renderGrid();
}

grid.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add]");
  const wishButton = event.target.closest("[data-wish]");

  if (addButton) {
    const product = catalogue.find((entry) => entry.slug === addButton.dataset.add);
    if (!product || product.stock <= 0) return;
    const size = product.sizes?.length ? product.sizes[0] : null;
    cart.add(product, { size });
    toast(
      `${product.name}${size ? ` · size ${size}` : ""} added to your bag.`,
      { tone: "success" }
    );
    return;
  }

  if (wishButton) {
    const saved = wishlist.toggle(wishButton.dataset.wish);
    wishButton.classList.toggle("active", saved);
    wishButton.setAttribute("aria-pressed", String(saved));
    const product = catalogue.find((entry) => entry.slug === wishButton.dataset.wish);
    wishButton.setAttribute(
      "aria-label",
      `${saved ? "Remove" : "Add"} ${product?.name || "piece"} ${saved ? "from" : "to"} wishlist`
    );
    toast(saved ? "Saved to your wishlist." : "Removed from your wishlist.");
  }
});

chipsHost.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-category]");
  if (chip) setFilter(chip.dataset.category);
});

sortSelect.addEventListener("change", renderGrid);

document.querySelectorAll("[data-filter-link]").forEach((link) => {
  link.addEventListener("click", () => {
    if (link.dataset.filterLink === undefined) return;
    setFilter(link.dataset.filterLink);
  });
});

document.addEventListener("sultan:wishlist", () => {
  grid.querySelectorAll("[data-wish]").forEach((button) => {
    const saved = wishlist.has(button.dataset.wish);
    button.classList.toggle("active", saved);
    button.setAttribute("aria-pressed", String(saved));
  });
});

const url = new URLSearchParams(window.location.search);
if (url.get("category")) activeFilter = url.get("category");
if (url.get("q")) searchTerm = url.get("q");

await loadConfig();
catalogue = await mountShell();
renderChips();
renderGrid();
