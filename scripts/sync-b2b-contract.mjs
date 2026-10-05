import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";

const source = resolve(
  process.argv.slice(2).find((arg) => !arg.startsWith("--")) ??
    "../prepix-backend/backend/src/b2b/contracts.ts",
);
const destination = resolve("lib/api/generated/b2b.ts");
const contents =
  "// Generated from backend/src/b2b/contracts.ts. Run node scripts/sync-b2b-contract.mjs after a server contract change.\n" +
  (await readFile(source, "utf8"));
if (process.argv.includes("--check")) {
  if ((await readFile(destination, "utf8")) !== contents)
    throw new Error("B2B contract is out of date");
} else {
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, contents);
}
