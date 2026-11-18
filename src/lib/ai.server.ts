// Model calls in OpenAI chat format: Google AI Studio (user keys) and the built-in fallback.
import { redactSecrets } from "./crypto.server";

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
  extra_content?: unknown;
};

export type ChatMsg =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[]; [k: string]: unknown }
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolDef = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type AIErrorKind = "quota" | "invalid" | "model" | "credits" | "network" | "other";

export class AIError extends Error {
  kind: AIErrorKind;
  status: number;
  constructor(kind: AIErrorKind, status: number, message: string) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

export const BUILTIN_MODEL = "google/gemini-3.8-flash";
const GEMINI_OPENAI = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

function classifyGemini(status: number, body: string): AIErrorKind {
  if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(body)) return "quota";
  if (/API_KEY_INVALID|API key not valid|PERMISSION_DENIED|unregistered callers/i.test(body) || status === 401 || status === 403)
    return "invalid";
  if (status === 404 || /model.*not found|is not found|not supported/i.test(body)) return "model";
  return "other";
}

async function post(url: string, headers: Record<string, string>, body: unknown) {
  try {
    return await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  } catch (e) {
    throw new AIError("network", 0, redactSecrets(`Falha de rede: ${(e as Error).message}`));
  }
}

export type CompletionResult = { message: Extract<ChatMsg, { role: "assistant" }>; usage?: unknown };

export async function callGemini(
  apiKey: string,
  model: string,
  messages: ChatMsg[],
  tools?: ToolDef[],
  maxTokens?: number,
): Promise<CompletionResult> {
  const res = await post(GEMINI_OPENAI, { Authorization: `Bearer ${apiKey}` }, {
    model: model.replace(/^models\//, ""),
    messages,
    ...(tools?.length ? { tools, tool_choice: "auto" } : {}),
    ...(maxTokens ? { max_tokens: maxTokens } : {}),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new AIError(classifyGemini(res.status, text), res.status, redactSecrets(`Gemini ${res.status}: ${text.slice(0, 600)}`));
  }
  const json = JSON.parse(text) as { choices?: { message: CompletionResult["message"] }[]; usage?: unknown };
  const message = json.choices?.[0]?.message;
  if (!message) throw new AIError("other", 200, "Resposta vazia do Gemini");
  return { message, usage: json.usage };
}

export async function callBuiltin(messages: ChatMsg[], tools?: ToolDef[], maxTokens?: number): Promise<CompletionResult> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new AIError("invalid", 0, "Reserva embutida indisponível neste ambiente");
  const res = await post(GATEWAY, { Authorization: `Bearer ${key}` }, {
    model: BUILTIN_MODEL,
    messages,
    ...(tools?.length ? { tools, tool_choice: "auto" } : {}),
    ...(maxTokens ? { max_tokens: maxTokens } : {}),
  });
  const text = await res.text();
  if (!res.ok) {
    const kind: AIErrorKind = res.status === 429 ? "quota" : res.status === 402 ? "credits" : "other";
    throw new AIError(kind, res.status, `Reserva embutida ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = JSON.parse(text) as { choices?: { message: CompletionResult["message"] }[]; usage?: unknown };
  const message = json.choices?.[0]?.message;
  if (!message) throw new AIError("other", 200, "Resposta vazia da reserva embutida");
  return { message, usage: json.usage };
}

/** Cheap real call that proves the key works and has quota right now. */
export async function pingGemini(apiKey: string, model: string): Promise<{ ok: true } | { ok: false; kind: AIErrorKind; error: string }> {
  try {
    await callGemini(apiKey, model, [{ role: "user", content: "Responda apenas: ok" }], undefined, 16);
    return { ok: true };
  } catch (e) {
    if (e instanceof AIError) return { ok: false, kind: e.kind, error: e.message };
    return { ok: false, kind: "other", error: redactSecrets(String(e)) };
  }
}

export async function listGeminiModels(apiKey: string): Promise<string[]> {
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
    headers: { "x-goog-api-key": apiKey },
  });
  const text = await res.text();
  if (!res.ok) throw new AIError(classifyGemini(res.status, text), res.status, redactSecrets(`Gemini ${res.status}: ${text.slice(0, 300)}`));
  const json = JSON.parse(text) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  return (json.models ?? [])
    .filter((m) => m.name.includes("gemini") && (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .sort();
}
