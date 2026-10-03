// Sign-in for the app.
//
// Two paths, both ending in the same place: a Supabase session whose access token every API
// call then carries. That is what makes the account the same on web and phone.
//
//   email + password  -> supabase.auth.signInWithPassword
//   Google            -> expo-auth-session opens the consent screen, the id token is posted
//                        to /auth/v1/token, and the resulting session is stored the same way
//
// The bag is tied to the session by cart.syncFromServer() / cart.resetToLocal(), so signing in
// merges whatever was held on the device and signing out clears it.

import { useEffect, useState } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import { api, setAccessToken, supabaseClient, hasSupabase } from "./api";
import { cart } from "./cart";
import { googleClientId } from "./shop";

WebBrowser.maybeCompleteAuthSession();

let session = null;
const listeners = new Set();

const notify = () => {
  for (const listener of listeners) listener(session);
};

const adopt = async (next) => {
  const wasSignedIn = Boolean(session);
  session = next;
  setAccessToken(next?.accessToken || null);
  cart.setUser(next || null);

  if (next) {
    try {
      await cart.syncFromServer();
    } catch {
      // A bag that will not sync must not block signing in.
    }
  } else if (wasSignedIn) {
    await cart.resetToLocal();
  }

  notify();
};

export const useSession = () => {
  const [state, setState] = useState(session);
  useEffect(() => {
    listeners.add(setState);
    return () => listeners.delete(setState);
  }, []);
  return state;
};

export const currentUser = () => session?.user || null;
export const isSignedIn = () => Boolean(session);

// Called once at start-up. A saved Supabase session is restored so the app opens signed in,
// which is what makes "sign out, close the app, reopen, sign in again, orders still there"
// behave the way the brief expects.
export async function initAuth() {
  if (!hasSupabase) {
    await adopt(null);
    return null;
  }

  try {
    const supabase = await supabaseClient();
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      await adopt({
        accessToken: data.session.access_token,
        user: {
          id: data.session.user.id,
          email: data.session.user.email,
          name:
            data.session.user.user_metadata?.full_name ||
            data.session.user.user_metadata?.name ||
            data.session.user.email.split("@")[0],
          isAdmin: false
        }
      });
      await checkAdmin();
    } else {
      await adopt(null);
    }
  } catch {
    await adopt(null);
  }
  return session;
}

async function checkAdmin() {
  if (!session) return;
  try {
    const { user } = await api("/me");
    session = { ...session, user: { ...session.user, isAdmin: Boolean(user?.isAdmin) } };
    notify();
  } catch {
    // Not being an admin is the safe default; the server enforces it regardless.
  }
}

export async function signInWithEmail(email, password) {
  const supabase = await supabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email || "").trim(),
    password
  });
  if (error) throw new Error(error.message);

  await adopt({
    accessToken: data.session.access_token,
    user: {
      id: data.session.user.id,
      email: data.session.user.email,
      name:
        data.session.user.user_metadata?.full_name ||
        data.session.user.user_metadata?.name ||
        data.session.user.email.split("@")[0],
      isAdmin: false
    }
  });
  await checkAdmin();
  return session;
}

// Google sign-in.
//
// The consent screen runs in a browser tab rather than a native Google SDK dialog. That is the
// one deliberate difference from the website: it means no extra native module, so the app runs
// in Expo Go on a phone without a development build.
//
// Android treats these links as other apps' links, so the result is read back with Linking
// instead of the return URL.
export async function signInWithGoogle() {
  const clientId = googleClientId();
  if (!clientId) throw new Error("Google sign-in is not configured for the app yet.");
  if (!hasSupabase) throw new Error("Supabase is not configured for the app.");

  const supabase = await supabaseClient();
  const redirectUri = `${exppoScheme()}://auth`;

  const nonce = Crypto.randomUUID();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "id_token",
    scope: "openid email profile",
    nonce,
    prompt: "select_account"
  });

  const authorizeUrl =
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` +
    `&state=${nonce}`;

  const result = await WebBrowser.openAuthSessionAsync(authorizeUrl, redirectUri);
  if (result.type !== "success") throw new Error("Google sign-in was cancelled.");

  const { id_token: idToken } = parseCallbackUrl(result.url);
  if (!idToken) throw new Error("Google did not return a sign-in token.");

  const { data, error } = await supabase.auth.signInWithIdToken({ provider: "google", token: idToken });
  if (error) throw new Error(error.message);

  await adopt({
    accessToken: data.session.access_token,
    user: {
      id: data.session.user.id,
      email: data.session.user.email,
      name:
        data.session.user.user_metadata?.full_name ||
        data.session.user.user_metadata?.name ||
        data.session.user.email.split("@")[0],
      isAdmin: false
    }
  });
  await checkAdmin();
  return session;
}

export async function signOut() {
  try {
    const supabase = await supabaseClient();
    await supabase.auth.signOut();
  } catch {
    // The local session is cleared either way.
  }
  await adopt(null);
}

function expoScheme() {
  // Must match "scheme" in app.json. The deep link Google returns to has to match too.
  return "sultan";
}

function parseCallbackUrl(url) {
  const out = {};
  const query = url.split("?")[1] || "";
  for (const part of query.split("&")) {
    const [key, value] = part.split("=");
    if (!key) continue;
    out[decodeURIComponent(key)] = decodeURIComponent(value || "");
  }
  return out;
}

export const canUseGoogle = () => Boolean(googleClientId());
export const platformIsAndroid = Platform.OS === "android";