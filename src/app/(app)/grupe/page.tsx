import { PageHeader } from "@/components/PageHeader";
import { GroupsManager } from "./GroupsManager";
import { SequenceEditor } from "./SequenceEditor";

export default function GrupePage() {
  return (
    <>
      <PageHeader title="Grupe i šabloni" description="Grupe kontakata i sekvence mejlova." />
      <div className="space-y-10">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Grupe</h2>
          <GroupsManager />
        </section>
        <SequenceEditor />
      </div>
    </>
  );
}
