<div align="center">
  <img src="./assets/images/icon.png" alt="CloudMail logo" width="96" height="96" />

# CloudMail

A polished mobile admin client for temporary mailbox systems powered by Cloudflare Workers.

[![CI](https://github.com/Lur1N77777/CloudMail/actions/workflows/ci.yml/badge.svg)](https://github.com/Lur1N77777/CloudMail/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Expo](https://img.shields.io/badge/Expo-54-black.svg)](https://expo.dev/)
[![React Native](https://img.shields.io/badge/React%20Native-0.81-61DAFB.svg)](https://reactnative.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6.svg)](https://www.typescriptlang.org/)

[English](./README.en.md) · [简体中文](./README.md)

[Download APK](https://github.com/Lur1N77777/CloudMail/releases) · [Build from source](./BUILD.md) · [API notes](./docs/mailbox-api-report.md)

</div>

## What CloudMail is

CloudMail is a React Native / Expo mobile app for managing temporary mailbox services from an administrator-first interface. It focuses on the daily workflow of creating addresses, receiving verification emails, reading HTML messages, sending email, and handling messages sent to addresses that have not been created yet.

The mailbox backend/API compatibility comes from [dreamhunter2333/cloudflare_temp_email](https://github.com/dreamhunter2333/cloudflare_temp_email). CloudMail builds a mobile admin experience around that mailbox system.

## Highlights

- **Admin-first workflow**: open the app, connect your mailbox service, and manage mailboxes from one place.
- **Address management**: create custom addresses, random addresses, and subdomain addresses.
- **Inbox, sent mail, and unknown recipients**: browse normal mail, sent mail, and mail received by uncreated addresses.
- **Fast verification-code handling**: detect common verification codes and copy them quickly.
- **HTML and text mail reading**: preview rich HTML email, plain text, and source content.
- **Local grouping**: group addresses locally and filter inbox messages by group.
- **Mobile-friendly UI**: compact cards, dark/light mode, local cache, and incremental refresh behavior.
- **Self-host friendly**: keep your mailbox service under your own control.

## Screenshots

Click any thumbnail to open the full-size image.

| Preview | Description |
| --- | --- |
| <a href="./docs/screenshots/admin-dashboard.jpg"><img src="./docs/screenshots/admin-dashboard.jpg" width="220" alt="Admin dashboard" /></a> | **Admin dashboard** — a compact overview of managed addresses, matched inbox mail, sent mail, and unknown-recipient messages, with quick refresh and tab navigation. |
| <a href="./docs/screenshots/compose-mail.jpg"><img src="./docs/screenshots/compose-mail.jpg" width="220" alt="Compose mail screen" /></a> | **Compose mail** — send email from a selected mailbox identity, with sender, recipient, subject, and content fields organized for mobile use. |
| <a href="./docs/screenshots/settings-server.jpg"><img src="./docs/screenshots/settings-server.jpg" width="220" alt="Server settings" /></a> | **Server settings** — configure the Cloudflare Worker endpoint, optional admin password, site password, and auto-refresh interval. |
| <a href="./docs/screenshots/settings-appearance.jpg"><img src="./docs/screenshots/settings-appearance.jpg" width="220" alt="Appearance settings" /></a> | **Appearance and app settings** — switch refresh intervals and theme mode, then test the connection or check the current app version. |

## Download

Download the latest APK from [GitHub Releases](https://github.com/Lur1N77777/CloudMail/releases).

APK files are intentionally not committed to the source repository. This keeps the Git history small and makes releases easier to audit.

## Upstream mailbox system

CloudMail is designed for mailbox systems compatible with [cloudflare_temp_email](https://github.com/dreamhunter2333/cloudflare_temp_email).

Credit goes to [dreamhunter2333](https://github.com/dreamhunter2333) and contributors of the upstream project for the Cloudflare temporary email system and API behavior that this app targets.

See [NOTICE](./NOTICE) for attribution details.

## Tech stack

- Expo / React Native
- TypeScript
- Expo Router
- AsyncStorage / SecureStore
- WebView-based mail preview
- Vitest
- Optional Drizzle-backed server utilities

## Use the app after downloading it

### 1. Prepare your mailbox service

CloudMail needs a deployed `cloudflare_temp_email` compatible service. Prepare these values first:

- **Worker URL**: for example, `https://your-worker.example.com`.
- **Admin password**: used to enter the admin system if your backend requires it.
- **Site password**: required if your Worker uses `PASSWORDS`.

If you have not deployed the backend yet, follow the upstream [cloudflare_temp_email](https://github.com/dreamhunter2333/cloudflare_temp_email) project first.

### 2. Install and connect

1. Download the latest APK from [GitHub Releases](https://github.com/Lur1N77777/CloudMail/releases).
2. Install the APK on your Android device.
3. Open CloudMail and go to **Settings**.
4. Fill in your **Worker URL**.
5. Fill in the **Admin password** and **Site password** if your backend uses them.
6. Tap **Test connection** to make sure the Worker is reachable.
7. Tap **Save configuration**.

### 3. Log in to the admin interface

CloudMail is designed to prioritize the admin workflow:

1. Save your **Admin password** on the **Settings** page.
2. The **Admin** section will appear near the bottom of Settings.
3. Tap **Enter admin mode**.
4. Enter the admin password and confirm.
5. After login, CloudMail opens the **Admin system**.

On later launches, if the saved admin password is still valid, CloudMail will open the admin system automatically.

If you do not see the **Admin** section yet, tap the **CloudMail** card in **Settings → About** several times to open the admin login entry.

### 4. What you can do in the admin system

Use the top tabs to switch between admin features:

- **Stats**: view address, inbox, sent mail, and unknown-recipient counts.
- **Addresses**: search, create, and manage mailbox addresses.
- **Inbox**: view all received mail, search, and filter by local groups.
- **Sent**: view sent mail records.
- **Unknown**: view messages sent to addresses that have not been created yet, then create those addresses with one tap.
- **Send**: send mail from a selected mailbox address.

### 5. Create a mailbox

1. Go to **Admin system → Addresses**.
2. Open the create mailbox entry.
3. Choose or fill in the prefix, domain, subdomain, or random address options.
4. After creation, the address appears in the address list.
5. You can group addresses locally for easier management.

### 6. Receive verification codes and read mail

1. Go to **Admin system → Inbox**.
2. Wait for auto refresh, or refresh manually.
3. Open the message you need.
4. If CloudMail detects a verification code, tap it to copy quickly.
5. HTML mail is previewed as rich content, and text/source views are available in the detail page.

### 7. Handle unknown recipient addresses

If someone sends mail to an address under your domain that has not been created yet:

1. Go to **Admin system → Unknown**.
2. Check the real recipient address and message content.
3. Tap **Create** if you want to keep that address.
4. After creation, the address becomes a managed mailbox.
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

Read the full guide in [BUILD.md](./BUILD.md).

Common local build flow:

```bash
pnpm install
npx expo prebuild -p android --clean
cd android
./gradlew assembleRelease
```

The generated APK should be uploaded to GitHub Releases instead of committed to Git.

## Project docs

- [Build and installation guide](./BUILD.md)
- [Design notes](./docs/design.md)
- [Mailbox API report](./docs/mailbox-api-report.md)
- [Roadmap](./docs/roadmap.md)
- [Security policy](./SECURITY.md)
- [Contributing guide](./CONTRIBUTING.md)

## Contributing

Issues and pull requests are welcome. Keep changes focused, run checks before submitting, and do not include secrets or generated APK files in commits.

## License

CloudMail is released under the [MIT License](./LICENSE).

The upstream mailbox system is [dreamhunter2333/cloudflare_temp_email](https://github.com/dreamhunter2333/cloudflare_temp_email). Check the upstream repository for its own license and terms.

