<div align="center">
  <img src="../assets/images/icon.png" alt="CloudMail logo" width="96" height="96" />

# CloudMail

**V1.1.1 · Multi-Worker mobile admin app for Cloudflare Temp Email systems**

[![CI](https://github.com/Lur1N77777/CloudMail/actions/workflows/ci.yml/badge.svg)](https://github.com/Lur1N77777/CloudMail/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../LICENSE)
[![Expo](https://img.shields.io/badge/Expo-54-black.svg)](https://expo.dev/)
[![React Native](https://img.shields.io/badge/React%20Native-0.81-61DAFB.svg)](https://reactnative.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6.svg)](https://www.typescriptlang.org/)

[English](./README.en.md) · [简体中文](../README.md)

[Download APK](https://github.com/Lur1N77777/CloudMail/releases) · [Build from source](./BUILD.md) · [API notes](./mailbox-api-report.md)

</div>

## What CloudMail is

CloudMail is an Android administrator app for **Cloudflare Temp Email** systems. It is built with Expo / React Native and targets [dreamhunter2333/cloudflare_temp_email](https://github.com/dreamhunter2333/cloudflare_temp_email) and compatible APIs.

The upstream project provides the Cloudflare Worker mailbox backend, web admin UI, and mail delivery features. CloudMail packages those capabilities into a phone-friendly admin client. It is not a new mailbox backend and it is not an official Cloudflare product; it is a mobile management app built around the `cloudflare_temp_email` ecosystem.

CloudMail is **administrator-first**: first launch opens admin setup, and a valid configuration opens the admin console directly.

## What's new in V1.1.1

V1.1.1 adds multi Cloudflare account / multi Worker support for setups where different Cloudflare accounts run separate Worker deployments.

- **Multiple Worker profiles**: `Workers configuration` is now a profile list. Each profile can store a name, Worker URL, admin password, site password, and cached domain list.
- **Automatic migration**: existing single-Worker installations are migrated into a `Default account` profile, so users do not need to reconfigure the app after upgrading.
- **Quick Worker switching**: the admin header shows the current Worker, such as `Account A ▾`, and lets admins switch the active management scope quickly.
- **Domain-based address creation**: creating an address routes the request to the Worker that owns the selected domain. If account B owns `4.com`, selecting `4.com` uses account B's Worker automatically.
- **Clear domain ownership**: the domain picker labels entries by Worker, such as `4.com · Account B`; duplicated domains are treated as conflicts instead of being selected silently.
- **Unknown-recipient creation routing**: one-tap creation from unknown-recipient mail also resolves the target Worker by domain.
- **Worker-scoped local state**: accounts, mail cache, unread dots, spam rules, and local address groups remain isolated per Worker. The same email address can exist under different Workers without overwriting another account.
- **Safer connection tests**: testing a Worker validates settings and admin login, refreshes domains, and avoids writing stale async results over newer edits.
- **No Cloudflare official API dependency**: multi-account support is implemented as local Worker profiles; no Cloudflare token is required.

## Highlights

- **Cloudflare Temp Email mobile admin**: connect to your `cloudflare_temp_email` compatible Worker/API and manage temporary mailboxes from a phone.
- **Multiple Cloudflare accounts / Workers**: store several local Worker profiles, useful when account A owns `1.com / 2.com / 3.com` and account B owns `4.com / 5.com / 6.com`.
- **Domain-based routing**: address creation automatically calls the Worker that owns the selected domain, reducing manual switching mistakes.
- **Admin console**: statistics, addresses, inbox mail, sent mail, unknown-recipient mail, and mail sending in one app.
- **User-level management**: load admin users and view addresses bound to a selected user.
- **Address management**: create custom, subdomain, and random-subdomain addresses; view credentials, clear inboxes, and delete addresses.
- **Batch operations**: process the current filtered address scope with preview/confirmation for destructive actions.
- **Local grouping**: group mailbox addresses locally and filter address or mail views by group.
- **Inbox and spam mailbox**: switch between normal inbox and spam inside the inbox page; long-press mail to block or unblock a sender.
- **Inbox, sent mail, and unknown recipients**: browse normal mail, sent mail, and mail sent to uncreated addresses; create unknown addresses with one tap.
- **Fast verification-code handling**: detect common verification codes, copy them quickly, and show clear copy feedback.
- **New-mail indicators**: historical mail stays quiet; newly refreshed messages get a local unread dot.
- **HTML and text mail reading**: preview rich HTML email, plain text, source text, and message details.
- **Night-friendly themes**: light, dark, OLED black, and system themes are available; the dark quick toggle remembers your preferred dark variant.
- **Self-host friendly**: keep your mailbox service under your own control; the app only talks to your Worker/API.

## Screenshots

Click any thumbnail to open the full-size image.

| Preview                                                                                                                                       | Description                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| <a href="./screenshots/admin-dashboard.jpg"><img src="./screenshots/admin-dashboard.jpg" width="220" alt="Admin dashboard" /></a>             | **Admin dashboard** — a compact overview of managed addresses, matched inbox mail, sent mail, and unknown-recipient messages.                                 |
| <a href="./screenshots/compose-mail.jpg"><img src="./screenshots/compose-mail.jpg" width="220" alt="Compose mail screen" /></a>               | **Compose mail** — send email from a selected mailbox identity with recipient, subject, and content fields organized for mobile use.                          |
| <a href="./screenshots/settings-server.jpg"><img src="./screenshots/settings-server.jpg" width="220" alt="Server settings" /></a>             | **Admin settings** — configure the Worker endpoint, admin password, site password, and auto-refresh interval.                                                |
| <a href="./screenshots/settings-appearance.jpg"><img src="./screenshots/settings-appearance.jpg" width="220" alt="Appearance settings" /></a> | **Appearance settings** — choose light, dark, OLED black, or system theme mode.                                                                               |

## Download

Download the latest APK from [GitHub Releases](https://github.com/Lur1N77777/CloudMail/releases).

APK files are intentionally not committed to the source repository. This keeps the Git history small and makes releases easier to audit.

## Use the app after downloading it

### 1. Prepare your mailbox service

CloudMail needs one or more deployed `cloudflare_temp_email` compatible services, meaning your Cloudflare temporary mailbox Worker/API deployments. Prepare these values first:

- **Worker URL**: for example, `https://worker-a.example.com` and `https://worker-b.example.com`.
- **Admin password**: each Worker has its own admin password.
- **Site password**: required if a Worker uses `PASSWORDS`.
- **Domain ownership**: for example, account A owns `1.com / 2.com / 3.com`, while account B owns `4.com / 5.com / 6.com`.

If you have not deployed the backend yet, follow the upstream [cloudflare_temp_email](https://github.com/dreamhunter2333/cloudflare_temp_email) project first.

### 2. First-time setup

1. Download and install the latest APK.
2. Open CloudMail. The app opens directly to **Admin settings** on first launch.
3. In **Workers configuration**, add one or more Worker profiles with name, Worker URL, admin password, and site password.
4. Tap **Test connection / Refresh domains** to validate each Worker and cache its domain list.
5. Pick the current default Worker and set the auto-refresh interval.
6. Choose light, dark, OLED black, or system theme under **Appearance**.
7. Save the configuration. CloudMail validates the current Worker admin password and opens the **Admin console** when it succeeds.

### 3. Daily use

- Later launches open the admin console automatically if the saved configuration is still valid.
- Tap **Settings** in the top-right corner of the admin console to edit Worker, password, refresh, and appearance settings.
- Tap the Worker name in the admin header to switch the current management scope.
- Use the top tabs to move between admin pages.
- The theme quick toggle remembers your preferred dark variant. If you picked OLED black, switching from light back to dark returns to OLED black.
- Newly refreshed mail shows a small dot until you open the detail page, copy a detected verification code, or mark all as read.
- In the inbox page, tap the title dropdown to switch between inbox and spam.
- Long-press mail for actions; long-press addresses to enter batch selection mode.
- When creating an address, the domain picker labels the source Worker and routes the request automatically.

### 4. Admin pages

- **Stats**: view address, inbox, sent mail, and unknown-recipient counts for the current Worker.
- **Addresses**: search, create, group, filter by user, inspect credentials, clear inboxes, delete addresses, and batch manage mailboxes.
- **Inbox**: view received mail, search, copy verification codes, see unread dots, use spam mailbox, and filter by local groups.
- **Sent**: view sent mail records.
- **Unknown**: view messages sent to addresses that have not been created yet, then create those addresses with one tap.
- **Send**: send mail from a selected mailbox address within the current Worker scope.

## Tech stack

- Expo 54 / React Native 0.81
- React 19 / TypeScript 5.9
- Expo Router
- React Native Reanimated / Gesture Handler
- AsyncStorage / SecureStore
- WebView-based mail preview
- Vitest
- Optional Drizzle-backed server utilities

## Get started for development

Install dependencies:

```bash
pnpm install
```

Run the development environment:

```bash
pnpm dev
```

Run only Expo:

```bash
pnpm dev:metro
```

Check the project before opening a pull request:

```bash
pnpm check
pnpm test
```

## Configure environment variables

Copy the example file:

```bash
cp .env.example .env.local
```

Most mailbox connection settings are configured inside the app. Environment variables are mainly for local development, optional OAuth/server features, database tooling, Forge integrations, and AI-related utilities.

Never commit real passwords, admin tokens, mailbox credentials, API keys, or database URLs.

## Build Android APK

Read the full guide in [BUILD.md](./BUILD.md). Common local build flow:

```bash
pnpm install
npx expo prebuild -p android --clean
cd android
./gradlew assembleRelease
```

The generated APK should be uploaded to GitHub Releases instead of committed to Git.

## Project docs

- [Build and installation guide](./BUILD.md)
- [Changelog](./CHANGELOG.md)
- [Design notes](./design.md)
- [Mailbox API report](./mailbox-api-report.md)
- [Roadmap](./roadmap.md)
- [Security policy](../.github/SECURITY.md)
- [Contributing guide](../.github/CONTRIBUTING.md)

## Upstream mailbox system

CloudMail is built around the [dreamhunter2333/cloudflare_temp_email](https://github.com/dreamhunter2333/cloudflare_temp_email) Cloudflare Temp Email ecosystem.

Credit goes to [dreamhunter2333](https://github.com/dreamhunter2333) and contributors of the upstream project for the mailbox backend, web admin experience, and API behavior that this app targets.

See [NOTICE](./NOTICE.md) for attribution details.

## Contributing

Issues and pull requests are welcome. Keep changes focused, run checks before submitting, and do not include secrets or generated APK files in commits.

## License

CloudMail is released under the [MIT License](../LICENSE).

The upstream mailbox system is [dreamhunter2333/cloudflare_temp_email](https://github.com/dreamhunter2333/cloudflare_temp_email). Check the upstream repository for its own license and terms.
