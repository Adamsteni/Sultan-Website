// One order, with its items and delivery address. Reachable from the Orders tab and straight
// after checkout, so the recording can show the confirmation straight after ordering.

import { useEffect, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { api, money, shortDate } from "../../lib/api";
import { colors, space, Banner, Title, Muted, Divider } from "../../components/ui";

export default function OrderScreen() {
  const { orderNumber } = useLocalSearchParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const payload = await api(`/orders/${orderNumber}`);
        if (!cancelled) setOrder(payload.order);
      } catch (failure) {
        if (!cancelled) setError(failure.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderNumber]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  if (error || !order) {
    return (
      <View style={styles.padded}>
        <Banner tone="error">{error || "We could not find that order."}</Banner>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body}>
      <Title>{order.orderNumber}</Title>
      <Muted style={styles.status}>
        {order.status} · placed {shortDate(order.createdAt)}
      </Muted>

      <Divider />

      <Text style={styles.section}>Items</Text>
      {order.items.map((item, index) => (
        <View key={`${item.slug}-${index}`} style={styles.item}>
          <View style={styles.itemMain}>
            <Text style={styles.itemName}>{item.name}</Text>
            {item.size ? <Muted>Size {item.size} · qty {item.quantity}</Muted> : <Muted>Qty {item.quantity}</Muted>}
          </View>
          <Text style={styles.itemTotal}>{money(item.lineTotalKobo)}</Text>
        </View>
      ))}

      <Divider />

      <Text style={styles.section}>Delivering to</Text>
      <Muted>
        {order.customer.fullName}
        {"\n"}
        {order.customer.phone}
        {"\n"}
        {order.customer.addressLine1}
        {order.customer.addressLine2 ? `, ${order.customer.addressLine2}` : ""}
        {"\n"}
        {order.customer.city}, {order.customer.state}
      </Muted>

      <Divider />

      <View style={styles.item}>
        <Text style={styles.itemName}>Subtotal</Text>
        <Text style={styles.itemTotal}>{money(order.subtotalKobo)}</Text>
      </View>
      <View style={styles.item}>
        <Text style={styles.itemName}>Delivery</Text>
        <Text style={styles.itemTotal}>
          {order.deliveryKobo === 0 ? "Free" : money(order.deliveryKobo)}
        </Text>
      </View>
      <Divider />
      <View style={styles.item}>
        <Text style={[styles.itemName, styles.strong]}>Total</Text>
        <Text style={[styles.itemTotal, styles.strong]}>{money(order.totalKobo)}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  body: { padding: space.lg, paddingBottom: space.xl },
  padded: { padding: space.lg, backgroundColor: colors.paper, flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper },
  status: { marginTop: space.xs, textTransform: "capitalize" },
  section: { fontSize: 12, fontWeight: "700", color: colors.label, letterSpacing: 0.6, marginBottom: space.md },
  item: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  itemMain: { flex: 1 },
  itemName: { fontSize: 14, color: colors.ink },
  itemTotal: { fontSize: 14, color: colors.ink, fontWeight: "600" },
  strong: { fontSize: 16, fontWeight: "700" }
});