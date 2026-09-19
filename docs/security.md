# Security

## The client is not trusted

Everything that happens on the device can be forged. The result returned by `pay()` tells your UI
what to show; it does **not** prove a payment. Before granting access:

1. Look the payment up **from your server** with Khalti's lookup API.
2. Check `status == "Completed"`, the exact amount, and that the `pidx` is the one you stored for
   that order.
3. Fulfil **once** (idempotent), then tell the app.

## Keys

- The **public** key is meant to be in the app (or delivered by your server). It cannot create
  payments.
- The **secret** key must only exist on your server. Never put it in the app, in the repo, or in
  remote config that clients can read.
- Use separate sandbox and live keys and switch them by environment.

## Defaults that protect you

- `environment` defaults to `'test'`, so a missing value can never charge live money.
- The library does not log payment data.

## Reporting a vulnerability

Please do not open a public issue. Contact the maintainers privately through the details on the
GitHub organisation page.
