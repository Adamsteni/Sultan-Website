import { api, config, setAccessToken, readStorage, writeStorage, toast } from "./core.js";

const SESSION_KEY = "sultan.session";

let supabase = null;
let googleReady = false;
let session = null;
const listeners = new Set();

const listenersRun = (user) => listeners.forEach((callback) => callback(user));

export function onAuthChange(callback) {
  listeners.add(callback);
  if (session !== undefined) callback(currentUser());
  return () => listeners.delete(callback);
}

export function currentUser() {
  return session ? session.user : null;
}

export function isSignedIn() {
  return Boolean(session);
}

export function authProvider() {
  return config().authProvider;
}

function adoptSession(next) {
  session = next;
  setAccessToken(next?.token || null);
  config().user = next
    ? { email: next.user.email, name: next.user.name, isAdmin: Boolean(next.user.isAdmin) }
    : null;
  if (next) writeStorage(SESSION_KEY, next);
  else window.localStorage.removeItem(SESSION_KEY);
  listenersRun(currentUser());
}

const normalise = (user) => ({
  id: user.id,
  email: user.email,
  name: user.user_metadata?.full_name || user.user_metadata?.name || user.email.split("@")[0],
  picture: user.user_metadata?.picture || user.user_metadata?.avatar_url || "",
  isAdmin: false
});

async function loadSupabaseSdk() {
  if (window.supabase?.createClient) return window.supabase;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/vendor/supabase.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Could not load the Supabase client."));
    document.head.append(script);
  });
  return window.supabase;
}

async function initSupabase() {
  const sdk = await loadSupabaseSdk();
  const { url, anonKey } = config().supabase;
  supabase = sdk.createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "sultan.auth"
    }
  });

  supabase.auth.onAuthStateChange((event, next) => {
    if (event === "SIGNED_OUT" || !next) {
      adoptSession(null);
      return;
    }
    if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN" || event === "INITIAL_SESSION") {
      if (session?.user?.email !== next.user.email || !session) {
        syncProfile(next.user, next.access_token);
      } else {
        adoptSession({ ...session, token: next.access_token });
      }
    }
  });

  const { data } = await supabase.auth.getSession();
  if (data.session) {
    const user = normalise(data.session.user);
    const isAdmin = await checkAdmin(data.session.access_token);
    adoptSession({ token: data.session.access_token, user: { ...user, isAdmin } });
  } else {
    adoptSession(null);
  }
}

async function checkAdmin(token) {
  try {
    const { user } = await api("/api/me", { headers: { authorization: `Bearer ${token}` } });
    return Boolean(user?.isAdmin);
  } catch {
    return false;
  }
}

async function syncProfile(user, accessToken) {
  const profile = normalise(user);
  const isAdmin = await checkAdmin(accessToken);
  adoptSession({ token: accessToken, user: { ...profile, isAdmin } });
}

function initDemo() {
  const stored = readStorage(SESSION_KEY, null);
  if (stored?.token && stored?.user) {
    session = { token: stored.token, user: stored.user };
    setAccessToken(stored.token);
    config().user = stored.user;
  } else {
    adoptSession(null);
  }
}

export async function initAuth() {
  if (config().authProvider === "supabase") {
    try {
      await initSupabase();
      return;
    } catch (error) {
      console.error("[auth] Supabase init failed:", error);
      toast("Sign-in is unavailable right now. Try again shortly.", { tone: "error" });
      adoptSession(null);
      return;
    }
  }
  initDemo();
}

export async function signInWithGoogleIdToken(credential) {
  if (!supabase) throw new Error("Google sign-in is not available.");
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: "google", token: credential });
  if (error) throw error;
  await syncProfile(data.user, data.session.access_token);
  return currentUser();
}

export async function signInWithGoogleRedirect() {
  if (!supabase) throw new Error("Google sign-in is not available.");
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/account.html`, queryParams: { prompt: "select_account" } }
  });
  if (error) throw error;
}

export async function signInWithPassword(email, password) {
  if (!supabase) throw new Error("Password sign-in needs Supabase to be configured.");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await syncProfile(data.user, data.session.access_token);
  return currentUser();
}

export async function signUpWithPassword({ name, email, password }) {
  if (!supabase) throw new Error("Creating accounts needs Supabase to be configured.");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name },
      emailRedirectTo: `${window.location.origin}/account.html`
    }
  });
  if (error) throw error;
  if (data.session) {
    await syncProfile(data.user, data.session.access_token);
    return { user: currentUser(), needsConfirmation: false };
  }
  return { user: null, needsConfirmation: true };
}

export async function signInDemo({ email, name }) {
  const result = await api("/api/auth/demo", { method: "POST", body: { email, name } });
  adoptSession({ token: result.token, user: result.user });
  return result.user;
}

export async function signOut() {
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }
  adoptSession(null);
}

export function renderGoogleButton(container, onSignedIn) {
  const clientId = config().googleClientId;
  if (!container) return;

  if (!clientId) {
    if (supabase) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "google-button";
      button.innerHTML = googleIcon + "<span>Continue with Google</span>";
      button.addEventListener("click", () => signInWithGoogleRedirect().catch((error) => onSignedIn(error)));
      container.append(button);
    }
    return;
  }

  const mount = () => {
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        signInWithGoogleIdToken(response.credential).then(
          () => onSignedIn(),
          (error) => onSignedIn(error)
        );
      }
    });
    container.innerHTML = `<div id="googleSlot"></div>`;
    const slot = container.querySelector("#googleSlot");
    window.google.accounts.id.renderButton(slot, {
      type: "standard",
      theme: "outline",
      size: "large",
      shape: "rectangular",
      text: "continue_with",
      width: 360
    });
    const fit = () => {
      const width = container.clientWidth;
      if (width) slot.style.transform = `scale(${Math.min(width / 360, 1.6)})`;
    };
    fit();
    window.addEventListener("resize", fit);
    container.dataset.ready = "true";
  };

  const wait = (attempt = 0) => {
    if (googleReady || (window.google && window.google.accounts)) {
      googleReady = true;
      mount();
      return;
    }
    if (attempt > 40) return;
    window.setTimeout(() => wait(attempt + 1), 100);
  };

  if (document.querySelector("#googleGsi")) {
    wait();
    return;
  }

  const script = document.createElement("script");
  script.id = "googleGsi";
  script.src = "https://accounts.google.com/gsi/client";
  script.async = true;
  script.defer = true;
  script.onload = () => wait();
  script.onerror = () => {
    const fallback = document.createElement("div");
    fallback.className = "auth-fallback";
    fallback.innerHTML = `<p class="auth-message">Google sign-in could not load. Check your connection.</p>`;
    container.append(fallback);
  };
  document.head.append(script);
}

const googleIcon = `<svg class="google-button-icon" viewBox="0 0 24 24" aria-hidden="true">
  <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"/>
  <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.1-4 1.1-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1C3.4 21.3 7.4 24 12 24z"/>
  <path fill="#FBBC05" d="M5.4 14.3c-.2-.7-.4-1.4-.4-2.3s.1-1.6.4-2.3V6.6H1.4C.5 8.2 0 10 0 12s.5 3.8 1.4 5.4l4-3.1z"/>
  <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.4 0 3.4 2.7 1.4 6.6l4 3.1C6.3 6.8 8.9 4.8 12 4.8z"/>
</svg>`;
