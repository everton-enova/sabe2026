import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabase = url && key
  ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

export function bucketEnabled() {
  return !!supabase;
}

/* Salva uma submissão no Supabase para backup. Retorna o ID do registro. */
export async function saveSubmissao(dados: {
  modalidade: string;
  acao: string;
  nte: string;
  local: string;
  payload: Record<string, unknown>;
}) {
  if (!supabase) return null;
  
  const { data, error } = await supabase
    .from('sabe2026_submissoes')
    .insert({
      modalidade: dados.modalidade,
      acao: dados.acao,
      nte: dados.nte,
      local: dados.local,
      payload_completo: dados.payload,
      // Extrai campos principais para facilitar consultas
      nome: typeof dados.payload.nome === 'string' ? dados.payload.nome : null,
      email: typeof dados.payload.email === 'string' ? dados.payload.email : null,
      telefone: typeof dados.payload.telefone === 'string' ? dados.payload.telefone : null,
      cpf: typeof dados.payload.cpf === 'string' ? dados.payload.cpf : null,
      banco: typeof dados.payload.banco === 'string' ? dados.payload.banco : null,
      agencia: typeof dados.payload.agencia === 'string' ? dados.payload.agencia : null,
      agencia_digito: typeof dados.payload.agenciaDigito === 'string' ? dados.payload.agenciaDigito : null,
      conta: typeof dados.payload.conta === 'string' ? dados.payload.conta : null,
      conta_digito: typeof dados.payload.contaDigito === 'string' ? dados.payload.contaDigito : null,
      pix: typeof dados.payload.pix === 'string' ? dados.payload.pix : null,
      tipo_conta: typeof dados.payload.tipoConta === 'string' ? dados.payload.tipoConta : null,
      operacao: typeof dados.payload.operacao === 'string' ? dados.payload.operacao : null,
      experiencia: typeof dados.payload.experiencia === 'string' ? dados.payload.experiencia : null,
      funcao: typeof dados.payload.funcao === 'string' ? dados.payload.funcao : null,
      documento_url: typeof dados.payload.documentoUrl === 'string' ? dados.payload.documentoUrl : null,
    })
    .select('id')
    .single();
  
  if (error) {
    console.error('Erro ao salvar submissão no Supabase:', error.message);
    return null;
  }
  
  return data?.id || null;
}

/* Marca uma submissão como gravada na planilha. */
export async function markSubmissaoGravada(id: string, sucesso: boolean, erro?: string) {
  if (!supabase || !id) return;
  
  const { error } = await supabase
    .from('sabe2026_submissoes')
    .update({
      gravado_na_planilha: sucesso,
      erro_gravacao: erro || null,
    })
    .eq('id', id);
  
  if (error) {
    console.error('Erro ao atualizar submissão no Supabase:', error.message);
  }
}

/* Faz upload do PDF para o Supabase Storage e retorna a URL pública.
   O caminho inclui NTE, município e timestamp para evitar colisão. */
export async function uploadDocumento(
  arquivo: { name: string; type: string; buffer: Buffer },
  nte: string,
  municipio: string
) {
  if (!supabase) throw new Error("Supabase não configurado.");
  const bucket = "sabe2026-documentos";
  /* O Supabase Storage rejeita chaves com acentos ("Invalid key"). Normaliza o nome
     do arquivo: tira acentos (NFD), remove símbolos e espaços, e garante só ASCII seguro. */
  const safeNome = String(arquivo.name || "documento.pdf")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/:*?"<>|\s]/g, "_")
    .replace(/[^A-Za-z0-9.\-_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/\.pdf$/i, ".pdf") || "documento.pdf";
  const timestamp = Date.now();
  const safeMunicipio = String(municipio || "SEM_MUNICIPIO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "_")
    .toUpperCase();
  const path = `NTE_${String(nte).replace(/\D/g, "")}/${safeMunicipio}/${timestamp}_${safeNome}`;

  const { error } = await supabase.storage.from(bucket).upload(path, arquivo.buffer, {
    contentType: arquivo.type || "application/pdf",
    upsert: false,
  });
  if (error) throw new Error(`Upload falhou: ${error.message}`);

  /* getPublicUrl apenas monta a string e nao confere se o objeto existe — foi o
     caso do TEOLANDIA: link gravado na planilha com o arquivo ausente no bucket
     (NoSuchKey). Confirma que o objeto foi de fato persistido antes de devolver. */
  const { data: info, error: infoError } = await supabase.storage.from(bucket).info(path);
  if (infoError || !info) throw new Error(`Upload não confirmado no Storage: ${infoError?.message || "objeto ausente"}`);

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/* Substitui o documento de um município no Supabase Storage, sobrescrevendo
   o arquivo no mesmo path determinístico (sem timestamp). Usado no fluxo
   "substituir-documento" do SM quando o ofício anterior está inválido. */
export async function replaceDocumento(
  arquivo: { name: string; type: string; buffer: Buffer },
  nte: string,
  municipio: string
) {
  if (!supabase) throw new Error("Supabase não configurado.");
  const bucket = "sabe2026-documentos";
  const safeMunicipio = String(municipio || "SEM_MUNICIPIO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "_")
    .toUpperCase();
  // Path determinístico: sobrescreve o documento do município.
  const path = `NTE_${String(nte).replace(/\D/g, "")}/${safeMunicipio}/documento.pdf`;

  const { error } = await supabase.storage.from(bucket).upload(path, arquivo.buffer, {
    contentType: arquivo.type || "application/pdf",
    upsert: true,
  });
  if (error) throw new Error(`Upload falhou: ${error.message}`);

  const { data: info, error: infoError } = await supabase.storage.from(bucket).info(path);
  if (infoError || !info) throw new Error(`Upload não confirmado no Storage: ${infoError?.message || "objeto ausente"}`);

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}