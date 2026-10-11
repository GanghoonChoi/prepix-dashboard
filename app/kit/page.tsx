import { notFound } from "next/navigation";
import { Catalogue } from "./catalogue";

/**
 * Every kit component, light and dark side by side — the reference for
 * "does this still look like the system" (docs/design/2026-10-12-design-system.md).
 * Development only; production answers 404.
 */
export default function KitPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Catalogue />;
}
