# Contributing to CloudMail

Thanks for taking the time to improve CloudMail.

## Before you start

- Open an issue for larger changes so the approach can be discussed first.
- Keep pull requests focused. Avoid mixing UI redesigns, API changes, and cleanup in one PR.
- Do not commit real passwords, tokens, API keys, mailbox credentials, or private service URLs.

## Local development

Install dependencies:

```bash
pnpm install
```

Run checks before opening a pull request:

```bash
pnpm check
pnpm test
```

## Pull request checklist

- The change is scoped to one purpose.
- TypeScript checks pass.
- Tests pass or the reason for missing tests is explained.
- Documentation is updated when behavior or setup changes.
- Generated APK files are not committed.
