"use server";

import { campos, esquemas, ErroValidacao, mensagemDeErroDb, redirecionarComErro, redirecionarComOk, revalidarTudo, transacao, validar, z } from "./util";

// --- Apurações -------------------------------------------------------------

const esquemaApuracao = z.object({
  representada_id: esquemas.uuid,
  nf_venda_id: esquemas.uuid,
  parcela_id: esquemas.uuidOpcional,
  nfse_id: esquemas.uuidOpcional,
  mes_referencia: esquemas.dataIso,
  referencia: esquemas.textoOpcional,
  data_pgto_representada: esquemas.dataIsoOpcional,
  nr_pgto: esquemas.textoOpcional,
  base: esquemas.dinheiro,
  pct: esquemas.pct,
  valor_apurado: z.number(),
  origem: z.enum(["relatorio_representada", "nfse_propria", "manual"]),
  observacoes: esquemas.textoOpcional,
});

export async function salvarApuracao(fd: FormData) {
  const id = campos.texto(fd, "id");
  const voltar = id ? `/apuracoes/${id}` : `/apuracoes/nova${campos.texto(fd, "nf_venda_id") ? `?nf=${campos.texto(fd, "nf_venda_id")}` : ""}`;
  const voltarPara = campos.texto(fd, "voltar_para");
  let destino = "/apuracoes";
  try {
    const nfId = campos.texto(fd, "nf_venda_id");
    const base = campos.numero(fd, "base");
    const pct = campos.pct(fd, "pct");
    const apurado = campos.numero(fd, "valor_apurado");
    // Mês de referência pode vir como 'AAAA-MM' (input month) ou data completa.
    const mesBruto = campos.texto(fd, "mes_referencia");
    const mes = mesBruto && /^\d{4}-\d{2}$/.test(mesBruto) ? `${mesBruto}-01` : mesBruto;
    const d = validar(esquemaApuracao, {
      representada_id: campos.texto(fd, "representada_id"),
      nf_venda_id: nfId,
      parcela_id: campos.texto(fd, "parcela_id"),
      nfse_id: campos.texto(fd, "nfse_id"),
      mes_referencia: mes,
      referencia: campos.texto(fd, "referencia"),
      data_pgto_representada: campos.data(fd, "data_pgto_representada"),
      nr_pgto: campos.texto(fd, "nr_pgto"),
      base,
      pct,
      valor_apurado: apurado ?? (base != null && pct != null ? Math.round(base * pct * 100) / 100 : null),
      origem: campos.texto(fd, "origem") ?? "relatorio_representada",
      observacoes: campos.texto(fd, "observacoes"),
    });
    destino = await transacao(async (tx) => {
      // A representada da apuração é sempre a da NF (evita inconsistência).
      const [nf] = await tx`select representada_id from nf_venda where id = ${d.nf_venda_id}`;
      if (!nf) throw new ErroValidacao("NF de venda não encontrada.");
      const registro = { ...d, representada_id: nf.representada_id as string };
      if (id) {
        await tx`update apuracao set ${tx(registro)} where id = ${id}`;
        return `/apuracoes/${id}`;
      }
      const [{ id: novo }] = await tx`insert into apuracao ${tx(registro)} returning id`;
      return `/apuracoes/${novo}`;
    });
  } catch (e) {
    redirecionarComErro(voltar, e instanceof ErroValidacao ? e : mensagemDeErroDb(e));
  }
  revalidarTudo();
  redirecionarComOk(voltarPara ?? destino);
}

export async function excluirApuracao(fd: FormData) {
  const id = campos.texto(fd, "id")!;
  const voltar = campos.texto(fd, "voltar") ?? "/apuracoes";
  try {
    await transacao((tx) => tx`delete from apuracao where id = ${id}`);
  } catch (e) {
    redirecionarComErro(`/apuracoes/${id}`, mensagemDeErroDb(e));
  }
  revalidarTudo();
  redirecionarComOk(voltar, "Apuração excluída.");
}

