export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    status: "ok",
    product: "WonderDrive",
    phase: 1,
    capabilities: {
      publicShell: true,
      serverRoutes: true,
      d1Declared: true,
      durableJourneys: true,
      guestIdentity: true,
      deterministicResearchFixture: true,
      liveResearch: false,
    },
  });
}
