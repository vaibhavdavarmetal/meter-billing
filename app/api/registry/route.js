import { ADMIN_PASSWORD } from "../../../lib/config";
import { liveProperties, validateRegistry } from "../../../lib/registry";
import { saveRegistry } from "../../../lib/store";

export const runtime = "nodejs";

// GET /api/registry?pw=...  → current live properties
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("pw") !== ADMIN_PASSWORD) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const properties = await liveProperties();
  return Response.json({ properties });
}

// POST /api/registry  { pw, properties }  → save edited registry
export async function POST(req) {
  try {
    const body = await req.json();
    if (body.pw !== ADMIN_PASSWORD) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const err = validateRegistry(body.properties);
    if (err) return Response.json({ error: err }, { status: 400 });
    await saveRegistry(body.properties);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: "Could not save" }, { status: 500 });
  }
}
