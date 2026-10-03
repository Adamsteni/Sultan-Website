import { Platform } from "react-native";

const base = (process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000/api").replace(/\/$/, "");

const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || "";

export const apiBase = base;
export const hasSupabase = Boolean(supabaseUrl && anonKey);

// The Supabase browser client is reused here rather than importing @supabase/supabase-js
// directly. The web app does the same: one code path, and no bundler complaints about the
// package's Node-targeted entry points under Metro.
let client = null;

export async function supabaseClient() {
  if (client) return client;
  if (!hasSupabase) throw new Error("Supabase is not configured for the app.");

  const { createClient } = await import("@supabase/supabase-js");
  client = createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: (await import("@react-native-async-storage/async-storage")).default
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

export const platformLabel = Platform.OS === "android" ? "Android" : "iOS";