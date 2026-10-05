import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const base = (process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000/api").replace(/\/$/, "");

const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || "";

export const apiBase = base;
export const hasSupabase = Boolean(supabaseUrl && anonKey);

// The Supabase client is created once and reused. Both imports are static rather than dynamic:
// Metro's dev bundler resolves dynamic import() lazily, which during a hot reload leaves the
// module registry out of step and throws "Requiring unknown module" on the phone. Everything is
// bundled up front instead.
let client = null;

export function supabaseClient() {
  if (client) return client;
  if (!hasSupabase) throw new Error("Supabase is not configured for the app.");

  client = createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: AsyncStorage
    }
  });
  return client;
}

let token = null;

export const setAccessToken = (next) => {
  token = next || null;
};

export const accessToken = () => token;

// One request helper for the whole app. Every call goes to the same Express server the website
// uses, so the phone and the website are always reading and writing identical data.
export async function api(path, { method = "GET", body } = {}) {
  const headers = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    const failure = new Error("Could not reach the shop. Check your connection and try again.");
    failure.status = 0;
    throw failure;
  }

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

export function money(kobo, { decimals = false } = {}) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0
  }).format((kobo || 0) / 100);
}

export function deliveryFor(subtotalKobo, config) {
  const threshold = config?.delivery?.freeThresholdKobo ?? 15000000;
  const fee = config?.delivery?.feeKobo ?? 750000;
  return subtotalKobo >= threshold ? 0 : fee;
}

export function shortDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

// Turns a product image path from the API into something React Native's Image can load.
//
// The API stores paths exactly as the website uses them -- "./img/product-men.jpg" -- because
// they are relative to the site root. The app has no such root, so the API host is prepended.
// Normalising the "./" prefix matters: naively joining would produce ".../netlify.app/./img/..."
// which resolves to a 404.
export function imageUrl(path) {
  const fallback = `${siteOrigin()}/img/product-essential.jpg`;
  if (!path || typeof path !== "string") return fallback;
  if (/^https?:\/\//i.test(path)) return path;

  const clean = path.replace(/^\.?\//, "");
  return `${siteOrigin()}/${clean}`;
}

// The site's root, derived from the API URL by dropping the trailing /api.
export function siteOrigin() {
  return apiBase.replace(/\/api$/, "");
}

export const platformLabel = Platform.OS === "android" ? "Android" : "iOS";