// The Sultan catalogue. Used by `npm run seed` to fill Supabase and by the
// in-memory repository that powers demo mode. Prices are in kobo.
export const catalogue = [
  {
    slug: "essential-crew",
    name: "Essential Crew",
    tagline: "Heavy loopback cotton, cut close",
    description:
      "The crew neck we rebuild every season. 420gsm loopback cotton, ribbed cuffs that hold their shape, and a shoulder seam that sits exactly where it should. Pre-shrunk so the size you buy is the size you keep.",
    category: "Men",
    priceKobo: 15000000,
    image: "./img/product-men.jpg",
    sizes: ["S", "M", "L", "XL"],
    stock: 24,
    featured: true
  },
  {
    slug: "soft-form-knit",
    name: "Soft Form Knit",
    tagline: "Merino blend with a relaxed drop shoulder",
    description:
      "Brushed merino blend that holds warmth without weight. Slightly cropped body, exaggerated shoulder, and a neckline that keeps its shape after washing. Wear it alone or under the overshirt.",
    category: "Women",
    priceKobo: 20000000,
    image: "./img/product-women.jpg",
    sizes: ["XS", "S", "M", "L"],
    stock: 18,
    featured: true
  },
  {
    slug: "heavyweight-tee",
    name: "Heavyweight Tee",
    tagline: "240gsm jersey, boxy through the body",
    description:
      "Built to be lived in. 240gsm combed cotton with a boxy body, ribbed neck and twin-needle hems. It softens with every wash instead of falling apart.",
    category: "Essentials",
    priceKobo: 11000000,
    image: "./img/product-essential.jpg",
    sizes: ["S", "M", "L", "XL", "XXL"],
    stock: 40,
    featured: true
  },
  {
    slug: "ivory-structure",
    name: "Ivory Structure",
    tagline: "Clean ivory overshirt, sharp lapel",
    description:
      "An overshirt with the weight of a light jacket. Structured lapel, patch pockets, and a brushed twill that keeps a crisp line over a tee or a knit.",
    category: "New in",
    priceKobo: 20000000,
    image: "./img/product-women.jpg",
    sizes: ["S", "M", "L"],
    stock: 12,
    featured: true
  },
  {
    slug: "charcoal-overshirt",
    name: "Charcoal Overshirt",
    tagline: "Washed canvas, four-pocket field cut",
    description:
      "Washed cotton canvas that starts stiff and earns its shape. Four bellows pockets, corozo buttons and a straight hem that works over denim or tailoring.",
    category: "Men",
    priceKobo: 24000000,
    image: "./img/new-season.jpg",
    sizes: ["M", "L", "XL", "XXL"],
    stock: 15,
    featured: false
  },
  {
    slug: "wide-trouser",
    name: "Wide Leg Trouser",
    tagline: "High rise, full break, pressed crease",
    description:
      "A high-rise trouser with a genuine full break. Half-lined so it breathes, deep pockets, and a centre crease that survives a day on your feet.",
    category: "Women",
    priceKobo: 18500000,
    image: "./img/product-women.jpg",
    sizes: ["UK 6", "UK 8", "UK 10", "UK 12", "UK 14"],
    stock: 20,
    featured: false
  },
  {
    slug: "ribbed-tank",
    name: "Ribbed Tank",
    tagline: "2x2 rib, bound neck and armholes",
    description:
      "A 2x2 rib tank with bound neck and armholes so it never twists. Layering weight that works under a shirt, a knit, or on its own.",
    category: "Essentials",
    priceKobo: 6500000,
    image: "./img/product-essential.jpg",
    sizes: ["XS", "S", "M", "L"],
    stock: 60,
    featured: false
  },
  {
    slug: "tailored-overcoat",
    name: "Tailored Overcoat",
    tagline: "Single-breasted, mid-calf length",
    description:
      "Mid-calf single-breasted overcoat in a wool-rich blend, half canvassed through the chest. Notched lapel, welt pockets, and a lining that glides.",
    category: "New in",
    priceKobo: 39500000,
    image: "./img/product-men.jpg",
    sizes: ["S", "M", "L", "XL"],
    stock: 8,
    featured: false
  }
];

export const FREE_DELIVERY_THRESHOLD_KOBO = 15000000;
export const DELIVERY_FEE_KOBO = 750000;

export function deliveryFor(subtotalKobo) {
  return subtotalKobo >= FREE_DELIVERY_THRESHOLD_KOBO ? 0 : DELIVERY_FEE_KOBO;
}
