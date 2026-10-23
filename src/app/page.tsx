import Link from "next/link";
import { FiltroGlobal } from "@/components/filtro-global";
import { LinkAgenda } from "@/components/link-agenda";
import { Alerta, Badge, Card, Indicador, Pagina, Tabela, Td, Th } from "@/components/ui";
import { brl, data, mesCurto, pct } from "@/lib/formato";
import { filtroDaBusca, obterResultado, queryDoFiltro, type ParametrosBusca } from "@/lib/resultado";

const TOM_ESTAGIO = ["bg-emerald-500", "bg-sky-500", "bg-violet-500", "bg-amber-500", "bg-slate-400"];

export default async function Dashboard({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  const sp = await searchParams;
  const filtro = filtroDaBusca(sp);
  const r = await obterResultado(filtro);
  const { funil, matriz, agenda } = r;
  const q = queryDoFiltro(filtro);
  const colunas = matriz.representadas.filter((rep) => Math.abs(matriz.totais.por_representada[rep.id] ?? 0) > 0.004 || !filtro.representada_id);
  const maior = Math.max(...funil.estagios.map((e) => e.comissao), 1);
  const proximos = agenda.filter((i) => i.confianca === "Firme").slice(0, 8);
  const previsoes = r.pedidos.filter((p) => p.ativo && p.no_filtro && p.situacao_comercial === "previsao");

  return (
    <Pagina titulo="Dashboard" descricao={`Posição em ${data(r.hoje)} — comissão da carteira firme, por estágio e por mês esperado de recebimento.`}>
      <FiltroGlobal filtro={filtro} representadas={r.dados.representadas} clientes={r.dados.clientes} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Indicador rotulo="Comissão a receber (firme)" valor={brl(funil.a_receber_firme)} tom="info" detalhe="Estágios 2 a 5, nota a nota" />
        <Indicador rotulo="Comissão já recebida" valor={brl(funil.ja_recebida)} tom="bom" detalhe="Com crédito confirmado em conta" />
        <Indicador rotulo="Em previsão" valor={brl(funil.em_previsao.comissao)} detalhe={`${pct(funil.em_previsao.pct_da_firme, 0)} da carteira firme — fora do total`} />
        <Indicador rotulo="Total da carteira firme" valor={brl(funil.total_firme)} detalhe={`Sobre ${brl(funil.total_base_firme)} em vendas`} />
      </div>

      {funil.divergencia.total > 0 && (
        <Alerta tom="atencao" titulo={`Comissão apurada acima da prevista: ${brl(funil.divergencia.total)}`}>
          {funil.divergencia.nfs.map((nf) => (
            <div key={nf.id}>
              NF <Link className="underline" href={`/notas-fiscais/${nf.id}`}>{nf.numero}</Link> ({nf.representada.nome}): prevista {brl(nf.comissao_prevista)} a {pct(nf.pct)} × apurada {brl(nf.comissao_apurada)} (+{brl(nf.divergencia)}).
              Confirme o percentual com a representada; o funil considera o valor apurado.
            </div>
          ))}
        </Alerta>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card titulo="Funil da carteira firme" className="lg:col-span-3">
          <ol className="space-y-3">
            {funil.estagios.map((e, i) => (
              <li key={e.numero} className="grid grid-cols-[1.5rem_1fr] gap-3">
                <span className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold text-white ${TOM_ESTAGIO[i]}`}>{e.numero}</span>
                <div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-slate-800">{e.nome}</span>
                    <span className="text-sm font-semibold tabular-nums text-slate-900">{brl(e.comissao)}</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-2 rounded-full ${TOM_ESTAGIO[i]}`} style={{ width: `${Math.max(2, (e.comissao / maior) * 100)}%` }} />
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-slate-500">
                    <span>Base {brl(e.base)} · {pct(e.pct_do_total, 0)} do total</span>
                    <span>{e.proximo_passo}</span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <Card titulo="Pipeline de previsão" className="lg:col-span-2" rodape="Pedidos em previsão não entram no total firme. Converta em firme quando o cliente confirmar.">
          {previsoes.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum pedido em previsão{filtro.representada_id || filtro.cliente_id ? " no filtro atual" : ""}.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {previsoes.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div>
                    <Link href={`/pedidos/${p.id}`} className="font-medium text-slate-800 hover:underline">{p.numero}</Link>
                    <div className="text-xs text-slate-500">{p.representada.nome} · {p.cliente.nome}</div>
                    <div className="text-xs text-slate-500">Faturamento previsto: {data(p.data_prevista_faturamento)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold tabular-nums">{brl(p.comissao_saldo)}</div>
                    <div className="text-xs text-slate-500">{brl(p.valor_total)} × {pct(p.pct_efetivo)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card titulo={`Quando o dinheiro deve cair — próximos 12 meses (mês base ${mesCurto(matriz.mes_base)})`} rodape="Datas esperadas calculadas pelo ciclo de cada representada (dias até a apuração + prazo de pagamento). 'Vencido' é o que já deveria ter caído.">
        <div className="-m-5 overflow-x-auto">
          <table className="w-full whitespace-nowrap text-left text-sm">
            <thead>
              <tr>
                <Th>Mês</Th>
                {colunas.map((c) => (
                  <Th key={c.id} num>{c.nome}</Th>
                ))}
                <Th num className="bg-slate-100">Total firme</Th>
                <Th num>Previsão</Th>
                <Th num>Acumulado firme</Th>
              </tr>
            </thead>
            <tbody>
              {matriz.linhas
                .filter((l) => l.tipo === "mes" || l.total_firme > 0 || l.em_previsao > 0)
                .map((l) => (
                  <tr key={l.chave} className={l.tipo === "vencido" ? "bg-rose-50/60" : l.tipo !== "mes" ? "bg-slate-50" : ""}>
                    <Td className={l.tipo === "vencido" ? "font-medium text-rose-700" : "font-medium"}>{l.tipo === "mes" ? mesCurto(l.mes) : l.rotulo}</Td>
                    {colunas.map((c) => (
                      <Td key={c.id} num className={l.por_representada[c.id] ? "" : "text-slate-300"}>{l.por_representada[c.id] ? brl(l.por_representada[c.id]) : "–"}</Td>
                    ))}
                    <Td num className="bg-slate-50 font-semibold">{l.total_firme ? brl(l.total_firme) : <span className="text-slate-300">–</span>}</Td>
                    <Td num className={l.em_previsao ? "text-violet-700" : "text-slate-300"}>{l.em_previsao ? brl(l.em_previsao) : "–"}</Td>
                    <Td num className="text-slate-500">{brl(l.acumulado_firme)}</Td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <Td>Total</Td>
                {colunas.map((c) => (
                  <Td key={c.id} num>{brl(matriz.totais.por_representada[c.id] ?? 0)}</Td>
                ))}
                <Td num className="bg-slate-50">{brl(matriz.totais.total_firme)}</Td>
                <Td num className="text-violet-700">{brl(matriz.totais.em_previsao)}</Td>
                <Td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <Card titulo="Próximos recebimentos firmes" rodape={<Link href={`/agenda${q}`} className="text-sky-700 hover:underline">Ver agenda completa →</Link>}>
        <Tabela className="border-0 shadow-none">
          <thead>
            <tr>
              <Th>Data esperada</Th>
              <Th>Origem</Th>
              <Th>Representada / cliente</Th>
              <Th>Documento</Th>
              <Th num>Comissão</Th>
            </tr>
          </thead>
          <tbody>
            {proximos.map((i, idx) => (
              <tr key={idx}>
                <Td>
                  {data(i.data_esperada)} {i.vencido && <Badge tom="vermelho">vencido</Badge>}
                </Td>
                <Td><Badge tom={i.origem.startsWith("NF de rep") ? "azul" : i.origem.startsWith("Faturada") ? "amarelo" : i.origem.startsWith("Autorizada") ? "roxo" : "cinza"}>{i.origem}</Badge></Td>
                <Td>
                  <div className="font-medium">{i.representada}</div>
                  <div className="text-xs text-slate-500">{i.cliente}</div>
                </Td>
                <Td><LinkAgenda ref_={i.referencia} texto={i.descricao} /></Td>
                <Td num className="font-semibold">{brl(i.valor)}</Td>
              </tr>
            ))}
            {proximos.length === 0 && (
              <tr>
                <Td colSpan={5} className="text-center text-slate-500">Nada em aberto.</Td>
              </tr>
            )}
          </tbody>
        </Tabela>
      </Card>
    </Pagina>
  );
}
