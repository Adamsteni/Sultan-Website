// Sign-in for the app.
//
// Two paths, both ending in the same place: a Supabase session whose access token every API
// call then carries. That is what makes the account the same on web and phone.
//
//   email + password  -> supabase.auth.signInWithPassword
//   Google            -> expo-web-browser opens the consent screen against Supabase's redirect,
//                        the tokens come back on the callback URL, and setSession stores them the
//                        same way. No native Google module is involved.
//
// The bag is tied to the session by cart.syncFromServer() / cart.resetToLocal(), so signing in
// merges whatever was held on the device and signing out clears it.

import { useEffect, useState } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { api, setAccessToken, supabaseClient, hasSupabase } from "./api";
import { cart } from "./cart";

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
// one deliberate difference from the website: it means no extra native module is needed.
//
// Supabase runs the whole Google exchange and hands back the URL to open. Talking to
// accounts.google.com directly would be simpler but cannot work: Google only allows https://
// redirects for web OAuth clients, so a custom scheme can never be sent straight to Google.
// Supabase sits in between as the allowed https target and forwards the finished tokens on.
//
// The redirect URI has to be derived at runtime, not hard-coded. Expo Go registers only its own
// exp:// scheme, so nothing there handles the "sultan" scheme this app owns, and iOS reports
// "Safari cannot open the page because it couldn't connect to the server". A development build
// (see eas.json) does own the sultan scheme, which is why Google sign-in needs one; authRedirectUrl
// below keeps working in Expo Go for the flows that can be received there.
export async function signInWithGoogle() {
  if (!hasSupabase) throw new Error("Supabase is not configured for the app.");

  const supabase = supabaseClient();
  const redirectTo = authRedirectUrl();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: "select_account" } }
  });
  if (error) throw new Error(error.message);
  if (!data?.url) throw new Error("Google sign-in could not be started.");

  const callbackUrl = await openAuthBrowser(data.url, redirectTo);
  const tokens = parseCallbackUrl(callbackUrl);
  const accessToken = tokens.access_token;
  const refreshToken = tokens.refresh_token;
  if (!accessToken || !refreshToken) throw new Error("Google sign-in did not return a session.");

  const { data: exchanged, error: setError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken
  });
  if (setError) throw new Error(setError.message);
  if (!exchanged.session) throw new Error("Google sign-in did not return a session.");

  await adopt({
    accessToken: exchanged.session.access_token,
    user: {
      id: exchanged.session.user.id,
      email: exchanged.session.user.email,
      name:
        exchanged.session.user.user_metadata?.full_name ||
        exchanged.session.user.user_metadata?.name ||
        exchanged.session.user.email.split("@")[0],
      isAdmin: false
    }
  });
  await checkAdmin();
  return session;
}

// Builds the URL Supabase sends the browser back to once Google is done.
//
// Linking.createURL() cannot be used inside Expo Go. This app declares its own scheme ("sultan" in
// app.json), and expo-linking blanks the host in that case whenever it detects Expo Go:
//
//   if (hasCustomScheme() && isExpoHosted()) hostUri = '';      createURL.js:72
//
// The result is "exp:////auth" with no host, which iOS reports as "Safari cannot open the page
// because it couldn't connect to the server". So the Expo Go URL is assembled here from the host
// Metro is already serving on. A development build owns the sultan scheme, so createURL returns
// sultan://auth there and is used directly.
function authRedirectUrl() {
  if (Constants.expoGoConfig) {
    const host = Constants.expoConfig?.hostUri || stripScheme(Constants.linkingUri);
    if (!host) throw new Error("Could not work out the address this app is running on.");
    return `exp://${host}/--/auth`;
  }
  return Linking.createURL("auth");
}

const stripScheme = (url = "") => url.replace(/^[a-zA-Z0-9+.-]+:\/\//, "").replace(/\/?\?.*$/, "");

// Opens the consent screen and resolves with the redirect URL the browser was sent to.
//
// The browser choice matters. openBrowserAsync shows an in-app browser that hands the final
// exp://... redirect to the operating system, and iOS cannot route it from there: Safari reports
// "Safari cannot open the page because it couldn't connect to the server". openAuthSessionAsync
// uses ASWebAuthenticationSession instead, which matches the redirect URL itself and hands the
// callback straight back without any browser ever trying to load it.
//
// openAuthSessionAsync resolves "dismissed" the moment the sheet closes, which on iOS can happen
// before the app's own openURL event lands, so the Linking listener is kept as a second way in.
// Whichever arrives first wins.
function openAuthBrowser(authUrl, redirectTo) {
  // Compared loosely on purpose. The Expo Go redirect is exp://<lan-ip>:8081/--/auth, so only the
  // scheme and host are stable and the path is not worth matching on.
  const origin = redirectTo.split("/").slice(0, 3).join("/");

  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(closeTimer);
      subscription.remove();
      fn(value);
    };

    const subscription = Linking.addEventListener("url", ({ url }) => {
      if (!url.startsWith(origin)) return;
      WebBrowser.dismissAuthSession();
      finish(resolve, url);
    });

    const closeTimer = setTimeout(() => {
      WebBrowser.dismissAuthSession();
      finish(reject, new Error(`Google sign-in timed out. Waiting for ${origin}`));
    }, 5 * 60 * 1000);

    WebBrowser.openAuthSessionAsync(authUrl, redirectTo)
      .then((result) => {
        if (result.type === "success") finish(resolve, result.url);
        else finish(reject, new Error("Google sign-in was cancelled."));
      })
      .catch((failure) => finish(reject, failure));
  });
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

function scheme() {
  // Must match "scheme" in app.json. Used for the paths a real build can be opened with; the
  // Google sign-in redirect is derived at runtime instead (see openAuthBrowser).
  return "sultan";
}

// Tokens come back in the URL fragment ("#access_token=..."), so the query-string part is skipped.
function parseCallbackUrl(url) {
  const out = {};
  const fragment = url.includes("#") ? url.slice(url.indexOf("#") + 1) : "";
  for (const part of fragment.split("&")) {
    const [key, value] = part.split("=");
    if (!key) continue;
    out[decodeURIComponent(key)] = decodeURIComponent(value || "");
  }
  return out;
}

export const canUseGoogle = () => hasSupabase;

// Surfaces what the Google flow is actually doing on screen. Deep-link problems are otherwise
// invisible from in here: the failure happens in the browser, not in the app.
export function describeGoogleRedirect() {
  try {
    const inExpoGo = Boolean(Constants.expoGoConfig);
    const host = Constants.expoConfig?.hostUri || stripScheme(Constants.linkingUri) || "(none)";
    return [
      `in Expo Go: ${inExpoGo ? "yes" : "no"}`,
      `hostUri: ${host}`,
      `link url: ${authRedirectUrl()}`,
      `debug deep link: exp://${host}/--/auth`
    ].join("\n");
  } catch (failure) {
    return `redirect error: ${failure.message}`;
  }
}
export const platformIsAndroid = Platform.OS === "android";





