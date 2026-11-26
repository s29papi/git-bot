# PR checkout fixture

This tiny static page is a deterministic target for the Git Bot PR-review demo.
It intentionally contains the checkout defect tracked in GitHub issue #1.

## Reported behavior

1. Open `index.html` in a browser.
2. Click **Complete purchase**.
3. The page displays a simulated `TypeError` instead of confirming order #1042.

Expected behavior: show a purchase confirmation for order #1042 and the $49.00 total.

## Serve locally

From the repository root:

```sh
python3 -m http.server 8765 --directory examples/pr-checkout-fixture
```

Then open `http://127.0.0.1:8765/`.
