// C28 — copilot Edge Function (read-only AI assistant for admins). Holds ANTHROPIC_API_KEY
// (Supabase secret); the client bundle never sees it. Admin-only: requires the admin session JWT
// minted by admin_login (app_metadata.admin === true) — players, who have no admin JWT, get 401.
// Read-only: this function only ANSWERS; it never writes. Mirrors admin_login's CORS + generic-error
// hardening. The snapshot it receives is already skill-redacted by buildCopilotContext on the client.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.5";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const MODEL = "claude-haiku-4-5";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

const SYSTEM = [
  "You are the Athletic Specimen admin co-pilot, helping the organizer run a pickup volleyball/basketball night.",
  "Answer ONLY from the JSON context in the user message. If the answer isn't in the context, say you don't have that info — never invent players, scores, courts, or counts.",
  "Never discuss, rank by, or infer player skill ratings — they are private and are not in your context.",
  "Be concise and courtside-friendly: a few short lines for a phone chat bubble. Use plain sentences, or simple '- ' bullets for a short list, and at most **bold** on a key number. Do not use headings, tables, or code blocks. Never use emojis.",
].join(" ");

// C28 Slice 2 — acting system prompt (used on the tool-loop relay path).
const SYSTEM_ACTING = [
  "You are the Athletic Specimen admin co-pilot, helping the organizer run a pickup volleyball/basketball night.",
  "You can ANSWER from the JSON state in the user message, and you can ACT using the provided tools when the admin asks you to do something (make teams, check players in or out, submit a score, set up a tournament).",
  "To check a player in or out, ALWAYS call the tool with the name the admin gave — the tool looks it up in the FULL player roster (including partial matches), so never refuse or claim you can't find someone just because they aren't in the state shown to you. If the name matches more than one player or none, the tool result will tell you — relay that and ask the admin which one.",
  "Some tools require the admin to confirm before they run — just call them normally; the app handles the confirmation and returns the result.",
  "Never invent players, scores, courts, or counts. Never discuss, rank by, or infer player skill ratings — they are private.",
  "Be concise and courtside-friendly: a few short lines for a phone chat bubble; at most **bold** on a key number; no headings, tables, or code blocks. Never use emojis.",
].join(" ");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    const reqHeaders = req.headers.get("access-control-request-headers");
    return new Response("ok", { headers: reqHeaders ? { ...cors, "Access-Control-Allow-Headers": reqHeaders } : cors });
  }
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // admin gate: require a valid admin session JWT (app_metadata.admin === true)
  const authz = req.headers.get("Authorization") || "";
  const jwt = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!jwt) return json({ error: "unauthorized" }, 401);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });
  let isAdmin = false;
  try {
    const { data, error } = await admin.auth.getUser(jwt);
    isAdmin = !error && !!data?.user && (data.user.app_metadata as Record<string, unknown>)?.admin === true;
  } catch (_e) {
    isAdmin = false;
  }
  if (!isAdmin) return json({ error: "unauthorized" }, 401);

  // parse body once
  let body: Record<string, unknown> = {};
  try { body = ((await req.json()) ?? {}) as Record<string, unknown>; } catch { /* bad body */ }

  // --- Slice 2: tool-loop relay (the browser drives the loop; one Claude call per step) ---
  if (Array.isArray((body as { messages?: unknown }).messages)) {
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1024,
          system: SYSTEM_ACTING,
          tools: Array.isArray((body as { tools?: unknown }).tools) ? (body as { tools: unknown }).tools : [],
          messages: (body as { messages: unknown }).messages,
        }),
      });
      if (!resp.ok) { console.error("anthropic relay error", resp.status, await resp.text()); return json({ error: "co-pilot unavailable" }, 502); }
      const data = await resp.json();
      return json({ stop_reason: data?.stop_reason ?? null, content: Array.isArray(data?.content) ? data.content : [] });
    } catch (e) {
      console.error("copilot relay failed", (e as Error)?.message);
      return json({ error: "co-pilot unavailable" }, 502);
    }
  }

  // --- Slice 1: single read-only question ---
  const question = String((body as { question?: unknown }).question ?? "").trim();
  const context = (body as { context?: unknown }).context ?? {};
  if (!question) return json({ error: "empty question" }, 400);

  // one Haiku call
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM,
        messages: [{
          role: "user",
          content: `Here is the current state as JSON:\n${JSON.stringify(context)}\n\nQuestion: ${question}`,
        }],
      }),
    });
    if (!resp.ok) {
      console.error("anthropic error", resp.status, await resp.text());
      return json({ error: "co-pilot unavailable" }, 502);
    }
    const data = await resp.json();
    const answer = Array.isArray(data?.content)
      ? data.content.filter((b: { type?: string }) => b?.type === "text").map((b: { text?: string }) => b.text || "").join("").trim()
      : "";
    return json({ answer: answer || "I couldn't come up with an answer from the current state." });
  } catch (e) {
    console.error("copilot call failed", (e as Error)?.message);
    return json({ error: "co-pilot unavailable" }, 502);
  }
});
