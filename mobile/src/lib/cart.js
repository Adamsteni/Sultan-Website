// The bag. Every screen reads and writes this one store, so the header badge, the product page
// quantity stepper and the cart screen can never disagree with each other.
//
// The server is the source of truth whenever the customer is signed in, which is what makes
// the phone and the website show the same bag. Signed out, the bag lives in AsyncStorage on the
// device and is merged into the account on sign-in.

import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";
import { deliveryFor } from "./shop";

const KEY = "sultan.cart";

let lines = [];
let user = null;
let loaded = false;
let syncing = false;

const listeners = new Set();

const notify = () => {
  for (const listener of listeners) listener(getCart());
};

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// ---- derived values --------------------------------------------------

const getCart = () => {
  const subtotalKobo = lines.reduce((sum, line) => sum + (line.unitPriceKobo || 0) * line.quantity, 0);
  const deliveryKobo = deliveryFor(subtotalKobo);
  return {
    lines,
    count: lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotalKobo,
    deliveryKobo,
    totalKobo: subtotalKobo + deliveryKobo
  };
};

export const useCart = () => {
  const [cart, setCart] = useState(getCart());
  useEffect(() => subscribe(setCart), []);
  return cart;
};

// ---- storage ---------------------------------------------------------

const readLocal = async () => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeLocal = async () => {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    // A storage failure should not break shopping; the server copy is still authoritative
    // once signed in.
  }
};

const save = () => {
  writeLocal();
  notify();
};

// Applies a local change first so the UI updates immediately, then reconciles with the server.
// A failed request is left to be resolved by the next action or the next sync.
const push = async (path, options) => {
  if (syncing || !user) return;
  syncing = true;
  try {
    const payload = await api(path, options);
    if (Array.isArray(payload?.lines)) {
      lines = payload.lines;
      save();
    }
  } catch {
    // Keep the local bag; it is saved locally and merged again later.
  } finally {
    syncing = false;
  }
};

const commit = (path, options) => {
  save();
  push(path, options);
};

// ---- mutations -------------------------------------------------------

const add = (product, size, quantity = 1) => {
  const wanted = quantity;
  const key = (entry) => `${entry.slug}|${entry.size || "-"}`;
  const match = key({ slug: product.slug, size });

  const existing = lines.find((line) => key(line) === match);
  if (existing) {
    lines = lines.map((line) =>
      key(line) === match ? { ...line, quantity: Math.min(line.quantity + wanted, 20) } : line
    );
  } else {
    lines = [
      ...lines,
      {
        slug: product.slug,
        name: product.name,
        image: product.image,
        size: size || null,
        unitPriceKobo: product.priceKobo,
        stock: product.stock,
        quantity: Math.min(wanted, 20)
      }
    ];
  }
  commit("/cart/items", { method: "POST", body: { slug: product.slug, size: size || null, quantity: wanted } });
};

const setQuantity = (slug, size, quantity) => {
  const key = (entry) => `${entry.slug}|${entry.size || "-"}`;
  const match = key({ slug, size });
  const next = Math.min(Math.max(quantity, 0), 20);

  if (next === 0) {
    lines = lines.filter((line) => key(line) !== match);
  } else {
    lines = lines.map((line) => (key(line) === match ? { ...line, quantity: next } : line));
  }

  commit("/cart/items", { method: "PATCH", body: { slug, size: size || null, quantity: next } });
};

const remove = (slug, size) => {
  const key = (entry) => `${entry.slug}|${entry.size || "-"}`;
  lines = lines.filter((line) => key(line) !== key({ slug, size }));

  const query = [`slug=${encodeURIComponent(slug)}`];
  if (size) query.push(`size=${encodeURIComponent(size)}`);
  commit(`/cart/items?${query.join("&")}`, { method: "DELETE" });
};

const clear = () => {
  lines = [];
  commit("/cart", { method: "DELETE" });
};

const quantityOf = (slug, size) => {
  const key = (entry) => `${entry.slug}|${entry.size || "-"}`;
  return lines.find((line) => key(line) === key({ slug, size }))?.quantity || 0;
};

// ---- session tie-in --------------------------------------------------

// Called after sign-in. Anything held on this device before signing in is merged into the
// account's bag, so signing in on a phone that already had items does not silently drop them.
const syncFromServer = async () => {
  const held = lines.filter((line) => line.slug);
  try {
    const payload = held.length
      ? await api("/cart/merge", {
          method: "POST",
          body: { items: held.map((line) => ({ slug: line.slug, size: line.size, quantity: line.quantity })) }
        })
      : await api("/cart");
    if (Array.isArray(payload?.lines)) lines = payload.lines;
    save();
  } catch {
    // Signed in but the bag could not be fetched: keep the local copy and retry later.
  }
  loaded = true;
  notify();
};

// Called after sign-out, so the next person to use this phone starts with an empty bag rather
// than inheriting the last customer's items.
const resetToLocal = async () => {
  user = null;
  lines = [];
  await AsyncStorage.removeItem(KEY).catch(() => {});
  notify();
};

const setUser = (next) => {
  user = next || null;
};

// Pull the bag once at start-up: from the server when there is a session, from the device
// otherwise.
const load = async () => {
  lines = await readLocal();
  if (user) await syncFromServer();
  else loaded = true;
  notify();
};

export const cart = {
  useCart,
  subscribe,
  add,
  setQuantity,
  remove,
  clear,
  quantityOf,
  setUser,
  syncFromServer,
  resetToLocal,
  load,
  get isLoaded() {
    return loaded;
  },
  get lines() {
    return lines;
  }
};