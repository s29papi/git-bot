# Checkout regression bisect demo

This static fixture is a safe, local browser flow for exercising Git Bot's bisect skill. Clicking **Complete purchase** does not contact a payment provider or create an order.

On `main`, the flow confirms order **#1042 for $49.00**. The demo regression branch changes that result to a payment error. Kane can use the same objective at each candidate revision:

> Click Complete purchase and verify it confirms order #1042 for $49.00.

The demo branch is `demo/bisect-checkout-regression`. Its history has a known-good starting point, a harmless change, the regression, and a later harmless change. The PR uses `main` as its base, so the agent can bisect from the passing `main` revision to the failing PR head.

Run Git Bot once from the coding agent with the demo PR and `bisect`. The skill prepares each candidate in a disposable worktree, serves this fixture, runs Kane, and saves one annotated MP4 per candidate under `recordings/`. The frame label includes the candidate commit hash. No server or recorder command is required from the user.
