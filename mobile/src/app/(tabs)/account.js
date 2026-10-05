// Account tab: who is signed in, and the way out. The session is the same Supabase account the
// website uses, which is why the bag and order history follow the customer between devices.

import { View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSession, signOut } from "../../lib/auth";
import { colors, space, Button, Muted, Divider } from "../../components/ui";

export default function AccountScreen() {
  const session = useSession();
  const router = useRouter();

  if (!session) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Account</Text>
        <Muted>Sign in with the same account you use on the website.</Muted>
        <Button title="Sign in" onPress={() => router.push("/sign-in")} style={styles.emptyButton} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.name}>{session.user.name}</Text>
      <Muted>{session.user.email}</Muted>

      <Divider />

      <Text style={styles.heading}>Bag sync</Text>
      <Muted style={styles.explainer}>
        Your bag is stored on your account, so anything you add here or on the website shows up
        on both. It refreshes when you open this app and whenever you come back to a screen.
      </Muted>

      <Divider />

      <Text style={styles.heading}>Session</Text>
      <Muted style={styles.explainer}>
        Signing out clears the bag on this phone only. Your account, bag and orders stay safe on
        the server.
      </Muted>

      <View style={styles.actions}>
        <Button title="Sign out" onPress={() => signOut()} variant="ghost" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: space.lg, backgroundColor: colors.paper },
  name: { fontSize: 22, fontWeight: "700", color: colors.ink, marginBottom: 4 },
  heading: { fontSize: 12, fontWeight: "600", color: colors.label, letterSpacing: 0.4, marginBottom: space.xs },
  explainer: { marginBottom: space.sm },
  actions: { marginTop: space.lg },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.lg, backgroundColor: colors.paper },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: colors.ink, marginBottom: space.sm },
  emptyButton: { marginTop: space.lg, minWidth: 200 }
});