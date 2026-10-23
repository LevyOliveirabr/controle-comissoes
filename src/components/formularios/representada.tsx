import { salvarRepresentada } from "@/lib/acoes/cadastros";
import type { Representada } from "@/lib/motor";
import { Botao, BotaoLink, Campo, Card, Checkbox, Grade, Input, Select, TextArea } from "../ui";

export function FormRepresentada({ r }: { r?: Representada }) {
  return (
    <form action={salvarRepresentada} className="space-y-6">
      {r && <input type="hidden" name="id" value={r.id} />}
      <Card titulo="Identificação">
        <Grade colunas={3}>
          <Campo rotulo="Nome" className="md:col-span-2">
            <Input name="nome" required defaultValue={r?.nome ?? ""} placeholder="Ex.: Signify" />
          </Campo>
          <Campo rotulo="CNPJ">
            <Input name="cnpj" defaultValue={r?.cnpj ?? ""} placeholder="00.000.000/0000-00" />
          </Campo>
        </Grade>
      </Card>

      <Card titulo="Comissão">
        <Grade colunas={4}>
          <Campo rotulo="% de comissão padrão" ajuda="Em percentual: 4 = 4%. Pode ser sobrescrito no pedido ou na NF.">
            <Input name="pct_padrao" type="number" step="0.0001" min="0" max="100" required defaultValue={r ? +(r.pct_padrao * 100).toFixed(6) : ""} />
          </Campo>
          <Campo rotulo="Base de cálculo">
            <Select name="base_calculo" defaultValue={r?.base_calculo ?? "valor_total_nf"}>
              <option value="valor_total_nf">Valor total da NF</option>
              <option value="valor_produtos">Valor dos produtos</option>
            </Select>
          </Campo>
          <Campo rotulo="Dias até a apuração" ajuda="Quanto tempo após o faturamento a representada reconhece a comissão. Zero quando você mesmo emite a NFS-e sem esperar relatório.">
            <Input name="dias_ate_apuracao" type="number" min="0" step="1" defaultValue={r?.dias_ate_apuracao ?? 0} />
          </Campo>
          <Campo rotulo="Prazo de pagamento (dias)" ajuda="Dias entre a emissão da sua NFS-e e o crédito em conta.">
            <Input name="prazo_pagamento_dias" type="number" min="0" step="1" defaultValue={r?.prazo_pagamento_dias ?? 30} />
          </Campo>
        </Grade>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Campo rotulo="Modo de controle" ajuda="Simplificado: NF de venda sem pedido (ex.: Maxi).">
            <Select name="modo_controle" defaultValue={r?.modo_controle ?? "completo"}>
              <option value="completo">Completo (pedido → NF → apuração)</option>
              <option value="simplificado">Simplificado (só NF → apuração)</option>
            </Select>
          </Campo>
          <Campo rotulo="Regra de liberação da comissão" ajuda="Por parcela: a comissão de cada duplicata é liberada no mês seguinte ao vencimento (ex.: F-Led).">
            <Select name="regra_liberacao" defaultValue={r?.regra_liberacao ?? "por_nf"}>
              <option value="por_nf">Por NF (após a apuração)</option>
              <option value="por_parcela">Por parcela (mês seguinte ao vencimento)</option>
            </Select>
          </Campo>
          <div className="space-y-3 pt-6">
            <Checkbox name="envia_relatorio" rotulo="Envia relatório de comissão" ajuda="Desmarque quando você emite a NFS-e por conta própria (VW, Green)." defaultChecked={r?.envia_relatorio ?? true} />
            <Checkbox name="ativa" rotulo="Ativa" defaultChecked={r?.ativa ?? true} />
          </div>
        </div>
      </Card>

      <Card titulo="Exigências da NFS-e de comissão" rodape="Esses dados formam o checklist antes do envio da NFS-e: PO, descrição obrigatória e e-mail de destino.">
        <Grade colunas={3}>
          <Campo rotulo="PO de comissão">
            <Input name="po_comissao" defaultValue={r?.po_comissao ?? ""} />
          </Campo>
          <Campo rotulo="E-mail para envio da NF">
            <Input name="email_nf" type="email" defaultValue={r?.email_nf ?? ""} />
          </Campo>
          <Campo rotulo="E-mail em cópia">
            <Input name="email_copia" defaultValue={r?.email_copia ?? ""} />
          </Campo>
          <Campo rotulo="Descrição obrigatória na NF" className="md:col-span-2">
            <Input name="descricao_nf" defaultValue={r?.descricao_nf ?? "Referente a Representacao Comercial"} />
          </Campo>
          <Campo rotulo="Padrão de nome do pedido" ajuda="Ex.: 'Pedido NN - Mês', 'PV NNN'">
            <Input name="padrao_nome_pedido" defaultValue={r?.padrao_nome_pedido ?? ""} />
          </Campo>
        </Grade>
        <div className="mt-4">
          <Campo rotulo="Observações">
            <TextArea name="observacoes" defaultValue={r?.observacoes ?? ""} />
          </Campo>
        </div>
      </Card>

      <div className="flex items-center gap-2">
        <Botao>Salvar</Botao>
        <BotaoLink href={r ? `/representadas/${r.id}` : "/representadas"} variante="secundario">Cancelar</BotaoLink>
      </div>
    </form>
  );
}
