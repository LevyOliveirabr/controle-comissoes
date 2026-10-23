import Link from "next/link";
import { Card, Pagina } from "@/components/ui";

const ESTAGIOS = [
  {
    n: 1,
    nome: "Já recebida em conta",
    cor: "bg-emerald-500",
    oQueE: "Comissão que já caiu. São as apurações ligadas a uma NFS-e sua que tem data de crédito informada.",
    oQueFazer: "Nada. Só confira o extrato quando registrar o crédito.",
  },
  {
    n: 2,
    nome: "NF de representação emitida",
    cor: "bg-sky-500",
    oQueE: "Você já emitiu a NFS-e para a representada, mas o dinheiro ainda não entrou. A data esperada é a emissão + prazo de pagamento da representada.",
    oQueFazer: "Aguardar o crédito. Se passar da previsão, aparece como 'vencido' — hora de cobrar.",
  },
  {
    n: 3,
    nome: "Autorizada, sem NF emitida",
    cor: "bg-violet-500",
    oQueE: "A representada já confirmou a comissão (no relatório de apuração), mas você ainda não emitiu a NFS-e correspondente.",
    oQueFazer: "Emitir a NFS-e, lançá-la em 'NFS-e de comissão' e marcar quais apurações ela cobre.",
  },
  {
    n: 4,
    nome: "Faturada, sem apuração",
    cor: "bg-amber-500",
    oQueE: "O cliente já recebeu a NF de venda, mas a representada ainda não mandou a apuração. O valor é a comissão prevista da NF (base × %) menos o que já foi apurado dela.",
    oQueFazer: "Aguardar o relatório da representada (cada uma tem um prazo, cadastrado em 'dias até a apuração'). Quando chegar, lançar a apuração.",
  },
  {
    n: 5,
    nome: "Pedido firme a faturar",
    cor: "bg-slate-400",
    oQueE: "Pedido confirmado pelo cliente que ainda não foi (totalmente) faturado. O valor é o saldo a faturar × % do pedido.",
    oQueFazer: "Acompanhar com o cliente/representada a liberação do faturamento. Quando a NF sair, lance-a ligada ao pedido: o valor sai daqui e vai para o estágio 4.",
  },
];

const FLUXO = [
  { passo: "Pedido", texto: "O cliente fecha um pedido com a representada. Você lança o pedido com valor e %. Enquanto não é faturado, a comissão fica no estágio 5 (firme) ou no pipeline (previsão)." },
  { passo: "NF de venda", texto: "A representada fatura e emite a NF para o cliente. Você lança a NF ligada ao pedido. A comissão prevista (base × %) nasce aqui e vai para o estágio 4." },
  { passo: "Apuração", texto: "A representada manda o relatório dizendo quanto de comissão reconheceu em cada NF. Você lança a apuração. O valor sai do estágio 4 e vai para o 3." },
  { passo: "NFS-e", texto: "Você emite sua nota de serviço para a representada e marca quais apurações ela cobre. Essas apurações vão para o estágio 2." },
  { passo: "Crédito", texto: "O dinheiro cai na conta. Você registra a data do crédito na NFS-e. Tudo o que ela cobre vai para o estágio 1." },
];

