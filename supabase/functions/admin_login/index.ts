// C21 — admin_login Edge Function (deployed to mlzblkzflgylnjorgjcp 2026-06-18).
// "Quick code, server-verified": the client POSTs only { code }. This function verifies it
// against a SERVER-ONLY code map (NOT in the client bundle), self-provisions the matching admin
// identity (role/group in app_metadata, which Supabase embeds in the JWT for RLS), and returns a
// real session. Deployed with verify_jwt=false because it implements its own auth (the code).
// Codes are unchanged from the old client for now; rotation = C21 Phase 4.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.5";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;          // auto-injected by Supabase
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!; // auto-injected
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;            // auto-injected

const SALT = "as_c21_pw_salt_v1"; // server-only; makes the auth password deterministic + non-trivial
const CODES: Record<string, { email: string; role: string; group: string | null }> = {
  "nlvb2025": { email: "owner@athleticspecimen.local", role: "owner",       group: null },
  "kcvb2025": { email: "kc@athleticspecimen.local",    role: "group_admin", group: "KC Volleyball" },
  "asvb2025": { email: "as@athleticspecimen.local",    role: "group_admin", group: "Athletic Specimen" },
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let code = "";
  try { code = String((await req.json())?.code ?? "").trim(); } catch { /* bad body -> falls through to 401 */ }
  const entry = CODES[code];
  if (!entry) return json({ error: "Incorrect admin code" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });
  const password = `${code}__${SALT}`;
  // Idempotent self-provision: create the admin identity if it doesn't exist (role/group -> JWT).
  const { error: cErr } = await admin.auth.admin.createUser({
    email: entry.email, password, email_confirm: true,
    app_metadata: { role: entry.role, group: entry.group, admin: true },
  });
  if (cErr && !/already|registered|exists/i.test(cErr.message || "")) {
    return json({ error: "provision failed", detail: cErr.message }, 500);
  }

  // Mint a real session via password sign-in. The password is server-only — never sent to the client.
  const anon = createClient(SUPABASE_URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email: entry.email, password });
  if (error || !data?.session) return json({ error: "login failed", detail: error?.message }, 500);

  return json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    role: entry.role,
    group: entry.group,
  });
});
