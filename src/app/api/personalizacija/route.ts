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
  type Suggestion,
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
    .select("id, company, city, source, notes, group_id, company_id")
    .in("id", ids);
  if (error) return fail(error.message, 500);

  // Podaci firme (sajt, opis, licence) pomažu da se odredi delatnost.
  const companyIds = [...new Set((contacts ?? []).map((c) => c.company_id).filter(Boolean))];
  const { data: companies } = companyIds.length
    ? await supabase.from("companies").select("id, website, description, licenses, segment").in("id", companyIds)
    : { data: [] as { id: string; website: string | null; description: string | null; licenses: string | null; segment: string | null }[] };
  const companyOf = (id: string | null) => (companies ?? []).find((co) => co.id === id);

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
    const co = companyOf(c.company_id);
    const input: PersonalizeInput = { ...c, website: co?.website, description: co?.description, licenses: co?.licenses };
    byLanguage.set(lang, [...(byLanguage.get(lang) ?? []), input]);
  }

  const client = new Anthropic();
  const suggestions: Record<string, Suggestion> = {};
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

  // Trenutna delatnost firme, da se u pregledu vidi šta je već upisano.
  const current = Object.fromEntries(
    (contacts ?? []).map((c) => [c.id, { company_id: c.company_id, segment: companyOf(c.company_id)?.segment ?? null }]),
  );
  return NextResponse.json({ suggestions, companies: current });
}
