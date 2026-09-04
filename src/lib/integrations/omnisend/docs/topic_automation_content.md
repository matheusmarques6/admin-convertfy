# automation_content — Automation content requirements

Some automation workflows only work correctly when the email template they send contains a specific dynamic section (or specific blocks). The required section/blocks live in the **template** (`templateID` of the send-email action), not in the automation payload — build the template first, then point the automation at it. Only the **first / primary email** of the automation must carry the required section; follow-up emails include it only when it fits.

## Requirements by automation type

| Automation type | Trigger / signal | Required in the template |
|---|---|---|
| Abandoned cart | Inactivity after `added product to cart` | ≥ 1 section of type `product_cart_recovery` |
| Abandoned checkout | Inactivity after `started checkout` | ≥ 1 section of type `product_cart_recovery` |
| Product / browse abandonment | Inactivity after `viewed product` | ≥ 1 section of type `product_cart_recovery` |
| Back in stock | `product back in stock` trigger | ≥ 1 section of type `product_back_in_stock` |
| Order confirmation | `placed order` / `paid for order` | Blocks `orderSummary`, `orderProducts`, `orderTotal` |
| Shipping confirmation | `order fulfilled` | Those three **plus** an `orderAddresses` block |
| Cancellation confirmation | `order canceled` | Blocks `orderSummary`, `orderProducts`, `orderTotal` |
| Cross-sell / Order follow-up / Replenishment | `ordered product` (post-purchase) | ≥ 1 section of type `product_recommender` (recommended, not enforced) |
| Welcome | `subscribed to marketing` | No section required; a discount offer must be a `discount` block |

Birthday, page viewed, reactivation, feedback, booking: no section required.

## Discount offers (any automation)

An offer written as text ("use code WELCOME15") creates nothing in the store — the code does not exist. **Use a `discount` block** with `discount.code` = placeholder `XXXX-XXXX-XXXX` (replaced per recipient at send time) and configure `discountType`, `valuePercentage`/`valueFixed`, `discountConditions`, `endsIn`, `link`. WooCommerce stores use `dynamicDiscount` instead (same object; `discount_button` required there).

Components (role-tagged): `discount_code` (`text`, required, exactly one) · `discount_button` (`button`, optional in `discount`) · `discount_expiration_date` (`text`, optional). Every component needs a 24-hex `id`, `type`, `role`, `stylePresetID` (preset defined in `generalSettings`) and `styleProperties`.

```json
{
  "id": "6a1f2c3d4e5b6a7c8d9e0f11",
  "type": "discount",
  "styleProperties": { "padding": "16px" },
  "discount": { "code": "XXXX-XXXX-XXXX", "discountType": "percentage", "valuePercentage": "15", "discountConditions": "all_orders", "endsIn": "14" },
  "components": [
    { "id": "6a1f2c3d4e5b6a7c8d9e0f12", "type": "text", "role": "discount_code",
      "text": "<p style=\"text-align:center\">XXXX-XXXX-XXXX</p>", "stylePresetID": "heading_small", "styleProperties": { "alignment": "center" } },
    { "id": "6a1f2c3d4e5b6a7c8d9e0f13", "type": "button", "role": "discount_button",
      "button": { "text": "Redeem discount", "link": "https://example.com", "isFullWidth": false },
      "stylePresetID": "primary_button", "styleProperties": { "alignment": "center" } }
  ]
}
```

## Validation checklist

1. Identify the automation type from its trigger.
2. Look up the required section/blocks above.
3. Confirm the template of the first send-email action contains it; if not, update the template first (`post_email_templates` / `put_email_templates_id`).
4. If any email offers a discount, confirm it is a `discount` block carrying its `discount_code` component.

See topic `email_templates` for section types and block types.
