Feature: Background location updates
  In order to keep locations reasonably up to date
  As a group member
  I want my location to update in the background when sharing is enabled

  Background:
    Given I am signed in
    And I am a member of a group

  Scenario: Background updates while sharing is enabled
    Given I have enabled location sharing for a group
    And background location permission is granted
    When I move around with the app in the background
    Then my location should be periodically updated in the backend
    And updates should not happen more frequently than the configured interval

  Scenario: No updates when sharing disabled
    Given I have disabled location sharing for all groups
    When the background task runs
    Then no location updates should be sent
    And system resources should not be consumed unnecessarily

  Scenario: Request background permission
    Given I have only foreground location permission
    When I enable background location updates
    Then the app should request background location permission
    And I should see an explanation of why background permission is needed

  Scenario: Background permission denied
    Given I have enabled location sharing
    When I deny background location permission
    Then foreground updates should still work
    And I should see a message about limited functionality
    And my location will only update when the app is open

  Scenario: Minimum distance threshold
    Given I have enabled location sharing
    And background location permission is granted
    When I move less than the minimum distance threshold
    Then no location update should be sent
    And battery should be conserved

  Scenario: Battery-efficient updates
    Given I have enabled location sharing
    And background location permission is granted
    When the device battery is low
    Then location updates should use low-power mode
    And update frequency should be reduced

  Scenario: Resume updates after app restart
    Given I had location sharing enabled before
    And the app was terminated
    When the app restarts
    Then background location updates should automatically resume
    And I should not need to re-enable sharing
