# SpendWise

<img src="assets/branding/spendwise-logo.png" alt="SpendWise logo" width="180" />

SpendWise is an offline-first personal expense tracker for Android, built with React Native, Expo Router, TypeScript, and SQLite. It keeps transactions, budgets, savings goals, and financial reports on the device. No account or bank connection is required.

## Features

- **Transactions:** Record, edit, and delete income and expenses with categories, payment methods, dates, and notes. Browse transaction details and history.
- **Search and filters:** Search titles, notes, and categories; combine transaction type, categories, payment methods, date ranges, and amount limits. A dual-thumb slider and editable minimum/maximum fields control the amount range. Sort results and view filtered totals.
- **Dashboard:** See recorded income, expenses, net cash flow, recent transactions, monthly comparisons, budget status, and savings allocations.
- **Analytics:** Explore income-versus-expense bars, category breakdowns, spending trends, top expenses, and insights across reporting periods. Charts refresh when transactions change.
- **Budgets:** Set overall monthly and category limits, view progress and history, and copy a previous month's overall limit. In a compatible Android build, local alerts can be scheduled when spending reaches 80% or 100% of a limit; the in-app budget status remains available without notification permission.
- **Spending heatmap:** View daily expense intensity for this month, last month, or the last 3, 6, or 12 months. Monthly calendars fit the available card width; longer ranges use a compact, horizontally scrollable grid. Select a date for its total, transaction count, highest expense, category breakdown, and a link to filtered history.
- **Savings goals:** Create and edit targets, record contributions and withdrawals, track progress, and see a monthly savings forecast and contribution history. Goal allocations are separate from recorded income and expenses.
- **Data and privacy:** Create and restore JSON backups, export filtered transactions as CSV, inspect local record counts, and optionally protect app access with a PIN and enrolled strong biometrics.

The interface uses the approved SpendWise logo and a centralized dark palette: Midnight `#0A0F1E`, Navy `#1B2A41`, Bright Blue `#3B82F6`, Slate `#94A3B8`, and Ice `#E2E8F0`.

## How data is handled

SQLite (`spendwise.db`) is the source of truth. Money is stored as integer paise; reports and budget usage are calculated from recorded transactions. Budget limits and savings-goal entries live in separate tables, so contributions and withdrawals do not change income, expense, or net cash-flow totals. Schema version 3 uses versioned migrations and does not reset existing records during initialization.

Backups contain categories, transactions, budgets, budget alert history, savings goals, and goal entries. Restore validates a backup before replacing records in one SQLite transaction and requires explicit confirmation in the app. CSV export supports all transactions, income, expenses, the current month, or a custom date range.

**Keep exported backups private.** JSON backups and CSV files are not encrypted. The App Lock PIN verifier is stored in Android-backed SecureStore and is excluded from backups. App Lock controls access to the app; it does not encrypt the SQLite database or exported files. If both the PIN and biometrics are unavailable, there is no recovery bypass.

## Project structure

```text
assets/branding/       Approved logo and generated Android branding assets
src/app/               Expo Router screens and navigation
src/components/        Reusable UI, charts, filters, and heatmap
src/data/              SQLite migrations, queries, and backup/restore
src/domain/            Money, dates, filters, and financial calculations
src/features/          Budget notifications and App Lock
src/theme/             Centralized color tokens
tests/                 Database, domain, and regression tests
```

## Develop locally

Requirements: Node.js and npm. An Android emulator or device is needed for native feature testing; EAS cloud builds require an Expo account.

```bash
npm ci
npx expo start
```

Open the project on an Android emulator or device. Expo Go can be useful for UI development, but its bundled native modules may differ from the installed packages. In particular, SpendWise skips operating-system budget notifications in Expo Go. Test notifications, biometrics, file picking, sharing, and other native behavior with an Android development or standalone build. For a local native development build with the Android toolchain installed, use `npx expo run:android`.

The installed APK includes its JavaScript bundle and runs without Expo Go, Metro, or a connected computer. Normal transaction and report use does not require an internet connection.

## Validate changes

```bash
npm run typecheck
npm run lint
npm test
npx expo-doctor
```

The automated tests cover transaction storage and filters, integer-paise calculations, analytics, budgets and alert thresholds, heatmap aggregation, savings goals, migrations, and backup/restore. Run device checks before sharing an APK, especially for layout on different screen sizes and for Android notification, biometric, backup, and file-sharing flows.

## Build an Android APK

The `release-apk` profile in `eas.json` is configured for a signed, standalone APK with internal distribution. The Android package identifier is `com.spendwise.expensetracker`. Sign in to the Expo account that owns the linked EAS project, then run:

```bash
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile release-apk
```

EAS provides an APK download link only after the build succeeds. Open that link on an Android device and allow installation from the browser or file manager when Android asks. The `preview` APK profile is also available for testing. The launcher icon and splash screen come from `assets/branding/generated/`; native branding changes require a new APK build.

For updates, keep the same package identifier **and signing key** so Android can install the new APK over the existing app. The release profile uses the local app version and automatically increments Android `versionCode` when building. Check that the resulting code is higher than every APK already distributed. Back up important records before updating, and install over the existing app rather than uninstalling it; uninstalling removes its local data.

## Before publishing this repository

Review `git status` before committing. Do not add real SQLite databases, exported JSON backups or CSVs, PINs, Expo credentials, or Android signing keys. The repository's `.gitignore` already excludes common native signing files and local environment files; exported personal data still needs a manual check.

## Current limitations

- The app records transactions manually; it does not sync with banks or payment providers.
- Budget notifications are evaluated while the app is running or when it next opens, not when an external payment occurs.
- Financial balances reflect recorded transactions and goal allocations, not verified bank balances.
- Automated checks and Android bundle export have passed, but installation and native flows still require validation on a physical Android device before wider sharing.
