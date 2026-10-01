import { randomUUID } from "node:crypto";
import { catalogue, deliveryFor } from "../data/catalogue.js";

// Same interface as the Supabase repository so the API does not care which one
// is mounted. Data lives in memory, so it resets whenever the server restarts.
export function createMemoryRepository() {
  const products = catalogue.map((product) => ({
    ...product,
    id: randomUUID(),
    active: true,
    createdAt: new Date().toISOString()
  }));
  const orders = new Map();
  const subscribers = [];
  let orderSeq = 1001;

  const reject = (message) => {
    const failure = new Error(message);
    failure.status = 422;
    throw failure;
  };

  const itemsFor = (orderId) => orders.get(orderId)?.items ?? [];

  return {
    mode: "memory",

    async ping() {
      return true;
    },

    async listProducts({ category, search, includeInactive = false } = {}) {
      const term = (search || "").trim().toLowerCase();
      return products
        .filter((product) => includeInactive || product.active)
        .filter((product) => !category || product.category === category)
        .filter((product) =>
          !term
            ? true
            : `${product.name} ${product.tagline} ${product.category}`.toLowerCase().includes(term)
        )
        .sort((a, b) => Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name));
    },

    async getProductBySlug(slug) {
      return products.find((product) => product.slug === slug) ?? null;
    },

    async getProductById(id) {
      return products.find((product) => product.id === id) ?? null;
    },

    async placeOrder({ userId, email, shipping, payment, items, deliveryKobo }) {
      if (!items.length) reject("Cart is empty");

      let subtotalKobo = 0;
      const lines = items.map((item) => {
        const product = products.find((entry) => entry.slug === item.slug);
        if (!product || !product.active) reject(`Product ${item.slug} is no longer available`);
        const quantity = Number(item.quantity);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
          reject(`Quantity for ${product.name} must be between 1 and 20`);
        }
        if (product.stock < quantity) reject(`Only ${product.stock} left of ${product.name}`);
        product.stock -= quantity;
        subtotalKobo += product.priceKobo * quantity;
        return { product, size: item.size || null, quantity };
      });

      const delivery = Number.isInteger(deliveryKobo) ? deliveryKobo : deliveryFor(subtotalKobo);
      const id = randomUUID();
      const order = {
        id,
        orderNumber: `SLT-${new Date().getFullYear()}-${String(orderSeq++).padStart(5, "0")}`,
        userId,
        email,
        status: "confirmed",
        customer: {
          fullName: shipping.fullName,
          phone: shipping.phone,
          addressLine1: shipping.addressLine1,
          addressLine2: shipping.addressLine2 || null,
          city: shipping.city,
          state: shipping.state,
          notes: shipping.notes || null
        },
        payment: { method: payment.method, reference: payment.reference },
        subtotalKobo,
        deliveryKobo: delivery,
        totalKobo: subtotalKobo + delivery,
        confirmationSentAt: null,
        createdAt: new Date().toISOString(),
        items: lines.map(({ product, size, quantity }) => ({
          id: randomUUID(),
          productId: product.id,
          slug: product.slug,
          name: product.name,
          size,
          image: product.image,
          unitPriceKobo: product.priceKobo,
          quantity,
          lineTotalKobo: product.priceKobo * quantity
        }))
      };
      orders.set(id, order);
      return structuredClone(order);
    },

    async listOrdersForUser(userId) {
      return [...orders.values()]
        .filter((order) => order.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((order) => structuredClone(order));
    },

    async getOrderByNumber(orderNumber) {
      const order = [...orders.values()].find((entry) => entry.orderNumber === orderNumber);
      return order ? structuredClone(order) : null;
    },

    async getOrderForUser(orderNumber, userId) {
      const order = await this.getOrderByNumber(orderNumber);
      return order && order.userId === userId ? order : null;
    },

    async listAllOrders({ status } = {}) {
      return [...orders.values()]
        .filter((order) => !status || status === "all" || order.status === status)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 200)
        .map((order) => structuredClone(order));
    },

    async updateOrderStatus(orderId, status) {
      const order = orders.get(orderId);
      if (!order) return null;
      order.status = status;
      return structuredClone(order);
    },

    async updateProduct(id, patch) {
      const product = products.find((entry) => entry.id === id);
      if (!product) return null;
      if (patch.priceKobo !== undefined && patch.priceKobo !== null) {
        product.priceKobo = Math.round(Number(patch.priceKobo));
      }
      for (const key of ["stock", "featured", "active"]) {
        if (patch[key] !== undefined && patch[key] !== null) product[key] = patch[key];
      }
      return { ...product };
    },

    async markConfirmationSent(orderId, sentAt) {
      const order = orders.get(orderId);
      if (order) order.confirmationSentAt = sentAt;
    },

    async subscribe(email, userId) {
      const existing = subscribers.find((entry) => entry.email === email);
      if (existing) return { ...existing };
      const entry = { email, userId: userId || null, welcomedAt: new Date().toISOString(), createdAt: new Date().toISOString() };
      subscribers.push(entry);
      return { ...entry };
    },

    async markSubscriberWelcomed(email) {
      const entry = subscribers.find((item) => item.email === email);
      if (entry) entry.welcomedAt = new Date().toISOString();
    },

    async listSubscribers() {
      return subscribers.map((entry) => ({ ...entry }));
    },

    async stats() {
      const all = [...orders.values()];
      const live = products.filter((product) => product.active);
      return {
        orderCount: all.length,
        revenueKobo: all.reduce((sum, order) => sum + order.totalKobo, 0),
        byStatus: all.reduce((tally, order) => {
          tally[order.status] = (tally[order.status] || 0) + 1;
          return tally;
        }, {}),
        productCount: live.length,
        unitsInStock: live.reduce((sum, product) => sum + product.stock, 0),
        inventoryValueKobo: live.reduce((sum, product) => sum + product.stock * product.priceKobo, 0),
        subscriberCount: subscribers.length,
        lowStock: live.filter((product) => product.stock <= 10)
      };
    },

    // Only used by the smoke test to prove the demo store persists an order.
    ordersInMemory: () => [...orders.values()].map((order) => order.orderNumber)
  };
}
