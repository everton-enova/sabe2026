export const detailLabels = {
  nome: "Nome", email: "E-mail", telefone: "Telefone", cpf: "CPF",
  banco: "Banco", agencia: "Agência", conta: "Conta corrente", pix: "Chave Pix",
} as const;
export type Details = Record<keyof typeof detailLabels, string>;
export type Coordinator = Details & {
  registro: string;
  versao: string;
  adicionais: { campo: string; valor: string }[];
};
export const emptyDetails: Details = {
  nome: "", email: "", telefone: "", cpf: "", banco: "", agencia: "", conta: "", pix: "",
};
