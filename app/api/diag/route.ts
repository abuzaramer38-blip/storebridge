import { NextResponse } from "next/server";
export const maxDuration = 60;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
type Jar = Map<string, string>;
function eat(res: Response, jar: Jar, raw: string[]) {
  for (const c of (res.headers as any).getSetCookie?.() ?? []) {
    raw.push(c.replace(/=([^;]{6})[^;]*/, "=$1…"));
    const [kv] = c.split(";"); const i = kv.indexOf("="); const v = kv.slice(i + 1);
    if (/deleted|^$/.test(v) || /expires=Thu, 01 Jan 1970/i.test(c)) jar.delete(kv.slice(0, i).trim()); else jar.set(kv.slice(0, i).trim(), v);
  }
}
const ck = (j: Jar) => [...j].map(([k, v]) => `${k}=${v}`).join("; ");
const hdrs = (r: Response) => Object.fromEntries([...r.headers].filter(([k]) => /cache|litespeed|x-|location|cf-|age|server/i.test(k)));
async function step(url: string, jar: Jar, init: RequestInit = {}) {
  const raw: string[] = [];
  const r = await fetch(url, { ...init, headers: { "User-Agent": UA, Cookie: ck(jar), ...(init.headers || {}) }, redirect: "manual" });
  eat(r, jar, raw);
  const t = r.status === 200 ? await r.text() : "";
  const items = t.match(/cart-contents-count[^>]*>\s*(\d+)/)?.[1] ?? t.match(/wd-cart-number[^>]*>\s*(\d+)/)?.[1];
  return { url, status: r.status, headers: hdrs(r), setCookie: raw, emptyCart: /cart is currently empty|cart-empty/i.test(t), cartRows: (t.match(/class="[^"]*cart_item/g) || []).length, headerCount: items, checkoutForm: /form[^>]+name="checkout"/.test(t), gateways: [...new Set([...t.matchAll(/payment_method_([a-z0-9_-]+)/g)].map((m) => m[1]))], errors: [...t.matchAll(/woocommerce-error[^>]*>([\s\S]{0,300}?)<\/ul>/g)].map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()) };
}
export async function GET(req: Request) {
  try {
    const p = new URL(req.url).searchParams.get("p") || "/product/camp-chef-woodwind-pro-36-pellet-grills/";
    const u = new URL(p, "https://poorat.com").toString();
    const out: any[] = [];
    // A: plain add to cart via query string, then cart
    let jar: Jar = new Map();
    out.push({ A: await step("https://poorat.com/?add-to-cart=21420&quantity=1", jar) });
    out.push({ A: await step("https://poorat.com/cart/", jar) });
    out.push({ A_cookies: [...jar.keys()] });
    // B: Store API (no page cache)
    jar = new Map();
    const raw: string[] = [];
    let r = await fetch("https://poorat.com/wp-json/wc/store/v1/cart", { headers: { "User-Agent": UA }, redirect: "manual" });
    eat(r, jar, raw);
    const nonce = r.headers.get("nonce") || r.headers.get("x-wc-store-api-nonce") || "";
    const cartToken = r.headers.get("cart-token") || "";
    r = await fetch("https://poorat.com/wp-json/wc/store/v1/cart/add-item", { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/json", Nonce: nonce, "Cart-Token": cartToken, Cookie: ck(jar) }, body: JSON.stringify({ id: 21420, quantity: 1 }) });
    eat(r, jar, raw);
    const body: any = await r.json().catch(() => null);
    out.push({ B_add: { status: r.status, items: body?.items_count, err: body?.message, code: body?.code } });
    r = await fetch("https://poorat.com/wp-json/wc/store/v1/cart", { headers: { "User-Agent": UA, "Cart-Token": r.headers.get("cart-token") || cartToken, Cookie: ck(jar) } });
    const b2: any = await r.json().catch(() => null);
    out.push({ B_after: { status: r.status, items: b2?.items_count, payment_methods: b2?.payment_methods, needs_shipping: b2?.needs_shipping, shipping_rates: b2?.shipping_rates?.[0]?.shipping_rates?.map((s: any) => s.name), errors: b2?.errors } });
    // C: buy now POST, then checkout
    jar = new Map();
    out.push({ C: await step(u, jar) });
    out.push({ C: await step(u, jar, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: u }, body: "quantity=1&add-to-cart=21420&wd-add-to-cart=21420" }) });
    out.push({ C: await step("https://poorat.com/checkout/", jar) });
    out.push({ C_cookies: [...jar.keys()] });
    return NextResponse.json(out);
  } catch (e) { return NextResponse.json({ error: String((e as Error)?.stack || e) }); }
}
