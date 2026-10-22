import { NextResponse } from "next/server";
export const maxDuration = 60;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
function cookiesFrom(res: Response, jar: Map<string, string>) {
  const list = (res.headers as any).getSetCookie?.() ?? [];
  for (const c of list) { const [kv] = c.split(";"); const i = kv.indexOf("="); jar.set(kv.slice(0, i).trim(), kv.slice(i + 1)); }
}
const cookieHeader = (jar: Map<string, string>) => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
export async function GET(req: Request) {
  try { return await run(req); } catch (e) { return NextResponse.json({ error: String((e as Error)?.stack || e) }); }
}
async function run(req: Request) {
  let u = new URL(req.url).searchParams.get("p") || "/product/camp-chef-woodwind-pro-36-pellet-grills/";
  u = new URL(u, "https://poorat.com").toString();
  const jar = new Map<string, string>();
  const log: any[] = [];
  let r = await fetch(u, { headers: { "User-Agent": UA }, redirect: "manual" });
  cookiesFrom(r, jar);
  const html = await r.text();
  const formMatch = html.match(/<form[^>]*class="[^"]*cart[^"]*"[\s\S]*?<\/form>/);
  const form = formMatch?.[0] ?? "";
  log.push({ step: "product", status: r.status, formHtml: form.slice(0, 4000) });
  const buyNowSnippets = [...html.matchAll(/.{0,300}buy[-_ ]?now.{0,300}/gi)].slice(0, 6).map((m) => m[0]);
  log.push({ buyNowSnippets });
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]).filter((s) => /plugins|woodmart|cart|checkout/.test(s));
  log.push({ scripts });
  // Build form body
  const body = new URLSearchParams();
  for (const m of form.matchAll(/<(input|button)[^>]*>/g)) {
    const tag = m[0];
    const name = tag.match(/name="([^"]+)"/)?.[1]; const value = tag.match(/value="([^"]*)"/)?.[1] ?? "";
    const type = tag.match(/type="([^"]+)"/)?.[1] ?? "";
    if (!name) continue;
    if (m[1] === "button" || type === "submit") { if (/buy/i.test(tag)) body.set(name, value || "1"); else if (name === "add-to-cart") body.set(name, value); continue; }
    body.set(name, value || (name === "quantity" ? "1" : value));
  }
  const action = form.match(/action="([^"]*)"/)?.[1]?.replace(/&#0?38;|&amp;/g, "&") || u;
  log.push({ post: action, body: body.toString() });
  let target = new URL(action, u).toString();
  r = await fetch(target, { method: "POST", body, headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieHeader(jar), Referer: u }, redirect: "manual" });
  cookiesFrom(r, jar);
  for (let i = 0; i < 6; i++) {
    const loc = r.headers.get("location");
    const text = loc ? "" : await r.text();
    const notices = [...text.matchAll(/class="[^"]*(woocommerce-(message|error|info)|wd-notice)[^"]*"[^>]*>([\s\S]{0,400}?)<\/(div|ul|li)/g)].map((m) => m[3].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    log.push({ step: `hop${i}`, url: target, status: r.status, location: loc, title: text.match(/<title>([^<]*)/)?.[1], notices, checkoutForm: /form[^>]+checkout/.test(text), emptyCart: /cart is currently empty|cart-empty/i.test(text) });
    if (!loc) break;
    target = new URL(loc, target).toString();
    r = await fetch(target, { headers: { "User-Agent": UA, Cookie: cookieHeader(jar) }, redirect: "manual" });
    cookiesFrom(r, jar);
  }
  // explicit checkout check
  const c = await fetch(new URL("/checkout/", u), { headers: { "User-Agent": UA, Cookie: cookieHeader(jar) }, redirect: "manual" });
  const ct = c.status === 200 ? await c.text() : "";
  log.push({ step: "checkout", status: c.status, location: c.headers.get("location"), checkoutForm: /form[^>]+checkout/.test(ct), gateways: [...ct.matchAll(/payment_method_([a-z0-9_-]+)/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i) });
  log.push({ cookies: [...jar.keys()] });
  return NextResponse.json(log);
}
