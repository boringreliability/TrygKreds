Feature: SOS panic button
  In order to alert my group in an emergency
  As a group member
  I want to press an SOS button and notify everyone

  # An SOS is the one place TrygKreds keeps a position beyond the latest one:
  # an emergency record that vanishes is useless. That makes it an amendment to
  # the privacy contract rather than an exception hidden in the code, and
  # PRIVACY.md says so explicitly.
  #
  # The push notification deliberately carries no coordinates. It says who and
  # which group; recipients open the app and read the position from the database,
  # where row level security still applies. A notification passes through Apple,
  # Google and Expo's relay, and none of them need to be told where anyone is.

  Scenario: Trigger SOS
    Given I am signed in and have location sharing enabled
    When I press the SOS button
    And I confirm
    Then an SOS event should be recorded with my current location
    And all members of my groups should receive a push notification

  Scenario: SOS without location permission
    Given I have not granted location permissions
    When I press the SOS button
    And I confirm
    Then an SOS event should still be recorded, without coordinates
    And all members should still be notified

  Scenario: SOS when the position cannot be obtained
    # A GPS fix can fail even with permission granted -- indoors, or in a tunnel.
    # The alert matters more than the coordinates.
    Given location permission is granted but no fix is available
    When I trigger SOS
    Then the event should be recorded without coordinates
    And the alert should still go out

  Scenario: Confirmation guards against an accidental press
    Given I am on the group screen
    When I press the SOS button
    Then I should be asked to confirm
    And no event should be recorded until I do
    # One extra tap, no more. A guard that takes four taps is a guard that fails
    # in the emergency it exists for.
    And confirming should cost exactly one tap

  Scenario: Cancelling records nothing
    Given I pressed the SOS button
    When I cancel the confirmation
    Then no SOS event should be recorded
    And nobody should be notified

  Scenario: An SOS reaches every group I am in
    Given I am a member of two groups
    When I trigger SOS
    Then an event should be recorded for both groups
    And members of both should be notified

  Scenario: Notification delivery failure does not lose the event
    # Recording comes first. If the relay is down, the people who open the app
    # still see the SOS.
    Given the push relay is unavailable
    When I trigger SOS
    Then the SOS event should still be recorded
    And I should be told the alert may not have been delivered

  # --- Privacy boundaries, verified against a real PostgreSQL in
  # --- supabase/tests/05_sos_test.sql

  Scenario: Only my groups see my SOS
    Given a user "carol" who shares no group with me
    When I trigger SOS
    Then my group members should see the event
    But carol should not

  Scenario: I cannot forge an SOS for someone else
    When I try to record an SOS event attributed to another user
    Then the database should reject it

  Scenario: I cannot raise an SOS in a group I am not in
    When I try to record an SOS event in a group I do not belong to
    Then the database should reject it

  Scenario: I can delete my own SOS event
    # A false alarm should not be a permanent record of where I was.
    Given I recorded an SOS event
    When I delete it
    Then it should be gone
    But I should not be able to delete anyone else's

  Scenario: Push tokens are write-only
    # A push token identifies a device. Nobody needs to read one except the
    # function that sends the notification, which runs with the service role.
    Given I have registered a push token
    When I try to read my own push token back
    Then the database should refuse
    And another user should not be able to read or write it
    And the notification function, with the service role, should be able to read it
