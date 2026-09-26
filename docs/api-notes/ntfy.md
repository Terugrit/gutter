# ntfy

Source: https://docs.ntfy.sh/publish/ (verified 2026-09-21).

Gutter publishes a plain-text HTTP `POST` to `{NTFY_URL}/{NTFY_TOPIC}`. The
documented `Title`, `Click`, and `Attach` headers supply the release title,
the in-app notification URL, and an external cover URL. When `NTFY_TOKEN` is
configured it is sent as `Authorization: Bearer <token>`. A successful 2xx
response means delivery was accepted.

The same publishing reference documents `Priority: high` (priority 4) and
`Tags: warning` headers. Job failure alerts use both; recovery uses ntfy's
default priority by omitting the `Priority` header.

`NTFY_URL` is the server root, not a topic URL. Topics are restricted by ntfy
to letters, numbers, underscores, and dashes; configuration validation keeps
that invalid state out of jobs.
