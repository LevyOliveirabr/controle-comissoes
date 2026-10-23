import Link from "next/link";
import { FiltroGlobal } from "@/components/filtro-global";
import { Dica, NumeroLink } from "@/components/rastreio";
import { Pagina, Tabela, Td, Th } from "@/components/ui";
import { brl } from "@/lib/formato";
import { linhasVisiveisConsolidado } from "@/lib/motor";
import { filtroDaBusca, obterResultado, queryDoFiltro, type ParametrosBusca } from "@/lib/resultado";

const COLUNAS = [
  ["carteira", "Carteira (firme)", ""],
  ["ja_faturado", "Já faturado", ""],
  ["saldo_a_faturar", "Saldo a faturar", ""],
  ["comissao_total", "Comissão total", ""],
  ["comissao_apurada", "Apurada", ""],
  ["comissao_recebida", "Recebida", "text-emerald-700"],
  ["comissao_a_receber", "A receber", "font-semibold"],
] as const;

export default async function ConsolidadoPage({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  const sp = await searchParams;
  const filtro = filtroDaBusca(sp);
  const r = await obterResultado(filtro);
  const linhas = linhasVisiveisConsolidado(r.consolidado);
  const soma = (f: (l: (typeof linhas)[number]) => number) => linhas.reduce((s, l) => s + f(l), 0);
  const voltar = `/consolidado${queryDoFiltro(filtro)}`;

  return (
    <Pagina titulo="Consolidado por cliente" descricao="Carteira firme, faturamento e comissão por representada × cliente. Previsões, cancelados e convertidos ficam de fora. Clique em um valor para ver os registros que o compõem.">
      <FiltroGlobal filtro={filtro} representadas={r.dados.representadas} clientes={r.dados.clientes} />
      <Tabela>
        <thead>
          <tr>
            <Th>Representada</Th>
            <Th>Cliente</Th>
            {COLUNAS.map(([col, rotulo]) => (
              <Th key={col} num>
                <span className="inline-flex items-center gap-1">
                  {rotulo} <Dica chave={`consolidado:${col}`} alinhar="direita" />
                </span>
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.cliente_id}>
              <Td>{l.representada}</Td>
              <Td>
                <Link href={`/clientes/${l.cliente_id}`} className="text-sky-700 hover:underline">{l.cliente}</Link>
              </Td>
              {COLUNAS.map(([col, , cls]) => (
                <Td key={col} num className={cls}>
                  {Math.abs(l[col]) >= 0.005 ? <NumeroLink chave={`consolidado:${l.cliente_id}:${col}`} filtro={filtro} voltar={voltar}>{brl(l[col])}</NumeroLink> : <span className="text-slate-300">{brl(0)}</span>}
                </Td>
              ))}
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr>
              <Td colSpan={9} className="text-center text-slate-500">Nenhum cliente com carteira ou apuração no filtro atual.</Td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50 font-semibold">
            <Td colSpan={2}>Total</Td>
            {COLUNAS.map(([col, , cls]) => (
              <Td key={col} num className={cls}>
                <NumeroLink chave={`consolidado:total:${col}`} filtro={filtro} voltar={voltar}>{brl(soma((l) => l[col]))}</NumeroLink>
              </Td>
            ))}
          </tr>
        </tfoot>
      </Tabela>
    </Pagina>
  );
}
