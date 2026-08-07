Feature: The privacy promise is enforced, not just written down
  In order to be believed rather than merely trusted
  As the maintainer of a privacy-first app
  I want the build to fail when the code stops matching the promise

  # TrygKreds exists because the alternatives sell location data, run ads and
  # upsell hard. A promise like that decays quietly: someone adds a package for
  # a good reason, it pulls in a telemetry client, and nobody notices. So the
  # guarantees in PRIVACY.md are each backed by something that fails the build.
  #
  # Verified by: npm run check:privacy (both scripts), npm run test:rls,
  # and src/domain/location.test.ts.

  Scenario: The privacy contract exists and is part of the build
    Given the repository
    Then PRIVACY.md should state what is stored, for how long, and who can read it
    And every guarantee it makes should name the check that enforces it
    And the dependency guard should fail if PRIVACY.md is deleted

  Scenario: An analytics SDK cannot be added
    Given a developer adds an analytics package to runtime dependencies
    When the dependency guard runs
    Then the build should fail
    And the message should say TrygKreds does not ship one

  Scenario: A crash reporter cannot be added
    Given a developer adds a crash reporting package to runtime dependencies
    When the dependency guard runs
    Then the build should fail

  Scenario: Even a harmless dependency needs a deliberate decision
    # The allowlist is the documentation. Adding to it is the review step.
    Given a developer adds an ordinary utility package to runtime dependencies
    When the dependency guard runs
    Then the build should fail
    And the message should say it is not on the allowlist

  Scenario: A dependency that reaches a third party must be disclosed
    Given a runtime dependency is marked as reaching a third party
    When it is not mentioned in PRIVACY.md
    Then the build should fail

  Scenario: Network calls to other hosts cannot be added
    Given a developer adds a fetch call to an unrelated host
    When the network guard runs
    Then the build should fail
    And it should report both the host and the direct fetch

  Scenario: All network access goes through the Supabase client
    When the network guard scans our own source
    Then it should find no fetch, XMLHttpRequest, WebSocket or sendBeacon
    And no absolute URL outside the allowlisted hosts
    # The real Supabase host is never in the source: it comes from
    # EXPO_PUBLIC_SUPABASE_URL, which is what makes the app self-hostable.

  Scenario: Turning off sharing deletes the stored position
    # A position sitting behind a policy is still a position sitting in the
    # database. The deletion belongs to the domain function, so that no caller
    # can turn sharing off and leave the position behind.
    Given I am sharing my location with a group
    When I turn sharing off
    Then my stored position should be deleted, not merely hidden
    And if the deletion fails I should not be told it succeeded

  Scenario: There is no table that could hold a location history
    # member_locations carries UNIQUE(user_id, group_id) and every write is an
    # upsert against it. That constraint is the no-history guarantee.
    Given a member updates their location repeatedly
    Then only the latest position should exist
    And there should be no row describing where they were before
