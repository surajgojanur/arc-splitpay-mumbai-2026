import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "ArcSplit — One invoice. Two payouts.",
  description:
    "Simple USDC invoice splitting on Arc Testnet. Fixture preview; live integration pending.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
