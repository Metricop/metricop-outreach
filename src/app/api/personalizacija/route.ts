import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_PERSONALIZE,
  parseSuggestions,
  SUGGESTIONS_SCHEMA,
  systemPrompt,
  userContent,
  type PersonalizeInput,
} from "@/lib/personalize";
import { isTeamEmail } from "@logic/email.ts";

export const maxDuration = 120;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isTeamEmail(user.email)) return fail("Niste prijavljeni nalogom metricop.com.", 401);
  if (!process.env.ANTHROPIC_API_KEY) return fail("Claude API ključ nije podešen (ANTHROPIC_API_KEY na Vercel-u).", 503);

  const { contact_ids } = (await request.json().catch(() => ({}))) as { contact_ids?: unknown };
  const ids = Array.isArray(contact_ids) ? contact_ids.filter((x): x is string => typeof x === "string") : [];
  if (ids.length === 0) return fail("Izaberite kontakte.", 400);
  if (ids.length > MAX_PERSONALIZE) return fail(`Najviše ${MAX_PERSONALIZE} kontakata odjednom.`, 400);

  const { data: contacts, error } = await supabase
    .from("contacts")
    .select("id, company, city, source, notes, group_id")
    .in("id", ids);
  if (error) return fail(error.message, 500);

  // Jezik predloga = jezik sekvence grupe (srpski ako grupa nema sekvencu).
  const groupIds = [...new Set((contacts ?? []).map((c) => c.group_id).filter(Boolean))];
  const { data: groups } = groupIds.length
    ? await supabase.from("groups").select("id, sequence_id").in("id", groupIds)
    : { data: [] as { id: string; sequence_id: string | null }[] };
  const seqIds = [...new Set((groups ?? []).map((g) => g.sequence_id).filter(Boolean))];
  const { data: sequences } = seqIds.length
    ? await supabase.from("sequences").select("id, language").in("id", seqIds)
    : { data: [] as { id: string; language: string }[] };
  const languageOf = (groupId: string | null) => {
    const seq = (groups ?? []).find((g) => g.id === groupId)?.sequence_id;
    return (sequences ?? []).find((s) => s.id === seq)?.language ?? "sr";
  };

  const byLanguage = new Map<string, PersonalizeInput[]>();
  for (const c of contacts ?? []) {
    const lang = languageOf(c.group_id);
    byLanguage.set(lang, [...(byLanguage.get(lang) ?? []), c]);
  }

  const client = new Anthropic();
  const suggestions: Record<string, string> = {};
  try {
    for (const [language, list] of byLanguage) {
      const response = await client.beta.messages.create({
        model: "claude-opus-5-5",
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: { type: "json_schema", schema: SUGGESTIONS_SCHEMA } },
        system: systemPrompt(language),
        messages: [{ role: "user", content: userContent(list) }],
      });
      if (response.stop_reason === "refusal") return fail("Claude je odbio zahtev. Probajte sa drugim kontaktima.", 502);
      const text = response.content.find((b) => b.type === "text");
      if (!text || text.type !== "text") return fail("Claude nije vratio predloge.", 502);
      Object.assign(suggestions, parseSuggestions(text.text, list.map((c) => c.id)));
    }
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return fail("Claude API ključ nije ispravan.", 502);
    if (e instanceof Anthropic.RateLimitError) return fail("Previše zahteva ka Claude-u. Probajte za minut.", 429);
    if (e instanceof Anthropic.APIError) return fail(`Claude API greška (${e.status}).`, 502);
    if (e instanceof SyntaxError) return fail("Odgovor Claude-a nije mogao da se pročita.", 502);
    throw e;
  }

  return NextResponse.json({ suggestions });
}
