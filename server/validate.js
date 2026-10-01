const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River",
  "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT - Abuja", "Gombe", "Imo", "Jigawa", "Kaduna",
  "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun",
  "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara"
];

export class ValidationError extends Error {
  constructor(fields) {
    super("Some details need another look.");
    this.status = 422;
    this.fields = fields;
  }
}

const clean = (value) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "");

export function validateShipping(input = {}) {
  const fields = {};
  const fullName = clean(input.fullName);
  const phone = clean(input.phone).replace(/[^\d+]/g, "");
  const addressLine1 = clean(input.addressLine1);
  const addressLine2 = clean(input.addressLine2);
  const city = clean(input.city);
  const state = clean(input.state);
  const notes = clean(input.notes).slice(0, 500);

  if (fullName.length < 2) fields.fullName = "Enter the name for the delivery.";
  if (!/^\+?\d{10,15}$/.test(phone)) fields.phone = "Enter a phone number we can reach you on.";
  if (addressLine1.length < 4) fields.addressLine1 = "Enter your street address.";
  if (city.length < 2) fields.city = "Enter your city.";

  const matchedState = NIGERIAN_STATES.find((entry) => entry.toLowerCase() === state.toLowerCase());
  if (!matchedState) fields.state = "Choose a state.";

  if (Object.keys(fields).length) throw new ValidationError(fields);

  return { fullName, phone, addressLine1, addressLine2, city, state: matchedState, notes };
}

function luhnValid(digits) {
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

export function validatePayment(input = {}, { requireCard }) {
  const method = input.method === "cod" ? "cod" : "card";
  if (!requireCard && method === "card") return { method, reference: null, last4: null };

  if (method === "cod") {
    return { method, reference: `COD-${Date.now().toString(36).toUpperCase()}`, last4: null };
  }

  const fields = {};
  const number = clean(input.cardNumber).replace(/[\s-]/g, "");
  const expiry = clean(input.expiry);
  const cvc = clean(input.cvc);
  const name = clean(input.cardName);

  if (!/^\d{13,19}$/.test(number) || !luhnValid(number)) fields.cardNumber = "Check the card number.";
  if (name.length < 2) fields.cardName = "Enter the name on the card.";

  const match = expiry.match(/^(\d{2})\s*\/\s*(\d{2})$/);
  if (!match) {
    fields.expiry = "Use MM/YY.";
  } else {
    const month = Number(match[1]);
    const year = 2000 + Number(match[2]);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);
    if (month < 1 || month > 12) fields.expiry = "Use MM/YY.";
    else if (endOfMonth.getTime() < Date.now()) fields.expiry = "This card has expired.";
  }

  if (!/^\d{3,4}$/.test(cvc)) fields.cvc = "Check the security code.";

  if (Object.keys(fields).length) throw new ValidationError(fields);

  return { method, reference: `SUL-${Date.now().toString(36).toUpperCase()}`, last4: number.slice(-4) };
}

export function validateCart(input = []) {
  const fields = {};
  if (!Array.isArray(input) || input.length === 0) throw new ValidationError({ cart: "Your bag is empty." });
  if (input.length > 25) throw new ValidationError({ cart: "Too many different items in one order." });

  const items = input.map((raw) => {
    const slug = clean(raw?.slug);
    const quantity = Number(raw?.quantity);
    if (!slug) throw new ValidationError({ cart: "One of the items in your bag is not valid." });
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      fields.cart = "Check the quantities in your bag.";
    }
    return { slug, quantity, size: clean(raw?.size) || null };
  });

  if (Object.keys(fields).length) throw new ValidationError(fields);
  return items;
}

export function validateAdminProductPatch(input = {}) {
  const patch = {};
  if (input.priceKobo !== undefined) {
    const price = Number(input.priceKobo);
    if (!Number.isFinite(price) || price < 0) throw new ValidationError({ priceKobo: "Enter a valid price." });
    patch.priceKobo = price;
  }
  if (input.stock !== undefined) {
    const stock = Number(input.stock);
    if (!Number.isInteger(stock) || stock < 0) throw new ValidationError({ stock: "Stock cannot be negative." });
    patch.stock = stock;
  }
  for (const key of ["featured", "active"]) {
    if (input[key] !== undefined) patch[key] = Boolean(input[key]);
  }
  if (!Object.keys(patch).length) throw new ValidationError({ form: "Nothing to update." });
  return patch;
}

export { NIGERIAN_STATES };
