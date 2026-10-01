import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import { catalogue } from "../server/data/catalogue.js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("\n  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.\n  Copy .env.example to .env and fill them in first.\n");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

const rows = catalogue.map((product) => ({
  slug: product.slug,
  name: product.name,
  tagline: product.tagline,
  description: product.description,
  category: product.category,
  price_kobo: product.priceKobo,
  image_url: product.image,
  sizes: product.sizes,
  stock: product.stock,
  featured: product.featured,
  active: true
}));

const { error } = await db.from("products").upsert(rows, { onConflict: "slug" });
if (error) {
  console.error(`\n  Seeding failed: ${error.message}\n`);
  process.exit(1);
}

const { count } = await db.from("products").select("id", { count: "exact", head: true });
console.log(`\n  Seeded ${rows.length} products into ${url}`);
console.log(`  The catalogue now holds ${count} products.\n`);
