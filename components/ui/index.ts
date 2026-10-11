/**
 * The dashboard's component kit (docs/design/2026-10-12-design-system.md §2).
 * Pages build from these; a page that needs a new look adds it here first, so
 * two pages cannot drift into two styles again.
 */
export * from "./button";
export * from "./badge";
export * from "./card";
export * from "./page";
export * from "./controls";
export * from "./data";
export * from "./feedback";
export * from "./settings";
export * from "./media";
export * from "./overlay";
export { ago } from "@/lib/format";
