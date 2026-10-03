// Checks whether the live Supabase project has the tables this build expects, without changing
// anything. Useful before a migration: it says what is missing rather than making you guess.
//
//   node scripts/check-schema.js
//
// Exit code 0 when everything is present, 1 when something is missing.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of readFileSync(".env", "utf8").split("\n")) {
  const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
}

const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.log("SUPABASE_URL or a Supabase key is missing from .env");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

// Each entry is (table, required columns). A missing table reports as an error from PostgREST,
// which is the answer we want -- no schema introspection needed.
const expectations = [
  ["products", ["slug", "name", "price_kobo", "stock"]],
  ["orders", ["order_number", "user_id", "total_kobo", "status"]],
  ["order_items", ["order_id", "slug", "quantity"]],
  ["cart_items", ["user_id", "slug", "size", "quantity"]],
  ["newsletter_subscribers", ["email"]]
];

const present = [];
const missing = [];

for (const [table, columns] of expectations) {
  const { error } = await db.from(table).select(columns.join(",")).limit(1);
  if (error) missing.push({ table, detail: error.message });
  else present.push(table);
}

// merge_cart is a function, so it is checked by calling it with no items: a working function
// returns an empty set, a missing one raises 42883 or 404.
const { error: rpcError } = await db.rpc("merge_cart", { p_user_id: "00000000-0000-0000-0000-000000000000", p_items: [] });
const mergeWorks = !rpcError;
const placeOrderWorks = await (async () => {
  const { error } = await db.rpc("place_order", {
    p_user_id: "00000000-0000-0000-0000-000000000000",
    p_email: "probe@sultan.test",
    p_full_name: "Probe",
    p_phone: "000",
    p_address_line1: "Probe",
    p_address_line2: "",
    p_city: "Lagos",
    p_state: "Lagos",
    p_items: [],
    p_delivery_kobo: 0
  });
  // A validation failure proves the function exists; a "not found" proves it does not.
  return !error || !/does not exist|not found|404|42883/i.test(error.message);
})();

console.log(`\nSchema check against ${url}\n`);

for (const table of present) console.log(`  [ok]   table ${table}`);
for (const entry of missing) console.log(`  [MISS] table ${entry.table} -> ${entry.detail}`);

console.log(`  ${mergeWorks ? "[ok]  " : "[MISS]"} function merge_cart`);
console.log(`  ${placeOrderWorks ? "[ok]  " : "[MISS]"} function place_order`);

const rows = await db.from("products").select("id", { count: "exact", head: true });
if (!rows.error) console.log(`\n  ${rows.count} products in the catalogue`);

const problems = missing.length + (mergeWorks ? 0 : 1) + (placeOrderWorks ? 0 : 1);

if (problems === 0) {
  console.log("\nEverything the app needs is present.\n");
  process.exit(0);
}

console.log("\nMissing pieces. Open db/schema.sql in the Supabase SQL Editor and run the whole file.");
console.log("Every statement is `if not exists`, so re-running is safe.\n");
process.exit(1);