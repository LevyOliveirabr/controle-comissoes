import { Mensagens } from "@/components/mensagens";
import { Botao, Campo, Card, Grade, Input, Pagina } from "@/components/ui";
import { salvarParametros } from "@/lib/acoes/cadastros";
import { carregarDados } from "@/lib/dados";
import type { ParametrosBusca } from "@/lib/resultado";

export default async function ParametrosPage({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  const sp = await searchParams;
  const d = await carregarDados();
  return (
    <Pagina titulo="Parâmetros" descricao="Tolerâncias usadas nos cálculos, iguais às da planilha.">
      <Mensagens sp={sp} />
      <form action={salvarParametros} className="space-y-6">
        <Card titulo="Tolerâncias">
          <Grade colunas={2}>
            <Campo rotulo="Tolerância do saldo a faturar (R$)" ajuda="Saldo até este valor conta como 'Faturado integralmente' (absorve arredondamento e pequenas diferenças de preço).">
              <Input name="tolerancia_saldo" type="number" step="0.01" min="0" defaultValue={d.parametros.tolerancia_saldo} />
            </Campo>
            <Campo rotulo="Tolerância da comissão (R$)" ajuda="Saldo de comissão até este valor conta como 'Comissão recebida'.">
              <Input name="tolerancia_comissao" type="number" step="0.01" min="0" defaultValue={d.parametros.tolerancia_comissao} />
            </Campo>
          </Grade>
        </Card>
        <Botao>Salvar</Botao>
      </form>
    </Pagina>
  );
}
