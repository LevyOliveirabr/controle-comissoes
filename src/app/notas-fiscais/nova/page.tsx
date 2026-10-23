import { FormNotaFiscal } from "@/components/formularios/nota-fiscal";
import { Mensagens } from "@/components/mensagens";
import { Pagina } from "@/components/ui";
import { carregarDados } from "@/lib/dados";
import type { ParametrosBusca } from "@/lib/resultado";

export default async function NovaNfPage({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  const sp = await searchParams;
  const d = await carregarDados();
  const pedidoPadrao = typeof sp.pedido === "string" ? d.pedidos.find((p) => p.id === sp.pedido) : null;
  return (
    <Pagina titulo="Nova nota fiscal de venda" descricao={pedidoPadrao ? `Pedido ${pedidoPadrao.numero}` : undefined}>
      <Mensagens sp={sp} />
      <FormNotaFiscal representadas={d.representadas.filter((r) => r.ativa)} clientes={d.clientes} pedidos={d.pedidos} pedidoPadrao={pedidoPadrao} />
    </Pagina>
  );
}
