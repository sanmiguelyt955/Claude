# Meta Ads Shared Preamble

Use this for account access and the local context shared by Meta Ads skills.
Follow [`../../docs/mcp-connection.md`](../../docs/mcp-connection.md) when live
account data is needed. Let the connected server's current instructions and
capability descriptions determine tool selection, arguments, and call order.

## Resolve the task and account

- Keep the work within the user's request. Listing accounts or answering a
  narrow question does not require a full audit, a business questionnaire, or
  creation of baseline files.
- Use the authenticated workspace and live account information to establish
  access. A saved account ID is a preference, not proof of authorization. Do not
  infer access to Meta Ads from another connected platform.
- When listing accounts, return the available accounts; selection is only needed
  before account-specific work. Use a clear account choice already in the
  conversation or the workspace's active account. Ask only if the intended
  target remains ambiguous.
- If setup is incomplete, use the connection's returned guidance. Do not infer
  that an empty result means the user must create an advertising account.
- Reuse valid results within the task. Refresh when the state changes or fresh
  evidence is needed; avoid repeated setup calls for their own sake.

## Local context, when needed

For workflows that use saved context, merge nonempty config fields from:

1. Project `.notfair.json`.
2. The host's project-specific `notfair.json`, if present.
3. `~/.notfair/config.json`.

The Meta Ads preference is `metaAccountId`. Preserve other fields when saving an
explicit account choice. Follow the live schema for account identifiers and
formatting; do not rewrite an ID based on an assumed platform convention.

When `.notfair.json` exists in the project, `{data_dir}` is `.notfair/` there;
otherwise it is `~/.notfair/`. Meta Ads business context and personas live under
`{data_dir}/meta/`. Create directories only when the requested workflow needs to
save something. Keep project-local account configuration and business data out
of version control. Missing business context should block only conclusions that
actually depend on it; collect what is needed for the user's task.
