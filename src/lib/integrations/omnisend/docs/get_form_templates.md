# get_form_templates — GET /api/form-templates

List the form templates available in the brand's library. Templates are ready-made, brand-styled designs: each comes with a complete `content` tree, default `targeting`, and `contactTags`, so it can be adapted into a new form **instead of authoring the content tree from scratch**.

**USE WHEN:** the user wants a new form and has no exact design in mind — **start here, not at `post_forms`**; you need a valid, complete `content` example for a given `displayType`.

**These are not the brand's own forms** — use `get_forms` for those.

## Agent workflow

1. **List** with `displayType` matching what the user wants (`popup`, `flyout`, `embedded`, `landingPage`, `fullscreen`). Keep `limit` small — each item embeds a full content tree.
2. **Pick one** and fetch it with `get_template_id` (GET /api/form-templates/{templateID}).
3. **Preview** with `post_form_templates_template_id_render` if the user should see it first.
4. **Adapt** the template's `content`: copy, brand colors, fields collected, blocks (e.g. swap the `discount` block for a `wheelOfFortune` block — see `post_forms`).
5. **Create** the form with `post_forms` (`content` + `displayType` + `name`), then enable with `post_forms_form_id_enable`.

Templates cannot be enabled — they are a source of content, not live forms.

## Query parameters

| Field | Default | Description |
|-------|---------|-------------|
| `displayType` | — | Filter: `popup`, `landingPage`, `embedded`, `flyout`, `fullscreen` |
| `limit` | 100 | 1–250. Keep it small |
| `sort` / `direction` | `createdAt` / `desc` | Only `createdAt` supported |
| `after` / `before` | — | Opaque cursors (never both) |

```
GET /api/form-templates?displayType=popup&limit=20
```

## Response (200)

`formTemplates[]` with `id`, `name`, `displayType`, `content` (full tree with brand assets applied — copy it into `post_forms`), `targeting`, `contactTags`; `paging.cursors.after/before`, `paging.hasMore`.