export default function AjudaPage() {
  return (
    <Pagina titulo="Entenda os números" descricao="Como o sistema chega em cada valor, explicado sem jargão. Em qualquer tela, clique no valor para ver a lista de registros que o compõem, ou passe o mouse no '?' para a explicação curta.">
      <Card titulo="O caminho da comissão: do pedido ao dinheiro na conta">
        <ol className="grid grid-cols-1 gap-4 md:grid-cols-5">
          {FLUXO.map((f, i) => (
            <li key={f.passo} className="relative rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Passo {i + 1}</div>
              <div className="mt-1 text-base font-semibold text-slate-900">{f.passo}</div>
              <p className="mt-2 text-sm text-slate-700">{f.texto}</p>
              {i < FLUXO.length - 1 && <span className="absolute -right-3 top-1/2 hidden -translate-y-1/2 text-slate-300 md:block">→</span>}
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-slate-600">
          Em representadas que pagam <strong>por parcela</strong> (ex.: F-Led), a comissão de cada NF é liberada aos poucos, conforme as duplicatas do cliente vencem — por isso essas NFs aparecem na Agenda em várias datas.
        </p>
      </Card>

      <Card titulo="Os 5 estágios do funil" rodape="Os estágios não se sobrepõem: cada real da carteira firme está em exatamente um deles. A soma dos 5 é o 'Total da carteira firme'; a soma de 2 a 5 é a 'Comissão a receber (firme)'.">
        <ol className="space-y-4">
          {ESTAGIOS.map((e) => (
            <li key={e.n} className="grid grid-cols-[1.75rem_1fr] gap-3">
              <span className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold text-white ${e.cor}`}>{e.n}</span>
              <div>
                <div className="font-semibold text-slate-900">{e.nome}</div>
                <p className="mt-1 text-sm text-slate-700">{e.oQueE}</p>
                <p className="mt-1 text-sm text-slate-500"><span className="font-medium text-slate-600">O que fazer:</span> {e.oQueFazer}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card titulo="Por que o card principal mostra dois valores?">
          <p className="text-sm text-slate-700">
            <strong>Nota a nota</strong> (o número grande): em cada NF de venda, o sistema compara a comissão prevista com o que a representada já apurou e só conta o que falta. Se uma representada apurou <em>mais</em> do que o previsto, esse excedente não é usado para cobrir outras notas — ele aparece como alerta de divergência.
          </p>
          <p className="mt-3 text-sm text-slate-700">
            <strong>Residual</strong> (o critério da planilha antiga): soma todas as comissões previstas e subtrai todas as apurações de uma vez. Aí um excedente em uma nota abate o que falta em outra.
          </p>
          <p className="mt-3 text-sm text-slate-700">
            Hoje a diferença entre os dois é a <strong>Green</strong>: ela apurou R$ 111,44 acima do % cadastrado. No residual isso diminui o total a receber; no nota a nota o total fica íntegro e a Green aparece no alerta amarelo do Dashboard. Vale confirmar com a Green qual é o % correto — se for maior que o cadastrado, ajuste o % na representada e os dois critérios voltam a bater.
          </p>
        </Card>

        <Card titulo="Agenda de recebimentos e matriz de 12 meses">
          <p className="text-sm text-slate-700">
            A <strong>Agenda</strong> é a lista de tudo que ainda vai entrar, item por item, com a data em que o dinheiro deve cair. Cada item vem de uma destas origens:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li><strong>NF de representação emitida</strong> — sua NFS-e já emitida; data = emissão + prazo de pagamento da representada.</li>
            <li><strong>Faturada, aguardando apuração</strong> — NF de venda sem apuração; data = emissão da NF + dias até a apuração + prazo de pagamento.</li>
            <li><strong>Autorizada, falta emitir sua NF</strong> — apuração sem NFS-e; data = hoje + prazo de pagamento (supondo que você emita agora).</li>
            <li><strong>Pedido firme a faturar</strong> — saldo do pedido; data = faturamento previsto + ciclo da representada. Sem data prevista, cai em “Sem data definida”.</li>
            <li><strong>Pedido em previsão</strong> — igual ao anterior, mas marcado como Previsão e fora do total firme.</li>
          </ul>
          <p className="mt-3 text-sm text-slate-700">
            A <strong>matriz</strong> do Dashboard é a mesma Agenda somada por mês e por representada. “Vencido” é o que tinha data antes do mês atual e ainda não entrou. O total da matriz é igual ao card “Comissão a receber (firme)” — só distribuído no tempo.
          </p>
        </Card>
      </div>

      <Card titulo="Glossário rápido">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm md:grid-cols-2">
          {[
            ["Base de cálculo", "Parte da NF sobre a qual a comissão incide: o total da nota ou só os produtos (sem frete/impostos), conforme o cadastro da representada."],
            ["% efetivo", "O percentual que vale de fato: primeiro o da NF (se informado), depois o do pedido, depois o padrão da representada."],
            ["Comissão prevista", "Base × %. O que você espera receber de uma NF."],
            ["Comissão apurada", "O que a representada reconheceu no relatório. Pode ser diferente da prevista — aí aparece a divergência."],
            ["Comissão recebida", "Apurações em NFS-e com data de crédito. Dinheiro na conta."],
            ["Saldo de comissão", "Prevista − recebida. O que ainda falta entrar de uma NF."],
            ["Saldo a faturar", "Valor do pedido − NFs emitidas (ou soma dos itens que faltam, quando o pedido usa itens)."],
            ["Tolerâncias", "Pequenas diferenças (centavos de comissão, poucos reais de saldo) são ignoradas para o status não ficar 'pendente' por arredondamento. Ajustáveis em Parâmetros."],
            ["Firme × Previsão", "Firme é pedido confirmado; entra em todas as somas. Previsão é expectativa; aparece à parte no pipeline. Convertido é a previsão que virou firme (fica fora para não contar duas vezes)."],
            ["Consolidado", "Visão por cliente: carteira firme, quanto já foi faturado, saldo e comissão (total, apurada, recebida, a receber)."],
          ].map(([t, d]) => (
            <div key={t}>
              <dt className="font-semibold text-slate-900">{t}</dt>
              <dd className="mt-0.5 text-slate-700">{d}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <p className="text-sm text-slate-500">
        Voltar ao <Link href="/" className="text-sky-700 hover:underline">Dashboard</Link>.
      </p>
    </Pagina>
  );
}
