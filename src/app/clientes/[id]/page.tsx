import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeFaturamento } from "@/components/badges";
import { FormCliente } from "@/components/formularios/cliente";
import { Mensagens } from "@/components/mensagens";
import { Card, FormExcluir, Indicador, Pagina, Tabela, Td, Th } from "@/components/ui";
import { excluirCliente } from "@/lib/acoes/cadastros";
import { brl, data } from "@/lib/formato";
import { obterResultado, type ParametrosBusca } from "@/lib/resultado";

export default async function ClientePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<ParametrosBusca> }) {
  const { id } = await params;
  const sp = await searchParams;
  const r = await obterResultado({ cliente_id: id });
  const cliente = r.dados.clientes.find((c) => c.id === id);
  if (!cliente) notFound();
  const cons = r.consolidado.find((l) => l.cliente_id === id);
  const pedidos = r.pedidos.filter((p) => p.cliente_id === id);

  return (
    <Pagina
      titulo={cliente.nome}
      descricao={`Cliente de ${r.representadas.get(cliente.representada_id)?.nome}`}
      acoes={
        <>
          <Link href={`/?rep=${cliente.representada_id}&cli=${id}`} className="text-sm text-sky-700 hover:underline">Dashboard deste cliente</Link>
          <FormExcluir acao={excluirCliente} id={id} />
        </>
      }
    >
      <Mensagens sp={sp} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Indicador rotulo="Carteira firme" valor={brl(cons?.carteira ?? 0)} />
        <Indicador rotulo="Já faturado" valor={brl(cons?.ja_faturado ?? 0)} />
        <Indicador rotulo="Comissão recebida" valor={brl(cons?.comissao_recebida ?? 0)} tom="bom" />
        <Indicador rotulo="Comissão a receber" valor={brl(cons?.comissao_a_receber ?? 0)} tom="info" />
      </div>

      <Card titulo={`Pedidos (${pedidos.length})`} rodape={<Link href={`/pedidos/novo?cli=${id}`} className="text-sky-700 hover:underline">Novo pedido para este cliente →</Link>}>
        {pedidos.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum pedido.</p>
        ) : (
          <Tabela className="border-0 shadow-none">
            <thead>
              <tr>
                <Th>Pedido</Th>
                <Th>Data</Th>
                <Th>Situação</Th>
                <Th num>Valor</Th>
                <Th num>Saldo a faturar</Th>
                <Th num>Comissão total</Th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <tr key={p.id}>
                  <Td><Link href={`/pedidos/${p.id}`} className="text-sky-700 hover:underline">{p.numero}</Link></Td>
                  <Td>{data(p.data_pedido)}</Td>
                  <Td><BadgeFaturamento situacao={p.situacao_faturamento} comercial={p.situacao_comercial} /></Td>
                  <Td num>{brl(p.valor_total)}</Td>
                  <Td num>{brl(p.saldo_a_faturar)}</Td>
                  <Td num>{brl(p.comissao_total)}</Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Card>

      <FormCliente c={cliente} representadas={r.dados.representadas} />
    </Pagina>
  );
}
