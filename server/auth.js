import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { config, isAdminEmail } from "./config.js";

const b64 = (input) => Buffer.from(input).toString("base64url");
const sign = (value, secret) => createHmac("sha256", secret).update(value).digest("base64url");

// Only used when the server runs without Supabase so the shop can still be
// demonstrated end to end. Real deployments verify Supabase access tokens.
const demoSecret = process.env.DEMO_SESSION_SECRET || randomBytes(32).toString("hex");

export function issueDemoToken(user) {
  const header = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      name: user.name,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
    })
  );
  return `${header}.${payload}.${sign(`${header}.${payload}`, demoSecret)}`;
}

function readDemoToken(token) {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) return null;
  const expected = sign(`${header}.${payload}`, demoSecret);
  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!claims.exp || claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

const supabaseAdmin = () =>
  createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

const toSession = (user) => ({
  id: user.id,
  email: String(user.email || "").toLowerCase(),
  name: user.user_metadata?.full_name || user.user_metadata?.name || "",
  picture: user.user_metadata?.picture || user.user_metadata?.avatar_url || "",
  isAdmin: isAdminEmail(user.email)
});

export async function resolveSession(req) {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;

  if (!config.demoMode) {
    const { data, error } = await supabaseAdmin().auth.getUser(token);
    if (error || !data?.user) return null;
    return toSession(data.user);
  }

  const claims = readDemoToken(token);
  if (!claims) return null;
  return {
    id: claims.sub,
    email: claims.email,
    name: claims.name || "",
    picture: "",
    isAdmin: isAdminEmail(claims.email)
  };
}

export async function attachUser(req, _res, next) {
  try {
    req.user = await resolveSession(req);
    next();
  } catch {
    req.user = null;
    next();
  }
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Please sign in to continue." });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Please sign in to continue." });
  if (!req.user.isAdmin) return res.status(403).json({ error: "This area is for the shop owner." });
  next();
}
