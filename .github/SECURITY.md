# Security policy

## Supported versions

Security fixes go into the latest release. Please update to it before reporting.

## Reporting a vulnerability

Please **don't open a public issue** for a security problem. Report it privately through GitHub's private vulnerability reporting:

1. Open the repository's [Security tab](https://github.com/relur-dev/relur/security).
2. Click **Report a vulnerability**.
3. Describe the problem, the version and platform, and the steps to reproduce it, with a proof of concept if you have one.

You'll get an answer as soon as possible, usually within a week. Once the problem is confirmed and fixed, a release will include the fix and the advisory will credit you, unless you'd rather stay anonymous.

## Scope

Relur runs the official Claude Code command and git on your machine. Problems in Claude Code itself belong to [Anthropic's vulnerability disclosure program](https://www.anthropic.com/responsible-disclosure-policy); problems in Relur's own code, its install script, its release packages or the hook bridge it runs on `127.0.0.1` belong here.
