import { query } from "../../../lib/api";
import { getDiagnostics } from "../../../lib/diagnostics";

export const dynamic = "force-dynamic";

export async function GET() {
  return query((viewer) => getDiagnostics(viewer));
}
