# Self-hosted widgentic

One image, two services, one SQLite file: an **authoring app** where you
design widgets, themes, schemas and actions, and an **MCP endpoint** your
agent hosts read them from. No cloud account, no identity provider, no
runtime dependency beyond Node — the database is `node:sqlite`, compiled into
the runtime.

```sh
# 1. A key-encryption key for stored secrets — generated ONCE, kept safe:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" > kek.txt
chmod 600 kek.txt

# 2. Up:
docker compose up --build

# 3. Author at http://localhost:8080/ — everything you save is served at
#    http://localhost:8081/mcp on the next tool call, no restart.
```

Mint a key under **Keys** (shown exactly once), then connect a host:

```sh
claude mcp add --transport http widgentic-self http://localhost:8081/mcp --header "x-api-key: <your key>"
```

Hosts whose connector settings cannot send headers can use
`http://localhost:8081/mcp?key=<your key>`. A request without a key (or with
an unknown one) is served the built-in catalog — never an error. `execute`
is opt-in per key and is what lets your http actions run.

## Co-author with a browser agent (WebMCP)

The authoring page registers its four designers as [WebMCP](https://github.com/webmachinelearning/webmcp)
tools through `@widgentic/webmcp` (beta). Open it in **ChatGPT Desktop's
browser**, or in Chrome 149+ / Edge 150 with `chrome://flags/#enable-webmcp-testing`
(or with an origin-trial token for your origin — see below), and the header
says `WebMCP tools are available in this browser`. Then the loop is:

1. Ask the agent for a widget ("a card for these support tickets"). It calls
   `widgentic_widget_draft_load` and the definition lands in the designer you
   are looking at, with the designer's own diagnostics.
2. Fix, restyle, ask again — the agent reads what you see (`widgentic_widget_draft_get`),
   sets example data, tries a theme. Nothing is saved by a tool.
3. **You** click *Save to my catalog*. On the MCP endpoint's next `render_widget`
   the agent — any agent with your key — renders the widget you co-authored.

In a browser without WebMCP nothing is shown and everything else is
unchanged. No polyfill is bundled: a polyfill supplies the
API, not the agent. If you want extension-based agents, load one such as
`@mcp-b/webmcp-polyfill` in `index.html` before the app bundle; the package
picks up whatever the page has.

### One origin for both surfaces

`WIDGENTIC_MCP_UPSTREAM=http://mcp:8081` on the `web` service forwards
`/mcp` to the MCP service — method, headers, body and the streamed response
untouched, no authorization added — so agents connect to
`https://<your-origin>/mcp` and one certificate covers both. This is how the
hosted challenge instance runs: one Azure Container App, two containers from
this image sharing an ephemeral `/data` (a restart empties it — the compose
file's named volume is the durable arrangement). `WIDGENTIC_ORIGIN_TRIAL_TOKEN`
puts a Chrome origin-trial token on the page so Chrome exposes WebMCP on your
origin without a flag; register the origin at developer.chrome.com/origintrials
and keep the token in the environment.

## The trust shape

The two services deliberately mirror the hosted product's split:

- **`web` is the only writer.** Writes are authorized by the deployment's
  identity (below) and never by an API key: a pasted key is refused with
  `401 KEY_NOT_A_SESSION`, because keys travel into prompt-injectable agent
  hosts and must never author.
- **`mcp` holds a read-only handle** on the store and resolves keys to
  principals per request; catalogs are composed per request, uncached, so
  one principal's widgets never reach another's session.

## Identity

Out of the box there is **one principal and no sign-in** — run it on
localhost or a network you trust, and treat the app the way you would treat
any admin panel with no login.

For multi-user, put the deployment behind the auth proxy you already run
(oauth2-proxy, Cloudflare Access, Authelia, Tailscale Serve) and set:

```yaml
WIDGENTIC_TRUSTED_USER_HEADER: x-forwarded-user
```

Each header value becomes its own account (subjects are namespaced
`proxy:<value>`, stable across restarts). Two rules make this safe rather
than convenient: while the variable is **unset the header is never read**, so
a spoofed header changes nothing; once **set the app fails closed** — a
request without the header is refused rather than served the default
account. Your proxy MUST strip the header from inbound client requests.

## Secrets and the KEK

Secret values (API tokens your http actions send) are envelope-encrypted at
rest; the file on disk holds ciphertext and key digests only. The
key-encryption key is **yours to supply and protect**:

- Generate it once (step 1 above) and hand it to both services as a mounted
  file (`WIDGENTIC_KEK_FILE` — the compose file uses a docker secret) or, as
  a fallback, the `WIDGENTIC_KEK` variable.
- Never bake it into an image layer, commit it, or leave it in shell
  history. **Whoever can read it can decrypt every secret this deployment
  stores**; losing it makes them unreadable, with no recovery.
- With no KEK configured, the Secrets section is off and everything else
  works.

Be clear-eyed about the custody: the KEK lives in the process here, which is
weaker than the hosted product's arrangement, where the key sits in a managed
vault and no process ever holds it. If your threat model needs that, the same
cipher port accepts `createKeyVaultCipher` from `@widgentic/mcp/secrets/keyvault`.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `WIDGENTIC_DB` | `/data/widgentic.db` | SQLite file (put it on a volume) |
| `WIDGENTIC_KEK_FILE` / `WIDGENTIC_KEK` | unset | secrets KEK, file preferred; unset = secrets off |
| `WIDGENTIC_TRUSTED_USER_HEADER` | unset | multi-user via a trusted proxy header; unset = single principal |
| `WIDGENTIC_WEB_PORT` / `WIDGENTIC_MCP_PORT` | 8080 / 8081 | service ports |
| `WIDGENTIC_EXECUTE_RATE` | 60 | per-principal action executions and test calls per minute |

## MCP-only, without compose

```sh
docker build -f docker/Dockerfile -t widgentic-selfhost .   # run from examples/
docker run -p 8081:8081 -v widgentic-data:/data widgentic-selfhost
```

Serves the built-in catalog to everyone; add the `web` service when you want
your own widgets in it.

## Running against unreleased package changes

The image installs the published `@widgentic/*` packages, which is the
point — it proves what a reader gets. To try unreleased changes, run the
hosts directly from a monorepo checkout (`npm run build`, then `npm link`
the three packages and `npm link @widgentic/core @widgentic/designer
@widgentic/mcp` here); path or `file:` edits to the widgentic ranges are
never committed.
