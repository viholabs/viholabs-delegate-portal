import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function normText(raw: string): string {
  return raw
    .replace(/\\r\\n/g, "\\n")
    .replace(/[\\t ]+/g, " ")
    .replace(/\\n{3,}/g, "\\n\\n")
    .trim();
}

function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

async function embed1536(input: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");

  const model = "text-embedding-3-small";

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input }),
  });

  const txt = await res.text();
  if (!res.ok) throw new Error(txt);

  const j = JSON.parse(txt);
  const emb = j?.data?.[0]?.embedding;

  if (!Array.isArray(emb) || emb.length !== 1536) {
    throw new Error("Embedding invalid");
  }

  return emb.map(Number);
}

function toVectorLiteral(v: number[]): string {
  return "[" + v.join(",") + "]";
}

type ChunkSource = {
  chunk_id?: string;
  title?: string;
  content?: string;
  similarity?: number;
  [key: string]: unknown;
};

async function generateAnswer(query: string, chunks: ChunkSource[]): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) {
    return chunks.length > 0
      ? `He encontrado ${chunks.length} fuente(s) relevante(s). Configura OPENAI_API_KEY para obtener respuestas generadas.`
      : "No he encontrado información relevante para tu consulta en el corpus actual.";
  }

  const context = chunks
    .map((c, i) => {
      const title = c.title ? `[${c.title}]` : `[Fuente ${i + 1}]`;
      return `${title}\n${c.content ?? ""}`;
    })
    .join("\n\n---\n\n");

  const systemPrompt = chunks.length > 0
    ? `Eres Viholeta, asistente experta de Viholabs Biotech. Responde en español, de forma concisa y profesional, basándote ÚNICAMENTE en las siguientes fuentes del corpus de conocimiento:\n\n${context}\n\nSi la información no está en las fuentes, dilo claramente.`
    : `Eres Viholeta, asistente experta de Viholabs Biotech. No hay fuentes relevantes para esta consulta en el corpus actual. Indica al usuario que no tienes información específica sobre su pregunta y que puede contactar con el equipo de soporte.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
      max_tokens: 1024,
      temperature: 0.2,
    }),
  });

  const txt = await res.text();
  if (!res.ok) throw new Error(`OpenAI error: ${txt}`);

  const j = JSON.parse(txt);
  const answer = j?.choices?.[0]?.message?.content;
  if (!answer) throw new Error("Empty response from OpenAI");

  return String(answer).trim();
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return json(401, { ok: false });

    const user_id = auth.user.id;

    const body = await req.json().catch(() => ({}));
    const input_text = normText(String(body?.input_text ?? ""));

    if (!input_text) return json(400, { ok: false });

    const corpusV = await supabase.rpc("viholeta_corpus_version_current");
    const corpus_version = corpusV.data ?? "unknown";

    const input_hash = sha256Hex(input_text);

    const cacheQ = await supabase
      .from("viholeta_consult_cache")
      .select("content_md, retrieval_used, sources_json")
      .eq("user_id", user_id)
      .eq("input_hash", input_hash)
      .eq("corpus_version", corpus_version)
      .maybeSingle();

    if (cacheQ.data) {
      await supabase.from("viholeta_consult_log").insert({
        user_id,
        input_hash,
        corpus_version,
        cache_hit: true,
        retrieval_used: cacheQ.data.retrieval_used,
        sources_count: cacheQ.data.sources_json.length,
      });

      return json(200, {
        ok: true,
        regime: "consultation",
        cache_hit: true,
        retrieval_used: cacheQ.data.retrieval_used,
        content_md: cacheQ.data.content_md,
        sources: cacheQ.data.sources_json,
      });
    }

    const emb = await embed1536(input_text);
    const vec = toVectorLiteral(emb);

    const sourcesRpc = await supabase.rpc("viholeta_sources_from_retrieval", {
      query_embedding: vec,
      match_count: 3,
    });

    const sources = sourcesRpc.data ?? [];

    const retrieval_used = sources.length > 0;

    const content_md = await generateAnswer(input_text, sources as ChunkSource[]);

    await supabase.from("viholeta_consult_cache").upsert({
      user_id,
      input_hash,
      corpus_version,
      retrieval_used,
      content_md,
      sources_json: sources,
    });

    await supabase.from("viholeta_consult_log").insert({
      user_id,
      input_hash,
      corpus_version,
      cache_hit: false,
      retrieval_used,
      sources_count: sources.length,
    });

    return json(200, {
      ok: true,
      regime: "consultation",
      cache_hit: false,
      retrieval_used,
      content_md,
      sources,
    });
  } catch (e) {
    return json(500, { ok: false, error: String(e) });
  }
}
