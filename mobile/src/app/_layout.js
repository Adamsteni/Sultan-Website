// Root layout. Loads the shop config, restores any saved session, and loads the bag, then
// renders the tabs. Everything else waits on that first load so no screen shows an empty
// catalogue or an empty bag that is really "not fetched yet".

import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { loadConfig } from "../lib/shop";
import { initAuth } from "../lib/auth";
import { cart } from "../lib/cart";
import { colors } from "../components/ui";
import { fontFamily, useBrandFonts } from "../lib/fonts";

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  // The site is set in Archivo, so the app waits for the same family before painting rather than
  // flashing a system font and reflowing on arrival.
  const [fontsLoaded] = useBrandFonts();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      await loadConfig();
      await initAuth();
      await cart.load();
      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready || !fontsLoaded) {
    return (
      <SafeAreaProvider>
        <View style={styles.splash}>
          <ActivityIndicator color={colors.foreground} />
        </View>
        <StatusBar style="dark" />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { fontFamily: fontFamily.semibold, fontSize: 13, letterSpacing: 1.6, textTransform: "uppercase", color: colors.ink },
        headerTintColor: colors.foreground,
        contentStyle: { backgroundColor: colors.background }
      }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="product/[slug]" options={{ title: "Product" }} />
        <Stack.Screen name="checkout" options={{ title: "Checkout" }} />
        <Stack.Screen name="sign-in" options={{ title: "Sign in", presentation: "modal" }} />
        <Stack.Screen name="orders/[orderNumber]" options={{ title: "Order" }} />
      </Stack>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background
  }
});