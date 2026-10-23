/** Formatação pt-BR (sem dependência de fuso: datas ISO viram dd/mm/aaaa por string). */

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtNum = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

export const brl = (v: number | null | undefined) => (v == null ? "—" : fmtBRL.format(v));
export const num = (v: number | null | undefined) => (v == null ? "—" : fmtNum.format(v));
export const inteiro = (v: number | null | undefined) => (v == null ? "—" : fmtInt.format(v));

export function pct(v: number | null | undefined, casas = 2) {
  if (v == null) return "—";
  return `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: 4 })}%`;
}

export function data(iso: string | null | undefined) {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LONGO = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function mesCurto(iso: string | null | undefined) {
  if (!iso) return "—";
  const [a, m] = iso.split("-");
  return `${MESES[Number(m) - 1]}/${a.slice(2)}`;
}

export function mesLongo(iso: string | null | undefined) {
  if (!iso) return "—";
  const [a, m] = iso.split("-");
  return `${MESES_LONGO[Number(m) - 1]} de ${a}`;
}

/** Quantidade de dias com sinal, em texto curto ("em 12 dias", "há 3 dias", "hoje"). */
export function diasRelativos(dias: number) {
  if (dias === 0) return "hoje";
  if (dias > 0) return `em ${dias} dia${dias === 1 ? "" : "s"}`;
  return `há ${-dias} dia${dias === -1 ? "" : "s"}`;
}
