-- ============================================================
-- SABE 2026 — Setup do Supabase Storage (rodar UMA vez no SQL Editor)
-- Supabase Dashboard -> SQL Editor -> New query -> colar -> Run
--
-- Cria o bucket público 'sabe2026-documentos' e as policies de
-- acesso anônimo necessárias para o upload dos PDFs do SM.
-- É idempotente: pode rodar quantas vezes quiser.
-- ============================================================

-- 1) Cria o bucket público com limite de 4 MB e só PDF
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sabe2026-documentos',
  'sabe2026-documentos',
  true,
  4194304,                          -- 4 MB (igual ao limite do formulário)
  array['application/pdf']::text[]
)
on conflict (id) do update set
  public = true,
  file_size_limit = 4194304,
  allowed_mime_types = array['application/pdf']::text[];

-- 2) Policy de INSERT anônimo — o upload é feito pelo servidor da Vercel
--    com SUPABASE_SERVICE_ROLE_KEY (ignora RLS), mas se a service role
--    não estiver configurada o app cai na publishable key (anon), que
--    precisa desta policy.
create policy "sabe2026-documentos anon insert"
on storage.objects for insert
to anon
with check (bucket_id = 'sabe2026-documentos');

-- 3) Policy de SELECT anônimo — permite ler a URL pública (necessária
--    para o Apps Script exibir o link do documento).
create policy "sabe2026-documentos anon select"
on storage.objects for select
to anon
using (bucket_id = 'sabe2026-documentos');

-- 4) Confirmação (deve listar o bucket)
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'sabe2026-documentos';