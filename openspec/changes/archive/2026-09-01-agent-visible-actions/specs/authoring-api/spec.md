## MODIFIED Requirements

### Requirement: The surface is transport-agnostic with a Node adapter
The authoring surface SHALL be exposed as a function over a decoded request — method, path, parsed body and the principal context — returning a status and a body, so it can be tested without a socket and mounted on any server. A `node:http` adapter SHALL be published beside it for hosts using the standard server, and it SHALL be the only part that touches request and response objects. The adapter SHALL contain the host's own failure: when the principal resolution the host supplies throws or rejects, the answer SHALL be exactly what the same failure inside the surface would produce — a store rejection keeps its mapped status and code, and any other failure is answered with the surface's structured internal-failure refusal and reported through the deps' log sink. The rejection SHALL NOT escape into the host's server, where it would surface as an unhandled rejection or a bodyless response, and an internal-failure refusal SHALL carry no detail of the host's failure. "Not signed in" is expressed by resolving no context, never by throwing.

#### Scenario: The core needs no server
- **WHEN** the surface is exercised in a test with plain values
- **THEN** every route SHALL be reachable with no HTTP server, socket or framework involved

#### Scenario: The adapter adds no behavior
- **WHEN** the same operation is driven through the core and through the Node adapter
- **THEN** the status and body SHALL be identical

#### Scenario: A failing host callback is contained
- **WHEN** the host's principal resolution rejects (its store is unreachable, say) during an authoring request
- **THEN** the response SHALL be the surface's structured internal-failure refusal, the failure SHALL reach the log sink, and no rejection SHALL escape the adapter
- **AND** the response body SHALL name no detail of the host's failure

#### Scenario: A store rejection keeps its meaning wherever it is thrown
- **WHEN** the host's principal resolution throws a store rejection (its principal store refuses the subject, say)
- **THEN** the response SHALL carry the same mapped status and code the surface would answer for that rejection inside a route
