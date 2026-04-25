# Changelog

All notable changes to this project will be documented in this file.

## 1.0.12 - 2026-04-25

- Added administrator-side new-mail unread dots for incrementally refreshed inbox and unknown-recipient mail, with local read-state sync across matching messages.
- Added a clear `验证码已复制` toast when copying detected verification codes, and marks copied messages as read locally.
- Polished address group modals with a stable centered layout, lightweight backdrop, and keyboard-aware sizing that avoids the previous input flicker.
- Improved single-address compose keyboard behavior so the body field and send controls remain reachable while typing.
- Tuned admin pager gestures so one swipe changes at most one page, with smoother settling animations.
- Compressed admin address, inbox, sent, and unknown page toolbars to leave more space for list previews while preserving touch targets.

## 1.0.11 - 2026-04-25

- Switched the app flow to administrator-first startup and moved admin settings to a root-level route.
- Added OLED black theme support with remembered dark-theme preference for the admin quick toggle.
- Added full-screen Reanimated pager navigation for admin pages with smoother tap and swipe transitions.
- Optimized admin navigation responsiveness, list rendering, cold-page placeholders, and background prefetch behavior.
- Refreshed README documentation for the new admin-first workflow.

## 1.0.10 - 2026-04-25

- Prepared the repository for public GitHub release as CloudMail.
- Kept APK files out of source control and documented GitHub Releases as the distribution path.
- Added open source project metadata and contribution documentation.
- Added upstream mailbox system attribution for dreamhunter2333/cloudflare_temp_email.

## Earlier versions

Earlier APK builds were local development builds. See Git history and project documentation for implementation details.
