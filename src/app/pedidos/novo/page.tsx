import { FormPedido } from "@/components/formularios/pedido";
import { Mensagens } from "@/components/mensagens";
import { Pagina } from "@/components/ui";
import { carregarDados } from "@/lib/dados";
import type { ParametrosBusca } from "@/lib/resultado";

export default async function NovoPedidoPage({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  const sp = await searchParams;
  const d = await carregarDados();
  return (
    <Pagina titulo="Novo pedido">
      <Mensagens sp={sp} />
      <FormPedido representadas={d.representadas.filter((r) => r.ativa)} clientes={d.clientes} clientePadrao={typeof sp.cli === "string" ? sp.cli : null} />
    </Pagina>
  );
}
