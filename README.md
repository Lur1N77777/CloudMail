<div align="center">
  <img src="./assets/images/icon.png" alt="CloudMail logo" width="96" height="96" />

# CloudMail

A polished mobile admin client for temporary mailbox systems powered by Cloudflare Workers.

[![CI](https://github.com/Lur1N77777/CloudMail/actions/workflows/ci.yml/badge.svg)](https://github.com/Lur1N77777/CloudMail/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Expo](https://img.shields.io/badge/Expo-54-black.svg)](https://expo.dev/)
[![React Native](https://img.shields.io/badge/React%20Native-0.81-61DAFB.svg)](https://reactnative.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6.svg)](https://www.typescriptlang.org/)

[English](./README.md) · [简体中文](./README.zh-CN.md)

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

Screenshots will be added as the public UI stabilizes. For now, check the release APK to try the current mobile experience.

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

