import { FormRepresentada } from "@/components/formularios/representada";
import { Mensagens } from "@/components/mensagens";
import { Pagina } from "@/components/ui";
import type { ParametrosBusca } from "@/lib/resultado";

export default async function NovaRepresentadaPage({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  const sp = await searchParams;
  return (
    <Pagina titulo="Nova representada">
      <Mensagens sp={sp} />
      <FormRepresentada />
    </Pagina>
  );
}
