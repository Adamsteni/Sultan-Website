// Shop tab. The website opens with hero, category band, seasonal split and a benefits strip
// before the grid; the app follows the same order so the two feel like one store. Only the
// product grid and the newsletter are data-driven -- the rest mirrors the homepage copy.
//
// Everything vertical uses the same section padding so the page reads as one rhythm rather than
// a stack of unrelated blocks, and images are sized from the screen width against their real
// aspect ratios so nothing is silently cropped.

import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  Image,
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, money, imageUrl } from "../../lib/api";
import { colors, space, gutter, sectionPad, labelStyle, Title, Label } from "../../components/ui";
import { fontFamily } from "../../lib/fonts";

const FILTERS = ["All", "Tops", "Bottoms", "Outerwear", "Accessories"];

// The three panels from the site's .categories band, with their real headings and copy.
const CATEGORIES = [
  { name: "Men", image: "./img/product-men.jpg", blurb: "Elevated everyday essentials.", slug: "men" },
  { name: "Women", image: "./img/product-women.jpg", blurb: "Effortless style for every you.", slug: "women" },
  { name: "Essentials", image: "./img/product-essential.jpg", blurb: "Made to live in, every day.", slug: "essentials" }
];

// The site's three benefits strip, each with the outline icon it uses.
const BENEFITS = [
  { title: "Fast delivery", note: "Quick & safe delivery", icon: "cube-outline" },
  { title: "Quality assured", note: "Best fashion, best quality", icon: "ribbon-outline" },
  { title: "Secure payment", note: "100% secure checkout", icon: "lock-closed-outline" }
];

