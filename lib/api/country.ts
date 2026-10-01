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

export async function countryHeaders(): Promise<Record<string, string>> {
  const country = await lookup();
  return country ? { "x-prepix-country": country } : {};
}
