import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { siteUrl } from "@/lib/site-url";
import { SITE_TITLE as TITLE, SITE_DESCRIPTION as DESCRIPTION } from "@/lib/metadata";
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
  metadataBase: siteUrl(),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: TITLE,
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  // Makes a home-screen launch open as a standalone app (no Safari address
  // bar or toolbar) rather than a bookmarked tab. `title` is the label iOS
  // shows under the icon and in the app switcher when it differs from the
  // page <title>; "Orbit" is shorter than the full SITE_TITLE and is what the
  // product's own icon and voice are named.
  //
  // statusBarStyle "black", not "black-translucent". Decision, 28 Sept 2026,
  // the owner, after phone pass 4: with black-translucent the installed app's
  // web view was 59px short at the bottom (innerHeight 793 on an 852pt
  // screen), leaving an unpainted bar; "black" fills the screen. Go back to
  // translucent only with a phone check. Under "black" the safe-area top
  // inset reads 0 in the installed app, so the top-inset plumbing in
  // globals.css and PageHeader is inert but deliberately kept.
  appleWebApp: {
    capable: true,
    title: "Orbit",
    statusBarStyle: "black",
  },
};

// `viewportFit: "cover"` is what turns viewport-fit=cover on at all: without
// it, `env(safe-area-inset-*)` resolves to 0 everywhere and the safe-area
// padding Tasks 2-3 added to the three locked screens has nothing to react
// to. themeColor/colorScheme match manifest.ts's background_color/theme_color
// (the product's dark tile, #15161e): themeColor tints browser chrome such as
// Android's address bar and system UI rather than defaulting to white (not
// 100% sure how iOS Safari uses it). It does NOT set the installed iOS app's
// status bar: with statusBarStyle "black" that bar is black, whatever
// themeColor says. colorScheme keeps native form controls, scrollbars, and the browser's own
// UI dark instead of guessing light from a missing signal.
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#15161e",
  colorScheme: "dark",
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
