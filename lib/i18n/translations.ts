// Merges every namespace dictionary into one flat lookup per language.
// Keys are dotted and namespaced (e.g. "plan.title"); add a namespace by
// importing its file and spreading it into both languages below.
import type { Lang } from "./config";
import { common } from "./strings/common";
import { nav } from "./strings/nav";
import { settings } from "./strings/settings";
import { plan } from "./strings/plan";
import { dashboard } from "./strings/dashboard";
import { usage } from "./strings/usage";
import { auth } from "./strings/auth";
import { pricing } from "./strings/pricing";
import { misc } from "./strings/misc";

const namespaces = [
  common,
  nav,
  settings,
  plan,
  dashboard,
  usage,
  auth,
  pricing,
  misc,
];

function merge(lang: Lang): Record<string, string> {
  return Object.assign({}, ...namespaces.map((ns) => ns[lang]));
}

export const dictionaries: Record<Lang, Record<string, string>> = {
  en: merge("en"),
  ko: merge("ko"),
};
