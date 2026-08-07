Feature: Display names for group members
  In order to tell my family apart on the map
  As a group member
  I want to see people's chosen names instead of raw user ids

  # Before this ward there was no profiles table. group_members held only a
  # user_id, and auth.users is not readable from the client, so the map had
  # nothing to label a marker with and showed every member as "Member".
  #
  # A display name is user-chosen and need not be a real name. Email is
  # deliberately NOT stored here: profiles are readable by everyone you share a
  # group with, and the address already lives in auth.users.

  Background:
    Given I am signed in

  Scenario: A profile exists as soon as an account does
    When a new account is created
    Then a profile row should exist for that account
    And its display name should be empty until the user chooses one

  Scenario: Set my display name
    Given I am on the profile screen
    When I enter "Mor" as my display name
    And I save
    Then my display name should be stored
    And group members should see "Mor" instead of my user id

  Scenario: Change my display name
    Given my display name is "Mor"
    When I change it to "Mette"
    And I save
    Then my display name should be "Mette"

  Scenario: A display name is required and bounded
    Given I am on the profile screen
    When I save an empty display name
    Then I should see a validation error
    And nothing should be sent to the server
    When I save a display name longer than 40 characters
    Then I should see a validation error

  Scenario: Display names appear on the group map
    Given I am a member of a group with "Mor" and "Far"
    And both are sharing their location
    When I open the group map
    Then the markers should be labelled "Mor" and "Far"
    And my own marker should be labelled "You"

  Scenario: A member who has not chosen a name yet
    Given a group member has no display name set
    When I open the group map
    Then their marker should show a neutral placeholder
    And it should not show their user id

  Scenario: Display names appear in the member list
    Given I am a member of a group with "Mor"
    When I view the group's members
    Then I should see "Mor" in the list

  # --- Privacy boundaries. Verified against a real PostgreSQL by
  # --- supabase/tests/03_profiles_test.sql, since these are policies.

  Scenario: I can only see the profiles of people I share a group with
    Given a user "carol" who shares no group with me
    When I query profiles
    Then I should see my own profile
    And I should see profiles of my fellow group members
    But I should not see carol's profile

  Scenario: Leaving a group hides the profiles again
    Given I shared a group with "Mor"
    When I leave that group
    Then I should no longer see "Mor"'s profile

  Scenario: I cannot change anyone else's display name
    Given I share a group with "Mor"
    When I try to change "Mor"'s display name
    Then the database should reject it

  Scenario: Profiles hold no email address
    When I inspect the profiles table
    Then it should have no column containing an email address
