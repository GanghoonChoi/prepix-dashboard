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

// Satoshi, the English face, comes from Fontshare's CDN instead: its licence
// forbids redistributing the files, and this repo is public. `block`, not
// `swap`: English text waits for Satoshi rather than flashing another face.
export const SATOSHI_CSS =
  "https://api.fontshare.com/v2/css?f[]=satoshi@1&display=block";
