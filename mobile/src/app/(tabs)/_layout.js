// Bottom tabs: Shop, Bag, Orders, Account. The bag badge is driven by the same cart store the
// Shop tab writes to, so adding an item updates the tab bar without a refresh.

import { Tabs } from "expo-router";
import { Text, View, StyleSheet } from "react-native";
import { useCart } from "../../lib/cart";
import { colors } from "../../components/ui";

function Badge({ count }) {
  if (!count) return null;
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{count > 99 ? "99+" : count}</Text>
    </View>
  );
}

function ShopIcon({ focused }) {
  return <Text style={[styles.icon, focused && styles.iconActive]}>Shop</Text>;
}

function BagIcon({ focused, count }) {
  return (
    <View>
      <Text style={[styles.icon, focused && styles.iconActive]}>Bag</Text>
      <Badge count={count} />
    </View>
  );
}

function TabIcon({ label, focused }) {
  return <Text style={[styles.icon, focused && styles.iconActive]}>{label}</Text>;
}

export default function TabsLayout() {
  const { count } = useCart();

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarStyle: { borderTopColor: colors.line },
        headerStyle: { backgroundColor: colors.paper },
        headerTitleStyle: { color: colors.ink, fontSize: 17 },
        headerShadowVisible: false
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Sultan Clothing", tabBarIcon: ({ focused }) => <ShopIcon focused={focused} /> }}
      />
      <Tabs.Screen
        name="cart"
        options={{ title: "Your bag", tabBarIcon: ({ focused }) => <BagIcon focused={focused} count={count} /> }}
      />
      <Tabs.Screen
        name="orders"
        options={{ title: "Orders", tabBarIcon: ({ focused }) => <TabIcon label="Orders" focused={focused} /> }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: "Account", tabBarIcon: ({ focused }) => <TabIcon label="Account" focused={focused} /> }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  icon: {
    fontSize: 11,
    color: colors.inkFaint
  },
  iconActive: {
    color: colors.ink,
    fontWeight: "600"
  },
  badge: {
    position: "absolute",
    top: -6,
    right: -16,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center"
  },
  badgeText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "700"
  }
});