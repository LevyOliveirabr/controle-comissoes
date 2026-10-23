import "server-only";
import { carregarDados } from "./dados";
import { calcular, type Filtro, type Resultado } from "./motor";

export type ParametrosBusca = Record<string, string | string[] | undefined>;

/** Lê o filtro global (RN-26) da query string: ?rep=<uuid>&cli=<uuid>. */
export function filtroDaBusca(sp: ParametrosBusca): Filtro {
  const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || null;
  return { representada_id: um(sp.rep), cliente_id: um(sp.cli) };
}

export function queryDoFiltro(f: Filtro, extra: Record<string, string | null | undefined> = {}) {
  const q = new URLSearchParams();
  if (f.representada_id) q.set("rep", f.representada_id);
  if (f.cliente_id) q.set("cli", f.cliente_id);
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** Carrega o banco e roda o motor. Sempre dinâmico (sem cache). */
export async function obterResultado(filtro: Filtro = {}): Promise<Resultado> {
  const dados = await carregarDados();
  return calcular(dados, { filtro });
}
