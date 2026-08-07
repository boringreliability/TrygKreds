-- ============================================================================
-- Minimal assertion helpers -- TEST HARNESS ONLY. NOT A MIGRATION.
-- ============================================================================
--
-- pgTAP is not available in every environment this suite has to run in, so the
-- suite carries its own tiny harness instead. It is deliberately small: record
-- a pass/fail row per assertion, then fail loudly at the end if any row failed.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS test;

DROP TABLE IF EXISTS test.results;
CREATE TABLE test.results (
  id          SERIAL PRIMARY KEY,
  description TEXT    NOT NULL,
  passed      BOOLEAN NOT NULL,
  expected    TEXT,
  actual      TEXT
);

-- ---------------------------------------------------------------------------
-- test.as(user, sql) -- run a query as a given end user and report the outcome.
--
-- Returns either 'OK:<row count>' or 'ERR:<sqlstate>'. Wrapping the query in
-- count(*) keeps assertions about *visibility* (how many rows RLS lets through)
-- separate from assertions about the row contents, and catching the error means
-- a policy that raises -- infinite recursion, for instance -- is a reportable
-- test result rather than an aborted test run.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION test.as(p_user UUID, p_sql TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
  v_state TEXT;
BEGIN
  -- Impersonate: claims first, then drop to `authenticated` so policies apply.
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text,
    true
  );
  SET LOCAL ROLE authenticated;

  BEGIN
    EXECUTE format('SELECT count(*) FROM (%s) AS _sub', p_sql) INTO v_count;
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
    RESET ROLE;
    RETURN 'ERR:' || v_state;
  END;

  RESET ROLE;
  RETURN 'OK:' || v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- test.execute_as(user, sql) -- run a statement (not a query) as an end user.
-- Returns 'OK' or 'ERR:<sqlstate>'. Used for write-path assertions.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION test.execute_as(p_user UUID, p_sql TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_state TEXT;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text,
    true
  );
  SET LOCAL ROLE authenticated;

  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
    RESET ROLE;
    RETURN 'ERR:' || v_state;
  END;

  RESET ROLE;
  RETURN 'OK';
END;
$$;

-- ---------------------------------------------------------------------------
-- test.check(description, actual, expected) -- record one assertion.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION test.check(
  p_description TEXT,
  p_actual      TEXT,
  p_expected    TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO test.results (description, passed, expected, actual)
  VALUES (p_description, p_actual = p_expected, p_expected, p_actual);
END;
$$;

-- ---------------------------------------------------------------------------
-- test.finish() -- print every result, then raise if anything failed so that
-- psql (with ON_ERROR_STOP=1) exits non-zero and CI goes red.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION test.finish()
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  r        RECORD;
  v_failed INTEGER;
  v_total  INTEGER;
BEGIN
  FOR r IN SELECT * FROM test.results ORDER BY id LOOP
    IF r.passed THEN
      RAISE INFO 'ok   %  %', r.id, r.description;
    ELSE
      RAISE WARNING 'FAIL %  %  (expected %, got %)',
        r.id, r.description, r.expected, r.actual;
    END IF;
  END LOOP;

  SELECT count(*) FILTER (WHERE NOT passed), count(*)
    INTO v_failed, v_total
  FROM test.results;

  RAISE INFO '--- % of % assertions passed ---', v_total - v_failed, v_total;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'No assertions ran -- the suite is not wired up correctly.';
  END IF;

  IF v_failed > 0 THEN
    RAISE EXCEPTION '% of % RLS assertions failed', v_failed, v_total;
  END IF;
END;
$$;
