export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    status: "ok",
    product: "WonderDrive",
    phase: 3,
    capabilities: {
      publicShell: true,
      serverRoutes: true,
      d1Declared: true,
      durableJourneys: true,
      guestIdentity: true,
      deterministicResearchFixture: true,
      liveForegroundResearch: true,
      openAIResponses: true,
      webSearch: true,
      structuredOutputValidation: true,
      usageAccounting: true,
      modelRegistry: true,
      performerContracts: true,
      preferences: true,
      journeySnapshots: true,
      journeyExport: true,
      deliberateGuestUpgrade: true,
      costGuardrails: true,
      backgroundJobs: false,
    },
  });
}
