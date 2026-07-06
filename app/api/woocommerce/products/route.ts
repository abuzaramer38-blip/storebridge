import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchWooCommerceProductsPage } from "@/lib/woocommerce";

export const maxDuration = 60;

const RequestSchema = z.object({
  siteUrl: z.string().min(1, "Site URL is required."),
  page: z.number().int().min(1).optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(" ") },
      { status: 400 }
    );
  }

  const data = parsed.data;

  try {
    const result = await fetchWooCommerceProductsPage({ siteUrl: data.siteUrl }, data.page ?? 1);

    return NextResponse.json({
      success: true,
      products: result.products,
      pageInfo: result.pageInfo,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error while contacting WooCommerce.",
      },
      { status: 502 }
    );
  }
}
