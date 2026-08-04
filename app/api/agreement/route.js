import { put } from "@vercel/blob";
import { ADMIN_PASSWORD } from "../../../lib/config";
import { liveProperties, findTenantIn, validateRegistry } from "../../../lib/registry";
import { saveRegistry } from "../../../lib/store";

export const runtime = "nodejs";

// POST /api/agreement  { pw, slug, fileBase64, mediaType, filename }
// Uploads the agreement to Blob and stores its URL on the tenant in the registry.
export async function POST(req) {
  try {
    const body = await req.json();
    if (body.pw !== ADMIN_PASSWORD) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!body.fileBase64) return Response.json({ error: "No file" }, { status: 400 });
    if (!process.env.BLOB_READ_WRITE_TOKEN) return Response.json({ error: "Storage not configured" }, { status: 500 });

    const props = await liveProperties();
    const found = findTenantIn(props, body.slug);
    if (!found) return Response.json({ error: "Unknown tenant" }, { status: 404 });

    // Size guard (~4MB of raw bytes)
    const buf = Buffer.from(body.fileBase64, "base64");
    if (buf.length > 4 * 1024 * 1024) {
      return Response.json({ error: "File too large (max ~4MB). Please compress or photograph fewer pages." }, { status: 413 });
    }

    const ext = (body.mediaType && body.mediaType.includes("pdf")) ? "pdf" : "jpg";
    const blob = await put(`agreements/${body.slug}.${ext}`, buf, {
      access: "public",
      contentType: body.mediaType || "application/octet-stream",
      addRandomSuffix: true,
    });

    // Store the URL on the tenant
    found.tenant.agreementUrl = blob.url;
    found.tenant.agreementName = body.filename || `agreement.${ext}`;
    const err = validateRegistry(props);
    if (err) return Response.json({ error: err }, { status: 400 });
    await saveRegistry(props);

    return Response.json({ ok: true, url: blob.url });
  } catch (e) {
    return Response.json({ error: "Could not upload" }, { status: 500 });
  }
}
