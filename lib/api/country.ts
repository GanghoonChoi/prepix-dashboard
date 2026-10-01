// The backend picks the payment processor from the buyer's country (KR → Toss).
// A hint, never a gate: if the lookup fails the request goes out without it and
// the backend falls back to its default processor.
let pending: Promise<string> | undefined;

function lookup(): Promise<string> {
  pending ??= fetch("/api/geo", { signal: AbortSignal.timeout(3000) })
    .then((r) => r.json())
    .then((j: { country?: string }) => j.country ?? "")
    .catch(() => {
      pending = undefined; // a blip should not pin "unknown" for the whole session
      return "";
    });
  return pending;
}

// `override` is for the buyer who chose the other processor on purpose — a
// foreign-issued card in Korea, which the domestic one declines. Any value that
// is not KR sends them to the default processor.
export async function countryHeaders(override?: string): Promise<Record<string, string>> {
  const country = override ?? (await lookup());
  return country ? { "x-prepix-country": country } : {};
}
