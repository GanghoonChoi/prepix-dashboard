// Vercel puts the visitor's country on the request at its edge; the API host
// (Railway) has no such header, so the browser asks here and forwards the answer.
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const country = req.headers.get("x-vercel-ip-country") ?? "";
  return Response.json({ country }, { headers: { "Cache-Control": "no-store" } });
}
