import { PageHeader } from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { ReplyList, type ReplyRow } from "./ReplyList";

export const dynamic = "force-dynamic";

export default async function OdgovoriPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reply_inbox")
    .select("*")
    .order("replied_at", { ascending: false, nullsFirst: false });

  return (
    <>
      <PageHeader
        title="Odgovori"
        description="Kontakti koji su odgovorili, najnoviji prvi. Sekvenca im je automatski zaustavljena."
      />
      <ReplyList initial={(data ?? []) as ReplyRow[]} />
    </>
  );
}
