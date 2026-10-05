import { PageHeader } from "@/components/PageHeader";
import { GroupsManager } from "./GroupsManager";

export default function GrupePage() {
  return (
    <>
      <PageHeader title="Grupe i šabloni" description="Grupe kontakata. Uređivač sekvenci dolazi u Fazi 3." />
      <GroupsManager />
    </>
  );
}
