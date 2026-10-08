import { json, readRequest } from "@/lib/api-security";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Lista submissões com filtros opcionais. */
export async function POST(request: Request) {
  try {
    const payload = await readRequest(request);
    
    if (!supabase) {
      return json({ ok: false, erro: "Supabase não configurado" });
    }
    
    const { nte, local, apenasNaoGravadas } = payload;
    
    let query = supabase
      .from('sabe2026_submissoes')
      .select('*')
      .order('enviado_em', { ascending: false })
      .limit(100);
    
    if (apenasNaoGravadas) {
      query = query.eq('gravado_na_planilha', false);
    }
    
    if (nte) {
      query = query.eq('nte', String(nte));
    }
    
    if (local) {
      query = query.eq('local', String(local));
    }
    
    const { data, error } = await query;
    
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
