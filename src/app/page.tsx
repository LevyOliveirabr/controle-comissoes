import Link from "next/link";
import { FiltroGlobal } from "@/components/filtro-global";
import { LinkAgenda } from "@/components/link-agenda";
import { Dica, NumeroLink, hrefComposicao } from "@/components/rastreio";
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
  const voltar = `/${q}`;
  const colunas = matriz.representadas.filter((rep) => Math.abs(matriz.totais.por_representada[rep.id] ?? 0) > 0.004 || !filtro.representada_id);
  const maior = Math.max(...funil.estagios.map((e) => e.comissao), 1);
  const proximos = agenda.filter((i) => i.confianca === "Firme").slice(0, 8);
  const previsoes = r.pedidos.filter((p) => p.ativo && p.no_filtro && p.situacao_comercial === "previsao");
  const comp = (chave: string) => hrefComposicao(chave, filtro, voltar);
  const difereDaPlanilha = Math.abs(funil.a_receber_firme - funil.a_receber_firme_planilha) >= 0.005;

  return (
    <Pagina
      titulo="Dashboard"
      descricao={`Posição em ${data(r.hoje)} — comissão da carteira firme, por estágio e por mês esperado de recebimento. Clique em qualquer valor para ver de onde ele vem; o "?" explica a conta.`}
      acoes={<Link href="/ajuda" className="text-sm text-sky-700 hover:underline">Entenda os números →</Link>}
    >
      <FiltroGlobal filtro={filtro} representadas={r.dados.representadas} clientes={r.dados.clientes} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Indicador
          rotulo="Comissão a receber (firme)"
          valor={brl(funil.a_receber_firme)}
          tom="info"
          href={comp("card:a_receber_firme")}
          ajuda={<Dica chave="card:a_receber_firme" />}
          detalhe={
            difereDaPlanilha ? (
              <>
                Estágios 2 a 5, nota a nota. Pelo critério da planilha (residual):{" "}
                <NumeroLink chave="card:a_receber_firme_planilha" filtro={filtro} voltar={voltar}>{brl(funil.a_receber_firme_planilha)}</NumeroLink>{" "}
                <Dica chave="card:a_receber_firme_planilha" />
              </>
            ) : (
              "Estágios 2 a 5, nota a nota"
            )
          }
        />
        <Indicador rotulo="Comissão já recebida" valor={brl(funil.ja_recebida)} tom="bom" href={comp("card:ja_recebida")} ajuda={<Dica chave="card:ja_recebida" />} detalhe="Com crédito confirmado em conta" />
        <Indicador rotulo="Em previsão" valor={brl(funil.em_previsao.comissao)} href={comp("card:em_previsao")} ajuda={<Dica chave="card:em_previsao" />} detalhe={`${pct(funil.em_previsao.pct_da_firme, 0)} da carteira firme — fora do total`} />
        <Indicador rotulo="Total da carteira firme" valor={brl(funil.total_firme)} href={comp("card:total_firme")} ajuda={<Dica chave="card:total_firme" alinhar="direita" />} detalhe={`Sobre ${brl(funil.total_base_firme)} em vendas`} />
      </div>

      {funil.divergencia.total > 0 && (
        <Alerta tom="atencao" titulo={`Comissão apurada acima da prevista: ${brl(funil.divergencia.total)}`}>
          {funil.divergencia.nfs.map((nf) => (
            <div key={nf.id}>
              NF <Link className="underline" href={`/notas-fiscais/${nf.id}`}>{nf.numero}</Link> ({nf.representada.nome}): prevista {brl(nf.comissao_prevista)} a {pct(nf.pct)} × apurada {brl(nf.comissao_apurada)} (+{brl(nf.divergencia)}).
              Confirme o percentual com a representada; o funil considera o valor apurado.
            </div>
          ))}
          <div className="mt-1 text-xs">
            É por isso que o critério da planilha (residual) dá {brl(funil.a_receber_firme_planilha)} e o nota a nota dá {brl(funil.a_receber_firme)}: no residual, o excedente abate o que falta nas outras notas.
          </div>
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
                    <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                      {e.nome} <Dica chave={`funil:${e.numero}`} />
                    </span>
                    <NumeroLink chave={`funil:${e.numero}`} filtro={filtro} voltar={voltar} className="text-sm font-semibold text-slate-900">{brl(e.comissao)}</NumeroLink>
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

        <Card
          titulo={<span className="flex items-center gap-1.5">Pipeline de previsão <Dica chave="pipeline" /></span>}
          className="lg:col-span-2"
          rodape={
            <span>
              Pedidos em previsão não entram no total firme. Converta em firme quando o cliente confirmar.{" "}
              <NumeroLink chave="pipeline" filtro={filtro} voltar={voltar}>Total: {brl(funil.em_previsao.comissao)}</NumeroLink>
            </span>
          }
        >
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
                    <div className="text-xs text-slate-500">saldo {brl(p.saldo_a_faturar)} × {pct(p.pct_efetivo)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card
        titulo={
          <span className="flex items-center gap-1.5">
            Quando o dinheiro deve cair — próximos 12 meses (mês base {mesCurto(matriz.mes_base)}) <Dica chave="matriz:celula" />
          </span>
        }
        rodape="Datas esperadas calculadas pelo ciclo de cada representada (dias até a apuração + prazo de pagamento). 'Vencido' é o que já deveria ter caído. Clique em um valor para ver os itens daquele mês."
      >
        <div className="-m-5 overflow-x-auto">
          <table className="w-full whitespace-nowrap text-left text-sm">
            <thead>
              <tr>
                <Th>Mês</Th>
                {colunas.map((c) => (
                  <Th key={c.id} num>{c.nome}</Th>
                ))}
                <Th num className="bg-slate-100"><span className="inline-flex items-center gap-1">Total firme <Dica chave="matriz:total_firme" alinhar="direita" /></span></Th>
                <Th num><span className="inline-flex items-center gap-1">Previsão <Dica chave="matriz:previsao" alinhar="direita" /></span></Th>
                <Th num><span className="inline-flex items-center gap-1">Acumulado firme <Dica chave="matriz:acumulado" alinhar="direita" /></span></Th>
              </tr>
            </thead>
            <tbody>
              {matriz.linhas
                .filter((l) => l.tipo === "mes" || l.total_firme > 0 || l.em_previsao > 0)
                .map((l) => (
                  <tr key={l.chave} className={l.tipo === "vencido" ? "bg-rose-50/60" : l.tipo !== "mes" ? "bg-slate-50" : ""}>
                    <Td className={l.tipo === "vencido" ? "font-medium text-rose-700" : "font-medium"}>
                      <span className="inline-flex items-center gap-1">
                        {l.tipo === "mes" ? mesCurto(l.mes) : l.rotulo}
                        {l.tipo === "vencido" && <Dica chave="matriz:vencido" />}
                      </span>
                    </Td>
                    {colunas.map((c) => (
                      <Td key={c.id} num className={l.por_representada[c.id] ? "" : "text-slate-300"}>
                        {l.por_representada[c.id] ? <NumeroLink chave={`matriz:${l.chave}:rep:${c.id}`} filtro={filtro} voltar={voltar}>{brl(l.por_representada[c.id])}</NumeroLink> : "–"}
                      </Td>
                    ))}
                    <Td num className="bg-slate-50 font-semibold">
                      {l.total_firme ? <NumeroLink chave={`matriz:${l.chave}:total_firme`} filtro={filtro} voltar={voltar}>{brl(l.total_firme)}</NumeroLink> : <span className="text-slate-300">–</span>}
                    </Td>
                    <Td num className={l.em_previsao ? "text-violet-700" : "text-slate-300"}>
                      {l.em_previsao ? <NumeroLink chave={`matriz:${l.chave}:previsao`} filtro={filtro} voltar={voltar}>{brl(l.em_previsao)}</NumeroLink> : "–"}
                    </Td>
                    <Td num className="text-slate-500">
                      {l.acumulado_firme ? <NumeroLink chave={`matriz:${l.chave}:acumulado`} filtro={filtro} voltar={voltar}>{brl(l.acumulado_firme)}</NumeroLink> : brl(0)}
                    </Td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <Td><span className="inline-flex items-center gap-1">Total <Dica chave="matriz:total" /></span></Td>
                {colunas.map((c) => (
                  <Td key={c.id} num>
                    {matriz.totais.por_representada[c.id] ? <NumeroLink chave={`matriz:total:rep:${c.id}`} filtro={filtro} voltar={voltar}>{brl(matriz.totais.por_representada[c.id])}</NumeroLink> : brl(0)}
                  </Td>
                ))}
                <Td num className="bg-slate-50"><NumeroLink chave="matriz:total:total_firme" filtro={filtro} voltar={voltar}>{brl(matriz.totais.total_firme)}</NumeroLink></Td>
                <Td num className="text-violet-700"><NumeroLink chave="matriz:total:previsao" filtro={filtro} voltar={voltar}>{brl(matriz.totais.em_previsao)}</NumeroLink></Td>
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
