Feature: Row Level Security is actually enforced
  In order to trust TrygKreds with where my family is
  As a user
  I want the database itself to refuse to hand my location to anyone I have not
  chosen to share it with

  # These scenarios are database behaviour, not app behaviour. The Jest suite
  # mocks Supabase and so cannot see a policy at all -- it would pass just as
  # happily against a database with RLS switched off. They are verified against
  # a real PostgreSQL instance by supabase/tests/, run with
  # `npm run test:rls`.

  Background:
    Given a user "alice" who owns the group "Family"
    And a user "bob" who is a member of "Family"
    And a user "carol" who owns a separate group and shares no group with them

  Scenario: Members of a group can see each other
    Given bob is sharing his location with "Family"
    When alice opens the group
    Then alice should see bob's last known location

  Scenario: Strangers cannot see each other
    Given carol is sharing her location with her own group
    When alice queries stored locations
    Then carol's location should not be visible to alice
    And bob's location should not be visible to carol

  Scenario: Turning sharing off hides the location immediately
    Given bob has a stored location in "Family"
    When bob turns off location sharing
    Then alice should no longer see bob's location
    But bob should still be able to see his own stored location

  Scenario: Views do not bypass the policies
    # groups_with_member_count and member_locations_with_sharing were created
    # without security_invoker, so they ran with the view owner's rights and
    # returned rows the caller was never allowed to see.
    When alice reads the member locations view
    Then she should see only members of groups she belongs to
    When alice reads the groups view
    Then she should see only her own groups

  Scenario: Listing group members does not crash
    # The old policy on group_members contained a subquery against
    # group_members, so Postgres aborted with "infinite recursion detected in
    # policy for relation" and every read path in the app raised instead of
    # returning rows.
    When alice lists the members of "Family"
    Then she should get the list without an error

  Scenario: Knowing a group's id is not enough to get in
    When carol tries to add herself to "Family" using its id
    Then the database should reject it
    And when carol tries to write her location into "Family"
    Then the database should reject that too

  Scenario: Joining requires a valid invite code
    When bob redeems the current invite code for carol's group
    Then bob should become a member of that group

  Scenario: An expired invite code stops working
    Given the invite code for carol's group expired yesterday
    When bob tries to redeem it
    Then he should be refused

  Scenario: A revoked invite code stops working
    Given carol has revoked her group's invite code
    When bob tries to redeem it
    Then he should be refused

  Scenario: Rotating the code invalidates the old one
    # This is what makes a code left in an old SMS recoverable.
    Given carol rotates her group's invite code
    When bob tries to redeem the previous code
    Then he should be refused
    And only carol, as owner, should be able to rotate it

  Scenario: An invite code is not a way to read the groups table
    # RLS cannot express "readable only by someone who knows the code": a policy
    # permissive enough for that lookup would expose every group. So redemption
    # goes through a SECURITY DEFINER function and the table stays closed.
    When carol queries the groups table using the "Family" invite code
    Then she should get no rows
