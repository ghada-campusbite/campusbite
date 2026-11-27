-- Run ONCE as the owner/migration role, after the first migration. Replace the password placeholder
-- in your SQL client only; never commit it. Runtime app role: DML only, no DDL, no role/db creation.
CREATE ROLE campusbite_app LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT CONNECT ON DATABASE neondb TO campusbite_app;  -- change neondb to your database name
GRANT USAGE ON SCHEMA public TO campusbite_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO campusbite_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO campusbite_app;
-- tables added by future migrations (run by the current owner role) get the same grants:
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO campusbite_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO campusbite_app;
-- do not grant on _prisma_migrations: the app does not need it
REVOKE ALL ON TABLE _prisma_migrations FROM campusbite_app;
