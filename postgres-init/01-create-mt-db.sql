-- Runs on the FIRST start of a fresh postgres data directory only.
-- Ensures the multi-tenant application database exists so the `migrate`
-- service can apply its migrations without a manual bootstrap step.
SELECT 'CREATE DATABASE voter_platform_mt OWNER voter'
 WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'voter_platform_mt')
\gexec
