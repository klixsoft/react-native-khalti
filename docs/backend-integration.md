# Server integration

The app never talks to Khalti's API with a secret key. Two calls happen on **your server**.

Base URLs (KPG-2 ePayment):

| Environment | Base URL |
| --- | --- |
| Sandbox | `https://dev.khalti.com/api/v2/` |
| Live | `https://khalti.com/api/v2/` |

All calls send `Authorization: key <YOUR_SECRET_KEY>` (the live or sandbox **secret** key). The
public key is the one your app passes to `pay()`.

## 1. Initiate a payment

`POST {base}/epayment/initiate/`

```json
{
  "return_url": "https://example.com/khalti/return",
  "website_url": "https://example.com",
  "amount": 1000,
  "purchase_order_id": "order-1234",
  "purchase_order_name": "30 days access",
  "customer_info": { "name": "Ram", "email": "ram@example.com", "phone": "9800000001" }
}
```

- `amount` is in **paisa** (Rs 10 = 1000). Khalti's minimum is Rs 10.
- `purchase_order_id` should be your own order id so you can reconcile later.
- The response contains `pidx` and `payment_url`. Send both to the app, together with the **public**
  key. Store the `pidx` against your order.

### Node

```ts
const res = await fetch(`${KHALTI_BASE}/epayment/initiate/`, {
  method: 'POST',
  headers: { Authorization: `key ${process.env.KHALTI_SECRET_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    return_url: `${SITE}/khalti/return`,
    website_url: SITE,
    amount: order.totalPaisa,
    purchase_order_id: order.id,
    purchase_order_name: order.title,
  }),
});
if (!res.ok) throw new Error(`Khalti initiate failed: ${res.status}`);
const { pidx, payment_url } = await res.json();
await orders.update(order.id, { khaltiPidx: pidx });
return { pidx, paymentUrl: payment_url, publicKey: process.env.KHALTI_PUBLIC_KEY };
```

### Python

```python
import requests

res = requests.post(
    f"{KHALTI_BASE}/epayment/initiate/",
    headers={"Authorization": f"key {settings.KHALTI_SECRET_KEY}"},
    json={
        "return_url": f"{SITE}/khalti/return",
        "website_url": SITE,
        "amount": order.total_paisa,
        "purchase_order_id": str(order.id),
        "purchase_order_name": order.title,
    },
    timeout=15,
)
res.raise_for_status()
data = res.json()
order.khalti_pidx = data["pidx"]
order.save(update_fields=["khalti_pidx"])
return {"pidx": data["pidx"], "paymentUrl": data["payment_url"], "publicKey": settings.KHALTI_PUBLIC_KEY}
```

## 2. Verify (lookup)

Call this when the app says it finished, **and** whenever you cannot be sure (the app was closed,
`E_LOOKUP_FAILED`, a webhook-less retry, ...).

`POST {base}/epayment/lookup/` with `{ "pidx": "<pidx>" }`.

Trust the payment **only** when all of these hold:

1. `status == "Completed"`.
2. `total_amount` equals your order total in paisa.
3. The `pidx` is the one you stored for this order (never one the client sends you).
4. The order is not already fulfilled (make fulfilment idempotent).

| Khalti status | Meaning | What to do |
| --- | --- | --- |
| `Completed` | Paid | Fulfil once |
| `Pending` | Not settled yet | Ask the user to wait, look up again later |
| `Initiated` | Opened, not paid | Leave the order pending |
| `User canceled` | Cancelled | Let the user retry |
| `Expired` | Link expired | Initiate a new payment |
| `Refunded`, `Partially Refunded` | Money returned | Reverse access |

Treat `Pending` like "unknown": never fulfil, never fail the order permanently. Look it up again.

## Idempotency and retries

- Initiating twice for one order produces two `pidx` values. Reuse the stored `pidx` while the order
  is open.
- Lookup is safe to repeat. Make your fulfilment step idempotent so two lookups cannot grant twice.
