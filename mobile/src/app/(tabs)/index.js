// Shop tab: search, category filters and the product grid. Products come from the same
// /api/products endpoint the website uses, so a price or stock change in the admin console
// shows up here on the next fetch.

import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, FlatList, Pressable, Image, ActivityIndicator, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { api, money } from "../../lib/api";
import { colors, space, Banner } from "../../components/ui";

const CATEGORIES = ["All", "Tops", "Bottoms", "Outerwear", "Accessories"];

export default function ShopScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

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

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: space.sm }]}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search the collection"
          placeholderTextColor={colors.inkFaint}
          style={styles.search}
          autoCorrect={false}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {CATEGORIES.map((name) => {
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
        </ScrollView>
        <Text style={styles.count}>
          {visible.length} {visible.length === 1 ? "piece" : "pieces"}
        </Text>
      </View>

      {error ? <Banner tone="error">{error}</Banner> : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.ink} />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.slug}
          numColumns={2}
          columnWrapperStyle={styles.column}
          contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + space.lg }]}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => router.push(`/product/${item.slug}`)}>
              <Image source={{ uri: absolute(item.image) }} style={styles.image} resizeMode="cover" />
              <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.price}>{money(item.priceKobo)}</Text>
              {item.stock <= 10 ? (
                <Text style={styles.low}>Only {item.stock} left</Text>
              ) : null}
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.empty}>Nothing matches that search.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

// Products store image paths as they appear on the website ("/img/x.jpg" or "./img/x.jpg").
// React Native's Image needs a full URL, so the API host is added when the path is relative.
function absolute(path) {
  if (!path) return "https://sultanng.netlify.app/img/product-essential.jpg";
  if (/^https?:\/\//.test(path)) return path;
  const base = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/api$/, "");
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: { paddingHorizontal: space.md, paddingBottom: space.sm },
  search: {
    height: 46,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space.md,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.paper
  },
  chips: { paddingVertical: space.md, gap: space.sm },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 13, color: colors.inkSoft },
  chipTextActive: { color: colors.paper, fontWeight: "600" },
  count: { fontSize: 12, color: colors.inkFaint, paddingBottom: space.sm },
  grid: { paddingHorizontal: space.md },
  column: { gap: space.md },
  card: { flex: 1, marginBottom: space.lg },
  image: { width: "100%", aspectRatio: 0.82, borderRadius: 4, backgroundColor: colors.cream },
  name: { fontSize: 14, fontWeight: "600", color: colors.ink, marginTop: space.sm },
  price: { fontSize: 13, color: colors.inkSoft, marginTop: 2 },
  low: { fontSize: 11, color: colors.accent, marginTop: 2 },
  center: { paddingVertical: 60, alignItems: "center" },
  empty: { fontSize: 14, color: colors.inkFaint }
});