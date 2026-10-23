/**
 * Utilitários de data sobre strings ISO 'YYYY-MM-DD' (sem fuso horário).
 */

export type DataISO = string;

export function paraData(iso: DataISO): Date {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

export function paraISO(d: Date): DataISO {
  return d.toISOString().slice(0, 10);
}

export function hojeISO(): DataISO {
  const agora = new Date();
  return paraISO(new Date(Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate())));
}

export function somarDias(iso: DataISO, dias: number): DataISO {
  const d = paraData(iso);
  d.setUTCDate(d.getUTCDate() + dias);
  return paraISO(d);
}

export function somarMeses(iso: DataISO, meses: number): DataISO {
  const d = paraData(iso);
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + meses);
  const ultimo = diasNoMes(d.getUTCFullYear(), d.getUTCMonth() + 1);
  d.setUTCDate(Math.min(dia, ultimo));
  return paraISO(d);
}

export function diasNoMes(ano: number, mes1a12: number): number {
  return new Date(Date.UTC(ano, mes1a12, 0)).getUTCDate();
}

/** Primeiro dia do mês da data. */
export function inicioMes(iso: DataISO): DataISO {
  return iso.slice(0, 7) + "-01";
}

/** Último dia do mês da data (EOMONTH(d, 0)). */
export function fimMes(iso: DataISO): DataISO {
  const [a, m] = iso.split("-").map(Number);
  return `${iso.slice(0, 7)}-${String(diasNoMes(a, m)).padStart(2, "0")}`;
}

export function diferencaDias(fim: DataISO, inicio: DataISO): number {
  return Math.round((paraData(fim).getTime() - paraData(inicio).getTime()) / 86_400_000);
}

const MESES_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** 'Out/2026' */
export function rotuloMes(iso: DataISO): string {
  const [a, m] = iso.split("-").map(Number);
  const nome = MESES_PT[m - 1];
  return nome.charAt(0).toUpperCase() + nome.slice(1) + "/" + a;
}

/** Converte rótulos como 'Jul/2026', 'Set/2026 - NF 852', 'Julho/2026' em '2026-07-01'. */
export function mesDoRotulo(rotulo: string | null | undefined): DataISO | null {
  if (!rotulo) return null;
  const m = rotulo.match(/([A-Za-zçÇ]{3,9})\s*\/\s*(\d{4})/);
  if (!m) return null;
  const nome = m[1].toLowerCase().slice(0, 3);
  const idx = MESES_PT.indexOf(nome);
  if (idx < 0) return null;
  return `${m[2]}-${String(idx + 1).padStart(2, "0")}-01`;
}

/** 'dd/mm/aaaa' -> ISO; aceita Date e ISO já formatado. */
export function normalizarData(valor: unknown): DataISO | null {
  if (valor == null || valor === "") return null;
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    // ExcelJS devolve datas em UTC; planilhas sem hora caem exatamente à meia-noite.
    return paraISO(new Date(Date.UTC(valor.getUTCFullYear(), valor.getUTCMonth(), valor.getUTCDate())));
  }
  if (typeof valor === "string") {
    const br = valor.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
    const iso = valor.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  return null;
}