export default function ShopScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  // Real numbers, not percentages. A percentage height inside a parent that only has a minHeight
  // does not resolve in React Native: the image falls back to its intrinsic pixel size, which
  // once stretched the hero past 1000dp and pushed the whole page off screen.
  //
  // The hero and season photos are landscape, so each box is derived from its own aspect ratio
  // (1.45 and 1.75) and only lightly cropped.
  const heroHeight = Math.round(Math.min(width / 1.2, 430));
  const heroWordmarkSize = Math.round(width / 5.6);
  const seasonHeight = Math.round(width / 1.75);

  const load = async () => {
    setLoading(true);
    try {
      const payload = await api("/products");
      setProducts(payload.products || []);
      setError("");
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const subscribe = async () => {
    if (subscribing) return;
    setSubscribing(true);
    try {
      await api("/newsletter", { method: "POST", body: { email } });
      setSubscribed(true);
      setEmail("");
    } catch {
      setSubscribed(false);
    } finally {
      setSubscribing(false);
    }
  };

  // Filtering happens on the device so typing feels immediate, rather than on every keystroke
  // going back to the server.
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory = category === "All" || product.category === category;
      const matchesTerm =
        !term ||
        product.name.toLowerCase().includes(term) ||
        (product.tagline || "").toLowerCase().includes(term);
      return matchesCategory && matchesTerm;
    });
  }, [products, search, category]);

  const pickCategory = (slug) => {
    const match = CATEGORIES.find((entry) => entry.slug === slug);
    // The band links to curated collections on the website; here they narrow the same grid.
    const target = FILTERS.find((name) => name.toLowerCase() === match.name.toLowerCase());
    setCategory(target || "All");
  };

  const header = (
    <View>
      {/* ---------- announcement ---------- mirrors .announcement */}
      <View style={styles.announcement}>
        <Text style={styles.announcementText}>Nationwide delivery</Text>
        <Text style={styles.announcementText}>New collection 2026</Text>
      </View>

      {/* ---------- hero ---------- mirrors .hero
          Eyebrow and collection note share the top row so they cannot collide with the
          buttons along the bottom on a narrow screen. */}
      <View style={[styles.hero, { height: heroHeight }]}>
        <Image
          source={{ uri: imageUrl("./img/atelier-hero.jpg") }}
          style={[styles.heroImage, { width, height: heroHeight }]}
          resizeMode="cover"
        />
        <View style={[styles.heroScrim, { width, height: heroHeight }]} />
        <Text style={styles.heroEyebrow}>Fashion that moves with you</Text>
        <Text style={styles.heroNote}>New collection 2026</Text>
        <Text
          style={[
            styles.heroWordmark,
            { fontSize: heroWordmarkSize, lineHeight: heroWordmarkSize * 0.84 }
          ]}
        >
          Sultan
        </Text>
        <View style={styles.heroActions}>
          <Pressable style={styles.heroButton} onPress={() => setCategory("All")}>
            <Text style={styles.heroButtonText}>Shop now</Text>
          </Pressable>
          <Pressable style={styles.heroLink} onPress={() => setCategory("All")}>
            <Text style={styles.heroLinkText}>Explore new in</Text>
          </Pressable>
        </View>
      </View>

      {/* ---------- categories ---------- mirrors .categories */}
      <View style={styles.band}>
        {CATEGORIES.map((entry, index) => (
          <Pressable
            key={entry.name}
            onPress={() => pickCategory(entry.slug)}
            style={[styles.bandRow, index < CATEGORIES.length - 1 && styles.bandRowBordered]}
          >
            <Image source={{ uri: imageUrl(entry.image) }} style={styles.bandImage} />
            <View style={styles.bandCopy}>
              <Title size={19} style={styles.bandTitle}>
                {entry.name}
              </Title>
              <Text style={styles.bandBlurb} numberOfLines={2}>
                {entry.blurb}
              </Text>
              <Text style={styles.bandLink}>Shop {entry.name.toLowerCase()}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      {/* ---------- season ---------- mirrors .season */}
      <View style={styles.season}>
        <View style={styles.seasonCopy}>
          <Label>New season</Label>
          <Title size={34}>Quiet impact. Considered shapes.</Title>
          <Text style={styles.seasonBlurb}>Honest materials. Everything new and now.</Text>
          <Pressable onPress={() => setCategory("All")} style={styles.seasonLink}>
            <Text style={styles.seasonLinkText}>Explore collection</Text>
          </Pressable>
        </View>
        <Image
          source={{ uri: imageUrl("./img/new-season.jpg") }}
          style={[styles.seasonImage, { width, height: seasonHeight }]}
          resizeMode="cover"
        />
      </View>

      {/* ---------- benefits ---------- mirrors .benefits */}
      <View style={styles.benefits}>
        {BENEFITS.map((entry) => (
          <View key={entry.title} style={styles.benefit}>
            <Ionicons name={entry.icon} size={24} color={colors.foreground} />
            <Text style={styles.benefitTitle}>{entry.title}</Text>
            <Text style={styles.benefitNote}>{entry.note}</Text>
          </View>
        ))}
      </View>

      {/* ---------- shop ---------- mirrors .shop */}
      <View style={styles.shopHead}>
        <Label>Shop</Label>
        <Title size={34}>Best of Sultan</Title>
        <Text style={styles.shopMeta}>{visible.length} pieces</Text>

        <View style={styles.searchWrap}>
          <Text style={styles.searchLabel}>Search</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search the collection"
            placeholderTextColor={colors.muted}
            style={styles.search}
            returnKeyType="search"
          />
        </View>

        <View style={styles.filters}>
          {FILTERS.map((name) => {
            const active = name === category;
            return (
              <Pressable
                key={name}
                onPress={() => setCategory(name)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{name}</Text>
              </Pressable>
            );
          })}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      {/* ---------- newsletter ---------- mirrors .newsletter */}
      <View style={styles.newsletter}>
        <Label>Newsletter</Label>
        <Title size={30}>Join the list</Title>
        {subscribed ? (
          <Text style={styles.newsletterDone}>Thank you. You are on the list.</Text>
        ) : (
          <>
            <Text style={styles.newsletterBlurb}>
              New arrivals and quiet restocks, sent occasionally.
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email address"
              placeholderTextColor={colors.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.newsletterInput}
            />
            <Pressable style={styles.newsletterButton} onPress={subscribe}>
              <Text style={styles.newsletterButtonText}>
                {subscribing ? "Joining" : "Join"}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );

  return (
    <FlatList
      style={styles.screen}
      data={visible}
      keyExtractor={(item) => item.slug}
      numColumns={2}
      ListHeaderComponent={header}
      columnWrapperStyle={styles.column}
      contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => router.push(`/product/${item.slug}`)}>
          <View style={styles.cardImageWrap}>
            <Image source={{ uri: imageUrl(item.image) }} style={styles.cardImage} />
            {item.stock > 0 && item.stock <= 10 ? (
              <View style={styles.flag}>
                <Text style={styles.flagText}>{item.stock} left</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.cardLabel}>{item.category}</Text>
          <Text style={styles.cardName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.cardPrice}>{money(item.priceKobo)}</Text>
        </Pressable>
      )}
      ListFooterComponent={
        loading ? (
          <ActivityIndicator style={styles.loading} color={colors.foreground} />
        ) : visible.length === 0 ? (
          <Text style={styles.empty}>No pieces match that search.</Text>
        ) : (
          <View style={styles.footer}>
            <Text style={styles.footerMark}>Sultan</Text>
            <Text style={styles.footerNote}>Fashion that moves with you.</Text>
          </View>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  // .announcement
  announcement: {
    height: 32,
    paddingHorizontal: gutter,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.foreground
  },
  announcementText: labelStyle(9, colors.onDark, 1.3),

  // .hero
  hero: { alignItems: "center", justifyContent: "center", backgroundColor: colors.canvas },
  heroImage: { position: "absolute", top: 0, left: 0 },
  heroScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    backgroundColor: "rgba(10,10,10,0.32)"
  },
  heroEyebrow: {
    position: "absolute",
    top: 22,
    left: gutter,
    width: 150,
    ...labelStyle(9.5, colors.onDark, 2.2),
    lineHeight: 18
  },
  heroNote: {
    position: "absolute",
    top: 24,
    right: gutter,
    width: 96,
    textAlign: "right",
    ...labelStyle(9, colors.onDark, 2),
    lineHeight: 17
  },
  // .hero-wordmark -- font-weight 900, tight leading, -0.045em
  heroWordmark: {
    fontFamily: fontFamily.black,
    letterSpacing: -2,
    textTransform: "uppercase",
    color: "#FFFFFF"
  },
  heroActions: {
    position: "absolute",
    left: gutter,
    bottom: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 18
  },
  heroButton: {
    minHeight: 44,
    paddingHorizontal: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF"
  },
  heroButtonText: labelStyle(10.5, "#111111", 2),
  heroLink: { paddingBottom: 5, borderBottomWidth: 1, borderBottomColor: colors.onDark },
  heroLinkText: labelStyle(10.5, colors.onDark, 2),

  // .categories -- black band
  band: { backgroundColor: colors.foreground, paddingVertical: space.sm },
  bandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    paddingVertical: 26,
    paddingHorizontal: gutter,
    minHeight: 150
  },
  bandRowBordered: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#2A2A2A" },
  bandImage: { width: 68, height: 82 },
  bandCopy: { flex: 1 },
  bandTitle: { color: colors.background, letterSpacing: 0.4 },
  bandBlurb: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.onDark,
    marginTop: 6
  },
  bandLink: {
    ...labelStyle(9.5, colors.onDark, 1.6),
    marginTop: 12,
    paddingBottom: 4,
    alignSelf: "flex-start",
    borderBottomWidth: 1,
    borderBottomColor: "#565452"
  },

  // .season -- copy above image on a phone, side by side on the site
  season: { backgroundColor: colors.canvas, paddingTop: sectionPad },
  seasonCopy: { paddingHorizontal: gutter, paddingBottom: space.lg },
  seasonBlurb: {
    fontFamily: fontFamily.regular,
    fontSize: 13.5,
    lineHeight: 20,
    color: "#3C3A37",
    marginTop: 14
  },
  seasonLink: {
    marginTop: 20,
    alignSelf: "flex-start",
    paddingBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: colors.foreground
  },
  seasonLinkText: labelStyle(10.5, colors.ink, 2),
  seasonImage: { width: "100%" },

  // .benefits
  benefits: {
    flexDirection: "row",
    backgroundColor: colors.paper,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    paddingVertical: 28
  },
  benefit: { flex: 1, alignItems: "center", paddingHorizontal: 10, gap: 2 },
  benefitTitle: { ...labelStyle(10, colors.foreground, 1.4), marginTop: 10 },
  benefitNote: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 16,
    color: colors.muted,
    textAlign: "center"
  },

  // .shop
  shopHead: { paddingHorizontal: gutter, paddingTop: sectionPad },
  shopMeta: {
    ...labelStyle(10, colors.muted, 1.4),
    marginTop: space.sm
  },
  searchWrap: { marginTop: space.lg },
  searchLabel: labelStyle(10, colors.ink, 1.4),
  search: {
    marginTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.foreground,
    paddingVertical: 11,
    paddingHorizontal: 0,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.ink
  },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: space.md },
  chip: {
    height: 34,
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999
  },
  chipActive: { backgroundColor: colors.foreground, borderColor: colors.foreground },
  chipText: labelStyle(10, colors.ink, 1.2),
  chipTextActive: { color: colors.background },
  error: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.danger,
    marginTop: space.md
  },

  // .product-grid / .product
  column: { gap: 14, paddingHorizontal: gutter },
  card: { flex: 1, marginBottom: space.lg },
  cardImageWrap: {
    width: "100%",
    aspectRatio: 3 / 4,
    overflow: "hidden",
    backgroundColor: colors.canvas
  },
  cardImage: { width: "100%", height: "100%" },
  flag: {
    position: "absolute",
    left: 0,
    bottom: 0,
    backgroundColor: colors.foreground,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  flagText: labelStyle(9, colors.background, 1),
  cardLabel: labelStyle(9.5, colors.muted, 1.2),
  cardName: {
    fontFamily: fontFamily.semibold,
    fontSize: 13.5,
    lineHeight: 18,
    color: colors.ink,
    marginTop: 5
  },
  cardPrice: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.ink,
    marginTop: 2,
    fontVariant: ["tabular-nums"]
  },

  // .newsletter
  newsletter: {
    marginTop: sectionPad,
    paddingHorizontal: gutter,
    paddingVertical: sectionPad,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line
  },
  newsletterBlurb: {
    fontFamily: fontFamily.regular,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.muted,
    marginTop: 12,
    maxWidth: 280
  },
  newsletterInput: {
    marginTop: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.foreground,
    paddingVertical: 12,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.ink
  },
  newsletterButton: {
    marginTop: space.md,
    alignSelf: "flex-start",
    minHeight: 44,
    paddingHorizontal: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.foreground
  },
  newsletterButtonText: labelStyle(10.5, colors.background, 2),
  newsletterDone: {
    fontFamily: fontFamily.regular,
    fontSize: 13.5,
    color: colors.ink,
    marginTop: space.md
  },

  loading: { marginVertical: sectionPad },
  empty: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    paddingHorizontal: gutter,
    paddingVertical: sectionPad
  },
  footer: {
    alignItems: "center",
    paddingTop: space.lg,
    paddingBottom: space.md
  },
  footerMark: {
    fontFamily: fontFamily.black,
    fontSize: 22,
    letterSpacing: 3,
    textTransform: "uppercase",
    color: colors.ink
  },
  footerNote: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.muted,
    marginTop: 8
  }
});