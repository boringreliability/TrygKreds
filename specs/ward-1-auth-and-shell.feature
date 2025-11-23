Feature: Authentication and basic app shell
  In order to use the app safely
  As a user
  I want to sign in and see my groups

  Background:
    Given the app is installed and running

  Scenario: First-time user sees login screen
    Given I am not signed in
    When I open the app
    Then I should see the login screen
    And I should see options to sign in or sign up

  Scenario: User signs up with email and password
    Given I am on the login screen
    When I tap "Sign Up"
    And I enter a valid email address
    And I enter a valid password
    And I submit the sign up form
    Then I should be signed in
    And I should see the groups screen
    And I should see an empty list of groups

  Scenario: User signs in with existing account
    Given I have an existing account
    And I am on the login screen
    When I enter my email address
    And I enter my password
    And I submit the sign in form
    Then I should be signed in
    And I should see the groups screen

  Scenario: Returning user is automatically signed in
    Given I have signed in before
    And my session is still valid
    When I open the app
    Then I should be taken directly to the groups screen
    And I should not see the login screen

  Scenario: User signs out
    Given I am signed in
    And I am on the groups screen
    When I tap the sign out button
    Then I should be signed out
    And I should see the login screen

  Scenario: Sign in with invalid credentials
    Given I am on the login screen
    When I enter an invalid email or password
    And I submit the sign in form
    Then I should see an error message
    And I should remain on the login screen

  Scenario: Sign up with weak password
    Given I am on the sign up screen
    When I enter a valid email address
    And I enter a password that is too short
    And I submit the sign up form
    Then I should see a password validation error
    And I should remain on the sign up screen
