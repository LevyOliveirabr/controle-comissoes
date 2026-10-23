import { notFound } from "next/navigation";
import { BadgeSituacaoApuracao } from "@/components/badges";
import { FormNfse } from "@/components/formularios/nfse";
import { Mensagens } from "@/components/mensagens";
import { Alerta, Botao, Campo, Card, Checkbox, Descricao, FormExcluir, Input, Pagina } from "@/components/ui";
import { excluirNfse, registrarCreditoNfse } from "@/lib/acoes/comissoes";
import { brl, data, diasRelativos } from "@/lib/formato";
import { diferencaDias } from "@/lib/motor";
import { obterResultado, type ParametrosBusca } from "@/lib/resultado";

export default async function NfseDetalhePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<ParametrosBusca> }) {
  const { id } = await params;
  const sp = await searchParams;
  const r = await obterResultado();
  const n = r.nfses.find((x) => x.id === id);
  if (!n) notFound();
  const rep = n.representada;
  const candidatas = r.apuracoes.filter((a) => a.representada_id === rep.id && (a.nfse_id === id || a.nfse_id == null));
  const atraso = n.status !== "Recebida" ? diferencaDias(r.hoje, n.previsao_credito) : 0;

  const itemCheck = (ok: boolean, rotulo: string, valor: string | null) => (
    <li key={rotulo} className="flex items-start gap-2">
      <span className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{ok ? "✓" : "!"}</span>
      <span>
        <span className="font-medium">{rotulo}</span>
        <span className="block text-xs text-slate-500">{valor ?? "não cadastrado na representada"}</span>
      </span>
    </li>
  );

  return (
    <Pagina titulo={n.numero ? `NFS-e ${n.numero}` : "NFS-e sem número"} descricao={`${rep.nome} · ${n.referencia ?? data(n.competencia)}`} acoes={<FormExcluir acao={excluirNfse} id={id} />}>
      <Mensagens sp={sp} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card titulo="Situação" className="lg:col-span-2">
          <Descricao
            itens={[
              ["Status", <BadgeSituacaoApuracao key="s" situacao={n.status} />],
              ["Valor", <strong key="v">{brl(n.valor)}</strong>],
              ["Soma das apurações cobertas", <span key="a" className={n.alerta_valor ? "text-amber-700" : ""}>{brl(n.soma_apuracoes)}{n.alerta_valor ? ` (diferença ${brl(n.diferenca_valor)})` : ""}</span>],
              ["Emissão", data(n.data_emissao)],
              ["Enviada em", data(n.enviada_em)],
              ["Previsão de crédito", <span key="p">{data(n.previsao_credito)} <span className="text-xs text-slate-500">(emissão + {rep.prazo_pagamento_dias} dias)</span></span>],
              ["Crédito", n.data_credito ? `${data(n.data_credito)}${n.data_credito_aproximada ? " (aprox.)" : ""} — ${n.dias_em_aberto} dias após a emissão` : atraso > 0 ? <span key="x" className="text-rose-700">atrasada {atraso} dia{atraso === 1 ? "" : "s"}</span> : diasRelativos(-atraso)],
              ["Clientes", n.clientes.map((c) => c.nome).join(", ") || "—"],
            ]}
          />
          {n.alerta_valor && (
            <div className="mt-4">
              <Alerta tom="atencao">O valor da NFS-e não bate com a soma das apurações marcadas abaixo. Revise as apurações cobertas ou o valor da nota.</Alerta>
            </div>
          )}
          {!n.data_credito && (
            <form action={registrarCreditoNfse} className="mt-5 flex flex-wrap items-end gap-3 rounded-lg bg-emerald-50 p-4">
              <input type="hidden" name="id" value={id} />
              <Campo rotulo="O dinheiro caiu? Informe a data do crédito">
                <Input name="data_credito" type="date" required defaultValue={r.hoje} />
              </Campo>
              <div className="pb-2"><Checkbox name="data_credito_aproximada" rotulo="data aproximada" /></div>
              <Botao>Registrar crédito</Botao>
            </form>
          )}
        </Card>

        <Card titulo="Checklist antes de enviar" rodape="Vem do cadastro da representada. Notas sem PO ou sem a descrição exigida costumam ser recusadas.">
          <ul className="space-y-3 text-sm">
            {itemCheck(n.checklist.po.ok, "PO de comissão na nota", n.checklist.po.valor)}
            {itemCheck(n.checklist.descricao.ok, "Descrição obrigatória", n.checklist.descricao.valor)}
            {itemCheck(n.checklist.email.ok, "E-mail de envio", n.checklist.email.valor)}
            {rep.email_copia && itemCheck(true, "Cópia para", rep.email_copia)}
          </ul>
        </Card>
      </div>

      <FormNfse n={n} representadas={r.dados.representadas} apuracoesCandidatas={candidatas} />
    </Pagina>
  );
}
