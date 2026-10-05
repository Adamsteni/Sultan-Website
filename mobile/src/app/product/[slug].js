// Product detail: size picker, quantity stepper and add-to-bag.
//
// The add button writes to the same cart store the Bag tab reads, so the tab badge updates the
// moment something is added, and the bag is already on the server if the customer is signed in.

import { useEffect, useState } from "react";
import { View, Text, Image, Pressable, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, money, imageUrl } from "../../lib/api";
import { cart } from "../../lib/cart";
import { colors, space, Button, Banner, Title, Muted, Divider } from "../../components/ui";

export default function ProductScreen() {
  const { slug } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [size, setSize] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const payload = await api(`/products/${slug}`);
        if (!cancelled) {
          setProduct(payload.product);
          setError("");
        }
      } catch (failure) {
        if (!cancelled) setError(failure.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const add = () => {
    cart.add(product, size, quantity);
    setAdded(`${product.name} added to your bag.`);
    setQuantity(1);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  if (error || !product) {
    return (
      <View style={styles.padded}>
        <Banner tone="error">{error || "We could not find that piece."}</Banner>
      </View>
    );
  }

  const needsSize = product.sizes.length > 0;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <Image source={{ uri: imageUrl(product.image) }} style={styles.image} resizeMode="cover" />
        <View style={styles.body}>
          <Text style={styles.category}>{product.category}</Text>
          <Title style={styles.name}>{product.name}</Title>
          <Text style={styles.price}>{money(product.priceKobo)}</Text>
          {product.tagline ? <Muted style={styles.tagline}>{product.tagline}</Muted> : null}

          <Divider />

          {needsSize ? (
            <>
              <Text style={styles.label}>Size</Text>
              <View style={styles.sizes}>
                {product.sizes.map((entry) => {
                  const active = entry === size;
                  return (
                    <Pressable
                      key={entry}
                      onPress={() => setSize(entry)}
                      style={[styles.size, active && styles.sizeActive]}
                    >
                      <Text style={[styles.sizeText, active && styles.sizeTextActive]}>{entry}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          <Text style={styles.label}>Quantity</Text>
          <View style={styles.stepper}>
            <Pressable
              onPress={() => setQuantity((value) => Math.max(value - 1, 1))}
              style={styles.step}
              disabled={quantity <= 1}
            >
              <Text style={styles.stepText}>−</Text>
            </Pressable>
            <Text style={styles.quantity}>{quantity}</Text>
            <Pressable
              onPress={() => setQuantity((value) => Math.min(value + 1, Math.min(product.stock, 20)))}
              style={styles.step}
              disabled={quantity >= Math.min(product.stock, 20)}
            >
              <Text style={styles.stepText}>+</Text>
            </Pressable>
          </View>

          <Divider />
          <Text style={styles.label}>Details</Text>
          <Muted>{product.description}</Muted>
          <Muted style={styles.stock}>
            {product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}
          </Muted>

          {added ? <Banner tone="ok">{added}</Banner> : null}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <Button
          title={needsSize && !size ? "Choose a size" : `Add to bag · ${money(product.priceKobo * quantity)}`}
          onPress={add}
          disabled={product.stock === 0 || (needsSize && !size)}
        />
        {cart.quantityOf(product.slug, size) > 0 ? (
          <Pressable onPress={() => router.push("/bag")} style={styles.inBag}>
            <Text style={styles.inBagText}>
              {cart.quantityOf(product.slug, size)} in your bag — view bag
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper },
  padded: { padding: space.md, backgroundColor: colors.paper, flex: 1 },
  image: { width: "100%", aspectRatio: 3 / 4, backgroundColor: colors.line },
  body: { padding: space.md },
  name: { fontSize: 26, letterSpacing: -0.4 },
  category: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.3,
    textTransform: "uppercase",
    color: colors.muted,
    marginBottom: 4
  },
  price: { fontSize: 20, color: colors.ink, marginTop: space.sm, fontWeight: "600" },
  tagline: { marginTop: space.xs },
  label: { fontSize: 12, fontWeight: "600", color: colors.label, marginBottom: space.sm, letterSpacing: 0.4 },
  sizes: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: space.md },
  size: {
    minWidth: 52,
    paddingHorizontal: space.md,
    paddingVertical: 10,
        borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center"
  },
  sizeActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  sizeText: { fontSize: 14, color: colors.ink },
  sizeTextActive: { color: colors.paper, fontWeight: "600" },
  stepper: { flexDirection: "row", alignItems: "center", gap: space.md, marginBottom: space.md },
  step: {
    width: 44,
    height: 44,
        borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center"
  },
  stepText: { fontSize: 20, color: colors.ink },
  quantity: { fontSize: 16, fontWeight: "600", color: colors.ink, minWidth: 28, textAlign: "center" },
  stock: { marginTop: space.sm },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.md,
    paddingTop: space.md,
    backgroundColor: colors.paper,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line
  },
  inBag: { alignItems: "center", paddingTop: space.sm },
  inBagText: { fontSize: 13, color: colors.accent, fontWeight: "600" }
});