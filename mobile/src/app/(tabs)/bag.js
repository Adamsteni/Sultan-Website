// Bag tab. Reads the same store the product pages write to, so what is shown here is the
// server's copy whenever the customer is signed in.

import { View, Text, Image, Pressable, FlatList, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { cart as cartStore, useCart } from "../../lib/cart";
import { api, money, imageUrl } from "../../lib/api";
import { isSignedIn } from "../../lib/auth";
import { colors, space, Button, Muted, Divider } from "../../components/ui";

export default function CartScreen() {
  const { lines, count, subtotalKobo, deliveryKobo, totalKobo } = useCart();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Pulls the account's bag each time the tab comes into view, so anything added on the website
  // while this tab sat in the background is here on return rather than after a manual reload.
  useFocusEffect(
    useCallback(() => {
      if (isSignedIn()) cartStore.syncFromServer();
    }, [])
  );

  const checkout = () => {
    if (!isSignedIn()) {
      router.push("/sign-in");
      return;
    }
    router.push("/checkout");
  };

  if (count === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Your bag is empty</Text>
        <Muted>Nothing in here yet. Add a piece from the shop.</Muted>
        <Button title="Browse the collection" onPress={() => router.push("/")} variant="ghost" style={styles.emptyButton} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={lines}
        keyExtractor={(item) => `${item.slug}|${item.size || "-"}`}
        contentContainerStyle={[styles.list, { paddingBottom: 220 }]}
        renderItem={({ item }) => (
          <View style={styles.line}>
            <Image source={{ uri: imageUrl(item.image) }} style={styles.image} resizeMode="cover" />
            <View style={styles.details}>
              <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
              {item.size ? <Muted>Size {item.size}</Muted> : null}
              <Muted>{money(item.unitPriceKobo)} each</Muted>

              <View style={styles.controls}>
                <Pressable
                  onPress={() => cartStore.setQuantity(item.slug, item.size, item.quantity - 1)}
                  style={styles.step}
                >
                  <Text style={styles.stepText}>-</Text>
                </Pressable>
                <Text style={styles.quantity}>{item.quantity}</Text>
                <Pressable
                  onPress={() => cartStore.setQuantity(item.slug, item.size, item.quantity + 1)}
                  style={styles.step}
                  disabled={item.quantity >= Math.min(item.stock ?? 20, 20)}
                >
                  <Text style={styles.stepText}>+</Text>
                </Pressable>
                <Pressable onPress={() => cartStore.remove(item.slug, item.size)} style={styles.remove}>
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              </View>
            </View>
            <Text style={styles.lineTotal}>{money(item.unitPriceKobo * item.quantity)}</Text>
          </View>
        )}
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <Row label="Subtotal" value={money(subtotalKobo)} />
        <Row label="Delivery" value={deliveryKobo === 0 ? "Free" : money(deliveryKobo)} />
        <Divider />
        <Row label="Total" value={money(totalKobo)} strong />
        <Button title="Checkout" onPress={checkout} style={styles.checkout} />
      </View>
    </View>
  );
}

function Row({ label, value, strong }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, strong && styles.rowStrong]}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.rowStrong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  list: { padding: space.md },
  line: { flexDirection: "row", paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  image: { width: 72, height: 96, backgroundColor: colors.line },
  details: { flex: 1, paddingHorizontal: space.md, gap: 2 },
  name: { fontSize: 15, fontWeight: "600", color: colors.ink },
  controls: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.sm },
  step: { width: 34, height: 34, borderRadius: 4, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  stepText: { fontSize: 17, color: colors.ink },
  quantity: { fontSize: 15, fontWeight: "600", color: colors.ink, minWidth: 22, textAlign: "center" },
  remove: { marginLeft: space.sm },
  removeText: { fontSize: 12, color: colors.danger },
  lineTotal: { fontSize: 14, fontWeight: "600", color: colors.ink },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: space.md,
    backgroundColor: colors.paper,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line
  },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  rowLabel: { fontSize: 14, color: colors.label },
  rowValue: { fontSize: 14, color: colors.ink },
  rowStrong: { fontSize: 16, fontWeight: "700", color: colors.ink },
  checkout: { marginTop: space.md },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.lg, backgroundColor: colors.paper },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: colors.ink, marginBottom: space.sm },
  emptyButton: { marginTop: space.lg, minWidth: 220 }
});



