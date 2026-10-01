const state = {
  config: {
    shopName: "Sultan Clothing",
    demoMode: true,
    authProvider: "demo",
    googleClientId: "",
    supabase: { url: "", anonKey: "" },
    delivery: { freeThresholdKobo: 15000000, feeKobo: 750000 },
    states: [],
    user: null
  },
  accessToken: null
};

export async function loadConfig() {
  try {
    const response = await fetch("/api/config", { headers: { accept: "application/json" } });
    if (response.ok) state.config = { ...state.config, ...(await response.json()) };
  } catch {
    // Offline or server not reachable: the defaults above keep the page usable.
  }
  applyEnvironment();
  return state.config;
}

export const config = () => state.config;

export function setAccessToken(token) {
  state.accessToken = token || null;
}

export const accessToken = () => state.accessToken;

export function isAdmin() {
  return Boolean(state.config.user?.isAdmin);
}

export function money(kobo, { decimals = false } = {}) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0
  }).format((kobo || 0) / 100);
}

export function deliveryFor(subtotalKobo) {
  const { freeThresholdKobo, feeKobo } = state.config.delivery;
  return subtotalKobo >= freeThresholdKobo ? 0 : feeKobo;
}

export function shortDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

export function dateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export async function api(path, { method = "GET", body, headers = {} } = {}) {
  const request = { method, headers: { accept: "application/json", ...headers } };
  if (body !== undefined) {
    request.headers["content-type"] = "application/json";
    request.body = JSON.stringify(body);
  }
  if (state.accessToken) request.headers.authorization = `Bearer ${state.accessToken}`;

  const response = await fetch(path, request);
  const type = response.headers.get("content-type") || "";
  const payload = type.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    const failure = new Error(payload?.error || `Request failed (${response.status})`);
    failure.status = response.status;
    failure.fields = payload?.fields;
    throw failure;
  }
  return payload;
}

export function readStorage(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing or a full quota: the shop still works for this visit.
  }
}

let toastHost = null;

export function toast(message, { tone = "info" } = {}) {
  if (!toastHost) {
    toastHost = document.createElement("div");
    toastHost.className = "toast-host";
    toastHost.setAttribute("role", "status");
    toastHost.setAttribute("aria-live", "polite");
    document.body.append(toastHost);
  }
  const node = document.createElement("p");
  node.className = `toast toast-${tone}`;
  node.textContent = message;
  toastHost.append(node);
  window.setTimeout(() => {
    node.classList.add("leaving");
    window.setTimeout(() => node.remove(), 300);
  }, 3600);
}

function applyEnvironment() {
  if (!state.config.demoMode) document.documentElement.dataset.mode = "live";
  else document.documentElement.dataset.mode = "demo";

  document.querySelectorAll("[data-shop-name]").forEach((node) => {
    node.textContent = state.config.shopName;
  });

  const banner = document.querySelector("#modeBanner");
  if (banner) {
    banner.hidden = !state.config.demoMode;
    if (state.config.demoMode) {
      banner.querySelector("[data-mode-detail]").textContent = state.config.authProvider === "demo"
        ? "Orders are held in memory and emails print to the terminal. Add Supabase keys to .env to make it permanent."
        : "Emails print to the terminal until Mailgun keys are added.";
    }
  }
}

export function escapeHtml(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]
  );
}
