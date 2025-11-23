Feature: Basic location sharing
  In order to know roughly where my group members are
  As a group member
  I want to share my last known location and see others on a map

  Background:
    Given I am signed in
    And I am a member of a group

  Scenario: Enable location sharing
    Given I have not enabled location sharing for my group
    When I enable location sharing for that group
    Then the app should request location permission
    And my last known location should be sent to the backend
    And other group members should be able to see my location

  Scenario: View members on the map
    Given location sharing is enabled for some members
    When I open the group map screen
    Then I should see markers for each member with a last known location
    And I should see when each member was last seen
    And members without location sharing should not appear on the map

  Scenario: Deny location permission
    Given I have not granted location permissions
    When I try to enable location sharing
    And I deny the permission request
    Then location sharing should remain disabled
    And I should see a clear explanation of why location is needed

  Scenario: Disable location sharing
    Given I have enabled location sharing for a group
    When I disable location sharing for that group
    Then my location should no longer be visible to group members
    And my last known location should be removed from the backend

  Scenario: Update location manually
    Given I have enabled location sharing for a group
    When I trigger a location update
    Then my current location should be fetched
    And my location should be updated in the backend
    And the timestamp should reflect the update time
