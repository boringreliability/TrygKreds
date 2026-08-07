Feature: Background location updates
  In order to keep locations reasonably up to date
  As a group member
  I want my location to update in the background when sharing is enabled

  # Battery is a product requirement here, not an optimisation. Every rule below
  # exists to send as few updates as the feature can get away with.
  #
  # The decision of whether to send is a pure function in
  # src/domain/backgroundLocation.ts, with no import from expo-* or react-native,
  # so it can be tested as arithmetic rather than through a device.

  Scenario: Background updates while sharing is enabled
    Given I have enabled location sharing for a group
    When I move around with the app in the background
    Then my location should be periodically updated in the backend
    And updates should not happen more frequently than the configured interval

  Scenario: No updates when sharing is disabled
    Given I have disabled location sharing
    When the background task runs
    Then no location updates should be sent

  Scenario: No updates when signed out
    # The gate is checked inside the task, not only when it is registered. A task
    # can outlive the session that started it -- the OS keeps it registered
    # across app restarts.
    Given I am signed out
    When the background task runs
    Then no location updates should be sent
    And the task should stop itself

  Scenario: The first fix is always sent
    Given I have just enabled sharing and have no stored position
    When the background task produces a fix
    Then it should be sent immediately, without waiting for the interval

  Scenario: A fix that arrives too soon is dropped
    Given I sent a position one minute ago
    And the configured minimum interval is longer than that
    When the background task produces a fix
    Then no update should be sent

  Scenario: Standing still does not send updates
    Given I sent a position longer ago than the minimum interval
    When the background task produces a fix a few metres from the last one
    Then no update should be sent

  Scenario: Moving far enough sends an update
    Given I sent a position longer ago than the minimum interval
    When the background task produces a fix well beyond the minimum distance
    Then an update should be sent

  Scenario: An inaccurate fix is dropped
    # A 2km-accurate fix is worse than showing nothing: it puts a marker on a
    # street the person has never been on.
    Given the background task produces a fix with poor accuracy
    Then no update should be sent

  Scenario: Nonsense coordinates are dropped
    Given the background task produces a fix outside the valid coordinate range
    Then no update should be sent

  Scenario: Only groups I am actually sharing with are updated
    Given I am a member of three groups
    And I am sharing my location with two of them
    When the background task runs
    Then only those two groups should receive my position

  Scenario: Updates never accumulate history
    # member_locations carries UNIQUE(user_id, group_id) and every write is an
    # upsert. If a background update ever INSERTed, the app would quietly grow
    # the location history it exists to avoid. Asserted against a real
    # PostgreSQL in supabase/tests/04_no_history_test.sql.
    Given I have sent many background updates for a group
    Then exactly one stored position should exist for me in that group
    And it should hold the most recent coordinates

  Scenario: Balanced accuracy is the default
    # Highest accuracy keeps the GPS chip awake and is the single biggest drain
    # available. Balanced is roughly city-block accurate, which is what "where is
    # my family" needs.
    When the background task requests a position
    Then it should ask for balanced accuracy rather than the highest available
