-- Segurança (auditoria 2026-11-10): `sessoes_auth` era a única tabela do
-- controle-caixa em `public` sem RLS (alerta "rls_disabled_in_public" do
-- Supabase) e `authenticated` tinha todos os privilégios nela. Quem inserisse
-- um hash conhecido ali forjava a sessão de um owner.
--
-- O app conecta por DATABASE_URL como dono da tabela, então não é afetado:
-- RLS ligado e sem policy = negado para anon/authenticated via API do Supabase.
--
-- ROLLBACK:
--   alter table public.sessoes_auth disable row level security;
--   grant all on public.sessoes_auth to authenticated;

alter table public.sessoes_auth enable row level security;
revoke all on public.sessoes_auth from anon, authenticated;
