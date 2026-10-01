import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const source = path.join(path.dirname(require.resolve("@supabase/supabase-js/package.json")), "dist", "umd", "supabase.js");
const targetDir = path.join(root, "public", "vendor");
const target = path.join(targetDir, "supabase.js");

// The browser needs the Supabase SDK as a real file under public/, because a serverless
// function cannot serve static assets out of node_modules the way the Express server does.
mkdirSync(targetDir, { recursive: true });
copyFileSync(source, target);

const version = require("@supabase/supabase-js/package.json").version;
console.log(`  vendor  supabase.js ${version}  ${(statSync(target).size / 1024).toFixed(0)}kb  ->  public/vendor/supabase.js`);
