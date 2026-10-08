import { json, readRequest } from "@/lib/api-security";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Endpoint para recuperar submissões que não foram gravadas na planilha.
   Uso: POST /api/recuperar com { nte: "1", local: "Nome do Polo" }
   Retorna todas as submissões para aquele NTE/local que não foram gravadas. */
export async function POST(request: Request) {
  try {
    const payload = await readRequest(request);
    
    if (!supabase) {
      return json({ ok: false, erro: "Supabase não configurado" });
    }
    
    const { nte, local } = payload;
    
    if (!nte || !local) {
      return json({ ok: false, erro: "NTE e local são obrigatórios" });
    }
    
    const { data, error } = await supabase
      .from('sabe2026_submissoes')
      .select('*')
      .eq('nte', String(nte))
      .eq('local', String(local))
      .order('enviado_em', { ascending: false });
    
    if (error) {
      return json({ ok: false, erro: error.message });
    }
    
    return json({ 
      ok: true, 
      total: data?.length || 0,
      submissoes: data || []
    });
  } catch (error) {
    return json({ 
      ok: false, 
      erro: error instanceof Error ? error.message : String(error) 
    });
  }
}
