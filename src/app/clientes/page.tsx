import Link from "next/link";
import { FiltroGlobal } from "@/components/filtro-global";
import { Mensagens } from "@/components/mensagens";
import { BotaoLink, Pagina, Tabela, Td, Th } from "@/components/ui";
import { brl } from "@/lib/formato";
import { filtroDaBusca, obterResultado, type ParametrosBusca } from "@/lib/resultado";

export default async function ClientesPage({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  const sp = await searchParams;
  const filtro = filtroDaBusca(sp);
  const r = await obterResultado(filtro);
  const clientes = r.dados.clientes.filter((c) => !filtro.representada_id || c.representada_id === filtro.representada_id);

  return (
    <Pagina titulo="Clientes" acoes={<BotaoLink href={`/clientes/novo${filtro.representada_id ? `?rep=${filtro.representada_id}` : ""}`}>Novo cliente</BotaoLink>}>
      <Mensagens sp={sp} />
      <FiltroGlobal filtro={filtro} representadas={r.dados.representadas} clientes={r.dados.clientes} />
      <Tabela>
        <thead>
          <tr>
            <Th>Cliente</Th>
            <Th>Representada</Th>
            <Th>CNPJ</Th>
            <Th>Código</Th>
            <Th num>Carteira firme</Th>
            <Th num>Saldo a faturar</Th>
            <Th num>Comissão a receber</Th>
          </tr>
        </thead>
        <tbody>
          {clientes.map((c) => {
            const cons = r.consolidado.find((l) => l.cliente_id === c.id);
            return (
              <tr key={c.id}>
                <Td className="font-medium"><Link href={`/clientes/${c.id}`} className="text-sky-700 hover:underline">{c.nome}</Link></Td>
                <Td>{r.representadas.get(c.representada_id)?.nome}</Td>
                <Td>{c.cnpj ?? "—"}</Td>
                <Td>{c.codigo_externo ?? "—"}</Td>
                <Td num>{brl(cons?.carteira ?? 0)}</Td>
                <Td num>{brl(cons?.saldo_a_faturar ?? 0)}</Td>
                <Td num className="font-semibold">{brl(cons?.comissao_a_receber ?? 0)}</Td>
              </tr>
            );
          })}
        </tbody>
      </Tabela>
    </Pagina>
  );
}
