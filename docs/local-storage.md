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

Database version 2 added `local_login`; version 3 widens its verifier format constraint without changing any saved verifier, PIN cooldown or journal entry. Both migrations use a transaction and `PRAGMA user_version`. An unknown newer database version fails initialization without recreating its tables. Foreign keys enforce relationships. WAL and FULL synchronous mode are configured before transactions. User values use bound parameters.

The connection is private and every repository operation runs through one queue. This prevents unrelated queries joining Expo's `withTransactionAsync` transaction. A thought submission commits its original text, segments, new categories and centre ownership together. The UI updates only after commit; save failure retains the draft. Profile saves also wait for commit. A startup gate hydrates saved data before mounting forms, with a retry option on failure. Stored profile and thought data are not silently reset on errors.

Counts and bubble sizes are rebuilt from saved segments. IDs come from SQLite AUTOINCREMENT, so reopening cannot reuse a previous submission's ID. This adds persistence; Gemma remains a separate upcoming integration. Earlier session-only preview entries that were already discarded cannot be recovered.

This database is not encrypted with SQLCipher. Uninstalling or clearing app data can remove it, and the OS may include it in device backups. Export, deletion and backup controls are future features.

## Offline login

First-time setup creates one local profile/login, not an online account. Existing thoughts and profile about text remain. Setup commits the name and verifier together; the plain PIN is never written to SQLite, SecureStore, localStorage or logs. A random 32-byte device key is held in Expo SecureStore, backed by Android Keystore/iOS Keychain. Native random bytes come from `expo-crypto`.

New verifier format 2 uses HMAC-SHA256 keyed with that device key, over the validated ASCII message `orbit.local-pin.v2:<32-character salt hex>:<six-digit PIN>`. Each setup has a fresh 16-byte salt. SQLite stores only its salt and 32-byte verifier, never the device key. This avoids the 600,000-round JavaScript loop that made setup impractically slow in a mobile development runtime. It is a local, device-key-backed PIN lock, not a replacement for a password KDF in an online account. If the device key is compromised, format 2 does not retain format 1's expensive per-guess work factor; the short PIN can be searched quickly. Protecting that key and enforcing attempt cooldowns are essential. The journal is still not encrypted.

Format 1 remains PBKDF2-HMAC-SHA256 (600,000 rounds over `<PIN>:<device-key hex>`, salt decoded from hex). It is checked unchanged, and a successful legacy login upgrades its verifier to format 2 with the same device key and salt. A wrong PIN never triggers an upgrade. Legacy verification can still be slow on a development phone; if it outlasts the UI deadline, it may finish and upgrade in the background but cannot unlock the screen after the timeout. Use byte inputs to avoid depending on TextEncoder in Hermes.

Login operations and profile refresh have 30-second UI deadlines with a stage-specific error. A Stop waiting control clears the entry screen and invalidates any pending unlock. The auth queue remains attached to the cached repository across service recreation: a timed-out native write is not treated as cancelled, so another setup cannot overtake it and replace its device key. A native save already started may finish after the UI stops waiting. Reopening then reads its committed login; saved data is never reset on timeout.

The browser preview keeps its pepper in localStorage and labels the weaker protection in its login screen. It is for UI preview, not sensitive journaling. It does not provide the phone's secure storage.

The route tree, menu and dialogs mount only after a successful login. Opening the app starts locked; Lock Orbit and background/inactive events unmount the private screens and clear entered PIN fields. A pending hash cannot reopen the app after a lock/background event. Five wrong attempts trigger a persisted 30-second cooldown, increasing to a maximum of 15 minutes. Login compares the current profile name (case-insensitively) and PIN. A name change keeps the same PIN; blank profile names are rejected once login is configured.

This is a local access gate, not journal encryption or protection against a rooted device, modified app/database, debugger or direct filesystem access. A PIN forgotten by the user has no email recovery. Do not add a reset button that bypasses authentication or silently deletes the journal. Losing the SecureStore key (for example a restored database on another phone without its key) fails closed and keeps the saved database. An unused pepper left by an interrupted setup can safely be replaced while no login record exists. Export/recovery, PIN changes and database encryption need their own design before release.

SecureStore documentation: https://docs.expo.dev/versions/v57.0.0/sdk/securestore/
Crypto documentation: https://docs.expo.dev/versions/v57.0.0/sdk/crypto/

## Verification

Run `node scripts/test-storage.cjs` for real SQLite file reopen, version 1/2 migration and rollback, foreign keys, concurrent saves, ordering and profile checks; `node scripts/test-local-login.cjs` for verifier cross-checks against Node crypto, legacy upgrade, deadlines, late-save serialization across service recreation, setup rollback, restart/cooldown persistence and missing-key handling; and `node scripts/test-thought-organization.cjs` for sorting and bubble leadership checks. Run `npx expo lint` and `npx tsc --noEmit` for static checks.

On the phone, save a thought and profile, completely close Expo Go, then reopen the same ORBIT project. Confirm the entries, bubbles and profile remain. Also verify a strict centre takeover followed by a tied count keeps the same centre after reopening. The Node checks validate SQL logic; physical-device testing still validates Expo's native SQLite integration.

For login, reload the app and set a name/PIN with confirmation. Check a wrong PIN does not reveal the dashboard, then log in correctly and verify the old thoughts remain. Lock through the menu and reopen from the background, then completely close/reopen. Each should request login. Verify cooldowns, native secure storage and responsiveness on physical Android/iOS before release.
