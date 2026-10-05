import { createClient } from "npm:@supabase/supabase-js@2";
import { isTeamEmail } from "./logic/email.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Klijent sa service role ključem, nad šemom outreach. Samo na serveru. */
export function createAdmin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    db: { schema: "outreach" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type Admin = ReturnType<typeof createAdmin>;

/** Prijavljeni član tima iz Authorization zaglavlja, ili null. */
export async function getTeamUser(req: Request, admin: Admin): Promise<{ email: string } | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user?.email || !isTeamEmail(data.user.email)) return null;
  return { email: data.user.email.toLowerCase() };
}
