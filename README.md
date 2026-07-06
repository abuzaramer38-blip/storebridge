# StoreBridge

A personal backup and migration dashboard for e-commerce stores you own —
paste a store link, pull the product catalog (title, description, images,
price, stock status, and category/subcategory info) into a table, and
export it as an import-ready CSV for either platform, or as a raw JSON
backup.

Built with Next.js 16 (App Router), TypeScript, and Tailwind CSS v4.
Designed to be deployed on Vercel as a private, internal tool.

**No API keys, tokens, or logins required.** Both tabs work off just a
store URL — see "How the fetching works" below for exactly what that
does and doesn't get you.

## Project structure

```
app/
  api/
    shopify/products/route.ts       Shopify public-catalog proxy
    woocommerce/products/route.ts   WooCommerce Store API proxy
  layout.tsx, page.tsx, globals.css
components/
  Dashboard.tsx                     Tab shell (Shopify Backup / WordPress Backup)
  ShopifyPanel.tsx                  Shopify: URL field + fetch loop
  WooCommercePanel.tsx              WooCommerce: URL field + fetch loop
  ProductTable.tsx                  Shared results table
  ExportPanel.tsx                   Format toggle + CSV/JSON download
  ui/                               Small shared UI primitives
lib/
  types.ts                          The shared "normalized product" shape
  shopify.ts                        Shopify public products.json fetching/normalizing
  woocommerce.ts                    WooCommerce Store API fetching/normalizing + category tree resolution
  csv-export.ts                     Normalized product -> Shopify/WooCommerce CSV rows
  utils.ts
proxy.ts                             Optional HTTP Basic Auth for the deployed app (Next 16 renamed Middleware -> Proxy)
```

## How the fetching works

Both platforms are read through their **public, unauthenticated
storefront endpoints** — the same data their own product pages use, just
in JSON:

- **Shopify** — `{store-url}/products.json`, the classic public catalog
  feed every Shopify storefront ships. Works with any store URL,
  `*.myshopify.com` or a custom domain.
- **WooCommerce** — `{site-url}/wp-json/wc/store/v1/products`, WooCommerce's
  "Store API," the same public endpoint that powers the block-based
  cart/checkout. [Officially documented as unauthenticated by design](https://developer.woocommerce.com/docs/apis/store-api/).

This is simpler and faster to use than the authenticated Admin/REST APIs
(no app setup, no keys), but it means some data is only as accurate as
what each platform is willing to make public:

| Field | Shopify (public) | WooCommerce (Store API) |
|---|---|---|
| Title, description | ✅ Accurate | ✅ Accurate |
| Images | ✅ Accurate | ✅ Accurate |
| Price | ✅ Accurate | ✅ Accurate |
| Stock | In stock / out of stock only | In stock / out of stock only |
| Categories | ⚠️ Single "Product Type" only — no real Collections | ✅ Full Parent > Child hierarchy |

The stock and category gaps aren't bugs — they're what each platform's
public endpoint actually exposes. Exact inventory counts and Shopify's
real Collection membership are only available through each platform's
*authenticated* Admin API, which trades "just paste a link" for needing
an API key/app setup. If you need that later, `lib/shopify.ts` and
`lib/woocommerce.ts` are the two places to swap the fetch target back to
an authenticated endpoint — everything downstream (the table, both CSV
exporters) works off the same normalized shape either way and needs no
changes.

## Category & subcategory handling

**Fetching from WooCommerce → Shopify or WooCommerce CSV:** solid in both
directions. `lib/woocommerce.ts` fetches the full public category tree
once (`/products/categories`), then walks each product's category IDs up
their parent chain to build the real path (e.g. `Clothing > Tops`).
Exporting to WooCommerce format writes that straight into the
`Categories` column as `Parent > Child`, comma-separating multiple
assignments — exactly what the
[official WooCommerce CSV importer](https://github.com/woocommerce/woocommerce/wiki/Product-CSV-Import-Schema)
expects.

**Fetching from Shopify:** there's a real platform limitation, not just
an API-access one — Shopify has no native subcategory concept at all.
Products belong to flat Collections (not visible via the public
endpoint), and `Type` is a single free-text field, which is what this
tool reads as a stand-in category.

**Exporting *to* Shopify CSV format** (regardless of source): since
there's no column that makes Shopify auto-build a category tree — it has
none to build — a hierarchy like `Clothing > Tops` is mapped two ways:
the leaf (`Tops`) becomes `Type`, and every level becomes a `Tag`. After
import, create Shopify **Automated Collections** with a "Tag is equal
to" condition per level to get browsable category pages back.

## Run it locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — paste a store URL
in either tab and click Fetch.

## Deploy to Vercel

1. Push this project to a GitHub repo.
2. Import it at [vercel.com/new](https://vercel.com/new) — Next.js is
   auto-detected, no build config needed.
3. **Recommended:** set `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` as
   environment variables in the Vercel project settings. There's no
   store data to protect (nothing's authenticated), but this stops
   random visitors from using your deployment as a general-purpose
   storefront scraper. Leave both unset to disable.

## Known limitations (and where to extend them)

- **Exact stock counts and real Shopify Collections** aren't available
  through either public endpoint — see the table above. Both `lib/*.ts`
  files are set up so swapping in an authenticated fetch (Shopify Admin
  GraphQL API, WooCommerce's `wc/v3` REST API with a Consumer Key/Secret)
  is a contained change; the normalized shape, table, and both CSV
  exporters don't need to change at all.
- **WooCommerce variable products** (size/color variations) export to
  the WooCommerce CSV format as a `simple` product using the first
  variation's price/SKU. WooCommerce's variable-product CSV format needs
  separate `Attribute N` columns and one row per variation with a shared
  parent — `toWooCommerceRows()` in `lib/csv-export.ts` is where to
  extend that if you need full variant fidelity. Shopify's own export
  *does* handle multi-variant products fully (one row per variant), since
  that's how Shopify's CSV format already works.
- **Very large catalogs**: fetching paginates one page at a time with a
  live progress indicator, so it won't time out on a large store, but a
  many-thousand-product catalog will still take a while page-by-page.
- **Password-protected or dev-mode stores** won't return data through
  either public endpoint — that's expected, since "public" is the whole
  mechanism this relies on.
