# widgentic-app Specification

## Purpose
The widgentic.dev app: the authenticated front door to per-principal catalogs. People sign in by email (Entra External ID) or GitHub (first-party OAuth), receive a stable principal, mint named revocable API keys (shown exactly once, stored as digests), and design widgets and themes in the hosted designers — saving writes through a session-authenticated API into the caller's store, so an entry appears in that principal's MCP catalog on the next tool call. Writes are authorized by sessions only; MCP API keys never write. This capability owns accounts, sessions, the key lifecycle, the authoring API, and designer hosting; storage semantics live in widget-store.

## Requirements
