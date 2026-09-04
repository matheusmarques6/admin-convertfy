# contacts — Contacts API

Endpoint `https://api.omnisend.com/api/contacts`.

## Identifiers and channels

Each contact can have several identifiers; each identifier has one channel: `email` → `email`, `phone` → `sms`. Two contacts cannot share an identifier (a duplicate identifier is ignored; if it is the only one, the contact is not created).

Channel statuses: `subscribed` · `unsubscribed` · `nonSubscribed`. A status date earlier than the stored one is ignored.

Consent per identifier (recommended): `source`, `createdAt` (ISO 8601), `ip`, `userAgent`.

## Filters on GET /api/contacts

`tag` and `status` cannot be combined; `updatedAtFrom` cannot be combined with `email`, `phone`, `status`, `segmentID`, or `tag`. URL-encode `+` in emails as `%2B`.

## Custom properties

`customProperties` object. Names: Latin letters, digits, `_`, ≤ 128, case-sensitive. Values: number, boolean, string (≤ 2048), date (`Y-m-d`, ISO 8601), list of strings. To remove a property, send `""` or `null`.

## Create / upsert (POST /api/contacts)

```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "countryCode": "US",
  "tags": ["vip"],
  "identifiers": [
    {
      "type": "email",
      "id": "jane.doe@example.com",
      "channels": { "email": { "status": "subscribed", "statusChangedAt": "2024-01-01T00:00:00Z" } },
      "consent": { "source": "omnisend-form", "ip": "192.168.1.1", "createdAt": "2024-01-01T00:00:00Z" }
    }
  ],
  "customProperties": { "loyaltyPoints": 125.8, "favoriteColors": ["blue", "green"] }
}
```

## Update (PATCH /api/contacts/{id} or PATCH /api/contacts?email=…)

```json
{ "firstName": "Jane", "tags": ["vip", "returning-customer"] }
```

Batch tags: `POST /api/contacts/tags` (add) · `DELETE /api/contacts/tags` (remove).
