// App-wide look, taken directly from the website's stylesheet so the two stay recognisably the
// same brand. The values here are the site's own CSS custom properties, and the house rules are
// copied with them: square corners everywhere, generous uppercase letterspacing on small labels,
// and heavy weights reserved for large display headings.

import { StyleSheet, Text, View, Pressable, ActivityIndicator } from "react-native";
import { fontFamily } from "../lib/fonts";

// Mirrors :root in public/styles.css
export const colors = {
  background: "#EFEDE9",
  paper: "#F6F5F2",
  foreground: "#000000",
  ink: "#141414",
  muted: "#6C6C68",
  label: "#4E4C48",
  canvas: "#DEDBD5",
  line: "#C9C6C0",
  accent: "#A8874C",
  onDark: "#E9E6E0",
  danger: "#A3312A",
  ok: "#2F6B3A"
};

// The site pads with clamp(20px, 4.6vw, 56px). A phone never reaches the upper bound, so the
// lower one is used as the standard gutter.
export const space = { xs: 6, sm: 10, md: 20, lg: 30, xl: 44 };
export const gutter = 20;

// Every full-width band on the homepage gets the same vertical padding so the page reads as one
// rhythm instead of a stack of unrelated blocks. The site's section padding tops out around
// 48px on a phone, so that is where this sits.
export const sectionPad = space.xl;

// Small uppercase labels are the site's most repeated device (nav, buttons, section eyebrows,
// filters). One helper keeps the tracking and casing identical everywhere.
export function labelStyle(size = 11, color = colors.ink, spacing = 2.4) {
  return {
    fontFamily: fontFamily.semibold,
    fontSize: size,
    letterSpacing: spacing,
    textTransform: "uppercase",
    color
  };
}

export function Title({ children, style, size = 40 }) {
  return (
    <Text
      style={[
        styles.display,
        { fontSize: size },
        style
      ]}
    >
      {children}
    </Text>
  );
}

export function Label({ children, style, size = 11, color = colors.label, spacing = 2.4 }) {
  return (
    <Text style={[labelStyle(size, color, spacing), style]}>{children}</Text>
  );
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
        <ActivityIndicator color={solid ? colors.background : colors.ink} size="small" />
      ) : (
        <Text style={[styles.buttonText, !solid && styles.buttonTextGhost]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Banner({ tone = "info", children }) {
  const tint = tone === "error" ? colors.danger : tone === "ok" ? colors.ok : colors.muted;
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
  // Matches .season h2 / .shop h2 / .newsletter h2 -- weight 800, tight leading, negative tracking.
  display: {
    fontFamily: fontFamily.extrabold,
    color: colors.ink,
    lineHeight: 0.92,
    letterSpacing: -1.2,
    textTransform: "uppercase"
  },
  muted: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted
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
  // Matches .button: min-height 46px, black fill, 0.2em tracking, and no border radius anywhere.
  button: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
    flexDirection: "row"
  },
  buttonSolid: {
    backgroundColor: colors.foreground
  },
  buttonGhost: {
    borderWidth: 1,
    borderColor: colors.foreground,
    backgroundColor: "transparent"
  },
  buttonDisabled: {
    opacity: 0.4
  },
  buttonPressed: {
    opacity: 0.7
  },
  buttonText: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 2.2,
    textTransform: "uppercase",
    color: colors.background
  },
  buttonTextGhost: {
    color: colors.ink
  },
  banner: {
    backgroundColor: colors.paper,
    borderLeftWidth: 2,
    padding: space.md,
    marginVertical: space.sm
  },
  bannerText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20
  }
});