import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";

const mapProduct = (row) => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  tagline: row.tagline,
  description: row.description,
  category: row.category,
  priceKobo: row.price_kobo,
  image: row.image_url,
  sizes: row.sizes || [],
  stock: row.stock,
  featured: row.featured,
  active: row.active
});

const mapItem = (row) => ({
  id: row.id,
  productId: row.product_id,
  slug: row.slug,
  name: row.name,
  size: row.size,
  image: row.image_url,
  unitPriceKobo: row.unit_price_kobo,
  quantity: row.quantity,
  lineTotalKobo: row.line_total_kobo
});

// A cart line pairs the stored slug/size/quantity with the product's current details.
// Products joined as an array because PostgREST returns embedded relations that way.
const cartLine = (row) => {
  const product = Array.isArray(row.products) ? row.products[0] : row.products;
  return {
    slug: row.slug,
    size: row.size || null,
    quantity: row.quantity,
    name: product?.name || row.slug,
    image: product?.image_url || null,
    unitPriceKobo: product?.price_kobo ?? 0,
    stock: product?.stock ?? 0,
    available: product?.active !== false
  };
};

const mapOrder = (row, items = []) => ({
  id: row.id,
  orderNumber: row.order_number,
  userId: row.user_id,
  email: row.email,
  status: row.status,
  customer: {
    fullName: row.full_name,
    phone: row.phone,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    city: row.city,
    state: row.state,
    notes: row.notes
  },
  payment: { method: row.payment_method, reference: row.payment_reference },
  subtotalKobo: row.subtotal_kobo,
  deliveryKobo: row.delivery_kobo,
  totalKobo: row.total_kobo,
  confirmationSentAt: row.confirmation_sent_at,
  createdAt: row.created_at,
  items
});

