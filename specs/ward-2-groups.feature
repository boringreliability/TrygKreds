Feature: Groups
  In order to share my location with people I trust
  As a user
  I want to create and join groups

  Background:
    Given I am signed in

  # Create Group Scenarios
  Scenario: Create a new group
    Given I am on the groups screen
    When I tap "Create Group"
    And I enter "Family" as the group name
    And I submit the create group form
    Then I should see "Family" in my groups list
    And I should be the owner of that group

  Scenario: Create group with empty name
    Given I am on the create group screen
    When I submit the form without entering a name
    Then I should see a validation error
    And the group should not be created

  Scenario: View group details
    Given I have created a group named "Family"
    When I tap on the "Family" group
    Then I should see the group details
    And I should see the invite code for the group
    And I should see the list of members

  # Join Group Scenarios
  Scenario: Join a group via invite code
    Given there is a group with invite code "ABC123"
    And I am on the groups screen
    When I tap "Join Group"
    And I enter "ABC123" as the invite code
    And I submit the join group form
    Then I should be added to that group
    And the group should appear in my groups list

  Scenario: Invalid invite code
    Given I am on the join group screen
    When I enter "INVALID" as the invite code
    And I submit the join group form
    Then I should see an error message "Invalid invite code"
    And I should not join any group

  Scenario: Already a member
    Given I am already a member of a group with code "ABC123"
    When I try to join with code "ABC123"
    Then I should see an error message "You are already a member of this group"

  # Group Management Scenarios
  Scenario: Leave a group
    Given I am a member of a group named "Friends"
    And I am not the owner
    When I tap on "Leave Group"
    And I confirm the action
    Then I should no longer be a member of "Friends"
    And the group should not appear in my groups list

  Scenario: Owner cannot leave group
    Given I am the owner of a group named "Family"
    When I view the group settings
    Then I should not see a "Leave Group" option
    And I should see a "Delete Group" option instead

  Scenario: Generate new invite code
    Given I am the owner of a group
    When I tap "Generate New Code"
    Then a new invite code should be generated
    And the old invite code should no longer work
