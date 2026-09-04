# get_forms — GET /api/forms

List the brand's forms with cursor-based pagination and sorting. Every entry is a full form object — content tree, targeting, status, and A/B linkage — so a single page can be large.

**USE WHEN:** you need to resolve a form ID from a name; the user asks what forms exist / which are live; you are auditing forms before enabling, disabling, deleting, or A/B testing. **Already have the ID?** Use `get_form_id` (GET /api/forms/{formID}).

This endpoint has **no status or display-type filter**: fetch and filter client-side on `status` / `displayType`.

## Agent workflow

1. **List** with a small `limit` and `sort: "updatedAt"` when hunting for something recently touched, or `sort: "name"` when matching a name.
2. **Filter locally** on `status` (`draft`, `enabled`, `disabled`) or `displayType`.
3. **Confirm ambiguity with the user** rather than guessing when several names match.
4. **Paginate** — while `paging.hasMore`, pass `paging.cursors.after` back as `after`.

## Query parameters

| Field | Default | Description |
|-------|---------|-------------|
| `limit` | 100 | 1–250 — keep it small |
| `sort` | `createdAt` | `createdAt`, `updatedAt`, or `name` (single field) |
| `direction` | `desc` | `asc` / `desc` |
| `after` / `before` | — | Opaque cursors; never both. Cursors embed the sort — don't change sort while paginating |

```
GET /api/forms?limit=25&sort=updatedAt&direction=desc
```

## Response (200)

`forms[]` (full form objects: `id`, `name`, `status`, `displayType`, `content`, `targeting`, `abSetupID`, `abStatus`, timestamps); `paging`.

## get_form_id — GET /api/forms/{formID}

One form with everything stored on it. It is the base you edit with `patch_form_id`. Check `status` (`draft` needs enable; `enabled` serving; `disabled` paused) and `abSetupID` (when set, manage through the A/B tools, not enable/disable). Response fields: `content` (`generalSettings` + `steps` → `sections` → `rows` → `columns` → `blocks`, plus optional `successStep`, `subscribedStep`, `unavailablePageStep`, `teaser`), `targeting` (`url`, `display`, `frequency`, `device`, `scheduling`, `audience`, `segments`, `location`, `utm`, `source`, `isBackInStock`), `doubleOptIn`, `contactTags`, `autoRedirect`, `socialMediaSharing`, `clickOutside`, `recaptcha`, `abSetupID`, `abStatus`, `createdAt`, `updatedAt`, `enabledAt`, `disabledAt`, `launchedAt`.
