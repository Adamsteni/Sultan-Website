import { api, loadConfig, money, config, escapeHtml, toast } from "./core.js";
import { mountShell } from "./shell.js";
import { currentUser, isSignedIn, renderGoogleButton, signInDemo, signInWithPassword, signUpWithPassword } from "./auth.js";
import { cart } from "./cart.js";

const authGate = document.querySelector("#authGate");
const checkout = document.querySelector("#checkout");
const emptyCart = document.querySelector("#emptyCart");
const form = document.querySelector("#checkoutForm");
const placeButton = document.querySelector("#placeOrder");
const formMessage = document.querySelector("#formMessage");
const cardFields = document.querySelector("#cardFields");

let submitting = false;

function renderSummary() {
  const { freeThresholdKobo, feeKobo } = config().delivery;
  const lines = cart.lines;

  document.querySelector("#summaryItems").innerHTML = lines
    .map(
      (line) => `
      <div class="summary-line">
        <div class="summary-thumb">
          <img src="${escapeHtml(line.image || "")}" width="56" height="74" alt="${escapeHtml(line.name)}" />
          <span>${line.quantity}</span>
        </div>
        <div>
          <p class="summary-name">${escapeHtml(line.name)}</p>
          <p class="summary-meta">${line.size ? `Size ${escapeHtml(line.size)}` : "One size"}</p>
        </div>
        <p class="summary-price">${money(line.unitPriceKobo * line.quantity)}</p>
      </div>`
    )
    .join("");

  document.querySelector("#summarySubtotal").textContent = money(cart.subtotalKobo);
  document.querySelector("#summaryDelivery").textContent = cart.deliveryKobo
    ? money(cart.deliveryKobo)
    : "Free";
  document.querySelector("#summaryTotal").textContent = money(cart.totalKobo);
  document.querySelector("#summaryNote").textContent =
    cart.deliveryKobo > 0
      ? `Add ${money(freeThresholdKobo - cart.subtotalKobo)} more for free delivery.`
      : "Free delivery applied.";
  placeButton.textContent = `Place order · ${money(cart.totalKobo)}`;
}

function populateStates() {
  const select = document.querySelector("#state");
  const states = config().states || [];
  select.innerHTML = `<option value="">Choose a state</option>${states
    .map((state) => `<option value="${escapeHtml(state)}">${escapeHtml(state)}</option>`)
    .join("")}`;
}

function clearErrors() {
  form.querySelectorAll("[data-error]").forEach((node) => {
    node.hidden = true;
    node.textContent = "";
  });
  formMessage.hidden = true;
  formMessage.classList.remove("is-success");
}

function showErrors(fields, message) {
  clearErrors();
  for (const [name, text] of Object.entries(fields || {})) {
    const node = form.querySelector(`[data-error="${name}"]`);
    if (node) {
      node.textContent = text;
      node.hidden = false;
    } else {
      formMessage.textContent = text;
      formMessage.hidden = false;
    }
  }
  if (!Object.keys(fields || {}).length && message) {
    formMessage.textContent = message;
    formMessage.hidden = false;
  }
  const firstBad = form.querySelector("[data-error]:not([hidden])");
  if (firstBad) firstBad.scrollIntoView({ block: "center", behavior: "smooth" });
}

function prefill() {
  const user = currentUser();
  if (!user) return;
  const name = document.querySelector("#fullName");
  if (!name.value) name.value = user.name || "";
  const emailNote = document.querySelector("#signedInAs");
  emailNote.textContent = `Signed in as ${user.email}. Orders are saved to this account.`;
  emailNote.hidden = false;
}

form.querySelectorAll('input[name="paymentMethod"]').forEach((radio) =>
  radio.addEventListener("change", () => {
    const isCard = chosenMethod() === "card";
    cardFields.hidden = !isCard;
    if (!isCard) {
      ["cardNumber", "cardName", "expiry", "cvc"].forEach((id) => {
        const node = document.querySelector(`#${id}`);
        if (node) node.value = "";
      });
    }
  })
);

document.querySelector("#cardNumber").addEventListener("input", (event) => {
  const digits = event.currentTarget.value.replace(/\D/g, "").slice(0, 19);
  event.currentTarget.value = digits.replace(/(.{4})/g, "$1 ").trim();
});

document.querySelector("#expiry").addEventListener("input", (event) => {
  const digits = event.currentTarget.value.replace(/\D/g, "").slice(0, 4);
  event.currentTarget.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
});

const chosenMethod = () =>
  form.querySelector('input[name="paymentMethod"]:checked')?.value || "card";

