// De Tracémolen — AI Provider (server-only)
// Generation: Lovable AI Gateway (LOVABLE_API_KEY) — default google/gemini-2.5-pro
// Embeddings: OpenAI (OPENAI_API_KEY) — text-embedding-3-small @ 1536 dim

if (typeof window !== "undefined") {
  throw new Error("ai-provider.server.ts mag niet in de browser laden.");
}

export interface EmbedOptions {
  input: string[];
  dimensionality?: number;
}

export interface GenerateOptions {
  system: string;
  user: string;
  maxTokens?: number;
}

export interface GenerateResult {
  text: string;
  input_tokens: number | null;
  output_tokens: number | null;
  model: string;
}

export interface AIProvider {
  readonly embeddingModel: string;
  readonly generationModel: string;
  embed(opts: EmbedOptions): Promise<number[][]>;
  generate(opts: GenerateOptions): Promise<GenerateResult>;
}

const LOVABLE_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const OPENAI_EMBEDDINGS = "https://api.openai.com/v1/embeddings";

export function getAIProvider(): AIProvider {
  const embeddingModel =
    process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
  const generationModel =
    process.env.GENERATION_MODEL ?? "google/gemini-2.5-pro";

  const lovableKey = process.env.LOVABLE_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!lovableKey) {
    throw new Error("LOVABLE_API_KEY ontbreekt — Lovable AI niet geconfigureerd.");
  }
  if (!openaiKey) {
    throw new Error("OPENAI_API_KEY ontbreekt — embeddings niet beschikbaar.");
  }

  return {
    embeddingModel,
    generationModel,
    embed: (opts) => openaiEmbed(openaiKey, embeddingModel, opts),
    generate: (opts) => lovableGenerate(lovableKey, generationModel, opts),
  };
}

async function openaiEmbed(
  apiKey: string,
  model: string,
  opts: EmbedOptions,
): Promise<number[][]> {
  const body: Record<string, unknown> = {
    model,
    input: opts.input.map((t) => t.substring(0, 8000)),
  };
  if (opts.dimensionality) body.dimensions = opts.dimensionality;

  return await withRetry(async () => {
    const res = await fetch(OPENAI_EMBEDDINGS, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new ApiError("openai-embed", res.status, await res.text());
    }
    const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return json.data.map((d) => d.embedding);
  });
}

async function lovableGenerate(
  apiKey: string,
  model: string,
  opts: GenerateOptions,
): Promise<GenerateResult> {
  return await withRetry(async () => {
    const res = await fetch(LOVABLE_GATEWAY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        max_completion_tokens: opts.maxTokens ?? 4000,
      }),
    });
    if (!res.ok) {
      throw new ApiError("lovable-generate", res.status, await res.text());
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = json.choices?.[0]?.message?.content ?? "";
    return {
      text,
      input_tokens: json.usage?.prompt_tokens ?? null,
      output_tokens: json.usage?.completion_tokens ?? null,
      model,
    };
  });
}

export class ApiError extends Error {
  constructor(
    public readonly label: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`[${label}] HTTP ${status}: ${body.substring(0, 500)}`);
  }
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const isRetryable =
        e instanceof ApiError && (e.status === 429 || e.status >= 500);
      if (!isRetryable || attempt === maxRetries) throw e;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  throw lastErr;
}

export function cosine(a: number[] | null, b: number[] | null): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

// pgvector accepts either a stringified array or float8[]; use string form.
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

// Parse pgvector text representation back to number[].
export function parseVector(v: unknown): number[] | null {
  if (!v) return null;
  if (Array.isArray(v)) return v as number[];
  if (typeof v === "string") {
    try {
      const trimmed = v.trim().replace(/^\[/, "").replace(/\]$/, "");
      if (!trimmed) return null;
      return trimmed.split(",").map(Number);
    } catch {
      return null;
    }
  }
  return null;
}
