import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StoreBridge — Backup & Migration Utility",
  description: "Personal backup and migration tool for your own Shopify and WooCommerce stores.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
