"use server";

import { campos, esquemas, ErroValidacao, mensagemDeErroDb, redirecionarComErro, redirecionarComOk, revalidarTudo, transacao, validar, z } from "./util";

// --- Representadas ---------------------------------------------------------

const esquemaRepresentada = z.object({
  nome: esquemas.texto,
  cnpj: esquemas.textoOpcional,
  pct_padrao: esquemas.pct,
  base_calculo: z.enum(["valor_total_nf", "valor_produtos"]),
  po_comissao: esquemas.textoOpcional,
  dias_ate_apuracao: esquemas.inteiro,
  prazo_pagamento_dias: esquemas.inteiro,
  email_nf: esquemas.textoOpcional,
  email_copia: esquemas.textoOpcional,
  descricao_nf: esquemas.textoOpcional,
  modo_controle: z.enum(["completo", "simplificado"]),
  envia_relatorio: z.boolean(),
  regra_liberacao: z.enum(["por_nf", "por_parcela"]),
  padrao_nome_pedido: esquemas.textoOpcional,
  cor: esquemas.textoOpcional,
  ativa: z.boolean(),
  observacoes: esquemas.textoOpcional,
});

export async function salvarRepresentada(fd: FormData) {
  const id = campos.texto(fd, "id");
  const voltar = id ? `/representadas/${id}` : "/representadas/nova";
  let destino = "/representadas";
  try {
    const d = validar(esquemaRepresentada, {
      nome: campos.texto(fd, "nome"),
      cnpj: campos.texto(fd, "cnpj"),
      pct_padrao: campos.pct(fd, "pct_padrao"),
      base_calculo: campos.texto(fd, "base_calculo"),
      po_comissao: campos.texto(fd, "po_comissao"),
      dias_ate_apuracao: campos.numero(fd, "dias_ate_apuracao") ?? 0,
      prazo_pagamento_dias: campos.numero(fd, "prazo_pagamento_dias") ?? 30,
      email_nf: campos.texto(fd, "email_nf"),
      email_copia: campos.texto(fd, "email_copia"),
      descricao_nf: campos.texto(fd, "descricao_nf"),
      modo_controle: campos.texto(fd, "modo_controle"),
      envia_relatorio: campos.bool(fd, "envia_relatorio"),
      regra_liberacao: campos.texto(fd, "regra_liberacao"),
      padrao_nome_pedido: campos.texto(fd, "padrao_nome_pedido"),
      cor: campos.texto(fd, "cor"),
      ativa: campos.bool(fd, "ativa"),
      observacoes: campos.texto(fd, "observacoes"),
    });
    destino = await transacao(async (tx) => {
      if (id) {
        await tx`update representada set ${tx(d)} where id = ${id}`;
        return `/representadas/${id}`;
      }
      const [{ id: novo }] = await tx`insert into representada ${tx(d)} returning id`;
      return `/representadas/${novo}`;
    });
  } catch (e) {
    redirecionarComErro(voltar, e instanceof ErroValidacao ? e : mensagemDeErroDb(e));
  }
  revalidarTudo();
  redirecionarComOk(destino);
}

export async function excluirRepresentada(fd: FormData) {
  const id = campos.texto(fd, "id")!;
  try {
    await transacao((tx) => tx`delete from representada where id = ${id}`);
  } catch (e) {
    redirecionarComErro(`/representadas/${id}`, mensagemDeErroDb(e));
  }
  revalidarTudo();
  redirecionarComOk("/representadas", "Representada excluída.");
}

// --- Clientes --------------------------------------------------------------

const esquemaCliente = z.object({
  representada_id: esquemas.uuid,
  nome: esquemas.texto,
  cnpj: esquemas.textoOpcional,
  codigo_externo: esquemas.textoOpcional,
  observacoes: esquemas.textoOpcional,
});

export async function salvarCliente(fd: FormData) {
  const id = campos.texto(fd, "id");
  const voltar = id ? `/clientes/${id}` : "/clientes/novo";
  let destino = "/clientes";
  try {
    const d = validar(esquemaCliente, {
      representada_id: campos.texto(fd, "representada_id"),
      nome: campos.texto(fd, "nome"),
      cnpj: campos.texto(fd, "cnpj"),
      codigo_externo: campos.texto(fd, "codigo_externo"),
      observacoes: campos.texto(fd, "observacoes"),
    });
    destino = await transacao(async (tx) => {
      if (id) {
        await tx`update cliente set ${tx(d)} where id = ${id}`;
        return `/clientes/${id}`;
      }
      const [{ id: novo }] = await tx`insert into cliente ${tx(d)} returning id`;
      return `/clientes/${novo}`;
    });
  } catch (e) {
    redirecionarComErro(voltar, e instanceof ErroValidacao ? e : mensagemDeErroDb(e));
  }
  revalidarTudo();
  redirecionarComOk(destino);
}

export async function excluirCliente(fd: FormData) {
  const id = campos.texto(fd, "id")!;
  try {
    await transacao((tx) => tx`delete from cliente where id = ${id}`);
  } catch (e) {
    redirecionarComErro(`/clientes/${id}`, mensagemDeErroDb(e));
  }
  revalidarTudo();
  redirecionarComOk("/clientes", "Cliente excluído.");
}

// --- Parâmetros ------------------------------------------------------------

export async function salvarParametros(fd: FormData) {
  try {
    const saldo = validar(esquemas.dinheiro, campos.numero(fd, "tolerancia_saldo"));
    const comissao = validar(esquemas.dinheiro, campos.numero(fd, "tolerancia_comissao"));
    await transacao(async (tx) => {
      await tx`update parametro set valor = ${saldo} where chave = 'tolerancia_saldo'`;
      await tx`update parametro set valor = ${comissao} where chave = 'tolerancia_comissao'`;
    });
  } catch (e) {
    redirecionarComErro("/parametros", e instanceof ErroValidacao ? e : mensagemDeErroDb(e));
  }
  revalidarTudo();
  redirecionarComOk("/parametros");
}