function readForm() {
  const value = (id) => document.querySelector(`#${id}`).value.trim();
  return {
    shipping: {
      fullName: value("fullName"),
      phone: value("phone"),
      addressLine1: value("addressLine1"),
      addressLine2: value("addressLine2"),
      city: value("city"),
      state: value("state"),
      notes: value("notes")
    },
    payment: {
      method: chosenMethod(),
      cardNumber: value("cardNumber"),
      cardName: value("cardName"),
      expiry: value("expiry"),
      cvc: value("cvc")
    },
    items: cart.toPayload()
  };
}

placeButton.addEventListener("click", async () => {
  if (submitting) return;
  clearErrors();

  if (!isSignedIn()) {
    window.location.href = "./account.html?next=%2Fcheckout.html";
    return;
  }

  const payload = readForm();
  submitting = true;
  placeButton.disabled = true;
  placeButton.textContent = "Placing your order…";

  try {
    const { order, email } = await api("/api/orders", { method: "POST", body: payload });
    cart.clear();
    toast(
      email.sent
        ? `Order ${order.orderNumber} placed. Confirmation email sent.`
        : `Order ${order.orderNumber} placed.`,
      { tone: "success" }
    );
    window.location.href = `./account.html?order=${encodeURIComponent(order.orderNumber)}&placed=1`;
  } catch (error) {
    showErrors(error.fields, error.message);
    toast(error.message, { tone: "error" });
    submitting = false;
    placeButton.disabled = false;
    renderSummary();
  }
});

let gateMode = "signin";

function renderGate() {
  const signup = gateMode === "signup";
  const supabase = config().authProvider === "supabase";
  document.querySelector("#gateNameField").hidden = !signup;
  document.querySelector("#gateName").required = signup;
  document.querySelector("#gateSubmit").textContent = signup ? "Create account" : "Sign in";
  document.querySelector("#gatePassword").setAttribute(
    "autocomplete",
    signup ? "new-password" : "current-password"
  );
  document.querySelector("#gatePrompt").textContent = signup
    ? "Already have an account?"
    : "New to Sultan?";
  document.querySelector("#gateToggle").textContent = signup ? "Sign in" : "Create an account";
  document.querySelector("#gateMessage").hidden = true;
  document.querySelectorAll("[data-email-only]").forEach((node) => {
    node.hidden = !supabase;
  });
  document.querySelectorAll("[data-google-only]").forEach((node) => {
    node.hidden = !supabase;
  });
  renderGoogleButton(document.querySelector("#googleWrap"), (error) => {
    if (error) {
      const message = document.querySelector("#gateMessage");
      message.textContent = error.message;
      message.hidden = false;
      return;
    }
    renderCheckout();
  });
}

function showAuthGate() {
  checkout.hidden = true;
  emptyCart.hidden = true;
  authGate.hidden = false;
  renderGate();
}

document.querySelector("#gateToggle")?.addEventListener("click", () => {
  gateMode = gateMode === "signup" ? "signin" : "signup";
  renderGate();
  document.querySelector("#gateEmail").focus();
});

document.querySelector("#gateForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = document.querySelector("#gateMessage");
  const submit = document.querySelector("#gateSubmit");
  const name = document.querySelector("#gateName").value.trim();
  const email = document.querySelector("#gateEmail").value.trim();
  const password = document.querySelector("#gatePassword").value;
  message.hidden = true;
  submit.disabled = true;

  try {
    if (config().authProvider === "demo") {
      await signInDemo({ email, name: name || email.split("@")[0] });
    } else if (gateMode === "signup") {
      const result = await signUpWithPassword({ name, email, password });
      if (result.needsConfirmation) {
        message.textContent = "Check your inbox to confirm the address, then sign in.";
        message.hidden = false;
        gateMode = "signin";
        renderGate();
        return;
      }
    } else {
      await signInWithPassword(email, password);
    }
    event.currentTarget.reset();
    toast(`Welcome, ${(currentUser().name || currentUser().email).split(" ")[0]}.`, { tone: "success" });
    renderCheckout();
  } catch (error) {
    message.textContent = error.message;
    message.hidden = false;
  } finally {
    submit.disabled = false;
  }
});

function renderCheckout() {
  authGate.hidden = true;
  checkout.hidden = false;
  emptyCart.hidden = true;
  prefill();
  renderSummary();
}

async function start() {
  await loadConfig();
  await mountShell();
  populateStates();
  document.addEventListener("sultan:cart", renderSummary);

  if (cart.count === 0) {
    emptyCart.hidden = false;
    checkout.hidden = true;
    authGate.hidden = true;
  } else if (isSignedIn()) {
    renderCheckout();
  } else {
    showAuthGate();
  }
}

start();
