// golden copy of catalog SQL. NOT imported from src → spec compare src text to this, any edit of a statement (even 1 char)
// fail until this file change too. Kills SQL-text mutants w/o live DB. What statements DO on real server = not proved here,
// only integration test vs live PostgreSQL prove it (lives outside this repo)
export const EXPECTED_ROLE_SQL = {
	identity: `
SELECT current_user::text AS effective_role,
       session_user::text AS login_role,
       r.rolsuper AS superuser,
       r.rolcreaterole AS createrole,
       r.rolcreatedb AS createdb,
       r.rolbypassrls AS bypassrls,
       r.rolreplication AS replication
FROM pg_catalog.pg_roles r
WHERE r.rolname = current_user`,
	ownsObjects: `
SELECT EXISTS (
  SELECT 1
  FROM pg_catalog.pg_shdepend d
  JOIN pg_catalog.pg_roles r ON r.oid = d.refobjid
  WHERE d.refclassid = 'pg_catalog.pg_authid'::regclass
    AND d.deptype = 'o'
    AND r.rolname = current_user
) AS owns`,
	memberships: `
WITH RECURSIVE membership (role_oid) AS (
  SELECT a.roleid
  FROM pg_catalog.pg_auth_members a
  JOIN pg_catalog.pg_roles me ON me.oid = a.member
  WHERE me.rolname = current_user
  UNION
  SELECT a.roleid
  FROM pg_catalog.pg_auth_members a
  JOIN membership m ON a.member = m.role_oid
)
SELECT r.rolname::text AS member_of
FROM membership m
JOIN pg_catalog.pg_roles r ON r.oid = m.role_oid`,
	grant: {
		schema: `
SELECT CASE
  WHEN s.oid IS NULL THEN NULL
  ELSE pg_catalog.has_schema_privilege(current_user, s.oid, $2::text)
END AS held
FROM (SELECT pg_catalog.to_regnamespace($1::text)::oid AS oid) s`,
		function: `
SELECT pg_catalog.bool_and(pg_catalog.has_function_privilege(current_user, p.oid, 'EXECUTE')) AS held
FROM pg_catalog.pg_proc p
WHERE p.pronamespace = pg_catalog.to_regnamespace($1::text)::oid
  AND p.proname = $2::text`,
		relation: `
SELECT CASE
  WHEN c.relkind = 'S' THEN
    CASE WHEN $2::text IN ('USAGE', 'SELECT', 'UPDATE')
      THEN pg_catalog.has_sequence_privilege(current_user, c.oid, $2::text)
      ELSE false
    END
  WHEN $2::text = 'USAGE' THEN false
  ELSE pg_catalog.has_table_privilege(current_user, c.oid, $2::text)
END AS held
FROM pg_catalog.pg_class c
WHERE c.oid = pg_catalog.to_regclass($1::text)::oid`,
		columns: `
SELECT a.attname::text AS name,
       pg_catalog.has_column_privilege(current_user, a.attrelid, a.attname::text, $2::text) AS held
FROM pg_catalog.pg_attribute a
WHERE a.attrelid = pg_catalog.to_regclass($1::text)::oid
  AND a.attname = ANY ($3::text[])
  AND a.attnum > 0
  AND NOT a.attisdropped`
	}
} as const