// --- NFS-e de comissão -----------------------------------------------------

const esquemaNfse = z.object({
  representada_id: esquemas.uuid,
  numero: esquemas.textoOpcional,
  chave_acesso: esquemas.textoOpcional,
  data_emissao: esquemas.dataIso,
  competencia: esquemas.dataIsoOpcional,
  referencia: esquemas.textoOpcional,
  valor: esquemas.dinheiro,
  enviada_em: esquemas.dataIsoOpcional,
  data_credito: esquemas.dataIsoOpcional,
  data_credito_aproximada: z.boolean(),
  observacoes: esquemas.textoOpcional,
});

export async function salvarNfse(fd: FormData) {
  const id = campos.texto(fd, "id");
  const voltar = id ? `/nfse/${id}` : "/nfse/nova";
  let destino = "/nfse";
  try {
    const compBruta = campos.texto(fd, "competencia");
    const competencia = compBruta && /^\d{4}-\d{2}$/.test(compBruta) ? `${compBruta}-01` : compBruta;
    const d = validar(esquemaNfse, {
      representada_id: campos.texto(fd, "representada_id"),
      numero: campos.texto(fd, "numero"),
      chave_acesso: campos.texto(fd, "chave_acesso"),
      data_emissao: campos.data(fd, "data_emissao"),
      competencia,
      referencia: campos.texto(fd, "referencia"),
      valor: campos.numero(fd, "valor"),
      enviada_em: campos.data(fd, "enviada_em"),
      data_credito: campos.data(fd, "data_credito"),
      data_credito_aproximada: campos.bool(fd, "data_credito_aproximada"),
      observacoes: campos.texto(fd, "observacoes"),
    });
    const cobrir = fd.getAll("cobrir").filter((v): v is string => typeof v === "string" && v.length > 0);
    destino = await transacao(async (tx) => {
      let nfseId = id;
      if (nfseId) {
        await tx`update nfse_comissao set ${tx(d)} where id = ${nfseId}`;
      } else {
        const [{ id: novo }] = await tx`insert into nfse_comissao ${tx(d)} returning id`;
        nfseId = novo as string;
      }
      // Apurações cobertas por esta NFS-e (RN-20): marca as escolhidas; desmarca as que saíram.
      if (fd.has("cobrir_enviado")) {
        await tx`update apuracao set nfse_id = null where nfse_id = ${nfseId} and not (id = any(${cobrir}::uuid[]))`;
        if (cobrir.length) {
          await tx`update apuracao set nfse_id = ${nfseId} where id = any(${cobrir}::uuid[]) and representada_id = ${d.representada_id}`;
        }
      }
      return `/nfse/${nfseId}`;
    });
  } catch (e) {
    redirecionarComErro(voltar, e instanceof ErroValidacao ? e : mensagemDeErroDb(e));
  }
  revalidarTudo();
  redirecionarComOk(destino);
}

export async function registrarCreditoNfse(fd: FormData) {
  const id = campos.texto(fd, "id")!;
  try {
    const dataCredito = validar(esquemas.dataIso, campos.data(fd, "data_credito"));
    const aproximada = campos.bool(fd, "data_credito_aproximada");
    await transacao((tx) => tx`update nfse_comissao set data_credito = ${dataCredito}, data_credito_aproximada = ${aproximada} where id = ${id}`);
  } catch (e) {
    redirecionarComErro(`/nfse/${id}`, e instanceof ErroValidacao ? e : mensagemDeErroDb(e));
  }
  revalidarTudo();
  redirecionarComOk(`/nfse/${id}`, "Crédito registrado.");
}

export async function excluirNfse(fd: FormData) {
  const id = campos.texto(fd, "id")!;
  try {
    await transacao((tx) => tx`delete from nfse_comissao where id = ${id}`);
  } catch (e) {
    redirecionarComErro(`/nfse/${id}`, mensagemDeErroDb(e));
  }
  revalidarTudo();
  redirecionarComOk("/nfse", "NFS-e excluída.");
}
