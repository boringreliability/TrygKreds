Feature: An unauthenticated caller can do nothing
  In order to mean what the migrations say
  As the maintainer of a privacy-first app
  I want the grants in the database to match the intent written above them

  # The migrations revoke EXECUTE from PUBLIC and grant it to authenticated,
  # under the comment "nothing else should be able to call them". On Supabase
  # that is not what happens: default privileges grant EXECUTE directly to the
  # anon role, and revoking from PUBLIC does not touch a named grant.
  #
  # Nothing leaks today, because every one of those functions refuses a NULL
  # auth.uid() itself. This is about the layer that was supposed to hold.
  #
  # Verified by: supabase/tests/06_grants_test.sql.

  Scenario: An unauthenticated caller cannot execute any of our functions
    Given the anon role
    Then it should hold no EXECUTE privilege on any function in public

  Scenario: Trigger functions are not part of the API surface
    # add_owner_as_member and handle_new_user run from triggers. Exposing them
    # as RPC endpoints gives callers something to poke at for no benefit.
    Given the trigger functions add_owner_as_member and handle_new_user
    Then no end-user role should be able to execute them

  Scenario: An unauthenticated caller holds nothing on any table
    Given the anon role
    Then it should hold no privilege on any table or view in public

  Scenario: Every function pins its search_path
    # A mutable search_path in a function is a way in. Most of ours set it
    # already; two did not.
    Given every function in the public schema
    Then each should have search_path set explicitly

  Scenario: A function added later cannot leak unnoticed
    # Prevention is not available: PostgreSQL's built-in default grants EXECUTE
    # on a new function to PUBLIC, and ALTER DEFAULT PRIVILEGES cannot remove
    # it -- the stored default ACL is a delta on top of the built-in one, so
    # there is nothing for a REVOKE to take away.
    #
    # So this is caught rather than prevented, like the other guards in this
    # repository. Whoever adds a function revokes PUBLIC and grants explicitly;
    # if they forget, the suite says so.
    Given someone adds a function to public without revoking PUBLIC
    When the RLS suite runs
    Then it should fail and name the function

  Scenario: The harness tells the truth about grants
    # This is the reason the ward exists. Before this change the harness gave
    # anon nothing, so "anon cannot call X" passed without anything being
    # fixed -- a test that could not go red for the right reason.
    Given the test harness
    Then it should grant anon exactly what Supabase grants it
