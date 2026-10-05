import { PageHeader } from "@/components/PageHeader";
import { ContactsBrowser } from "./ContactsBrowser";

export default function KontaktiPage() {
  return (
    <>
      <PageHeader title="Kontakti" description="Pretraga, filteri i istorija kontakata." />
      <ContactsBrowser />
    </>
  );
}
