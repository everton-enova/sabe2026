-- ============================================================
-- SABE 2026 — Setup do Supabase Storage
-- Supabase Dashboard -> SQL Editor -> New query -> colar -> Run
--
-- Cria o bucket público 'sabe2026-documentos' e as policies de
-- acesso anônimo necessárias para o upload dos PDFs do SM.
-- É 100% idempotente: pode rodar quantas vezes quiser, sem erro.
-- (Se já rodou antes e deu "policy already exists", é porque o bucket
--  e as policies JÁ estão corretos — pode rodar de novo sem medo.)
-- ============================================================

-- 1) Cria o bucket público com limite de 4 MB e só PDF (idempotente)
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
--    precisa desta policy. (drop primeiro evita o erro 42710 na re-execução)
drop policy if exists "sabe2026-documentos anon insert" on storage.objects;
create policy "sabe2026-documentos anon insert"
on storage.objects for insert
to anon
with check (bucket_id = 'sabe2026-documentos');

-- 3) Policy de SELECT anônimo — permite ler a URL pública (necessária
--    para o Apps Script exibir o link do documento).
drop policy if exists "sabe2026-documentos anon select" on storage.objects;
create policy "sabe2026-documentos anon select"
on storage.objects for select
to anon
using (bucket_id = 'sabe2026-documentos');

-- 4) Confirmação (deve listar o bucket)
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'sabe2026-documentos';

-- ============================================================
-- Tabela de backup das submissões (evita perda de dados)
-- Armazena todos os dados enviados pelo formulário antes de
-- enviar para o Google Sheets. Se a gravação na planilha
-- falhar, os dados ficam preservados aqui.
-- ============================================================

create table if not exists sabe2026_submissoes (
  id uuid primary key default gen_random_uuid(),
  enviado_em timestamptz not null default now(),
  modalidade text not null check (modalidade in ('CP', 'SM')),
  acao text not null,
  nte text not null,
  local text not null,
  nome text,
  email text,
  telefone text,
  cpf text,
  banco text,
  agencia text,
  agencia_digito text,
  conta text,
  conta_digito text,
  pix text,
  tipo_conta text,
  operacao text,
  experiencia text,
  funcao text,
  documento_url text,
  gravado_na_planilha boolean not null default false,
  erro_gravacao text,
  payload_completo jsonb not null
);

-- Índice para consultas por NTE e local
create index if not exists idx_sabe2026_submissoes_nte_local on sabe2026_submissoes(nte, local);
create index if not exists idx_sabe2026_submissoes_enviado_em on sabe2026_submissoes(enviado_em desc);

-- Policy de leitura para o serviço (service role)
drop policy if exists "sabe2026_submissoes service role" on sabe2026_submissoes;
create policy "sabe2026_submissoes service role"
on sabe2026_submissoes for all
to service_role
using (true)
with check (true);