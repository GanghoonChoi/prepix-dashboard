import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";
import { DEFAULT_LANG } from "@/lib/i18n/config";
import { I18nProvider } from "@/lib/i18n/context";

// The site's own Pretendard subsets (laskerstudio.com apps/site/app/fonts).
// Satoshi, the English face, comes from Fontshare's CDN in <head> instead: its
// licence forbids redistributing the files, and this repo is public.
const pretendard = localFont({
  variable: "--font-pretendard",
  src: [
    { path: "./fonts/Pretendard-Regular.subset.woff2", weight: "400" },
    { path: "./fonts/Pretendard-Medium.subset.woff2", weight: "500" },
    { path: "./fonts/Pretendard-SemiBold.subset.woff2", weight: "600" },
    { path: "./fonts/Pretendard-Bold.subset.woff2", weight: "700" },
    { path: "./fonts/Pretendard-ExtraBold.subset.woff2", weight: "800" },
  ],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://prepix.ai",
  ),
  title: "Prepix Dashboard",
  description: "AI video editing assistant dashboard",
  // An authenticated app dashboard should never be indexed.
  robots: { index: false, follow: false },
  openGraph: {
    title: "Prepix Dashboard",
    description: "AI video editing assistant dashboard",
    images: ["/og-image.png"],
  },
};

/**
 * Pick the colour scheme before the first paint.
 *
 * `dark` used to be hardcoded on `<html>`, which meant a reader who had been
 * on prepix.ai in light mode hit a black page the moment they clicked "log in"
 * — the single most visible break in a journey that is supposed to read as one
 * product.
 *
 * Order: `?theme=` (the site passes what the reader chose, the same way it
 * passes `?locale=`) → the choice saved from the account menu (`lib/theme.ts`)
 * → the OS preference → dark, which is what this app has always been and
 * stays the default for anyone arriving cold.
 *
 * Inline and synchronous because a React effect runs after the first paint,
 * and a white flash on a dark page is worse than no theming at all. Failing
 * silently is deliberate: if this throws, `dark` is already on the element.
 */
const PICK_SCHEME = `try{
var q=new URLSearchParams(location.search).get('theme');
var s=null;try{s=localStorage.getItem('px-theme')}catch(e){}
var t=(q==='light'||q==='dark')?q:(s==='light'||s==='dark')?s:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');
var e=document.documentElement;
e.classList.toggle('dark',t==='dark');
e.classList.toggle('light',t==='light');
e.dataset.theme=t;
}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      suppressHydrationWarning
      // What the server renders; I18nProvider moves it with the language.
      lang={DEFAULT_LANG}
      className={`dark ${pretendard.variable} ${geistMono.variable} antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: PICK_SCHEME }} />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="" />
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@1&display=swap" />
        <link rel="icon" type="image/svg+xml" href="/favicon_black.svg" media="(prefers-color-scheme: light)" />
        <link rel="icon" type="image/svg+xml" href="/favicon_white.svg" media="(prefers-color-scheme: dark)" />
        <Script
          src="https://cdn.paddle.com/paddle/v2/paddle.js"
          strategy="beforeInteractive"
        />
      </head>
      <body className="min-h-dvh bg-background text-foreground font-sans">
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
