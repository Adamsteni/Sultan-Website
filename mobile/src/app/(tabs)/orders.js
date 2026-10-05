// Orders tab. Signed-in customers see their order history from the server; everyone else is
// pointed at sign-in. This is the screen that proves the account is shared between web and
// phone: the same orders appear here that the website shows.

import { useEffect, useState, useCallback } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { api, money, shortDate } from "../../lib/api";
import { useSession } from "../../lib/auth";
import { colors, space, Button, Muted } from "../../components/ui";

export default function OrdersScreen() {
  const session = useSession();
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Re-fetched each time the tab comes into view, so an order placed on the website shows up
  // here as soon as the customer switches back.
  useFocusEffect(useCallback(() => {
      let cancelled = false;
      (async () => {
        if (!session) {
          setOrders([]);
          return;
        }
        setLoading(true);
        try {
          const payload = await api("/orders");
          if (!cancelled) {
            setOrders(payload.orders || []);
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
    } , [session?.accessToken]));

  if (!session) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Your orders</Text>
        <Muted>Sign in to see orders placed on any device, including the website.</Muted>
        <Button title="Sign in" onPress={() => router.push("/sign-in")} style={styles.emptyButton} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.ink} />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Muted style={styles.header}>
              Signed in as {session.user.email}. These are the same orders shown on the website.
            </Muted>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No orders yet</Text>
              <Muted>Anything you order will be listed here.</Muted>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => router.push(`/orders/${item.orderNumber}`)}>
              <View style={styles.cardTop}>
                <Text style={styles.orderNumber}>{item.orderNumber}</Text>
                <Text style={[styles.status, statusStyle(item.status)]}>{item.status}</Text>
              </View>
              <Muted>{shortDate(item.createdAt)} Â· {item.items?.length || 0} item(s)</Muted>
              <Text style={styles.total}>{money(item.totalKobo)}</Text>
            </Pressable>
          )}
        />
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const statusColors = {
  pending: colors.accent,
  paid: colors.ok,
  shipped: colors.ink,
  delivered: colors.ok,
  cancelled: colors.danger
};

const statusStyle = (status) => ({ color: statusColors[status] || colors.label });

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { paddingVertical: 60, alignItems: "center" },
  list: { padding: space.md },
  header: { marginBottom: space.md },
  card: {
    padding: space.md,
        borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    marginBottom: space.md,
    backgroundColor: colors.paper
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: space.xs },
  orderNumber: { fontSize: 15, fontWeight: "700", color: colors.ink },
  status: { fontSize: 12, fontWeight: "600", textTransform: "uppercase" },
  total: { fontSize: 15, fontWeight: "600", color: colors.ink, marginTop: space.sm },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.lg },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: colors.ink, marginBottom: space.sm },
  emptyButton: { marginTop: space.lg, minWidth: 200 },
  error: { color: colors.danger, padding: space.md, fontSize: 13 }
});

