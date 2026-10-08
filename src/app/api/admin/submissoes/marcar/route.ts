import { json, readRequest } from "@/lib/api-security";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Marca uma submissão como gravada (ou não) na planilha. */
export async function POST(request: Request) {
  try {
    const payload = await readRequest(request);
    
    if (!supabase) {
      return json({ ok: false, erro: "Supabase não configurado" });
    }
    
    const { id, gravado } = payload;
    
    if (!id) {
      return json({ ok: false, erro: "ID é obrigatório" });
    }
    
    const { error } = await supabase
      .from('sabe2026_submissoes')
      .update({
        gravado_na_planilha: gravado === true,
        erro_gravacao: gravado ? null : 'Marcado manualmente como não gravado',
      })
      .eq('id', String(id));
    
    if (error) {
      return json({ ok: false, erro: error.message });
    }
    
    return json({ ok: true });
  } catch (error) {
    return json({ 
      ok: false, 
      erro: error instanceof Error ? error.message : String(error) 
    });
  }
}
