export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    status: "ok",
    product: "WonderDrive",
    phase: 0,
    capabilities: {
      publicShell: true,
      serverRoutes: true,
      d1Declared: true,
      liveResearch: false,
    },
  });
}
