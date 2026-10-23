import Link from "next/link";
import { FiltroGlobal } from "@/components/filtro-global";
import { Pagina, Tabela, Td, Th } from "@/components/ui";
import { brl } from "@/lib/formato";
import { filtroDaBusca, obterResultado, type ParametrosBusca } from "@/lib/resultado";

export default async function ConsolidadoPage({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  const sp = await searchParams;
  const filtro = filtroDaBusca(sp);
  const r = await obterResultado(filtro);
  const linhas = r.consolidado.filter((l) => l.carteira > 0 || l.comissao_apurada > 0);
  const soma = (f: (l: (typeof linhas)[number]) => number) => linhas.reduce((s, l) => s + f(l), 0);

  return (
    <Pagina titulo="Consolidado por cliente" descricao="Carteira firme, faturamento e comissão por representada × cliente. Previsões, cancelados e convertidos ficam de fora.">
      <FiltroGlobal filtro={filtro} representadas={r.dados.representadas} clientes={r.dados.clientes} />
      <Tabela>
        <thead>
          <tr>
            <Th>Representada</Th>
            <Th>Cliente</Th>
            <Th num>Carteira (firme)</Th>
            <Th num>Já faturado</Th>
            <Th num>Saldo a faturar</Th>
            <Th num>Comissão total</Th>
            <Th num>Apurada</Th>
            <Th num>Recebida</Th>
            <Th num>A receber</Th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.cliente_id}>
              <Td>{l.representada}</Td>
              <Td>
                <Link href={`/clientes/${l.cliente_id}`} className="text-sky-700 hover:underline">{l.cliente}</Link>
              </Td>
              <Td num>{brl(l.carteira)}</Td>
              <Td num>{brl(l.ja_faturado)}</Td>
              <Td num>{brl(l.saldo_a_faturar)}</Td>
              <Td num>{brl(l.comissao_total)}</Td>
              <Td num>{brl(l.comissao_apurada)}</Td>
              <Td num className="text-emerald-700">{brl(l.comissao_recebida)}</Td>
              <Td num className="font-semibold">{brl(l.comissao_a_receber)}</Td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50 font-semibold">
            <Td colSpan={2}>Total</Td>
            <Td num>{brl(soma((l) => l.carteira))}</Td>
            <Td num>{brl(soma((l) => l.ja_faturado))}</Td>
            <Td num>{brl(soma((l) => l.saldo_a_faturar))}</Td>
            <Td num>{brl(soma((l) => l.comissao_total))}</Td>
            <Td num>{brl(soma((l) => l.comissao_apurada))}</Td>
            <Td num className="text-emerald-700">{brl(soma((l) => l.comissao_recebida))}</Td>
            <Td num>{brl(soma((l) => l.comissao_a_receber))}</Td>
          </tr>
        </tfoot>
      </Tabela>
    </Pagina>
  );
}
