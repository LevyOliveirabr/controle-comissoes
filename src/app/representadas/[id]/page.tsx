import Link from "next/link";
import { notFound } from "next/navigation";
import { FormRepresentada } from "@/components/formularios/representada";
import { Mensagens } from "@/components/mensagens";
import { Card, FormExcluir, Indicador, Pagina, Tabela, Td, Th } from "@/components/ui";
import { excluirRepresentada } from "@/lib/acoes/cadastros";
import { brl } from "@/lib/formato";
import { obterResultado, type ParametrosBusca } from "@/lib/resultado";

export default async function RepresentadaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<ParametrosBusca> }) {
  const { id } = await params;
  const sp = await searchParams;
  const r = await obterResultado({ representada_id: id });
  const rep = r.dados.representadas.find((x) => x.id === id);
  if (!rep) notFound();
  const clientes = r.dados.clientes.filter((c) => c.representada_id === id);

  return (
    <Pagina
      titulo={rep.nome}
      descricao="Representada"
      acoes={
        <>
          <Link href={`/?rep=${id}`} className="text-sm text-sky-700 hover:underline">Dashboard desta representada</Link>
          <FormExcluir acao={excluirRepresentada} id={id} />
        </>
      }
    >
      <Mensagens sp={sp} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Indicador rotulo="A receber (firme)" valor={brl(r.funil.a_receber_firme)} tom="info" />
        <Indicador rotulo="Já recebida" valor={brl(r.funil.ja_recebida)} tom="bom" />
        <Indicador rotulo="Em previsão" valor={brl(r.funil.em_previsao.comissao)} />
        <Indicador rotulo="Pedidos / NFs" valor={`${r.pedidos.filter((p) => p.representada_id === id).length} / ${r.nfs.filter((n) => n.representada_id === id).length}`} />
      </div>

      <Card titulo={`Clientes (${clientes.length})`} rodape={<Link href={`/clientes/novo?rep=${id}`} className="text-sky-700 hover:underline">Novo cliente desta representada →</Link>}>
        {clientes.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum cliente cadastrado.</p>
        ) : (
          <Tabela className="border-0 shadow-none">
            <thead>
              <tr>
                <Th>Cliente</Th>
                <Th>CNPJ</Th>
                <Th>Código na representada</Th>
                <Th num>Comissão a receber</Th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => {
                const cons = r.consolidado.find((l) => l.cliente_id === c.id);
                return (
                  <tr key={c.id}>
                    <Td><Link href={`/clientes/${c.id}`} className="text-sky-700 hover:underline">{c.nome}</Link></Td>
                    <Td>{c.cnpj ?? "—"}</Td>
                    <Td>{c.codigo_externo ?? "—"}</Td>
                    <Td num>{brl(cons?.comissao_a_receber ?? 0)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Tabela>
        )}
      </Card>

      <FormRepresentada r={rep} />
    </Pagina>
  );
}
