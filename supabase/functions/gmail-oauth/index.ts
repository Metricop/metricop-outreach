// Povezivanje Gmail naloga sa mailboxom (OAuth).
// POST {mailbox_id} od prijavljenog člana tima -> vraća Google URL.
// GET ?code&state od Google-a -> čuva refresh token u Vault i vraća korisnika u aplikaciju.

import { authUrl, exchangeCode, getProfile, GMAIL_SCOPES } from "../_shared/gmail.ts";
import { corsHeaders, createAdmin, getTeamUser, json } from "../_shared/http.ts";
import { signState, verifyState } from "../_shared/state.ts";

const APP_URL = Deno.env.get("APP_URL") ?? "https://metricop-outreach.vercel.app";
const REDIRECT_URI = `${Deno.env.get("SUPABASE_URL")}/functions/v1/gmail-oauth`;

const back = (params: Record<string, string>) =>
  Response.redirect(`${APP_URL}/podesavanja?${new URLSearchParams(params)}`, 302);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  try {
    if (req.method === "POST") return await start(req);
    if (req.method === "GET" && (url.searchParams.has("code") || url.searchParams.has("error"))) {
      return await callback(url);
    }
    return json({ error: "Nepoznat zahtev." }, 400);
  } catch (e) {
    console.error(e);
    if (req.method === "GET") return back({ gmail: "greska", razlog: "server" });
    return json({ error: e instanceof Error ? e.message : "Greška na serveru." }, 500);
  }
});

async function start(req: Request) {
  const admin = createAdmin();
  const user = await getTeamUser(req, admin);
  if (!user) return json({ error: "Niste prijavljeni nalogom metricop.com." }, 401);

  const { mailbox_id } = await req.json();
  const { data: mailbox } = await admin.from("mailboxes").select("id, email").eq("id", mailbox_id).single();
  if (!mailbox) return json({ error: "Mailbox ne postoji." }, 404);

  const state = await signState({ m: mailbox.id, u: user.email });
  return json({ url: authUrl(REDIRECT_URI, state, mailbox.email) });
}

async function callback(url: URL) {
  if (url.searchParams.get("error")) return back({ gmail: "greska", razlog: "odbijeno" });

  const state = await verifyState<{ m: string; u: string }>(url.searchParams.get("state") ?? "");
  if (!state) return back({ gmail: "greska", razlog: "istekao_zahtev" });

  const admin = createAdmin();
  const { data: mailbox } = await admin.from("mailboxes").select("id, email").eq("id", state.m).single();
  if (!mailbox) return back({ gmail: "greska", razlog: "nema_mailboxa" });

  const tokens = await exchangeCode(url.searchParams.get("code")!, REDIRECT_URI);
  if (!tokens.refresh_token) return back({ gmail: "greska", razlog: "nema_tokena" });

  const missing = GMAIL_SCOPES.filter((s) => !(tokens.scope ?? "").split(" ").includes(s));
  if (missing.length) return back({ gmail: "greska", razlog: "dozvole" });

  const profile = await getProfile(tokens.access_token);
  if (profile.emailAddress.toLowerCase() !== mailbox.email.toLowerCase()) {
    return back({ gmail: "greska", razlog: "pogresan_nalog", nalog: profile.emailAddress });
  }

  const { error } = await admin.rpc("store_mailbox_token", {
    p_mailbox_id: mailbox.id,
    p_refresh_token: tokens.refresh_token,
    p_scopes: GMAIL_SCOPES,
  });
  if (error) throw new Error(error.message);

  console.log(`Mailbox ${mailbox.email} povezan (korisnik ${state.u}).`);
  return back({ gmail: "ok" });
}
