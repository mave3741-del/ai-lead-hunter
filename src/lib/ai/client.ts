import { ASSISTANT_MAX_TOKENS, classifyHttpError, defaultShouldRetry, withRetries } from "./retry.ts";
import type { FailureKind } from "./retry.ts";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatResult =
  | { ok: true; text: string; tokensIn: number; tokensOut: number; provider: string; model: string }
  | { ok: false; error: string; failure: FailureKind; retryable: boolean };

function configuredProvider(): string {
  return (process.env.AI_PROVIDER || "xai").toLowerCase();
}

function endpointFor(provider: string): { url: string; key: string | undefined; model: string } {
  if (provider === "openai") {
    return {
      url: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1/chat/completions",
      key: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    };
  }
  if (provider === "anthropic") {
    return {
      url: "https://api.anthropic.com/v1/messages",
      key: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest",
    };
  }
  if (provider === "google") {
    return {
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      key: process.env.GOOGLE_API_KEY,
      model: process.env.GOOGLE_MODEL || "gemini-2.0-flash",
    };
  }
  if (provider === "openrouter") {
    return {
      url: "https://openrouter.ai/api/v1/chat/completions",
      key: process.env.OPENROUTER_API_KEY,
      model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
    };
  }
  return {
    url: process.env.XAI_BASE_URL || "https://api.x.ai/v1/chat/completions",
    key: process.env.XAI_API_KEY,
    model: process.env.XAI_MODEL || "grok-4.5",
  };
}

export function aiAvailable(): boolean {
  const p = configuredProvider();
  const primary = endpointFor(p);
  if (primary.key) return true;
  if (p !== "xai" && process.env.XAI_API_KEY) return true;
  return false;
}

function fallbackChain(): string[] {
  const primary = configuredProvider();
  const extra = (process.env.AI_FALLBACK_PROVIDER || "").toLowerCase().trim();
  const order = [primary];
  if (extra && extra !== primary) order.push(extra);
  for (const p of ["openai", "openrouter", "anthropic", "google", "xai"]) {
    if (!order.includes(p) && endpointFor(p).key) order.push(p);
  }
  return order.filter((p, i) => order.indexOf(p) === i && Boolean(endpointFor(p).key));
}

export async function chatCompletion(opts: {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}): Promise<ChatResult> {
  const chain = fallbackChain();
  let last: ChatResult | null = null;
  for (const provider of chain) {
    const ep = endpointFor(provider);
    if (!ep.key) {
      last = {
        ok: false,
        error: `${provider} is not configured`,
        failure: { kind: "invalid_config" },
        retryable: false,
      };
      continue;
    }
    try {
      const result = await withRetries(() => callOpenAiCompatible(ep, opts), {
        shouldRetry: defaultShouldRetry,
      });
      return result;
    } catch (err) {
      const failure: FailureKind =
        err && typeof err === "object" && "failure" in err
          ? (err as { failure: FailureKind }).failure
          : { kind: "network" };
      const retryable = failure.kind === "http" || failure.kind === "timeout" || failure.kind === "network";
      last = {
        ok: false,
        error: err instanceof Error ? err.message : "AI provider failed",
        failure,
        retryable,
      };
      if (!retryable) return last;
    }
  }
  return last ?? {
    ok: false,
    error: "AI is not available in this environment",
    failure: { kind: "invalid_config" },
    retryable: false,
  };
}

async function callOpenAiCompatible(
  ep: { url: string; key: string | undefined; model: string },
  opts: { messages: ChatMessage[]; maxTokens?: number; temperature?: number },
): Promise<ChatResult> {
  if (!ep.key) {
    const err = Object.assign(new Error("Missing API key"), {
      failure: { kind: "invalid_key" } satisfies FailureKind,
    });
    throw err;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(ep.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ep.key}`,
      },
      body: JSON.stringify({
        model: ep.model,
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? ASSISTANT_MAX_TOKENS,
        messages: opts.messages,
      }),
      signal: controller.signal,
    });
    const bodyText = await res.text();
    if (!res.ok) {
      const failure = classifyHttpError(res.status, bodyText);
      const err = Object.assign(new Error(`AI provider error ${res.status}`), { failure });
      throw err;
    }
    let json: {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    try {
      json = JSON.parse(bodyText) as typeof json;
    } catch {
      const err = Object.assign(new Error("Malformed AI response"), {
        failure: { kind: "malformed" } satisfies FailureKind,
      });
      throw err;
    }
    const text = json.choices?.[0]?.message?.content ?? "";
    return {
      ok: true,
      text,
      tokensIn: json.usage?.prompt_tokens ?? 0,
      tokensOut: json.usage?.completion_tokens ?? 0,
      provider: configuredProvider(),
      model: ep.model,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw Object.assign(new Error("AI request timed out"), {
        failure: { kind: "timeout" } satisfies FailureKind,
      });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Rough USD estimate for grok-class chat. Conservative; for dashboard display only. */
export function estimateCostUsd(tokensIn: number, tokensOut: number): number {
  const inCost = (tokensIn / 1_000_000) * 1.2;
  const outCost = (tokensOut / 1_000_000) * 6;
  return Math.round((inCost + outCost) * 100000) / 100000;
}

export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1] ?? trimmed;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("No JSON object in model output");
  return JSON.parse(raw.slice(start, end + 1));
}
