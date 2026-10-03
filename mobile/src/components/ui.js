// App-wide look: colours, spacing and a few shared building blocks, so every screen matches the
// website's calm cream-and-ink styling without repeating it.

import { StyleSheet, Text, View, Pressable, ActivityIndicator } from "react-native";

export const colors = {
  ink: "#0F0F10",
  inkSoft: "#4A4A4E",
  inkFaint: "#7C7C82",
  paper: "#FFFFFF",
  cream: "#F6F3EE",
  line: "#E4DFD7",
  accent: "#8A6A3B",
  danger: "#A3312A",
  ok: "#2F6B3A"
};

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export function Title({ children, style }) {
  return <Text style={[styles.title, style]}>{children}</Text>;
}

export function Muted({ children, style, numberOfLines }) {
  return (
    <Text style={[styles.muted, style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

export function Button({ title, onPress, disabled, busy, variant = "solid", style }) {
  const solid = variant === "solid";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        solid ? styles.buttonSolid : styles.buttonGhost,
        (disabled || busy) && styles.buttonDisabled,
        pressed && styles.buttonPressed,
        style
      ]}
    >
      {busy ? (
        <ActivityIndicator color={solid ? colors.paper : colors.ink} size="small" />
      ) : (
        <Text style={[styles.buttonText, !solid && styles.buttonTextGhost]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Banner({ tone = "info", children }) {
  const tint = tone === "error" ? colors.danger : tone === "ok" ? colors.ok : colors.inkSoft;
  return (
    <View style={[styles.banner, { borderLeftColor: tint }]}>
      <Text style={[styles.bannerText, { color: tint }]}>{children}</Text>
    </View>
  );
}

export function Row({ children, style }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.4
  },
  muted: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkFaint
  },
  row: {
    flexDirection: "row",
    alignItems: "center"
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginVertical: space.md
  },
  button: {
    minHeight: 50,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.md,
    flexDirection: "row"
  },
  buttonSolid: {
    backgroundColor: colors.ink
  },
  buttonGhost: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper
  },
  buttonDisabled: {
    opacity: 0.5
  },
  buttonPressed: {
    opacity: 0.8
  },
  buttonText: {
    color: colors.paper,
    fontSize: 15,
    fontWeight: "600"
  },
  buttonTextGhost: {
    color: colors.ink
  },
  banner: {
    backgroundColor: colors.cream,
    borderLeftWidth: 3,
    borderRadius: 4,
    padding: space.md,
    marginVertical: space.sm
  },
  bannerText: {
    fontSize: 14,
    lineHeight: 20
  }
});