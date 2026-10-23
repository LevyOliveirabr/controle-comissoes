import { salvarApuracao } from "@/lib/acoes/comissoes";
import { brl, data } from "@/lib/formato";
import type { Apuracao, Resultado } from "@/lib/motor";
import { Botao, BotaoLink, Campo, Card, Input, Select, TextArea } from "../ui";
import { SelecaoApuracao, type NfOpcao, type NfseOpcao } from "./selecao-apuracao";

export function FormApuracao({ a, r, nfPadrao, voltarPara }: { a?: Apuracao; r: Resultado; nfPadrao?: string | null; voltarPara?: string }) {
  const nfs: NfOpcao[] = r.nfs
    .slice()
    .sort((x, y) => x.representada.nome.localeCompare(y.representada.nome) || y.data_emissao.localeCompare(x.data_emissao))
    .map((n) => ({
      id: n.id,
      rotulo: `NF ${n.numero} · ${n.cliente.nome} · ${data(n.data_emissao)} · ${brl(n.valor_total)}${n.pendente_apuracao > 0 ? ` · falta apurar ${brl(n.pendente_apuracao)}` : ""}`,
      representada_id: n.representada_id,
      representada: n.representada.nome,
      base: n.base,
      pct: n.pct,
      parcelas: n.parcelas.map((p) => ({ id: p.id, rotulo: `Parcela ${p.numero} · venc. ${data(p.vencimento_documento)} · ${brl(p.valor)}`, valor: p.valor })),
    }));
  const nfses: NfseOpcao[] = r.nfses
    .slice()
    .sort((x, y) => y.data_emissao.localeCompare(x.data_emissao))
    .map((n) => ({ id: n.id, representada_id: n.representada_id, rotulo: `${n.numero ? `NFS-e ${n.numero}` : "NFS-e s/ número"} · ${n.referencia ?? ""} · ${data(n.data_emissao)} · ${brl(n.valor)}${n.data_credito ? " · recebida" : ""}` }));
  const mesPadrao = a?.mes_referencia?.slice(0, 7) ?? new Date().toISOString().slice(0, 7);

  return (
    <form action={salvarApuracao} className="space-y-6">
      {a && <input type="hidden" name="id" value={a.id} />}
      {voltarPara && <input type="hidden" name="voltar_para" value={voltarPara} />}
      <Card titulo="Apuração de comissão" rodape="Uma linha por registro do relatório da representada (ou por NFS-e sua, quando a representada não manda relatório). Vincule à NFS-e quando emitir.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <SelecaoApuracao nfs={nfs} nfses={nfses} nfId={a?.nf_venda_id ?? nfPadrao} parcelaId={a?.parcela_id} nfseId={a?.nfse_id} base={a?.base} pct={a?.pct} valorApurado={a?.valor_apurado} />
          <Campo rotulo="Mês de referência">
            <Input name="mes_referencia" type="month" required defaultValue={mesPadrao} />
          </Campo>
          <Campo rotulo="Rótulo / referência" ajuda="Como aparece no relatório: 'Jul/2026', 'Green - parcela 1/4'.">
            <Input name="referencia" defaultValue={a?.referencia ?? ""} />
          </Campo>
          <Campo rotulo="Origem">
            <Select name="origem" defaultValue={a?.origem ?? "relatorio_representada"}>
              <option value="relatorio_representada">Relatório da representada</option>
              <option value="nfse_propria">NFS-e própria (sem relatório)</option>
              <option value="manual">Manual</option>
            </Select>
          </Campo>
          <Campo rotulo="Data do pagamento do cliente à representada">
            <Input name="data_pgto_representada" type="date" defaultValue={a?.data_pgto_representada ?? ""} />
          </Campo>
          <Campo rotulo="Nº do pagamento">
            <Input name="nr_pgto" defaultValue={a?.nr_pgto ?? ""} />
          </Campo>
        </div>
        <div className="mt-4">
          <Campo rotulo="Observações">
            <TextArea name="observacoes" defaultValue={a?.observacoes ?? ""} />
          </Campo>
        </div>
      </Card>
      <div className="flex items-center gap-2">
        <Botao>Salvar</Botao>
        <BotaoLink href={voltarPara ?? (a ? `/apuracoes/${a.id}` : "/apuracoes")} variante="secundario">Cancelar</BotaoLink>
      </div>
    </form>
  );
}
