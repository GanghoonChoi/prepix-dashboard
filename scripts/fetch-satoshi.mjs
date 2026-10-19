// Satoshi's licence (ITF FFL) allows serving it from our own domain but not
// redistributing the file, and this repo is public — so the build downloads
// Fontshare's original into public/ (gitignored) instead of committing it.
// Runs before `build` and `dev`; a failed download fails the build, so
// production never ships without it.
import { access, mkdir, writeFile } from "node:fs/promises";

const destination = "public/fonts/Satoshi-Variable.woff2";

try {
  await access(destination);
} catch {
  const css = await (await fetch("https://api.fontshare.com/v2/css?f[]=satoshi@1")).text();
  const url = css.match(/url\('(\/\/cdn\.fontshare\.com\/[^']+\.woff2)'\)/)?.[1];
  if (!url) throw new Error("Satoshi: no woff2 in Fontshare's CSS");
  const font = Buffer.from(await (await fetch(`https:${url}`)).arrayBuffer());
  if (font.subarray(0, 4).toString() !== "wOF2") throw new Error("Satoshi: download is not a woff2");
  await mkdir("public/fonts", { recursive: true });
  await writeFile(destination, font);
}
