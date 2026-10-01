import "dotenv/config";

const bool = (value, fallback = false) => {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
};

const list = (value) =>
  (value || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const config = {
  port: Number(process.env.PORT || 3000),
  siteUrl: (process.env.SITE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, ""),
  shopName: process.env.SHOP_NAME || "Sultan Clothing",
  shopEmail: process.env.SHOP_EMAIL || "dripwithsultan@gmail.com",

  supabase: {
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
    serviceRoleKey: supabaseServiceRoleKey
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || ""
  },

  mailgun: {
    apiKey: process.env.MAILGUN_API_KEY || "",
    domain: process.env.MAILGUN_DOMAIN || "",
    from: process.env.MAILGUN_FROM || "",
    apiBase: process.env.MAILGUN_API_BASE || "https://api.mailgun.net/v3"
  },

  adminEmails: list(process.env.ADMIN_EMAILS),

  // Without a service role key the server cannot write to Postgres, so it falls
  // back to an in-memory store and logs mail instead of sending it.
  demoMode: bool(process.env.DEMO_MODE) || !supabaseServiceRoleKey
};

export const adminChecklist = [
  {
    name: "Supabase",
    ok: Boolean(config.supabase.url && config.supabase.serviceRoleKey),
    hint: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, then run db/schema.sql"
  },
  {
    name: "Google sign-in",
    ok: Boolean(config.google.clientId),
    hint: "Set GOOGLE_CLIENT_ID to a Web application client ID"
  },
  {
    name: "Mailgun",
    ok: Boolean(config.mailgun.apiKey && config.mailgun.domain),
    hint: "Set MAILGUN_API_KEY, MAILGUN_DOMAIN and MAILGUN_FROM"
  }
];

export const isAdminEmail = (email) =>
  Boolean(email) && config.adminEmails.includes(String(email).trim().toLowerCase());
