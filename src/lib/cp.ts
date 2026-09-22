export type Details = {
  nome: string;
  email: string;
  telefone: string;
  cpf: string;
  banco: string;
  agencia: string;
  agenciaDigito: string;
  conta: string;
  contaDigito: string;
  pix: string;
  tipoConta: string;
  operacao: string;
};

export type Coordinator = {
  registro: string;
  versao: string;
  nome: string;
  email: string;
  telefone: string;
  cpf: string;
  banco: string;
  agencia: string;
  agenciaDigito: string;
  conta: string;
  contaDigito: string;
  pix: string;
  tipoConta: string;
  operacao: string;
  adicionais: { campo: string; valor: string }[];
};

export const emptyDetails: Details = {
  nome: "",
  email: "",
  telefone: "",
  cpf: "",
  banco: "",
  agencia: "",
  agenciaDigito: "",
  conta: "",
  contaDigito: "",
  pix: "",
  tipoConta: "",
  operacao: "",
};

export const detailLabels: Record<keyof Details, string> = {
  nome: "Nome completo",
  email: "E-mail",
  telefone: "Telefone",
  cpf: "CPF",
  banco: "Banco",
  agencia: "Agência",
  agenciaDigito: "Dígito Agência",
  conta: "Conta",
  contaDigito: "Dígito Conta",
  pix: "Chave Pix",
  tipoConta: "Tipo de Conta",
  operacao: "Variação/Operação",
};