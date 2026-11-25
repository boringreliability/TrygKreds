Feature: Auth works on a phone
  In order to use TrygKreds without a computer
  As someone who has just installed it
  I want to confirm my address from the email and stay signed in afterwards

  # Two defects, one symptom. signUp() sent no emailRedirectTo, so the
  # confirmation link went to the project's default Site URL and never came
  # back to the app; and the Supabase client had persistSession set but no
  # storage adapter, so on React Native -- which has no localStorage -- the
  # session lived in memory and vanished when the app closed.
  #
  # Verified by: src/services/sessionStorage.test.ts,
  # src/domain/authRedirect.test.ts, src/services/authLink.test.ts,
  # src/domain/auth.test.ts -- and, for what none of them can reach, by
  # walking it through on a device.

  Scenario: The session outlives the app
    Given I have signed in
    When I close the app completely and open it again
    Then I should still be signed in

  Scenario: The session is stored encrypted
    # A stored session is a key to seeing where someone's family is.
    Given a session is written to the device
    Then it should go to the Keychain or Keystore, not to a plain file

  Scenario: A session larger than the platform limit still round-trips
    # Expo documents a limit around 2048 bytes per value on iOS, and a
    # Supabase session can exceed it.
    Given a session larger than one storage entry can hold
    When it is written and read back
    Then it should come back identical

  Scenario: A half-written session is refused rather than half-restored
    Given a stored session is missing one of its parts
    When it is read back
    Then nothing should be returned, and the remains should be cleared

  Scenario: The confirmation link comes back to the app
    Given I sign up on my phone
    Then the confirmation mail should point at the app, not at a web page

  Scenario: Following the link signs me in
    Given I have tapped the confirmation link
    When the app receives it
    Then it should exchange the code and I should be signed in

  Scenario: A link that has already been used says so
    # A confirmation token is single-use. Opening the link twice -- or a mail
    # scanner prefetching it -- produces an error rather than a code, and the
    # app must react visibly. Silence would leave someone tapping a link that
    # appears to do nothing.
    Given the confirmation link has already been used
    When the app receives it
    Then it should tell me the link is no longer valid

  Scenario: An unrelated deep link is left alone
    Given the app receives a link that carries no auth information
    Then it should do nothing
