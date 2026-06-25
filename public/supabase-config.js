// public/supabase-config.js — shared Supabase connection config (C25 item 7).
// The anon key is a PUBLIC client key (safe to ship); centralized here so app.js and checkin.html
// can't drift apart. Loaded as a classic <script> BEFORE app.js (index.html) and before checkin.html's
// inline script, so these become globals both pages read. (Item 1's pure.js uses the same pattern.)
const SUPABASE_URL = 'https://mlzblkzflgylnjorgjcp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1semJsa3pmbGd5bG5qb3JnamNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5MDY1NzEsImV4cCI6MjA2OTQ4MjU3MX0.tqK5lCOKWy1wEaDwNGF6fTo08QxRdhp50LREHMpIVXs';
const SUPABASE_ANON_KEY = SUPABASE_KEY; // alias consumed by checkin.html
// Wave 1d (2026-06-25): the canonical club group for anon self-serve registration. Shared here (one
// owner) so the standalone door (checkin.html) and the in-app kiosk register into the SAME group —
// otherwise the same person checking in at the two doors becomes two rows (dedup keys on name+group)
// and is invisible in the other door's roster, splitting attendance + inflating headcount.
const CLUB_GROUP = 'Athletic Specimen';
