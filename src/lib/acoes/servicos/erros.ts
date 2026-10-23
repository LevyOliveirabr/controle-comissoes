import { ErroValidacao } from "../base";

export { ErroValidacao };

export interface Opcao {
  id: string;
  rotulo: string;
  detalhe?: string;
}

/** Nada encontrado para o texto informado; traz sugestões parecidas. */
export class ErroNaoEncontrado extends Error {
  constructor(
    public entidade: string,
    public texto: string,
    public sugestoes: Opcao[] = [],
    mensagem?: string,
  ) {
    super(mensagem ?? `Não encontrei ${entidade} com "${texto}".`);
  }
}

/** Mais de um registro combina com o texto; o chamador precisa escolher. */
export class ErroAmbiguo extends Error {
  constructor(
    public entidade: string,
    public texto: string,
    public opcoes: Opcao[],
    mensagem?: string,
  ) {
    super(mensagem ?? `Encontrei ${opcoes.length} ${entidade}s parecidos com "${texto}"; informe qual.`);
  }
}
