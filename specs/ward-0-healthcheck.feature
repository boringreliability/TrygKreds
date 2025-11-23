Feature: Project healthcheck
  In order to verify the project is correctly set up
  As a developer
  I want a simple healthcheck test to pass

  Scenario: Jest test suite runs successfully
    Given the project dependencies are installed
    When I run the test suite
    Then all tests should pass

  Scenario: Linting passes without errors
    Given the project dependencies are installed
    When I run the linter
    Then no lint errors should be reported

  Scenario: TypeScript compiles without errors
    Given the project dependencies are installed
    When I run the TypeScript compiler
    Then no type errors should be reported
