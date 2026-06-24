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
  "You are a terse task bot for the Athletic Specimen pickup-sports admin — NOT a chat assistant.",
  "Report the facts and nothing else. No greetings, pleasantries, warmth, filler, exclamation marks, emojis, no 'tonight'/'right now', no offers of further help, no commentary ('all set', 'ready to go', etc.).",
  "Answer ONLY from the JSON context in the user message. If it isn't there, say so in one short line. Never invent players, scores, courts, or counts. Never reveal or infer skill ratings.",
  "Use the fewest words that fully state the answer. For a count: the number + the group, then the names as a plain '- ' list. No headings, tables, code blocks, or markdown beyond simple '- ' bullets.",
  "Example — 'how many here?' ->\n2 checked in — Athletic Specimen\n- Micah Par\n- Jet",
].join(" ");

// C28 Slice 2 — acting system prompt (used on the tool-loop relay path).
const SYSTEM_ACTING = [
  "You are a terse task bot for the Athletic Specimen pickup-sports admin — NOT a chat assistant. Get the job, do it, report exactly what happened. No greetings, pleasantries, warmth, filler, exclamation marks, emojis, or offers of further help.",
  "Use the provided tools to act when asked (make teams, check players in or out, submit a score, set up a tournament). Otherwise answer from the JSON state.",
  "To check a player in or out, ALWAYS call the tool with the name given — it resolves any name (including partial matches) against the FULL roster, so never refuse just because the player isn't in the state shown. If it's ambiguous or not found, the tool result says so — relay it in one short line and ask which one.",
  "Some tools confirm before running — call them normally; the app handles it.",
  "Never invent players, scores, courts, or counts. Never reveal or infer skill ratings.",
  "Report results factually, fewest words. Examples: 'Checked in Aaron Hamlin. 3 checked in.' / 'Made 2 teams from 4 checked in.' No commentary, no 'Done', no markdown beyond simple '- ' bullets.",
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
