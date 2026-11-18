-- Supabase: as tabelas do schema "public" ficam expostas pela Data API (PostgREST) para quem
-- tem a chave anon do projeto. A plataforma não usa a Data API: todo acesso passa pela API
-- (NestJS + Prisma), que conecta como DONA das tabelas e por isso ignora o RLS.
-- Esta migração só fecha portas; não altera nem apaga dados. Em Postgres comum (dev, Docker)
-- a parte dos papéis anon/authenticated é pulada.

-- 1) Row Level Security ligado em todas as tabelas atuais, sem políticas = ninguém de fora lê.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

-- 2) Papéis da Data API do Supabase sem nenhum privilégio, inclusive nas tabelas futuras.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated';
  END IF;
END $$;
