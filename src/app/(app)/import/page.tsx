import { PageHeader } from "@/components/PageHeader";
import { ImportWizard } from "./ImportWizard";

export default function ImportPage() {
  return (
    <>
      <PageHeader title="Import" description="Uvoz kontakata iz CSV ili XLSX fajla." />
      <ImportWizard />
    </>
  );
}
