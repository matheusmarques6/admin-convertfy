# Credential Key Rotation Guide

This guide describes how to rotate the `ENCRYPTION_KEY` used by the credential encryption system (`enc:v1:` prefix, AES-256-GCM).

## When to Rotate

- **Key compromised**: Environment variable leaked, server breach, or unauthorized access suspected.
- **Compliance requirement**: Periodic rotation mandated by security policy (e.g., annually).
- **Personnel change**: Team member with access to production secrets leaves the organization.
- **Routine maintenance**: Proactive rotation as part of security hygiene.

## Prerequisites

- Access to production environment variables (Vercel / hosting provider).
- Admin access to the application (`/api/admin/encrypt-credentials` endpoint).
- Database read access to verify encrypted values.

## Procedure

### Step 1: Generate a New Key

Generate a 256-bit (32-byte) hex key:

```bash
openssl rand -hex 32
```

Save the output securely (password manager, not plaintext files).

### Step 2: Set the New Key as Secondary

Add the new key to the environment as `ENCRYPTION_KEY_NEW`:

```
ENCRYPTION_KEY=<current-key>
ENCRYPTION_KEY_NEW=<new-key>
```

Deploy this change. The system continues using the old key for all operations.

### Step 3: Re-encrypt All Credentials

Call the admin re-encryption endpoint:

```bash
curl -X POST https://<your-domain>/api/admin/encrypt-credentials \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json"
```

This endpoint:
1. Reads all `client_stores` rows.
2. Decrypts each encrypted field using the current `ENCRYPTION_KEY`.
3. Re-encrypts using `ENCRYPTION_KEY_NEW`.
4. Writes back to the database.

Monitor the response for any errors. Fields that fail decryption will be logged and skipped (they were already corrupted).

### Step 4: Swap Keys

Update environment variables:

```
ENCRYPTION_KEY=<new-key>
```

Remove `ENCRYPTION_KEY_NEW` from the environment.

Deploy this change.

### Step 5: Verify

1. Pick 2-3 stores and call their credentials endpoint to confirm decryption works:
   ```bash
   curl https://<your-domain>/api/stores/<store-id>/credentials \
     -H "Authorization: Bearer <admin-token>"
   ```
2. Check application logs for any `[Crypto] Failed to decrypt field` errors.
3. Verify integrations (Klaviyo sync, Shopify API calls) are working normally.

## Rollback Procedure

If re-encryption failed or the new key is not working:

1. **Revert `ENCRYPTION_KEY`** to the old value immediately.
2. Deploy the change.
3. Verify decryption works with the old key.
4. Investigate what went wrong before attempting rotation again.

**Important**: Rollback is only possible if Step 4 (swap keys) has NOT been completed yet, or if you still have the old key available. Never discard the old key until verification (Step 5) is fully successful.

## Post-Rotation Checklist

- [ ] New key is set as `ENCRYPTION_KEY` in production
- [ ] `ENCRYPTION_KEY_NEW` is removed from environment
- [ ] Old key is stored securely as backup (for emergency rollback, minimum 30 days)
- [ ] 2-3 stores verified with successful decryption
- [ ] No `[Crypto] Failed to decrypt field` errors in logs
- [ ] Klaviyo cron sync completes successfully
- [ ] Shopify API calls work for configured stores
- [ ] Old key is permanently deleted after 30-day retention period
