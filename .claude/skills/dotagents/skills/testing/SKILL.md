---
description: Use when deciding a testing approach or writing tests.
---

# Testing

- Isolated — tests should return the same results regardless of the order in which they are run.
- Composable — I should be able to test different dimensions of variability separately and combine the results.
- Deterministic — if nothing changes, the test result shouldn’t change.
- Fast — tests should run quickly.
- Writable — tests should be cheap to write relative to the cost of the code being tested.
- Readable — tests should be comprehensible for reader, invoking the motivation for writing this particular test.
- Behavioral — tests should be sensitive to changes in the behavior of the code under test. If the behavior changes, the test result should change.
- Structure-insensitive — tests should not change their result if the structure of the code changes.
- Automated — tests should run without human intervention.
- Specific — if a test fails, the cause of the failure should be obvious.
- Predictive — if the tests all pass, then the code under test should be suitable for production.
- Inspiring — passing the tests should inspire confidence

Some properties support each other. Automating tests makes them faster to run.

Some properties interfere with each other. Making tests more predictive of production behavior makes them slower.

Sometimes (and this is the magic), properties only seem to interfere. You can use composability to make tests faster and more predictive.

The original Test Desiderata papers are [here](https://medium.com/@kentbeck_7670/test-desiderata-94150638a4b3) and [here](https://medium.com/@kentbeck_7670/programmer-test-principles-d01c064d7934).
