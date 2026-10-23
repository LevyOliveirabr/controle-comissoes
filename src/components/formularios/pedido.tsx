import { salvarPedido } from "@/lib/acoes/pedidos";
import type { Cliente, Pedido, Representada } from "@/lib/motor";
import { Botao, BotaoLink, Campo, Card, Checkbox, Grade, Input, Select, TextArea } from "../ui";
import { SelecaoRepCliente } from "./selecao-rep-cliente";

export function FormPedido({ p, representadas, clientes, clientePadrao }: { p?: Pedido; representadas: Representada[]; clientes: Cliente[]; clientePadrao?: string | null }) {
  return (
    <form action={salvarPedido} className="space-y-6">
      {p && <input type="hidden" name="id" value={p.id} />}
      <Card titulo="Pedido" rodape="Deixe o % em branco para usar o padrão da representada; preencha para valer só neste pedido (ex.: Green 2,29%).">
        <Grade colunas={3}>
          <SelecaoRepCliente representadas={representadas} clientes={clientes} representadaId={p?.representada_id} clienteId={p?.cliente_id ?? clientePadrao} />
          <Campo rotulo="Número / nome do pedido" ajuda="Ex.: 'Pedido 05 - Setembro', 'PV 668', 'OC 004323'">
            <Input name="numero" required defaultValue={p?.numero ?? ""} />
          </Campo>
          <Campo rotulo="Referência / proposta">
            <Input name="referencia" defaultValue={p?.referencia ?? ""} />
          </Campo>
          <Campo rotulo="Data do pedido">
            <Input name="data_pedido" type="date" defaultValue={p?.data_pedido ?? ""} />
          </Campo>
          <Campo rotulo="Entrega prevista (texto)">
            <Input name="entrega_prevista" defaultValue={p?.entrega_prevista ?? ""} placeholder="Ex.: Setembro/2026" />
          </Campo>
          <Campo rotulo="Data prevista de faturamento" ajuda="Usada na agenda: + dias até apuração + prazo de pagamento.">
            <Input name="data_prevista_faturamento" type="date" defaultValue={p?.data_prevista_faturamento ?? ""} />
          </Campo>
          <Campo rotulo="Valor total do pedido (R$)">
            <Input name="valor_total" type="number" step="0.01" min="0" required defaultValue={p?.valor_total ?? ""} />
          </Campo>
          <Campo rotulo="Valor original (R$)" ajuda="Preenchido automaticamente quando o pedido é ajustado ao valor da NF (RN-04).">
            <Input name="valor_original" type="number" step="0.01" min="0" defaultValue={p?.valor_original ?? ""} />
          </Campo>
          <Campo rotulo="% de comissão deste pedido" ajuda="Em percentual (2,29 = 2,29%). Vazio = padrão da representada.">
            <Input name="pct_override" type="number" step="0.0001" min="0" max="100" defaultValue={p?.pct_override != null ? +(p.pct_override * 100).toFixed(6) : ""} />
          </Campo>
          <Campo rotulo="Situação comercial">
            <Select name="situacao_comercial" defaultValue={p?.situacao_comercial ?? "firme"}>
              <option value="firme">Firme</option>
              <option value="previsao">Previsão</option>
              <option value="convertido">Convertido (histórico)</option>
              <option value="cancelado">Cancelado</option>
            </Select>
          </Campo>
          <div className="pt-6">
            <Checkbox name="usa_itens" rotulo="Controlar por itens" ajuda="Saldo a faturar calculado pelos itens (família × quantidade). Ativado automaticamente ao adicionar itens." defaultChecked={p?.usa_itens ?? false} />
          </div>
        </Grade>
        <div className="mt-4">
          <Campo rotulo="Observações">
            <TextArea name="observacoes" defaultValue={p?.observacoes ?? ""} />
          </Campo>
        </div>
      </Card>
      <div className="flex items-center gap-2">
        <Botao>Salvar</Botao>
        <BotaoLink href={p ? `/pedidos/${p.id}` : "/pedidos"} variante="secundario">Cancelar</BotaoLink>
      </div>
    </form>
  );
}
