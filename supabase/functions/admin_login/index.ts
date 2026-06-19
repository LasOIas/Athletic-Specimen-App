// C21 — admin_login Edge Function (deployed to mlzblkzflgylnjorgjcp).
// "Quick code, server-verified": the client POSTs only { code }. This function verifies it against a
// SERVER-ONLY code map (NOT in the client bundle), self-provisions the matching admin identity
// (role/group in app_metadata, embedded in the JWT for RLS), and returns a real session. Deployed
// with verify_jwt=false because it implements its own auth (the code).
// Audit hardening (#7): per-IP rate limit (logged failed attempts in action_log; 429 after a burst),
// failed-attempt logging for alerting, and GENERIC 5xx bodies (stage detail only to server logs).
// Codes are still the originals here pending the high-entropy rotation (audit #1b) — the real
// brute-force mitigation; this throttle bounds abuse in the meantime.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.5";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const SALT = "as_c21_pw_salt_v1"; // server-only; makes the auth password deterministic + non-trivial
const CODES: Record<string, { email: string; role: string; group: string | null }> = {
  "nlvb2025": { email: "owner@athleticspecimen.local", role: "owner",       group: null },
  "kcvb2025": { email: "kc@athleticspecimen.local",    role: "group_admin", group: "KC Volleyball" },
  "asvb2025": { email: "as@athleticspecimen.local",    role: "group_admin", group: "Athletic Specimen" },
};

const FAIL_WINDOW_MIN = 10; // rolling window
const FAIL_MAX = 10;        // failed attempts per IP per window before 429

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    const reqHeaders = req.headers.get("access-control-request-headers");
    return new Response("ok", { headers: reqHeaders ? { ...cors, "Access-Control-Allow-Headers": reqHeaders } : cors });
  }
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });

  // Per-IP rate limit: too many recent failed attempts -> 429. Never block on the rate-check failing.
  try {
    const since = new Date(Date.now() - FAIL_WINDOW_MIN * 60 * 1000).toISOString();
    const { count } = await admin
      .from("action_log")
      .select("*", { count: "exact", head: true })
      .eq("action", "admin_login_fail")
      .eq("detail", ip)
      .gte("at", since);
    if ((count ?? 0) >= FAIL_MAX) return json({ error: "too many attempts, try again later" }, 429);
  } catch (_e) { /* fail open on the throttle */ }

  let code = "";
  try { code = String((await req.json())?.code ?? "").trim(); } catch { /* bad body -> wrong code */ }
  const entry = CODES[code];
  if (!entry) {
    try {
      await admin.from("action_log").insert({ actor: "anon", role: "public", action: "admin_login_fail", entity_type: "auth", detail: ip });
    } catch (_e) { /* logging best-effort */ }
    return json({ error: "Incorrect admin code" }, 401);
  }

  const password = `${code}__${SALT}`;
  // Idempotent self-provision: create the admin identity if missing (role/group -> JWT).
  const { error: cErr } = await admin.auth.admin.createUser({
    email: entry.email, password, email_confirm: true,
    app_metadata: { role: entry.role, group: entry.group, admin: true },
  });
  if (cErr && !/already|registered|exists/i.test(cErr.message || "")) {
    console.error("admin_login provision failed:", cErr.message);
    return json({ error: "login failed" }, 500); // generic body; detail in server logs only
  }

  // Mint a real session via password sign-in. The password is server-only — never sent to the client.
  const anon = createClient(SUPABASE_URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email: entry.email, password });
  if (error || !data?.session) {
    console.error("admin_login signin failed:", error?.message);
    return json({ error: "login failed" }, 500); // generic body
  }

  return json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    role: entry.role,
    group: entry.group,
  });
});
