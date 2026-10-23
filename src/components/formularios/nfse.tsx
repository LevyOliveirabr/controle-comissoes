import { salvarNfse } from "@/lib/acoes/comissoes";
import { brl, data } from "@/lib/formato";
import type { ApuracaoCalculada, NfseComissao, Representada } from "@/lib/motor";
import { Botao, BotaoLink, Campo, Card, Checkbox, Grade, Input, Select, TextArea } from "../ui";

/**
 * Formulário da NFS-e. Na edição, lista as apurações da representada ainda sem
 * NFS-e (e as já cobertas por esta) para marcar o que a nota cobre (RN-20).
 */
export function FormNfse({ n, representadas, apuracoesCandidatas, representadaPadrao }: { n?: NfseComissao; representadas: Representada[]; apuracoesCandidatas?: ApuracaoCalculada[]; representadaPadrao?: string | null }) {
  const totalMarcado = apuracoesCandidatas?.filter((a) => a.nfse_id === n?.id).reduce((s, a) => s + a.valor_apurado, 0) ?? 0;
  return (
    <form action={salvarNfse} className="space-y-6">
      {n && <input type="hidden" name="id" value={n.id} />}
      <Card titulo="NFS-e de comissão" rodape="Previsão de crédito = data de emissão + prazo de pagamento da representada. Registre a data do crédito quando o dinheiro cair.">
        <Grade colunas={3}>
          <Campo rotulo="Representada">
            <Select name="representada_id" required defaultValue={n?.representada_id ?? representadaPadrao ?? ""} disabled={!!n}>
              <option value="" disabled>Selecione…</option>
              {representadas.map((r) => (
                <option key={r.id} value={r.id}>{r.nome}</option>
              ))}
            </Select>
            {n && <input type="hidden" name="representada_id" value={n.representada_id} />}
          </Campo>
          <Campo rotulo="Número da NFS-e" ajuda="Pode ficar vazio até a prefeitura numerar.">
            <Input name="numero" defaultValue={n?.numero ?? ""} />
          </Campo>
          <Campo rotulo="Chave / código de verificação">
            <Input name="chave_acesso" defaultValue={n?.chave_acesso ?? ""} />
          </Campo>
          <Campo rotulo="Data de emissão">
            <Input name="data_emissao" type="date" required defaultValue={n?.data_emissao ?? new Date().toISOString().slice(0, 10)} />
          </Campo>
          <Campo rotulo="Competência (mês de referência)">
            <Input name="competencia" type="month" defaultValue={n?.competencia?.slice(0, 7) ?? ""} />
          </Campo>
          <Campo rotulo="Referência" ajuda="Rótulo livre: 'Set/2026', 'Out/2026 - NFs 877 e 884'.">
            <Input name="referencia" defaultValue={n?.referencia ?? ""} />
          </Campo>
          <Campo rotulo="Valor (R$)" ajuda={apuracoesCandidatas ? `Apurações marcadas: ${brl(totalMarcado)}` : undefined}>
            <Input name="valor" type="number" step="0.01" min="0" required defaultValue={n?.valor ?? ""} />
          </Campo>
          <Campo rotulo="Enviada à representada em">
            <Input name="enviada_em" type="date" defaultValue={n?.enviada_em ?? ""} />
          </Campo>
          <Campo rotulo="Data do crédito em conta">
            <Input name="data_credito" type="date" defaultValue={n?.data_credito ?? ""} />
          </Campo>
        </Grade>
        <div className="mt-4 space-y-3">
          <Checkbox name="data_credito_aproximada" rotulo="Data do crédito aproximada" ajuda="Marque quando a data exata não foi informada pelo banco/representada." defaultChecked={n?.data_credito_aproximada ?? false} />
          <Campo rotulo="Observações">
            <TextArea name="observacoes" defaultValue={n?.observacoes ?? ""} />
          </Campo>
        </div>
      </Card>

      {apuracoesCandidatas && (
        <Card titulo="Apurações cobertas por esta NFS-e" rodape="Marque as apurações que esta nota cobre. A soma deve bater com o valor da NFS-e.">
          <input type="hidden" name="cobrir_enviado" value="1" />
          {apuracoesCandidatas.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma apuração pendente desta representada.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {apuracoesCandidatas.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2 text-sm">
                  <input type="checkbox" name="cobrir" value={a.id} defaultChecked={a.nfse_id === n?.id} className="h-4 w-4 rounded border-slate-300" />
                  <span className="flex-1">
                    NF {a.nf.numero} · {a.cliente.nome} · {a.referencia ?? data(a.mes_referencia)}
                    {a.parcela ? ` · parcela ${a.parcela.numero}` : ""}
                  </span>
                  <span className="font-semibold tabular-nums">{brl(a.valor_apurado)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <div className="flex items-center gap-2">
        <Botao>Salvar</Botao>
        <BotaoLink href={n ? `/nfse/${n.id}` : "/nfse"} variante="secundario">Cancelar</BotaoLink>
      </div>
    </form>
  );
}
