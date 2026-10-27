import { PageHeader } from "@/components/PageHeader";
import { ContactsBrowser } from "./ContactsBrowser";

export default async function KontaktiPage({ searchParams }: PageProps<"/kontakti">) {
  const { kontakt } = await searchParams;
  return (
    <>
      <PageHeader title="Kontakti" description="Pretraga, filteri, istorija i izvoz kontakata." />
      <ContactsBrowser initialOpenId={typeof kontakt === "string" ? kontakt : null} />
    </>
  );
}