export function createSupabaseRepository() {
  const db = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const throwOnError = ({ error, context }) => {
    if (!error) return;
    const failure = new Error(error.message);
    failure.status = 422;
    failure.code = error.code;
    failure.context = context;
    throw failure;
  };

  const itemsFor = async (orderId) => {
    const { data, error } = await db
      .from("order_items")
      .select("*")
      .eq("order_id", orderId)
      .order("id");
    throwOnError({ error, context: "order_items" });
    return (data || []).map(mapItem);
  };

  return {
    mode: "supabase",

    async ping() {
      const { error } = await db.from("products").select("id", { count: "exact", head: true });
      if (error) throw new Error(error.message);
      return true;
    },

    async listProducts({ category, search, includeInactive = false } = {}) {
      let query = db.from("products").select("*");
      if (!includeInactive) query = query.eq("active", true);
      if (category) query = query.eq("category", category);
      if (search) query = query.or(`name.ilike.%${search}%,tagline.ilike.%${search}%,category.ilike.%${search}%`);
      const { data, error } = await query.order("featured", { ascending: false }).order("name");
      throwOnError({ error, context: "products" });
      return (data || []).map(mapProduct);
    },

    async getProductBySlug(slug) {
      const { data, error } = await db.from("products").select("*").eq("slug", slug).maybeSingle();
      throwOnError({ error, context: "products" });
      return data ? mapProduct(data) : null;
    },

    async getProductById(id) {
      const { data, error } = await db.from("products").select("*").eq("id", id).maybeSingle();
      throwOnError({ error, context: "products" });
      return data ? mapProduct(data) : null;
    },

    async placeOrder({ userId, email, shipping, payment, items, deliveryKobo }) {
      const { data, error } = await db.rpc("place_order", {
        p_user_id: userId,
        p_email: email,
        p_full_name: shipping.fullName,
        p_phone: shipping.phone,
        p_address_line1: shipping.addressLine1,
        p_address_line2: shipping.addressLine2 || null,
        p_city: shipping.city,
        p_state: shipping.state,
        p_notes: shipping.notes || null,
        p_payment_method: payment.method,
        p_payment_ref: payment.reference,
        p_delivery_kobo: deliveryKobo,
        p_items: items.map((item) => ({ slug: item.slug, quantity: item.quantity, size: item.size }))
      });
      throwOnError({ error, context: "place_order" });
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error("Order could not be created");
      return mapOrder(row, await itemsFor(row.id));
    },

    async listOrdersForUser(userId) {
      const { data, error } = await db
        .from("orders")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      throwOnError({ error, context: "orders" });
      return Promise.all((data || []).map(async (row) => mapOrder(row, await itemsFor(row.id))));
    },

    async getOrderByNumber(orderNumber) {
      const { data, error } = await db
        .from("orders")
        .select("*")
        .eq("order_number", orderNumber)
        .maybeSingle();
      throwOnError({ error, context: "orders" });
      if (!data) return null;
      return mapOrder(data, await itemsFor(data.id));
    },

    async getOrderForUser(orderNumber, userId) {
      const order = await this.getOrderByNumber(orderNumber);
      if (!order || order.userId !== userId) return null;
      return order;
    },

    async listAllOrders({ status } = {}) {
      let query = db.from("orders").select("*");
      if (status && status !== "all") query = query.eq("status", status);
      const { data, error } = await query.order("created_at", { ascending: false }).limit(200);
      throwOnError({ error, context: "orders" });
      return Promise.all((data || []).map(async (row) => mapOrder(row, await itemsFor(row.id))));
    },

    async updateOrderStatus(orderId, status) {
      const { data, error } = await db
        .from("orders")
        .update({ status })
        .eq("id", orderId)
        .select()
        .maybeSingle();
      throwOnError({ error, context: "orders" });
      return data ? mapOrder(data, await itemsFor(data.id)) : null;
    },

    async updateProduct(id, patch) {
      const column = { priceKobo: "price_kobo", stock: "stock", featured: "featured", active: "active" };
      const update = {};
      for (const [key, value] of Object.entries(patch)) {
        if (column[key] === undefined || value === undefined || value === null) continue;
        update[column[key]] = key === "priceKobo" ? Math.round(Number(value)) : value;
      }
      if (!Object.keys(update).length) return this.getProductById(id);
      const { data, error } = await db.from("products").update(update).eq("id", id).select().maybeSingle();
      throwOnError({ error, context: "products" });
      return data ? mapProduct(data) : null;
    },

    async markConfirmationSent(orderId, sentAt) {
      const { error } = await db
        .from("orders")
        .update({ confirmation_sent_at: sentAt })
        .eq("id", orderId);
      throwOnError({ error, context: "orders" });
    },

    async subscribe(email, userId) {
      const { data, error } = await db
        .from("newsletter_subscribers")
        .upsert(
          { email, user_id: userId || null, welcomed_at: new Date().toISOString() },
          { onConflict: "email" }
        )
        .select()
        .maybeSingle();
      throwOnError({ error, context: "newsletter_subscribers" });
      return { email: data.email, createdAt: data.created_at };
    },

    async markSubscriberWelcomed(email) {
      const { error } = await db
        .from("newsletter_subscribers")
        .update({ welcomed_at: new Date().toISOString() })
        .eq("email", email);
      throwOnError({ error, context: "newsletter_subscribers" });
    },

    async listSubscribers() {
      const { data, error } = await db
        .from("newsletter_subscribers")
        .select("email,created_at,welcomed_at")
        .order("created_at", { ascending: false })
        .limit(500);
      throwOnError({ error, context: "newsletter_subscribers" });
      return (data || []).map((row) => ({
        email: row.email,
        createdAt: row.created_at,
        welcomedAt: row.welcomed_at
      }));
    },

    async stats() {
      const [{ data: orders, error: ordersError }, { data: products, error: productsError }] =
        await Promise.all([
          db.from("orders").select("status,total_kobo,created_at"),
          db.from("products").select("stock,active,price_kobo")
        ]);
      throwOnError({ error: ordersError, context: "orders" });
      throwOnError({ error: productsError, context: "products" });

      const all = orders || [];
      const live = (products || []).filter((product) => product.active);
      return {
        orderCount: all.length,
        revenueKobo: all.reduce((sum, order) => sum + order.total_kobo, 0),
        byStatus: all.reduce((tally, order) => {
          tally[order.status] = (tally[order.status] || 0) + 1;
          return tally;
        }, {}),
        productCount: live.length,
        unitsInStock: live.reduce((sum, product) => sum + product.stock, 0),
        inventoryValueKobo: live.reduce((sum, product) => sum + product.stock * product.price_kobo, 0),
        subscriberCount: await db
          .from("newsletter_subscribers")
          .select("id", { count: "exact", head: true })
          .then(({ count }) => count || 0),
        lowStock: live.filter((product) => product.stock <= 10)
      };
    },

    // ---- cart -------------------------------------------------------------
    // Only slug, size and quantity are stored; name, price and image are joined from products
    // on read so a cart can never hold a stale price.

    async getCart(userId) {
      const { data, error } = await db
        .from("cart_items")
        .select("slug,size,quantity,products(slug,name,image_url,price_kobo,stock,active)")
        .eq("user_id", userId)
        .order("created_at");
      throwOnError({ error, context: "cart_items" });
      return (data || []).map(cartLine);
    },

    async setCartLine(userId, slug, size, quantity) {
      const wanted = Math.min(Math.max(Number(quantity) || 0, 0), 20);
      const sizeValue = size || "";

      if (wanted === 0) {
        const { error } = await db
          .from("cart_items")
          .delete()
          .eq("user_id", userId)
          .eq("slug", slug)
          .eq("size", sizeValue);
        throwOnError({ error, context: "cart_items" });
        return this.getCart(userId);
      }

      const { error } = await db
        .from("cart_items")
        .upsert(
          { user_id: userId, slug, size: sizeValue, quantity: wanted },
          { onConflict: "user_id,slug,size" }
        )
        .select();
      throwOnError({ error, context: "cart_items" });
      return this.getCart(userId);
    },

    async addCartLine(userId, slug, size, quantity) {
      const add = Math.min(Math.max(Number(quantity) || 1, 1), 20);
      const { data, error } = await db
        .from("cart_items")
        .select("quantity")
        .eq("user_id", userId)
        .eq("slug", slug)
        .eq("size", size || "")
        .maybeSingle();
      throwOnError({ error, context: "cart_items" });

      const current = data ? data.quantity : 0;
      return this.setCartLine(userId, slug, size, Math.min(current + add, 20));
    },

    async clearCart(userId) {
      const { error } = await db.from("cart_items").delete().eq("user_id", userId);
      throwOnError({ error, context: "cart_items" });
      return [];
    },

    async mergeCart(userId, items) {
      if (!items || items.length === 0) return this.getCart(userId);

      const { error } = await db.rpc("merge_cart", {
        p_user_id: userId,
        p_items: items.map((item) => ({
          slug: item.slug,
          quantity: item.quantity,
          size: item.size || ""
        }))
      });
      throwOnError({ error, context: "merge_cart" });

      // merge_cart writes the rows; re-read so product name, price and image are attached.
      return this.getCart(userId);
    },

    async replaceCart(userId, items) {
      const { error } = await db.from("cart_items").delete().eq("user_id", userId);
      throwOnError({ error, context: "cart_items" });
      return this.mergeCart(userId, items);
    }
  };
}
