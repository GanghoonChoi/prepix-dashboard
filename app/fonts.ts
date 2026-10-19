import localFont from "next/font/local";

// The site's own Pretendard subsets (laskerstudio.com apps/site/app/fonts).
export const pretendard = localFont({
  variable: "--font-pretendard",
  src: [
    { path: "./fonts/Pretendard-Regular.subset.woff2", weight: "400" },
    { path: "./fonts/Pretendard-Medium.subset.woff2", weight: "500" },
    { path: "./fonts/Pretendard-SemiBold.subset.woff2", weight: "600" },
    { path: "./fonts/Pretendard-Bold.subset.woff2", weight: "700" },
    { path: "./fonts/Pretendard-ExtraBold.subset.woff2", weight: "800" },
  ],
});

// Satoshi, the English face, is a plain @font-face in globals.css: the file is
// downloaded at build (scripts/fetch-satoshi.mjs), not committed.
export const SATOSHI_URL = "/fonts/Satoshi-Variable.woff2";
