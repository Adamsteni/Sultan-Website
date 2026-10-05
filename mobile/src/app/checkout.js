// Checkout. Posts to the same POST /api/orders endpoint the website uses, with the same server
// validation, so a bad card number or an unsupported state fails identically on both.
//
// Placing the order empties the stored bag on the server, which is why the phone clears itself
// without any extra work here.

import { useState } from "react";
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCart } from "../lib/cart";
import { api, money } from "../lib/api";
import { getConfig } from "../lib/shop";
import { colors, space, Button, Banner, Title, Muted, Divider } from "../components/ui";

const STATES_FALLBACK = ["Lagos", "Abuja", "Port Harcourt", "Ibadan", "Kano", "Enugu"];

export default function CheckoutScreen() {
  const { lines, count, subtotalKobo, deliveryKobo, totalKobo } = useCart();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    cardNumber: "",
    cardName: "",
    expiry: "",
    cvc: ""
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const states = getConfig().states?.length ? getConfig().states : STATES_FALLBACK;
  const set = (key) => (value) => setForm((previous) => ({ ...previous, [key]: value }));

  const submit = async () => {
    setError("");
    setFieldErrors({});
    setBusy(true);
    try {
      const payload = await api("/orders", {
        method: "POST",
        body: {
          items: lines.map((line) => ({ slug: line.slug, quantity: line.quantity, size: line.size })),
          shipping: {
            fullName: form.fullName,
            phone: form.phone,
            addressLine1: form.addressLine1,
            addressLine2: form.addressLine2,
            city: form.city,
            state: form.state
          },
          payment: {
            method: "card",
            cardNumber: form.cardNumber.replace(/\s/g, ""),
            cardName: form.cardName,
            expiry: form.expiry,
            cvc: form.cvc
          }
        }
      });

      const ordered = payload.order;
      // The server cleared the bag; mirror that here so the tab badge is right immediately.
      await api("/cart", { method: "DELETE" }).catch(() => {});
      router.replace(`/orders/${ordered.orderNumber}`);
    } catch (failure) {
      setError(failure.message);
      setFieldErrors(failure.fields || {});
    } finally {
      setBusy(false);
    }
  };

  if (count === 0) {
    return (
      <View style={styles.padded}>
        <Banner>Your bag is empty, so there is nothing to check out.</Banner>
        <Button title="Back to the shop" onPress={() => router.replace("/")} />
      </View>
    );
  }

  const field = (key, label, options = {}) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={form[key]}
        onChangeText={set(key)}
        placeholder={options.placeholder || label}
        placeholderTextColor={colors.muted}
        style={[styles.input, fieldErrors[key] && styles.inputError]}
        autoCapitalize={options.capitalize || "words"}
        keyboardType={options.keyboardType || "default"}
        secureTextEntry={options.secure}
        maxLength={options.maxLength}
      />
      {fieldErrors[key] ? <Text style={styles.fieldError}>{fieldErrors[key]}</Text> : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 130 }]} keyboardShouldPersistTaps="handled">
        {error ? <Banner tone="error">{error}</Banner> : null}

        <Title>Checkout</Title>
        <Muted style={styles.lead}>{count} item(s) · {money(totalKobo)}</Muted>

        <Divider />

        <Text style={styles.section}>Where it is going</Text>
        {field("fullName", "Full name")}
        {field("phone", "Phone number", { keyboardType: "phone-pad", maxLength: 20 })}
        {field("addressLine1", "Address line 1")}
        {field("addressLine2", "Address line 2 (optional)")}
        {field("city", "City")}

        <Text style={styles.label}>State</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.states}>
          {states.map((name) => {
            const active = form.state === name;
            return (
              <Pressable
                key={name}
                onPress={() => setForm((previous) => ({ ...previous, state: name }))}
                style={[styles.state, active && styles.stateActive]}
              >
                <Text style={[styles.stateText, active && styles.stateTextActive]}>{name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {fieldErrors.state ? <Text style={styles.fieldError}>{fieldErrors.state}</Text> : null}

        <Divider />

        <Text style={styles.section}>Card</Text>
        <Muted style={styles.note}>
          Validated in test mode only. No card is charged and no card details are stored.
        </Muted>
        {field("cardNumber", "Card number", { keyboardType: "number-pad", capitalize: "none", maxLength: 23 })}
        {field("cardName", "Name on card")}
        {field("expiry", "Expiry (MM/YY)", { capitalize: "none", keyboardType: "number-pad", maxLength: 5 })}
        {field("cvc", "Security code", { capitalize: "none", keyboardType: "number-pad", secure: true, maxLength: 4 })}

        <Divider />

        <Text style={styles.section}>Order summary</Text>
        <Summary label="Subtotal" value={money(subtotalKobo)} />
        <Summary label="Delivery" value={deliveryKobo === 0 ? "Free" : money(deliveryKobo)} />
        <Divider />
        <Summary label="Total" value={money(totalKobo)} strong />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <Button title={`Place order · ${money(totalKobo)}`} onPress={submit} busy={busy} />
      </View>
    </View>
  );
}

function Summary({ label, value, strong }) {
  return (
    <View style={styles.summary}>
      <Text style={[styles.summaryLabel, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.summaryValue, strong && styles.strong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  body: { padding: space.lg },
  padded: { padding: space.lg, backgroundColor: colors.paper, flex: 1, gap: space.md },
  lead: { marginTop: space.xs },
  section: { fontSize: 12, fontWeight: "700", color: colors.label, letterSpacing: 0.6, marginBottom: space.md },
  field: { marginBottom: space.md },
  label: { fontSize: 12, fontWeight: "600", color: colors.label, marginBottom: space.xs },
  input: {
    height: 48,
        borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space.md,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.paper
  },
  inputError: { borderColor: colors.danger },
  fieldError: { fontSize: 12, color: colors.danger, marginTop: 4 },
  states: { gap: space.sm, paddingBottom: space.md },
  state: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: 999, borderWidth: 1, borderColor: colors.line },
  stateActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  stateText: { fontSize: 13, color: colors.label },
  stateTextActive: { color: colors.paper, fontWeight: "600" },
  note: { marginBottom: space.md },
  summary: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  summaryLabel: { fontSize: 14, color: colors.label },
  summaryValue: { fontSize: 14, color: colors.ink },
  strong: { fontSize: 16, fontWeight: "700", color: colors.ink },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: space.md,
    paddingTop: space.md,
    backgroundColor: colors.paper,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line
  }
});