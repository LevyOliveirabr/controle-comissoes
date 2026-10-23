/**
 * Busca tolerante por nome: ignora acentos, caixa, pontuação e sufixos de
 * razão social ("Ltda", "S/A"), aceita texto parcial ("Remo" → "Construtora
 * Remo Ltda") e pequenos erros de digitação ("Signfy" → "Signify", via
 * similaridade de bigramas). A base tem dezenas de registros, então a
 * pontuação é feita em memória sobre a lista completa.
 */
import { ErroAmbiguo, ErroNaoEncontrado, type Opcao } from "./erros";

const SUFIXOS = new Set(["ltda", "ltda.", "sa", "s/a", "s.a", "s.a.", "me", "epp", "eireli", "cia", "cia.", "de", "da", "do", "e"]);

export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9/.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(texto: string): string[] {
  return normalizar(texto)
    .split(/[\s\-./]+/)
    .filter((t) => t && !SUFIXOS.has(t));
}

function bigramas(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const t = ` ${s} `;
  for (let i = 0; i < t.length - 1; i++) {
    const b = t.slice(i, i + 2);
    m.set(b, (m.get(b) ?? 0) + 1);
  }
  return m;
}

/** Coeficiente de Dice sobre bigramas (0..1). */
export function similaridade(a: string, b: string): number {
  const na = normalizar(a);
  const nb = normalizar(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ba = bigramas(na);
  const bb = bigramas(nb);
  let comuns = 0;
  let totalA = 0;
  let totalB = 0;
  for (const [k, v] of ba) {
    totalA += v;
    comuns += Math.min(v, bb.get(k) ?? 0);
  }
  for (const v of bb.values()) totalB += v;
  return (2 * comuns) / (totalA + totalB);
}

/**
 * Pontua quão bem `candidato` responde à `consulta` (0..1):
 *  1.00 igual (normalizado)            0.90 consulta é palavra(s) inteira(s) do candidato
 *  0.85 candidato está dentro da consulta   0.80 cada palavra da consulta é prefixo de uma do candidato
 *  0.70 consulta é trecho do candidato  senão: similaridade de bigramas (nome inteiro ou palavra a palavra)
 */
export function pontuar(candidato: string, consulta: string): number {
  const c = normalizar(candidato);
  const q = normalizar(consulta);
  if (!c || !q) return 0;
  if (c === q) return 1;
  const tc = tokens(candidato);
  const tq = tokens(consulta);
  if (tc.join(" ") === tq.join(" ") && tq.length > 0) return 1;
  if (tq.length > 0 && new RegExp(`(^| )${escapar(tq.join(" "))}( |$)`).test(tc.join(" "))) return 0.9;
  if (tc.length > 0 && new RegExp(`(^| )${escapar(tc.join(" "))}( |$)`).test(tq.join(" "))) return 0.85;
  if (tq.length > 0 && tq.every((p) => tc.some((t) => t.startsWith(p)))) return 0.8;
  if (c.includes(q)) return 0.7;
  let melhor = similaridade(c, q);
  if (tq.length === 1) {
    for (const t of tc) melhor = Math.max(melhor, similaridade(t, q) * 0.95);
  } else if (tq.length > 1 && tc.length > 0) {
    // Cada palavra da consulta contra a palavra mais parecida do candidato (média).
    const media = tq.reduce((s, p) => s + Math.max(...tc.map((t) => similaridade(t, p))), 0) / tq.length;
    melhor = Math.max(melhor, media * 0.95);
  }
  return melhor;
}

function escapar(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface Pontuado<T> {
  item: T;
  pontos: number;
}

export function classificar<T>(itens: T[], nomeDe: (item: T) => string, consulta: string): Pontuado<T>[] {
  return itens
    .map((item) => ({ item, pontos: pontuar(nomeDe(item), consulta) }))
    .filter((p) => p.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos);
}

const LIMIAR_CANDIDATO = 0.5;
const LIMIAR_UNICO = 0.6;
const FOLGA = 0.15;

/**
 * Resolve `consulta` para exatamente um item. Lança ErroAmbiguo quando há
 * empate razoável e ErroNaoEncontrado (com sugestões) quando nada serve.
 */
export function resolverUnico<T>(
  itens: T[],
  consulta: string,
  entidade: string,
  nomeDe: (item: T) => string,
  opcaoDe: (item: T) => Opcao,
): T {
  const ranking = classificar(itens, nomeDe, consulta);
  const candidatos = ranking.filter((r) => r.pontos >= LIMIAR_CANDIDATO);
  const [primeiro, segundo] = candidatos;
  const unico = primeiro && primeiro.pontos >= LIMIAR_UNICO && (!segundo || primeiro.pontos - segundo.pontos >= FOLGA);
  if (unico) return primeiro.item;
  if (candidatos.length > 0) {
    throw new ErroAmbiguo(entidade, consulta, candidatos.slice(0, 6).map((c) => opcaoDe(c.item)));
  }
  throw new ErroNaoEncontrado(entidade, consulta, ranking.slice(0, 5).map((c) => opcaoDe(c.item)));
}
