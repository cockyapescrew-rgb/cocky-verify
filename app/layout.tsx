import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://verify.cocky.cafe"),
  title: {
    default: "Cocky Portal | XRPL Discord Verification",
    template: "%s | Cocky Portal",
  },
  description:
    "Verify XRPL wallets, automate Discord roles, gate access by NFT traits, token holdings, and server subscriptions.",
  icons: {
    icon: [{ url: "/icon.png", type: "image/png" }],
    shortcut: ["/icon.png"],
    apple: [{ url: "/icon.png", type: "image/png" }],
  },
  openGraph: {
    title: "Cocky Portal | XRPL Discord Verification",
    description:
      "NFT, trait, token, and subscription-based Discord access powered by Cocky Bot. Built for XRPL communities.",
    url: "https://verify.cocky.cafe",
    siteName: "Cocky Portal",
    images: [
      {
        url: "/cockybots.png?v=2",
        width: 1200,
        height: 630,
        alt: "Cocky Portal XRPL Discord Verification",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Cocky Portal | XRPL Discord Verification",
    description:
      "Automated Discord role verification for XRPL communities using NFTs, traits, token holdings, and paid server access.",
    images: ["/cockybots.png?v=2"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}