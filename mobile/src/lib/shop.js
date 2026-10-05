// Shop-wide values fetched from /api/config: delivery thresholds, the Nigerian states list
// for checkout, and the provider the account screen should use. Kept separate from the cart
// so a config fetch never triggers a cart write.

import { api } from "./api";

let config = {
  shopName: "Sultan Clothing",
  demoMode: true,
  authProvider: "demo",
  googleClientId: "",
  delivery: { freeThresholdKobo: 15000000, feeKobo: 750000 },
  states: []
};

const listeners = new Set();

export const getConfig = () => config;

export const onConfig = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const publish = () => {
  for (const listener of listeners) listener(config);
};

export async function loadConfig() {
  try {
    config = { ...config, ...(await api("/config")) };
  } catch {
    // The defaults above keep the app usable if the config call fails.
  }
  publish();
  return config;
}

export const deliveryFor = (subtotalKobo) => {
  const threshold = config.delivery?.freeThresholdKobo ?? 15000000;
  const fee = config.delivery?.feeKobo ?? 750000;
  return subtotalKobo >= threshold ? 0 : fee;
};

export const authProvider = () => config.authProvider;
export const googleClientId = () => config.googleClientId || "";