/* eslint-disable @typescript-eslint/no-explicit-any --
   Parses raw third-party HTML/JSON. `any` stays at this boundary; the result is typed. */
import { fetchJson, fetchText } from "./net";

export type PlatformId =
  | "woocommerce"
  | "wordpress"
  | "shopify"
  | "wix"
  | "squarespace"
  | "bigcommerce"
  | "magento"
  | "prestashop"
  | "opencart"
  | "webflow"
  | "ecwid"
  | "weebly"
  | "godaddy"
  | "shopware"
  | "bigcartel"
  | "salesforce"
  | "framer"
  | "unknown";

export interface ThemeInfo {
  name: string;
  slug: string | null;
  version: string | null;
  author: string | null;
  authorUrl: string | null;
  themeUrl: string | null;
  parent: { name: string; slug: string | null } | null;
  /** Shopify: the name the merchant gave their copy of the theme, when it differs. */
  renamedTo: string | null;
  themeStoreId: number | null;
}

export interface InspectResult {
  url: string;
  finalUrl: string;
  title: string | null;
  platform: { id: PlatformId; name: string; evidence: string[] };
  cms: { name: string; version: string | null } | null;
  shop: { name: string; version: string | null } | null;
  theme: ThemeInfo | null;
  pageBuilders: string[];
  plugins: { slug: string; name: string }[];
  hosting: { server: string | null; cdn: string | null; host: string | null };
  productCount: number | null;
  currency: string | null;
  blocked: boolean;
  notes: string[];
}

const PLATFORM_NAMES: Record<PlatformId, string> = {
  woocommerce: "WooCommerce",
  wordpress: "WordPress",
  shopify: "Shopify",
  wix: "Wix",
  squarespace: "Squarespace",
  bigcommerce: "BigCommerce",
  magento: "Magento (Adobe Commerce)",
  prestashop: "PrestaShop",
  opencart: "OpenCart",
  webflow: "Webflow",
  ecwid: "Ecwid",
  weebly: "Weebly (Square Online)",
  godaddy: "GoDaddy Website Builder",
  shopware: "Shopware",
  bigcartel: "Big Cartel",
  salesforce: "Salesforce Commerce Cloud",
  framer: "Framer",
  unknown: "Not recognised",
};

