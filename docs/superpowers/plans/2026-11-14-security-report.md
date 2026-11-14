# Security report (#616)

**Goal:** every open code scanning and Dependabot alert becomes a `ready-for-agent` `fast-lane` issue, without anyone reading the Security tab.

**Why a workflow:** the cloud session's GitHub access cannot list security alerts (the proxy refuses them). A workflow can, and a session can read its artifact.

## Tasks

1. `.github/workflows/security-report.yml`: at 05:40 UTC and on demand, list the open code scanning alerts with the job token (`security-events: read`) and the open Dependabot alerts with the `DEPENDABOT_READ_TOKEN` secret. Write one JSON line per alert, `counts.json`, and only the counts to the public run summary. Upload the `security-report` artifact, kept one day. Without the secret, the report says Dependabot was not read.
2. The github-issues skill, Triage: a security pass that reads the newest report and files, or closes, one `[security] <kind> #<id>` issue per alert. The issue names no file or advisory, because the repo is public.
3. `docs/ARCHITECTURE.md`: one sentence beside the Dependabot bullet.
4. Prove it: dispatch the workflow on the branch and read the artifact. Both lists must be read, or the report must say why one was not.

## Rulings

- Security-pass issues skip the "Build this?" step: Flemming chose this report (option A), added the token, and asked for the automation (14 Nov 2026: nothing waits on him).
- The issue's title carries the alert's number as a stable key, so a second pass never files it twice.
- The workflow runs 20 minutes before the 06:00 triage, so the report is fresh when the pass reads it.
- A PR that changes the workflow runs it, because a dispatch only reaches the copy on `main`.
