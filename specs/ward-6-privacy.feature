Feature: Privacy controls
  In order to maintain control over my privacy
  As a user
  I want to see who can see me and pause sharing when needed

  # The core of this ward already exists: turning sharing off deletes the stored
  # position rather than hiding it behind a policy. That moved into
  # disableLocationSharing() in Ward 3.4, so that no caller can turn sharing off
  # and leave the position behind. What is added here is the control surface --
  # seeing who can see you, and being able to stop it in one action.

  Background:
    Given I am signed in

  Scenario: View who can see my location
    Given I am a member of multiple groups
    When I open the privacy settings
    Then I should see a list of all users who can see my location
    And the list should be grouped by group name
    And I should not be listed as someone who can see myself

  Scenario: A group I am not sharing with shows nobody
    Given I am a member of a group but not sharing with it
    When I open the privacy settings
    Then that group should be shown as not shared
    And nobody should be listed as able to see me there

  Scenario: Members who have not chosen a name are still listed
    Given a group member has no display name
    When I open the privacy settings
    Then they should appear with a neutral placeholder
    And their user id should not be shown

  Scenario: Pause location sharing
    Given I am sharing my location with a group
    When I pause location sharing for that group
    Then my stored position should be deleted, not merely hidden
    And my location should no longer be visible to group members
    And background updates should stop if I share with nobody else

  Scenario: Pausing one group leaves the others alone
    Given I am sharing with two groups
    When I pause sharing for one of them
    Then the other group should still see me
    And background updates should continue

  Scenario: Resume location sharing
    Given I have paused location sharing for a group
    When I resume location sharing
    Then my location should become visible again
    And background updates should resume

  Scenario: Pause everything at once
    Given I am sharing with several groups
    When I pause all sharing
    Then no group should be able to see me
    And every stored position of mine should be deleted
    And background updates should stop

  # Deliberately absent: a "resume everything" action.
  #
  # Restoring a remembered set of groups could switch sharing back on for a group
  # the user had turned off on purpose. A privacy control must never turn sharing
  # ON by inference -- so resuming is always an explicit, per-group choice.
  Scenario: Resuming is always explicit
    Given I paused all sharing
    When I look for a way to resume everything
    Then there should not be one
    And each group should have to be resumed individually

  Scenario: Failing to pause does not report success
    Given the database refuses the change
    When I pause sharing
    Then I should be told it failed
    And the group should still be shown as shared