/** Other platforms, checked against the homepage HTML when it isn't WordPress or Shopify. */
const OTHER_PLATFORMS: { id: PlatformId; test: RegExp; evidence: string }[] = [
  { id: "wix", test: /static\.wixstatic\.com|wix\.com website builder|_wixCssImports/i, evidence: "Wix static files" },
  { id: "squarespace", test: /static1\.squarespace\.com|squarespace-cdn\.com|<!-- This is Squarespace/i, evidence: "Squarespace CDN" },
  { id: "bigcommerce", test: /cdn\d*\.bigcommerce\.com|stencil-utils|BCData/i, evidence: "BigCommerce CDN" },
  { id: "magento", test: /\/static\/version\d+\/frontend\/|Magento_[A-Za-z]+\/|mage\/cookies/i, evidence: "Magento static paths" },
  { id: "prestashop", test: /content="PrestaShop|var prestashop\s*=|\/modules\/ps_/i, evidence: "PrestaShop scripts" },
  { id: "opencart", test: /catalog\/view\/theme\/|index\.php\?route=product/i, evidence: "OpenCart theme path" },
  { id: "webflow", test: /data-wf-site=|content="Webflow"|assets\.website-files\.com/i, evidence: "Webflow site attributes" },
  { id: "ecwid", test: /app\.ecwid\.com|ecwid_store/i, evidence: "Ecwid widget" },
  { id: "weebly", test: /editmysite\.com|weebly\.com\/|cdn\d*\.editmysite/i, evidence: "Weebly / Square Online files" },
  { id: "godaddy", test: /img1\.wsimg\.com|Go Daddy Website Builder|Starfield Technologies/i, evidence: "GoDaddy builder files" },
  { id: "shopware", test: /shopware|sw-plugin/i, evidence: "Shopware markup" },
  { id: "bigcartel", test: /bigcartel\.com|assets\.bigcartel/i, evidence: "Big Cartel assets" },
  { id: "salesforce", test: /demandware\.static|\/on\/demandware\.store\//i, evidence: "Demandware paths" },
  { id: "framer", test: /framerusercontent\.com|data-framer-/i, evidence: "Framer assets" },
];

/** Friendly names for common WordPress plugins (slug → name). Unknown slugs are title-cased. */
const PLUGIN_NAMES: Record<string, string> = {
  woocommerce: "WooCommerce",
  elementor: "Elementor",
  "elementor-pro": "Elementor Pro",
  "js_composer": "WPBakery Page Builder",
  "contact-form-7": "Contact Form 7",
  "wordpress-seo": "Yoast SEO",
  "seo-by-rank-math": "Rank Math SEO",
  "litespeed-cache": "LiteSpeed Cache",
  "wp-rocket": "WP Rocket",
  "w3-total-cache": "W3 Total Cache",
  "wp-super-cache": "WP Super Cache",
  jetpack: "Jetpack",
  wordfence: "Wordfence",
  "woocommerce-payments": "WooPayments",
  "woocommerce-gateway-stripe": "Stripe for WooCommerce",
  "woocommerce-paypal-payments": "PayPal Payments",
  "afterpay-gateway-for-woocommerce": "Afterpay",
  "yith-woocommerce-wishlist": "YITH Wishlist",
  "header-footer-elementor": "Elementor Header & Footer",
  "essential-addons-for-elementor-lite": "Essential Addons for Elementor",
  "premium-addons-for-elementor": "Premium Addons for Elementor",
  "revslider": "Slider Revolution",
  "wpforms-lite": "WPForms",
  "mailchimp-for-wp": "Mailchimp for WP",
  "gtranslate": "GTranslate",
  "translatepress-multilingual": "TranslatePress",
  "sitepress-multilingual-cms": "WPML",
  "google-site-kit": "Site Kit by Google",
  "google-listings-and-ads": "Google for WooCommerce",
  "facebook-for-woocommerce": "Facebook for WooCommerce",
  "pixelyoursite": "PixelYourSite",
  "cookie-law-info": "CookieYes",
  "complianz-gdpr": "Complianz",
  "woo-variation-swatches": "Variation Swatches",
  "variation-swatches-for-woocommerce": "Variation Swatches",
  "wp-smushit": "Smush",
  "autoptimize": "Autoptimize",
  "redux-framework": "Redux Framework",
  "kirki": "Kirki",
  "elementskit-lite": "ElementsKit",
  "woolentor-addons": "WooLentor",
  "woo-product-feed-pro": "Product Feed PRO",
  "official-facebook-pixel": "Meta Pixel",
  "tidio-live-chat": "Tidio Chat",
  "wp-whatsapp-chat": "WhatsApp Chat",
  "really-simple-ssl": "Really Simple SSL",
  "classic-editor": "Classic Editor",
  "safe-svg": "Safe SVG",
  "ti-woocommerce-wishlist": "TI Wishlist",
  "woo-smart-quick-view": "WPC Quick View",
  "woo-smart-wishlist": "WPC Wishlist",
  "woo-smart-compare": "WPC Compare",
  "trustindex": "Trustindex Reviews",
  "customer-reviews-woocommerce": "Customer Reviews for WooCommerce",
};

/** REST namespaces from /wp-json/ that reveal a plugin even when its files are hidden. */
const NAMESPACE_PLUGINS: Record<string, string> = {
  "wc/store": "woocommerce",
  "wc/v3": "woocommerce",
  "elementor/v1": "elementor",
  "elementor-pro/v1": "elementor-pro",
  "yoast/v1": "wordpress-seo",
  "rankmath/v1": "seo-by-rank-math",
  "litespeed/v1": "litespeed-cache",
  "litespeed/v3": "litespeed-cache",
  "contact-form-7/v1": "contact-form-7",
  "jetpack/v4": "jetpack",
  "wordfence/v1": "wordfence",
  "wp-rocket/v1": "wp-rocket",
  "google-site-kit/v1": "google-site-kit",
  "wc/gla": "google-listings-and-ads",
  "wc-paypal/v1": "woocommerce-paypal-payments",
};

const PAGE_BUILDERS: { name: string; test: (html: string, plugins: Set<string>, themeSlugs: string[]) => boolean }[] = [
  { name: "Elementor", test: (h, p) => p.has("elementor") || /class="[^"]*elementor-/.test(h) },
  { name: "Divi", test: (h, _p, t) => t.some((s) => /^divi/i.test(s)) || /et_pb_|et-db/.test(h) },
  { name: "WPBakery", test: (h, p) => p.has("js_composer") || /vc_row|wpb_wrapper/.test(h) },
  { name: "Beaver Builder", test: (h, p) => p.has("bb-plugin") || p.has("beaver-builder-lite-version") || /fl-builder/.test(h) },
  { name: "Oxygen", test: (h, p) => p.has("oxygen") || /ct-section|oxy-/.test(h) },
  { name: "Bricks", test: (h, _p, t) => t.some((s) => /^bricks/i.test(s)) || /brxe-/.test(h) },
  { name: "Breakdance", test: (h, p) => p.has("breakdance") || /breakdance/.test(h) },
  { name: "Gutenberg blocks", test: (h) => /wp-block-(?!library)[a-z]/.test(h) && !/elementor-/.test(h) },
];

function prettySlug(slug: string): string {
  return (
    PLUGIN_NAMES[slug] ??
    slug
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim()
  );
}

function firstMatch(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#8212;|&mdash;/g, "—")
    .replace(/&#8217;/g, "’")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function countSlugs(html: string, re: RegExp): string[] {
  const counts = new Map<string, number>();
  for (const m of html.matchAll(re)) {
    const slug = decodeURIComponent(m[1]).toLowerCase();
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
}

function parseStyleCssHeader(css: string) {
  const head = css.slice(0, 4000);
  const field = (name: string) => firstMatch(head, new RegExp(`^[\\s*]*${name}\\s*:\\s*(.+)$`, "im"));
  return {
    name: field("Theme Name"),
    version: field("Version"),
    author: field("Author"),
    authorUrl: field("Author URI"),
    themeUrl: field("Theme URI"),
    template: field("Template"),
  };
}

function detectHosting(headers: Headers | null) {
  if (!headers) return { server: null, cdn: null, host: null };
  const h = (k: string) => headers.get(k);
  const server = h("server") || h("x-powered-by") || h("x-turbo-charged-by");
  let cdn: string | null = null;
  if (h("cf-ray")) cdn = "Cloudflare";
  else if (h("x-amz-cf-id")) cdn = "Amazon CloudFront";
  else if (h("x-fastly-request-id") || /fastly/i.test(h("via") ?? "")) cdn = "Fastly";
  else if (h("x-sucuri-id")) cdn = "Sucuri";
  else if (h("x-akamai-transformed") || /akamai/i.test(server ?? "")) cdn = "Akamai";
  else if (h("x-qc-pop") || h("x-qc-cache")) cdn = "QUIC.cloud";
  let host: string | null = null;
  if (/hostinger/i.test(h("platform") ?? "") || h("x-hcdn-request-id")) host = "Hostinger";
  else if (h("x-kinsta-cache")) host = "Kinsta";
  else if (/wp engine/i.test(h("x-powered-by") ?? "") || h("wpe-backend")) host = "WP Engine";
  else if (h("x-sg-id") || h("host-header") === "6b7412fb82ca5edfd0917e3957f05d89") host = "SiteGround";
  else if (h("x-vercel-id")) host = "Vercel";
  else if (h("x-nf-request-id")) host = "Netlify";
  else if (h("x-shopid") || h("x-shopify-stage")) host = "Shopify";
  else if (h("x-ah-environment")) host = "Acquia";
  else if (h("x-fw-hash") || h("x-fw-serve")) host = "Flywheel";
  return { server, cdn, host };
}

async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

async function countShopifyProducts(origin: string): Promise<number | null> {
  // /meta.json is the fast path; fall back to paging the public catalog (capped).
  let total = 0;
  const deadline = Date.now() + 15_000;
  for (let page = 1; page <= 20 && Date.now() < deadline; page += 1) {
    const r = await settle(fetchJson<any>(`${origin}/products.json?limit=250&page=${page}`, 10_000));
    const list = r?.json?.products;
    if (!Array.isArray(list)) return total || null;
    total += list.length;
    if (list.length < 250) return total;
  }
  return total || null;
}

export async function inspectStore(origin: string): Promise<InspectResult> {
  const notes: string[] = [];

  const [home, wpJson, shopMeta, storeApi] = await Promise.all([
    settle(fetchText(origin, 15_000)),
    settle(fetchJson<any>(`${origin}/wp-json/`, 12_000)),
    settle(fetchJson<any>(`${origin}/meta.json`, 10_000)),
    settle(fetchJson<any>(`${origin}/wp-json/wc/store/v1/products?per_page=1`, 12_000)),
  ]);

  const html = home?.text ?? "";
  const blocked =
    !home ||
    home.status === 403 ||
    home.status === 429 ||
    home.status === 503 ||
    /<title>\s*(Just a moment|Attention Required|Access denied)/i.test(html) ||
    home.headers.get("cf-mitigated") === "challenge";
  if (blocked) {
    notes.push("The homepage blocked our request (firewall or bot check), so theme details may be incomplete.");
  }

  const title = decodeEntities(firstMatch(html, /<title[^>]*>([^<]{1,200})<\/title>/i) ?? "") || null;
  const generators = [...html.matchAll(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/gi)].map(
    (m) => m[1]
  );

  const evidence: string[] = [];
  let platform: PlatformId = "unknown";

  // ---------- Shopify ----------
  const shopifyThemeJson = firstMatch(html, /Shopify\.theme\s*=\s*(\{[\s\S]*?\})\s*;/);
  const isShopify =
    !!shopifyThemeJson ||
    /cdn\.shopify\.com|shopify-features|Shopify\.shop\s*=/.test(html) ||
    !!home?.headers.get("x-shopid") ||
    !!home?.headers.get("x-shopify-stage") ||
    /shopify/i.test(home?.headers.get("powered-by") ?? "") ||
    (!!shopMeta?.json && typeof shopMeta.json === "object" && "myshopify_domain" in shopMeta.json);

  // ---------- WordPress ----------
  const wpNamespaces: string[] = Array.isArray(wpJson?.json?.namespaces) ? wpJson!.json.namespaces : [];
  const isWordPress =
    wpNamespaces.length > 0 ||
    /\/wp-content\/|\/wp-includes\/|api\.w\.org/.test(html) ||
    generators.some((g) => /^WordPress/i.test(g));
  const hasStoreApi = Array.isArray(storeApi?.json);
  const isWoo =
    isWordPress &&
    (hasStoreApi ||
      wpNamespaces.some((n) => n.startsWith("wc/")) ||
      /\/plugins\/woocommerce\/|woocommerce-no-js|class="[^"]*woocommerce/.test(html) ||
      generators.some((g) => /^WooCommerce/i.test(g)));

  let theme: ThemeInfo | null = null;
  let cms: InspectResult["cms"] = null;
  let shop: InspectResult["shop"] = null;
  let plugins: { slug: string; name: string }[] = [];
  let pageBuilders: string[] = [];
  let productCount: number | null = null;
  let currency: string | null = null;

  if (isShopify) {
    platform = "shopify";
    if (shopifyThemeJson) evidence.push("Shopify theme settings in the page");
    if (/cdn\.shopify\.com/.test(html)) evidence.push("Files served from cdn.shopify.com");
    if (shopMeta?.json?.myshopify_domain) evidence.push(`Store ID ${shopMeta.json.myshopify_domain}`);
    if (home?.headers.get("x-shopid")) evidence.push("Shopify response headers");

    shop = { name: "Shopify", version: null };
    if (shopifyThemeJson) {
      try {
        const t = JSON.parse(shopifyThemeJson);
        const realName: string = t.schema_name || t.name;
        theme = {
          name: realName,
          slug: null,
          version: t.schema_version ?? null,
          author: null,
          authorUrl: null,
          themeUrl: t.theme_store_id ? `https://themes.shopify.com/search?q=${encodeURIComponent(realName)}` : null,
          parent: null,
          renamedTo: t.schema_name && t.name && t.name !== t.schema_name ? t.name : null,
          themeStoreId: typeof t.theme_store_id === "number" ? t.theme_store_id : null,
        };
        if (!t.theme_store_id) notes.push("This theme isn't from the Shopify Theme Store — it's custom or bought elsewhere.");
      } catch {
        // malformed theme JSON — leave theme null
      }
    }
    currency =
      firstMatch(html, /Shopify\.currency\s*=\s*\{[^}]*"active"\s*:\s*"([A-Z]{3})"/) ?? shopMeta?.json?.currency ?? null;
    productCount =
      typeof shopMeta?.json?.published_products_count === "number"
        ? shopMeta.json.published_products_count
        : await countShopifyProducts(origin);
  } else if (isWordPress) {
    platform = isWoo ? "woocommerce" : "wordpress";
    if (wpNamespaces.length) evidence.push("WordPress REST API at /wp-json/");
    if (/\/wp-content\//.test(html)) evidence.push("Files under /wp-content/");
    if (hasStoreApi) evidence.push("WooCommerce Store API responds");

    const wpGen = generators.find((g) => /^WordPress/i.test(g));
    cms = { name: "WordPress", version: wpGen ? firstMatch(wpGen, /WordPress\s+([\d.]+)/i) : null };
    if (isWoo) {
      const wcGen = generators.find((g) => /^WooCommerce/i.test(g));
      shop = { name: "WooCommerce", version: wcGen ? firstMatch(wcGen, /WooCommerce\s+([\d.]+)/i) : null };
    }

    // Theme: the most-referenced folder under /wp-content/themes/, plus its parent if it's a child theme.
    const themeSlugs = countSlugs(html, /\/wp-content\/themes\/([A-Za-z0-9_.%-]+)\//g);
    if (themeSlugs.length) {
      const primary = themeSlugs[0];
      const css = await settle(fetchText(`${origin}/wp-content/themes/${primary}/style.css`, 10_000));
      const header = css && css.status === 200 ? parseStyleCssHeader(css.text) : null;
      let parent: ThemeInfo["parent"] = null;
      const parentSlug = header?.template || themeSlugs.find((s) => s !== primary) || null;
      if (parentSlug && parentSlug !== primary) {
        const pcss = await settle(fetchText(`${origin}/wp-content/themes/${parentSlug}/style.css`, 10_000));
        const ph = pcss && pcss.status === 200 ? parseStyleCssHeader(pcss.text) : null;
        parent = { name: ph?.name || prettySlug(parentSlug), slug: parentSlug };
      }
      theme = {
        name: header?.name || prettySlug(primary),
        slug: primary,
        version: header?.version ?? null,
        author: header?.author ?? null,
        authorUrl: header?.authorUrl ?? null,
        themeUrl: header?.themeUrl ?? null,
        parent,
        renamedTo: null,
        themeStoreId: null,
      };
      if (!header) notes.push("The theme's style.css couldn't be read, so its name comes from the folder name.");
    } else if (!blocked) {
      notes.push("No theme folder was visible in the page — a security or optimisation plugin may be hiding it.");
    }

    // Plugins: from file paths in the HTML and from REST namespaces.
    const pluginSlugs = new Set(countSlugs(html, /\/wp-content\/plugins\/([A-Za-z0-9_.%-]+)\//g));
    for (const ns of wpNamespaces) {
      const key = Object.keys(NAMESPACE_PLUGINS).find((k) => ns === k || ns.startsWith(k));
      if (key) pluginSlugs.add(NAMESPACE_PLUGINS[key]);
    }
    if (isWoo) pluginSlugs.add("woocommerce");
    plugins = [...pluginSlugs].map((slug) => ({ slug, name: prettySlug(slug) })).sort((a, b) => a.name.localeCompare(b.name));
    pageBuilders = PAGE_BUILDERS.filter((b) => b.test(html, pluginSlugs, themeSlugs)).map((b) => b.name);

    if (isWoo) {
      const total = Number(storeApi?.headers.get("x-wp-total"));
      productCount = Number.isFinite(total) && total >= 0 && storeApi?.headers.get("x-wp-total") ? total : null;
      currency = Array.isArray(storeApi?.json) ? storeApi!.json[0]?.prices?.currency_code ?? null : null;
    }
  } else {
    const hit = OTHER_PLATFORMS.find((p) => p.test.test(html));
    if (hit) {
      platform = hit.id;
      evidence.push(hit.evidence);
    } else if (blocked) {
      notes.push("The site blocked us before we could see enough to tell the platform.");
    } else {
      notes.push("No known store platform matched. It may be custom-built or a headless setup.");
    }
    const gen = generators[0];
    if (gen) evidence.push(`Generator tag: ${gen}`);
  }

  return {
    url: origin,
    finalUrl: home?.finalUrl ?? origin,
    title,
    platform: { id: platform, name: PLATFORM_NAMES[platform], evidence },
    cms,
    shop,
    theme,
    pageBuilders,
    plugins,
    hosting: detectHosting(home?.headers ?? null),
    productCount,
    currency,
    blocked,
    notes,
  };
}
