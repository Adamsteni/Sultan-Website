// Sign-in sheet.
//
// Both routes end in the same place: a Supabase session whose access token every API call
// carries, and a bag merged into that account. Email and password and Google are offered
// because the website offers both, and because the brief requires the same account on both.

import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { signInWithEmail, signInWithGoogle, canUseGoogle } from "../lib/auth";
import { getConfig } from "../lib/shop";
import { colors, space, Button, Banner, Title, Muted, Divider } from "../components/ui";

export default function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const provider = getConfig().authProvider;

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      await signInWithEmail(email, password);
      router.back();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError("");
    setBusy(true);
    try {
      await signInWithGoogle();
      router.back();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Title>Sign in</Title>
      <Muted style={styles.lead}>
        Use the same account as the website. Your bag and orders will be waiting.
      </Muted>

      {error ? <Banner tone="error">{error}</Banner> : null}

      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email address"
        placeholderTextColor={colors.inkFaint}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
      />

      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor={colors.inkFaint}
        style={styles.input}
        secureTextEntry
        textContentType="password"
      />

      <Button title="Sign in" onPress={submit} busy={busy} disabled={!email || !password} />

      {canUseGoogle() ? (
        <>
          <Divider />
          <Pressable onPress={google} disabled={busy} style={styles.google}>
            <Text style={styles.googleText}>Continue with Google</Text>
          </Pressable>
        </>
      ) : (
        <Muted style={styles.note}>
          Google sign-in appears once a client ID is added to the app's environment file.
        </Muted>
      )}

      {provider === "demo" ? (
        <Muted style={styles.note}>
          The shop is running in demo mode, so any email works with any password.
        </Muted>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: space.lg, backgroundColor: colors.paper },
  lead: { marginTop: space.sm, marginBottom: space.md },
  input: {
    height: 50,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space.md,
    fontSize: 15,
    color: colors.ink,
    marginBottom: space.md,
    backgroundColor: colors.paper
  },
  google: {
    height: 50,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center"
  },
  googleText: { fontSize: 15, fontWeight: "600", color: colors.ink },
  note: { marginTop: space.md }
});