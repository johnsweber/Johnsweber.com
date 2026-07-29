import type { Metadata } from "next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import { AuthProvider } from "./auth-provider";
import { ImageEdgeBursts } from "./image-edge-bursts";
import { SiteThemeController } from "./site-theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://johnsweber.com"),
  title: "John Weber — Product Thinker, Builder & AI Tinkerer",
  description:
    "Bright ideas, clear systems, and approachable AI experiments by John Weber.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "John Weber — Product Thinker, Builder & AI Tinkerer",
    description:
      "Bright ideas, clear systems, and approachable AI experiments.",
    type: "website",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "John Weber — Product Thinker, Builder & AI Tinkerer",
    description:
      "Bright ideas, clear systems, and approachable AI experiments.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable}`}>
        <SiteThemeController />
        <ImageEdgeBursts />
        <AuthProvider publishableKey={publishableKey}>{children}</AuthProvider>
      </body>
    </html>
  );
}
