import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { decryptSecret, encryptSecret, redactSecrets, secretHint } from "./crypto.server";
import { listGeminiModels, pingGemini } from "./ai.server";
import { getAuthenticatedUser } from "./github.server";

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

const geminiInput = z.object({
  name: z.string().trim().min(1).max(80),
  apiKey: z.string().trim().min(20).max(200),
  model: z.string().trim().min(1).max(80),
  googleProject: z.string().trim().max(120).optional().default(""),
  setPrimary: z.boolean().optional().default(false),
});

export const addGeminiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => geminiInput.parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { count } = await db.from("api_connections").select("id", { count: "exact", head: true }).eq("user_id", context.userId).eq("provider", "gemini");
    const primary = data.setPrimary || !count;
    if (primary) await db.from("api_connections").update({ is_primary: false }).eq("user_id", context.userId).eq("provider", "gemini");
    const { data: row, error } = await db
      .from("api_connections")
      .insert({
        user_id: context.userId,
        provider: "gemini",
        name: data.name,
        model: data.model,
        google_project: data.googleProject || null,
        secret_ciphertext: await encryptSecret(data.apiKey),
        secret_hint: secretHint(data.apiKey),
        is_primary: primary,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateGeminiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(80).optional(),
      model: z.string().trim().min(1).max(80).optional(),
      googleProject: z.string().trim().max(120).optional(),
      isActive: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.model !== undefined) patch.model = data.model;
    if (data.googleProject !== undefined) patch.google_project = data.googleProject || null;
    if (data.isActive !== undefined) patch.is_active = data.isActive;
    const { error } = await db.from("api_connections").update(patch).eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setPrimaryKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: row } = await db.from("api_connections").select("id, provider").eq("id", data.id).eq("user_id", context.userId).single();
    if (!row) throw new Error("Chave não encontrada");
    await db.from("api_connections").update({ is_primary: false }).eq("user_id", context.userId).eq("provider", row.provider);
    await db.from("api_connections").update({ is_primary: true, is_active: true }).eq("id", row.id);
    return { ok: true };
  });

export const deleteConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: row } = await db.from("api_connections").select("id, provider, is_primary").eq("id", data.id).eq("user_id", context.userId).single();
    if (!row) throw new Error("Conexão não encontrada");
    const { error } = await db.from("api_connections").delete().eq("id", row.id);
    if (error) throw new Error(error.message);
    if (row.is_primary) {
      const { data: next } = await db.from("api_connections").select("id").eq("user_id", context.userId).eq("provider", row.provider).eq("is_active", true).order("created_at").limit(1).maybeSingle();
      if (next) await db.from("api_connections").update({ is_primary: true }).eq("id", next.id);
    }
    return { ok: true };
  });

export const testGeminiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: row } = await db.from("api_connections").select("id, model, secret_ciphertext, metadata").eq("id", data.id).eq("user_id", context.userId).eq("provider", "gemini").single();
    if (!row) throw new Error("Chave não encontrada");
    const key = await decryptSecret(row.secret_ciphertext);
    let models: string[] = [];
    let modelsError: string | null = null;
    try {
      models = await listGeminiModels(key);
    } catch (e) {
      modelsError = redactSecrets((e as Error).message);
    }
    const ping = await pingGemini(key, row.model ?? "gemini-2.5-flash");
    const now = new Date().toISOString();
    const status = ping.ok ? "ok" : ping.kind === "quota" ? "quota_exceeded" : ping.kind === "invalid" ? "invalid" : "error";
    await db
      .from("api_connections")
      .update({
        status,
        last_tested_at: now,
        last_error: ping.ok ? null : ping.error,
        quota_exceeded_at: ping.ok ? null : ping.kind === "quota" ? now : undefined,
        metadata: { ...((row.metadata as Record<string, unknown>) ?? {}), models: models.length ? models : ((row.metadata as { models?: string[] })?.models ?? []) },
      })
      .eq("id", row.id);
    return { ok: ping.ok, status, error: ping.ok ? null : ping.error, kind: ping.ok ? null : ping.kind, models: models.length, modelsError };
  });

export const saveGithubToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ name: z.string().trim().min(1).max(80), token: z.string().trim().min(20).max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    let user;
    try {
      user = await getAuthenticatedUser(data.token);
    } catch (e) {
      throw new Error(`Token recusado pelo GitHub: ${redactSecrets((e as Error).message)}`);
    }
    const db = await admin();
    const fields = {
      name: data.name,
      secret_ciphertext: await encryptSecret(data.token),
      secret_hint: secretHint(data.token),
      status: "ok",
      last_tested_at: new Date().toISOString(),
      last_error: null,
      is_active: true,
      is_primary: true,
      metadata: { login: user.login, name: user.name, avatar_url: user.avatar_url, scopes: user.scopes },
    };
    const { data: existing } = await db.from("api_connections").select("id").eq("user_id", context.userId).eq("provider", "github").limit(1).maybeSingle();
    if (existing) {
      const { error } = await db.from("api_connections").update(fields).eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db.from("api_connections").insert({ ...fields, user_id: context.userId, provider: "github" });
      if (error) throw new Error(error.message);
    }
    return { login: user.login, scopes: user.scopes };
  });

export const testGithub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const { data: row } = await db.from("api_connections").select("id, secret_ciphertext, metadata").eq("user_id", context.userId).eq("provider", "github").limit(1).maybeSingle();
    if (!row) throw new Error("GitHub não conectado");
    const now = new Date().toISOString();
    try {
      const user = await getAuthenticatedUser(await decryptSecret(row.secret_ciphertext));
      await db.from("api_connections").update({ status: "ok", last_tested_at: now, last_error: null, metadata: { ...((row.metadata as object) ?? {}), login: user.login, avatar_url: user.avatar_url, scopes: user.scopes } }).eq("id", row.id);
      return { ok: true, login: user.login, scopes: user.scopes, error: null };
    } catch (e) {
      const msg = redactSecrets((e as Error).message);
      await db.from("api_connections").update({ status: "invalid", last_tested_at: now, last_error: msg }).eq("id", row.id);
      return { ok: false, login: null, scopes: null, error: msg };
    }
  });
