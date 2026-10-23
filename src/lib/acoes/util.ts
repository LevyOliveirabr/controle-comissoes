import "server-only";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Sql } from "postgres";
import { transacaoComo } from "./base";

export { esquemas, ErroValidacao, mensagemDeErroDb, validar, z } from "./base";

/** Leitura tolerante dos campos de formulário. */
export const campos = {
  texto: (fd: FormData, nome: string) => {
    const v = fd.get(nome);
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s === "" ? null : s;
  },
  numero: (fd: FormData, nome: string) => {
    const s = campos.texto(fd, nome);
    if (s == null) return null;
    const n = Number(s.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "") || s);
    return Number.isFinite(n) ? n : NaN;
  },
  /** Percentual digitado "4" ou "4,5" → 0.04 / 0.045. */
  pct: (fd: FormData, nome: string) => {
    const n = campos.numero(fd, nome);
    return n == null || Number.isNaN(n) ? n : n / 100;
  },
  data: (fd: FormData, nome: string) => campos.texto(fd, nome),
  bool: (fd: FormData, nome: string) => fd.get(nome) === "on" || fd.get(nome) === "true",
};

/** Redireciona de volta para `voltar` com o erro na query string. */
export function redirecionarComErro(voltar: string, erro: unknown): never {
  const msg = erro instanceof Error ? erro.message : String(erro);
  const sep = voltar.includes("?") ? "&" : "?";
  redirect(`${voltar}${sep}erro=${encodeURIComponent(msg)}`);
}

export function redirecionarComOk(destino: string, mensagem = "Salvo com sucesso."): never {
  const sep = destino.includes("?") ? "&" : "?";
  redirect(`${destino}${sep}ok=${encodeURIComponent(mensagem)}`);
}

/**
 * Transação das Server Actions com o usuário da auditoria. Enquanto não há
 * login, grava APP_USUARIO (ou 'app').
 */
export function transacao<T>(fn: (tx: Sql) => Promise<T>): Promise<T> {
  return transacaoComo(process.env.APP_USUARIO ?? "app", fn);
}

/** Invalida todas as telas (tudo é derivado do mesmo conjunto de dados). */
export function revalidarTudo() {
  revalidatePath("/", "layout");
}
