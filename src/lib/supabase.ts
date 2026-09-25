import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabase = url && key
  ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

export function bucketEnabled() {
  return !!supabase;
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
  const safeNome = String(arquivo.name || "documento.pdf")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "_");
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

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
