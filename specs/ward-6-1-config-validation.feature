Feature: The app refuses to run half-configured
  In order to trust what I see on a device
  As someone verifying TrygKreds on real hardware
  I want a missing Supabase configuration to stop the app rather than be papered over

  # src/config/env.ts used to fall back to https://placeholder.supabase.co and
  # write a warning to the console. On a phone that produces an app which starts,
  # renders, and then fails at every request -- a failure that looks like broken
  # background location, or a permissions problem, or anything except what it is.
  #
  # Verified by: src/config/env.test.ts.

  Scenario: A valid configuration is accepted
    Given EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are both set
    When the configuration is read
    Then it should return the URL and the key unchanged

  Scenario: A missing variable stops the app
    Given EXPO_PUBLIC_SUPABASE_URL is not set
    When the configuration is read
    Then it should fail
    And the message should name EXPO_PUBLIC_SUPABASE_URL
    And it should say where to get the value

  Scenario: A blank variable is treated as missing
    # An empty value in .env is easy to write and impossible to see.
    Given EXPO_PUBLIC_SUPABASE_ANON_KEY is set to whitespace
    When the configuration is read
    Then it should fail

  Scenario: The old placeholder values are rejected
    Given EXPO_PUBLIC_SUPABASE_URL is set to the old placeholder
    When the configuration is read
    Then it should fail
    And the message should say it is still the placeholder

  Scenario: A value that is not a URL is rejected
    Given EXPO_PUBLIC_SUPABASE_URL is set to a project reference without a scheme
    When the configuration is read
    Then it should fail
    And the message should show what a correct URL looks like

  Scenario: There is no fallback left
    # Behavioural rather than decorative: if anyone reintroduces a default,
    # reading an empty environment stops failing and this scenario goes red.
    Given no Supabase variables are set at all
    When the configuration is read
    Then it should fail rather than return a default
