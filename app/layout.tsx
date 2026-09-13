import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n/context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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
 * passes `?locale=`) → the OS preference → dark, which is what this app has
 * always been and stays the default for anyone arriving cold.
 *
 * Inline and synchronous because a React effect runs after the first paint,
 * and a white flash on a dark page is worse than no theming at all. Failing
 * silently is deliberate: if this throws, `dark` is already on the element.
 */
const PICK_SCHEME = `try{
var q=new URLSearchParams(location.search).get('theme');
var t=(q==='light'||q==='dark')?q:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');
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
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: PICK_SCHEME }} />
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
