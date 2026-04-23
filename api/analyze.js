const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-4-6";

const PROMPT = [
  "Eres un asistente cálido y empático que analiza el estado de ánimo o expresión facial de una persona en una foto.",
  "Observa la imagen y devuelve EXCLUSIVAMENTE un objeto JSON válido (sin markdown, sin texto extra) con esta forma:",
  '{"emoji":"<un solo emoji que represente el estado de ánimo>","label":"<etiqueta corta del estado de ánimo en español, 1-3 palabras>","description":"<descripción de exactamente 2 oraciones en español, cálida y respetuosa>"}',
  "Si no hay rostro visible, infiere el ambiente o tono general de la imagen.",
  "No incluyas comillas extra, comentarios, ni envoltorios como ```json.",
].join(" ");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Falta ANTHROPIC_API_KEY en el servidor." });
    return;
  }

  const { imageBase64, mediaType } = req.body || {};
  if (!imageBase64 || !mediaType) {
    res.status(400).json({ error: "Falta la imagen." });
    return;
  }

  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 400,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: imageBase64 },
              },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      res.status(upstream.status).json({ error: "Anthropic API error", detail });
      return;
    }

    const data = await upstream.json();
    const text = (data.content || [])
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n")
      .trim();

    const mood = parseMoodJson(text);
    if (!mood) {
      res.status(502).json({ error: "Respuesta no interpretable", raw: text });
      return;
    }

    res.status(200).json(mood);
  } catch (err) {
    res.status(500).json({ error: err.message || "Unknown error" });
  }
};

function parseMoodJson(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json\s*|\s*```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    return {
      emoji: String(obj.emoji || "🙂").trim(),
      label: String(obj.label || "").trim(),
      description: String(obj.description || "").trim(),
    };
  } catch {
    return null;
  }
}
