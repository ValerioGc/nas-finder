Feature: NAS Finder
  Scenario: Find and save a NAS before setup, then refresh its configured state
    Given NAS Finder is open with a NAS awaiting setup
    When I open the NAS search
    Then the discovered NAS needs configuration
    When I save the discovered NAS
    And I close the search
    And I open the NAS page
    Then the native browser opener receives the NAS identity
    When the NAS completes setup and changes its address
    And I refresh the NAS list
    Then the changed NAS connection requires confirmation
    When I confirm the new NAS connection
    Then the saved NAS is configured at its new address

  Scenario: An unavailable saved NAS cannot be opened
    Given NAS Finder is open with a NAS awaiting setup
    When I open the NAS search
    And I save the discovered NAS
    And I close the search
    And the NAS becomes unavailable
    And I refresh the NAS list
    Then the saved NAS is unavailable and its link is disabled

  Scenario: Manual discovery reports invalid input and can be retried
    Given NAS Finder is open with a NAS awaiting setup
    When I open the NAS search
    And I search for an invalid manual address
    Then the search reports an invalid IPv4 address
    When I retry with the NAS address
    Then the discovered NAS needs configuration

  Scenario: Theme and language remain accessible in the page header
    Given NAS Finder is open with a NAS awaiting setup
    When I change theme and language in the page header
    Then the page uses a light theme and English without opening a dialog

  Scenario: Search remains centered at desktop and compact window sizes
    Given NAS Finder is open with a NAS awaiting setup
    When I open the NAS search
    Then the search dialog is centered and contained in the window

  Scenario: A changed connection can be confirmed inside network discovery
    Given NAS Finder is open with a NAS awaiting setup
    When I open the NAS search
    And I save the discovered NAS
    And I close the search
    And the NAS completes setup and changes its address
    And I refresh the NAS list
    And I open the NAS search
    Then the changed NAS connection requires confirmation
    When I confirm the new NAS connection
    And I close the search
    Then the saved NAS is configured at its new address
