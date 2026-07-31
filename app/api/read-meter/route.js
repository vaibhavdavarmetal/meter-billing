import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

// Receives a base64 image, asks Claude to read the meter number, returns it.
export async function POST(req) {
  try {
    const { imageBase64, mediaType } = await req.json();
    if (!imageBase64) {
      return Response.json({ error: "No image provided" }, { status: 400 });
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001", // cheapest current model; ideal for reading a number off a photo
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType || "image/jpeg", data: imageBase64 },
            },
            {
              type: "text",
              text:
                "This is a photo of an electricity sub-meter. Read the main consumption number shown on the display (kWh / units). " +
                "Respond ONLY with a JSON object, no other text, in this exact form: " +
                '{"reading": <number or null>, "confidence": "high"|"medium"|"low", "note": "<short reason if unsure>"}. ' +
                "Ignore decimals after a red digit if present. If you cannot read it clearly, set reading to null and confidence to low.",
            },
          ],
        },
      ],
    });

    const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const clean = text.replace(/```json|```/g, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      parsed = { reading: null, confidence: "low", note: "Could not parse meter" };
    }
    return Response.json(parsed);
  } catch (e) {
    return Response.json({ reading: null, confidence: "low", note: "Server error reading meter" }, { status: 200 });
  }
}
