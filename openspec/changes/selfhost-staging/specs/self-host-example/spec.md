## MODIFIED Requirements

### Requirement: The image consumes published packages
The image SHALL install `@widgentic/core`, `@widgentic/designer`, `@widgentic/webmcp` and `@widgentic/mcp` from the registry at declared version ranges, never from a path, a workspace link or a tarball in the build context, so building it exercises exactly what a reader of the documentation would install. A module shared between the examples in this repository is part of the example, not the product, and MAY be referenced by path and copied into the build context. The example's documentation SHALL name the supported way to run it against unreleased package changes, and that way SHALL NOT be a committed dependency edit.

The example SHALL also provide a separate source-build variant for running unreleased changes, such as on a staging deployment of a feature branch. Built with the repository root as its context, it SHALL compile the four packages from the checkout in a build stage, pack each with the package manager's own packing, and install those packed tarballs in place of the registry versions, so every `@widgentic/*` import in the image resolves to the branch's packed code exactly as a published install would lay it out. It SHALL leave the committed manifest unchanged, keep the import smoke, and otherwise produce the same runtime image. The documentation SHALL present it beside the linking recipe as a way to run unreleased changes.

#### Scenario: The build resolves from the registry
- **WHEN** the image is built
- **THEN** every `@widgentic/*` dependency SHALL resolve from the registry at the declared ranges, and no `file:`, `link:`, `portal:` or workspace specifier SHALL name one of them in the example's manifest

#### Scenario: Unreleased changes have a documented path
- **WHEN** a reader wants to try an unreleased package change in the example
- **THEN** the documentation SHALL give a linking recipe that leaves the committed manifest unchanged

#### Scenario: The build proves the webmcp entry
- **WHEN** the image is built while `@widgentic/webmcp` is not yet on the registry at the declared range
- **THEN** the build SHALL fail at the import smoke rather than produce a container whose page cannot register tools

#### Scenario: The source variant runs the checkout's packages
- **WHEN** the source-build variant is built from a checkout whose packages differ from the published ones
- **THEN** each `@widgentic/*` package installed in the image SHALL be the one packed from that checkout, with a single copy of each, and the import smoke SHALL pass

#### Scenario: The source variant leaves the manifest alone
- **WHEN** the source-build variant is built
- **THEN** the committed `examples/docker/package.json` SHALL be unchanged, and the published-package build SHALL still resolve from the registry

## ADDED Requirements

### Requirement: An optional seed populates the single principal at startup
When `WIDGENTIC_SEED_FILE` names a readable JSON document, the authoring service SHALL, at startup in single-principal mode, load its entries into the single principal: an object whose optional `schemas`, `themes`, `actions` and `widgets` arrays hold entries in the shapes the authoring surface imports and exports. Entries SHALL be written in that order — shared schemas and actions before the widgets that reference them — and each through the store's validated write, so the seed passes exactly the checks a person's import passes. An entry whose name (or kind) the principal already holds SHALL be skipped and SHALL NOT be overwritten. A refused entry SHALL be logged with its name and refusal code, and the remaining entries SHALL still be written. A file that cannot be read or parsed SHALL be logged and SHALL NOT stop the service. The seed SHALL never create keys or secrets. With the variable unset or empty nothing SHALL be seeded, and in trusted-header mode the seed SHALL be ignored with a log line, since no single principal owns it. The service SHALL log a summary of what was written, skipped and refused.

#### Scenario: A seed populates an empty store
- **WHEN** the service starts in single-principal mode with a seed holding two schemas, two themes and two widgets that reference those schemas
- **THEN** the principal SHALL hold all six entries, and a render of either widget over its kind SHALL succeed

#### Scenario: A person's edits survive a restart
- **WHEN** the principal already holds a theme named in the seed, with different tokens, and the service restarts
- **THEN** the stored theme SHALL keep the person's tokens

#### Scenario: A bad entry does not block the rest
- **WHEN** a seed holds a widget that references a schema absent from the store and the seed
- **THEN** that widget SHALL be refused and logged with `UNKNOWN_SCHEMA`, and the seed's other entries SHALL be written

#### Scenario: A broken file does not stop the service
- **WHEN** `WIDGENTIC_SEED_FILE` names a missing file or a file that is not JSON
- **THEN** the service SHALL log the failure and start with nothing seeded

#### Scenario: No seed without configuration
- **WHEN** the variable is unset, or the service runs in trusted-header mode
- **THEN** nothing SHALL be written, and in trusted-header mode a log line SHALL say the seed was ignored

### Requirement: A deployment key survives an ephemeral store
The MCP service SHALL accept one operator-supplied API key — from a mounted file (`WIDGENTIC_DEFAULT_KEY_FILE`, preferred) or a variable (`WIDGENTIC_DEFAULT_KEY`) — that resolves to the single principal on every boot, so hosts configured with it keep working when the store starts empty. The key SHALL have the shape the stores mint (`wgk_` followed by 64 hexadecimal characters); any other value SHALL be ignored with a log line. The service SHALL hold only its digest and SHALL compare a presented key against it in constant time; the key SHALL NOT be written to the store, the volume, any log line, page or diagnostic. Its scopes SHALL come from `WIDGENTIC_DEFAULT_KEY_SCOPES` through the same normalization a key gets at creation: read only by default, `execute` only when the operator names it, and a scope keys cannot hold SHALL leave the key read-only with a log line. A presented key that is not the deployment key SHALL resolve through the store exactly as before. With neither setting configured, nothing SHALL change.

#### Scenario: The deployment key reaches the seeded catalog after a restart
- **WHEN** the deployment key is configured, the store starts empty and the seed loads, and a host presents that key
- **THEN** the request SHALL resolve to the single principal and its catalog SHALL include the seeded widgets

#### Scenario: Read only unless execute is named
- **WHEN** the deployment key is configured without scopes, and again with `read,execute`
- **THEN** it SHALL resolve with `read` only the first time and `read` and `execute` the second

#### Scenario: A scope keys cannot hold leaves it read-only
- **WHEN** `WIDGENTIC_DEFAULT_KEY_SCOPES` names `write`
- **THEN** the key SHALL resolve read-only and a log line SHALL say so

#### Scenario: A malformed or unreadable key is ignored
- **WHEN** the configured value lacks the minted shape, or the named file cannot be read
- **THEN** no deployment key SHALL be active, a log line SHALL say why, and no log line SHALL contain the configured value

#### Scenario: Other keys resolve as before
- **WHEN** a deployment key is configured and a different key is presented
- **THEN** the presented key SHALL resolve through the store, or to the anonymous catalog when the store does not know it
