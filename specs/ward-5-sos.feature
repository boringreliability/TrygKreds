Feature: SOS panic button
  In order to alert my group in an emergency
  As a group member
  I want to press an SOS button and notify everyone

  Background:
    Given I am signed in
    And I am a member of at least one group

  Scenario: Trigger SOS with location
    Given I have location permission granted
    When I press the SOS button
    And I confirm the SOS action
    Then an SOS event should be recorded with my current location
    And all members of my groups should receive a push notification
    And I should see a confirmation that the SOS was sent

  Scenario: Trigger SOS without location permission
    Given I have not granted location permissions
    When I press the SOS button
    And I confirm the SOS action
    Then an SOS event should be recorded without location
    And all members of my groups should still be notified
    And I should see a confirmation that the SOS was sent

  Scenario: Cancel SOS confirmation
    Given I am on the main screen
    When I press the SOS button
    And I cancel the confirmation dialog
    Then no SOS event should be recorded
    And no notifications should be sent

  Scenario: SOS notification content
    Given another group member triggers an SOS
    When I receive the push notification
    Then the notification should include the member's name
    And the notification should include when it was triggered
    And if available, the notification should include their last known location

  Scenario: View SOS history
    Given SOS events have been triggered in my groups
    When I view the SOS history
    Then I should see a list of recent SOS events
    And each event should show who triggered it and when
    And I should be able to see the location if it was available

  Scenario: Multiple groups SOS notification
    Given I am a member of multiple groups
    And I have enabled location sharing for all groups
    When I trigger an SOS
    Then members of all my groups should be notified
    And a separate SOS event should be recorded for each group

  Scenario: SOS cooldown
    Given I triggered an SOS in the last minute
    When I try to trigger another SOS
    Then I should see a message about the cooldown period
    And no new SOS event should be created

  Scenario: SOS with app in background
    Given the app is in the background
    When I use a quick action to trigger SOS
    Then the SOS should be processed normally
    And I should receive confirmation via notification
