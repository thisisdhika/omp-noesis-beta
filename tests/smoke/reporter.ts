"use strict";

/**
 * TAP-style test reporter for the noesis smoke test suite.
 *
 * Prints results to stdout using a simple TAP-like format:
 *   # suite-name (1234ms)
 *   ok - scenario description
 *   not ok - failing scenario
 *     ---
 *     error message lines indented
 *     ...
 *   5 scenarios: 4 passed, 1 failed
 */

export interface ScenarioResult {
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

export interface SuiteResult {
  name: string;
  scenarios: ScenarioResult[];
  passed: number;
  failed: number;
  durationMs: number;
}

/**
 * Print TAP-style report for all suites and return aggregate counts.
 */
export function report(results: SuiteResult[]): { passed: number; failed: number } {
  let totalPassed = 0;
  let totalFailed = 0;
  let totalScenarios = 0;

  for (const suite of results) {
    totalPassed += suite.passed;
    totalFailed += suite.failed;
    totalScenarios += suite.scenarios.length;

    console.log(`# ${suite.name} (${suite.durationMs}ms)`);

    for (const scenario of suite.scenarios) {
      if (scenario.passed) {
        console.log(`ok - ${scenario.name}`);
      } else {
        console.log(`not ok - ${scenario.name}`);
        if (scenario.error) {
          console.log("  ---");
          // Indent every line of the error message for YAML block style
          for (const line of scenario.error.split("\n")) {
            console.log(`  ${line}`);
          }
          console.log("  ...");
        }
      }
    }

    // Blank line between suites for readability
    console.log();
  }

  console.log(`${totalScenarios} scenarios: ${totalPassed} passed, ${totalFailed} failed`);

  return { passed: totalPassed, failed: totalFailed };
}
