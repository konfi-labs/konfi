# Security Policy

## Supported versions

Security fixes are handled on the default branch. Public release support
windows are not defined yet.

## Reporting a vulnerability

Please do not open a public issue for suspected vulnerabilities. Report the
problem privately by emailing <security@getkonfi.com>, or use GitHub's
private vulnerability reporting ("Report a vulnerability" under the Security
tab) on this repository. Include:

- affected app, package, route, function, or workflow
- reproduction steps or proof of concept
- expected impact
- any relevant logs with secrets redacted

You should receive an acknowledgement within a few business days. If you are
reporting against a fork that has no private advisory channel, contact that
fork's repository owner directly.

## Secrets and production data

Do not commit real credentials, Firebase service-account JSON, API tokens,
customer/order exports, production files, or screenshots containing private
business data. Use the checked-in `.env.example` file for placeholders.

Before making a fork public, run a secret scan across both the current tree
and git history, rotate any credential that appears in history, and review
tests, Storybook fixtures, docs, changelogs, and screenshots for private data.

Suggested tools include GitHub secret scanning, gitleaks, and trufflehog.
