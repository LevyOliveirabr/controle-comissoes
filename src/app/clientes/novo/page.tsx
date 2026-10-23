import { FormCliente } from "@/components/formularios/cliente";
import { Mensagens } from "@/components/mensagens";
import { Pagina } from "@/components/ui";
import { carregarDados } from "@/lib/dados";
import type { ParametrosBusca } from "@/lib/resultado";

export default async function NovoClientePage({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  const sp = await searchParams;
  const d = await carregarDados();
  return (
    <Pagina titulo="Novo cliente">
      <Mensagens sp={sp} />
      <FormCliente representadas={d.representadas} representadaPadrao={typeof sp.rep === "string" ? sp.rep : null} />
    </Pagina>
  );
}
