-- Migration: Fix Supabase Security Linter Errors
-- Date: 2026-08-11

-- 1. Fix Security Definer View
-- Alter view to use security_invoker = true so queries run with the permissions of the invoking user
ALTER VIEW public.fa_kiosk_my_capabilities SET (security_invoker = true);

-- 2. Enable Row Level Security (RLS) and add access policies for public tables

-- Table: public.solicitacoes_retirada
ALTER TABLE public.solicitacoes_retirada ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "solicitacoes_retirada_authenticated" ON public.solicitacoes_retirada;
CREATE POLICY "solicitacoes_retirada_authenticated" ON public.solicitacoes_retirada FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "solicitacoes_retirada_service_role" ON public.solicitacoes_retirada;
CREATE POLICY "solicitacoes_retirada_service_role" ON public.solicitacoes_retirada FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Table: public.pos_visita_indicadores
ALTER TABLE public.pos_visita_indicadores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pos_visita_indicadores_authenticated" ON public.pos_visita_indicadores;
CREATE POLICY "pos_visita_indicadores_authenticated" ON public.pos_visita_indicadores FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "pos_visita_indicadores_service_role" ON public.pos_visita_indicadores;
CREATE POLICY "pos_visita_indicadores_service_role" ON public.pos_visita_indicadores FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Table: public.fluxo_caixa_mensal
ALTER TABLE public.fluxo_caixa_mensal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fluxo_caixa_mensal_authenticated" ON public.fluxo_caixa_mensal;
CREATE POLICY "fluxo_caixa_mensal_authenticated" ON public.fluxo_caixa_mensal FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "fluxo_caixa_mensal_service_role" ON public.fluxo_caixa_mensal;
CREATE POLICY "fluxo_caixa_mensal_service_role" ON public.fluxo_caixa_mensal FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Table: public.fluxo_caixa_campanha
ALTER TABLE public.fluxo_caixa_campanha ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fluxo_caixa_campanha_authenticated" ON public.fluxo_caixa_campanha;
CREATE POLICY "fluxo_caixa_campanha_authenticated" ON public.fluxo_caixa_campanha FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "fluxo_caixa_campanha_service_role" ON public.fluxo_caixa_campanha;
CREATE POLICY "fluxo_caixa_campanha_service_role" ON public.fluxo_caixa_campanha FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Table: public.fluxo_caixa_referencia_loja
ALTER TABLE public.fluxo_caixa_referencia_loja ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fluxo_caixa_referencia_loja_authenticated" ON public.fluxo_caixa_referencia_loja;
CREATE POLICY "fluxo_caixa_referencia_loja_authenticated" ON public.fluxo_caixa_referencia_loja FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "fluxo_caixa_referencia_loja_service_role" ON public.fluxo_caixa_referencia_loja;
CREATE POLICY "fluxo_caixa_referencia_loja_service_role" ON public.fluxo_caixa_referencia_loja FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Table: public.fluxo_caixa_indice_sazonal
ALTER TABLE public.fluxo_caixa_indice_sazonal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fluxo_caixa_indice_sazonal_authenticated" ON public.fluxo_caixa_indice_sazonal;
CREATE POLICY "fluxo_caixa_indice_sazonal_authenticated" ON public.fluxo_caixa_indice_sazonal FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "fluxo_caixa_indice_sazonal_service_role" ON public.fluxo_caixa_indice_sazonal;
CREATE POLICY "fluxo_caixa_indice_sazonal_service_role" ON public.fluxo_caixa_indice_sazonal FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Table: public.fluxo_caixa_observacao_diaria
ALTER TABLE public.fluxo_caixa_observacao_diaria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fluxo_caixa_observacao_diaria_authenticated" ON public.fluxo_caixa_observacao_diaria;
CREATE POLICY "fluxo_caixa_observacao_diaria_authenticated" ON public.fluxo_caixa_observacao_diaria FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "fluxo_caixa_observacao_diaria_service_role" ON public.fluxo_caixa_observacao_diaria;
CREATE POLICY "fluxo_caixa_observacao_diaria_service_role" ON public.fluxo_caixa_observacao_diaria FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Table: public.fluxo_caixa_checklist
ALTER TABLE public.fluxo_caixa_checklist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fluxo_caixa_checklist_authenticated" ON public.fluxo_caixa_checklist;
CREATE POLICY "fluxo_caixa_checklist_authenticated" ON public.fluxo_caixa_checklist FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "fluxo_caixa_checklist_service_role" ON public.fluxo_caixa_checklist;
CREATE POLICY "fluxo_caixa_checklist_service_role" ON public.fluxo_caixa_checklist FOR ALL TO service_role USING (true) WITH CHECK (true);
