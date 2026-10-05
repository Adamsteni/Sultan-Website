// Bottom tabs: Shop, Bag, Orders, Account. The bag badge is driven by the same cart store the
// Shop tab writes to, so adding an item updates the tab bar without a refresh.
//
// The site's header uses hairline outline icons rather than filled ones, so the outline variants
// are used here to keep that weight consistent across both.

import { Tabs } from "expo-router";
import { Text, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCart } from "../../lib/cart";
import { colors, labelStyle } from "../../components/ui";
import { fontFamily } from "../../lib/fonts";

function Badge({ count }) {
  if (!count) return null;
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{count > 99 ? "99+" : count}</Text>
    </View>
  );
}

function TabIcon({ name, focused, count }) {
  const tint = focused ? colors.foreground : colors.muted;
  return (
    <View style={styles.iconWrap}>
      <Ionicons name={name} size={21} color={tint} />
      <Badge count={count} />
    </View>
  );
}

export default function TabsLayout() {
  const { count } = useCart();

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: colors.foreground,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.line,
          borderTopWidth: StyleSheet.hairlineWidth
        },
        tabBarLabelStyle: labelStyle(9.5, colors.muted, 1.4),
        tabBarItemStyle: { paddingTop: 6 },
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTitleStyle: {
          fontFamily: fontFamily.extrabold,
          fontSize: 14,
          letterSpacing: 2.4,
          textTransform: "uppercase",
          color: colors.ink
        }
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Sultan Clothing",
          tabBarIcon: ({ focused }) => <TabIcon name="storefront-outline" focused={focused} />
        }}
      />
      <Tabs.Screen
        name="bag"
        options={{
          title: "Your bag",
          tabBarIcon: ({ focused }) => (
            <TabIcon name="bag-outline" focused={focused} count={count} />
          )
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: "Orders",
          tabBarIcon: ({ focused }) => <TabIcon name="receipt-outline" focused={focused} />
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ focused }) => <TabIcon name="person-outline" focused={focused} />
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: { width: 44, alignItems: "center" },
  badge: {
    position: "absolute",
    top: -5,
    right: 4,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center"
  },
  badgeText: {
    color: "#FFFFFF",
    fontFamily: fontFamily.bold,
    fontSize: 9.5
  }
});
