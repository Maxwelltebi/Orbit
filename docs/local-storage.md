# Local storage

Android and iOS use Expo SQLite (`orbit.db` in the app's document directory), including in Expo Go. The browser preview uses a separate localStorage adapter; its data does not transfer to a phone.

| Table | Purpose |
| --- | --- |
| `thought_dumps` | Original text, durable submission ID, timestamp and sorting method |
| `thoughts` | Exact categorized segments and their offsets into the original dump |
| `categories` | Stable ID, unique normalized name and insertion order |
| `profile` | Local name and about text |
| `app_state` | Central category ID, preserved when counts tie |
| `local_login` | PIN verifier version, salt, hash, failed-attempt count and retry timestamp |

Database version 2 adds `local_login` transactionally using `PRAGMA user_version`, preserving every version 1 journal table and entry. An unknown newer database version fails initialization without recreating its tables. Foreign keys enforce relationships. WAL and FULL synchronous mode are configured before transactions. User values use bound parameters.

The connection is private and every repository operation runs through one queue. This prevents unrelated queries joining Expo's `withTransactionAsync` transaction. A thought submission commits its original text, segments, new categories and centre ownership together. The UI updates only after commit; save failure retains the draft. Profile saves also wait for commit. A startup gate hydrates saved data before mounting forms, with a retry option on failure. Stored profile and thought data are not silently reset on errors.

Counts and bubble sizes are rebuilt from saved segments. IDs come from SQLite AUTOINCREMENT, so reopening cannot reuse a previous submission's ID. This adds persistence; Gemma remains a separate upcoming integration. Earlier session-only preview entries that were already discarded cannot be recovered.

This database is not encrypted with SQLCipher. Uninstalling or clearing app data can remove it, and the OS may include it in device backups. Export, deletion and backup controls are future features.

## Offline login

First-time setup creates one local profile/login, not an online account. Existing thoughts and profile about text remain. Setup commits the name and verifier together; the plain PIN is never written to SQLite, SecureStore, localStorage or logs. Six-digit PINs use PBKDF2-HMAC-SHA256 (600,000 iterations, 16-byte random salt, 32-byte result). A separate 32-byte random pepper is held in Expo SecureStore, backed by Android Keystore/iOS Keychain. Native random bytes come from `expo-crypto`. Async hashing yields to the event loop to keep the interface responsive. The verifier format is versioned; do not change version 1 parameters without a migration strategy.

The browser preview keeps its pepper in localStorage and labels the weaker protection in its login screen. It is for UI preview, not sensitive journaling. It does not provide the phone's secure storage.

The route tree, menu and dialogs mount only after a successful login. Opening the app starts locked; Lock Orbit and background/inactive events unmount the private screens and clear entered PIN fields. A pending hash cannot reopen the app after a lock/background event. Five wrong attempts trigger a persisted 30-second cooldown, increasing to a maximum of 15 minutes. Login compares the current profile name (case-insensitively) and PIN. A name change keeps the same PIN; blank profile names are rejected once login is configured.

This is a local access gate, not journal encryption or protection against a rooted device, modified app/database, debugger or direct filesystem access. A PIN forgotten by the user has no email recovery. Do not add a reset button that bypasses authentication or silently deletes the journal. Losing the SecureStore key (for example a restored database on another phone without its key) fails closed and keeps the saved database. An unused pepper left by an interrupted setup can safely be replaced while no login record exists. Export/recovery, PIN changes and database encryption need their own design before release.

SecureStore documentation: https://docs.expo.dev/versions/v57.0.0/sdk/securestore/
Crypto documentation: https://docs.expo.dev/versions/v57.0.0/sdk/crypto/

## Verification

Run `node scripts/test-storage.cjs` for real SQLite file reopen, migration, rollback, foreign key, concurrent save, ordering and profile checks; `node scripts/test-local-login.cjs` for setup rollback, hashing cross-check against Node crypto, restart/cooldown persistence, rejected credentials and missing-key handling; and `node scripts/test-thought-organization.cjs` for sorting and bubble leadership checks. Run `npx expo lint` and `npx tsc --noEmit` for static checks.

On the phone, save a thought and profile, completely close Expo Go, then reopen the same ORBIT project. Confirm the entries, bubbles and profile remain. Also verify a strict centre takeover followed by a tied count keeps the same centre after reopening. The Node checks validate SQL logic; physical-device testing still validates Expo's native SQLite integration.

For login, reload the app and set a name/PIN with confirmation. Check a wrong PIN does not reveal the dashboard, then log in correctly and verify the old thoughts remain. Lock through the menu and reopen from the background, then completely close/reopen. Each should request login. Verify cooldowns, native secure storage and responsiveness on physical Android/iOS before release.
