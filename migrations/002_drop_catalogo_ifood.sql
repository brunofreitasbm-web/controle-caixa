-- Migration: Remove tabelas do Catálogo Digital (ecommerce) e da integração iFood
-- Date: 2026-08-16
--
-- Contexto: as features de catálogo público (/catalogo/:slug + painel admin) e
-- integração/gestão iFood foram removidas do app (código, rotas, cron e UI).
-- Esta migration apaga permanentemente as tabelas e os dados associados
-- (pedidos do catálogo, produtos, lojas, histórico de sincronização iFood).
--
-- ATENÇÃO: isto é destrutivo e IRREVERSÍVEL. Rode manualmente contra o banco
-- de produção só depois de confirmar que não há mais nada dependendo dessas
-- tabelas (o código já foi removido do repositório nesta mesma leva de commits).
-- Recomenda-se tirar um backup/export das tabelas antes de rodar, caso queira
-- manter o histórico de pedidos/sincronizações para consulta futura.

DROP TABLE IF EXISTS catalogo_pedidos;
DROP TABLE IF EXISTS catalogo_loja_produtos;
DROP TABLE IF EXISTS catalogo_lojas;
DROP TABLE IF EXISTS catalogo_produtos;
DROP TABLE IF EXISTS ifood_sync_history;
DROP TABLE IF EXISTS ifood_config;
