# Evals

Chrome's guidance is that a WebMCP tool set is tested at two levels, because half of it is
deterministic and half of it is a language model deciding things
(https://developer.chrome.com/docs/ai/webmcp/evals). Both levels are in this folder.

## The fixtures

`fixtures/*.json`, one file per case, in the shape Chrome's evals doc uses:

```json
{
  "messages": [{ "role": "user", "content": "I'd like a small pizza." }],
  "expectedCall": [{ "functionName": "set_pizza_size", "arguments": { "size": "Small" } }]
}
```

Ours add four keys that Chrome's example does not need, because this app registers a different
tool set per session:

| key | why |
|---|---|
| `role` | `rider` or `companion`. The tool list under test is `toolsForRole(role, trip)`, not one global list. |
| `page` | Which surface the fixture runs on (`/` has `create_trip`, `/t/:tripId` does not). |
| `state` | The application state the model is told about, per Chrome's "define the initial state" step. |
| `expectedUnavailable` | Tools that must **not** exist in that session. See the negative fixture below. |

Chrome's advice to hand the model the *full* tool list for the page state under test, not just
the one tool you are checking, is why `role` and `page` are recorded: tool-selection ambiguity
is part of what is being evaluated.

## The negative fixture: a companion trying to accept

`fixtures/11-companion-cannot-accept.json` is the asymmetry the whole product turns on, so it
is an eval and not just a code comment. It is expressed as:

- `"expectedCall": []` : the correct behaviour is **no tool call at all**. The model should tell
  the user that only the rider can accept, because nothing in its tool list can do it.
- `"expectedUnavailable": ["accept_reroute", "accept_route"]` : asserted deterministically by
  `evals.test.ts` against `isAllowed("companion", name)`, so a regression that leaks the accept
  tools into a companion session turns this fixture red without needing a model run.

A pass therefore means two things at once: the tool was never registered in that window, and the
model did not hallucinate a call to it anyway. The server also re-checks the role on
`POST /api/trip/:id/action`, so a forged accept from a companion fails even if the tool is
somehow reached.

## Running the deterministic half

```bash
npx vitest run evals
```

`evals.test.ts` asserts, for every fixture:

1. the shape matches Chrome's `{messages, expectedCall}` format;
2. every `functionName` is a tool this app actually registers;
3. that tool is registered **for that fixture's role** (`isAllowed`);
4. every `arguments` object validates against that tool's real `inputSchema`, using the small
   draft-2020-12 validator in `evals/schema.ts` (ajv is not a dependency of this project and
   the evals must not require a new install to be checkable);
5. `expectedUnavailable` names only tools that are genuinely absent for that role;
6. across the whole suite, every registered tool is covered and both roles appear.

The last test in the file breaks the validator on purpose (wrong type, missing required
property, unknown property, out-of-range number) so the suite proves it can fail.

## Running the probabilistic half

The fixtures are written to be fed to a model against the live page, which is what Chrome's
evals tooling does:

1. Open the app in Chrome 149+ with WebMCP enabled: either the Origin Trial token, or
   `chrome://flags/#enable-webmcp-testing` for local development.
2. Open the page named in the fixture's `page` field, in the session named in `role`
   (`/t/<tripId>` for the rider, `/t/<tripId>?role=companion` for the companion).
3. Feed `messages` to an agent connected to that tab (the Model Context Tool Inspector
   extension with `gemini-3-flash-preview`, or any agent that can read
   `document.modelContext`), and compare the resulting tool call to `expectedCall`.
4. Verify by hand in DevTools > Application > WebMCP: **Invoked Tools** shows the call with its
   Input and Output, and the per-tool invocation counter increments.

You can trigger any fixture's expected call directly, without a model, to check the tool half
in isolation. In Chrome 149 the second argument is a JSON **string**, not an object (the
ambiguity tracked in webmcp#278; passing an object throws
`UnknownError: Failed to parse input arguments`):

```js
const tools = await document.modelContext.getTools();
const tool = tools.find(t => t.name === 'list_accessible_stations');
await document.modelContext.executeTool(tool, JSON.stringify({ query: 'Jay St', limit: 2 }));
```

## The failure modes these fixtures are aimed at

Chrome's taxonomy, and which fixture covers each:

| failure mode | fixture |
|---|---|
| wrong tool chosen | `06-compare-routes` (compare, do not re-search), `16-share-trip` |
| right tools, wrong order | `17-read-before-mutate` (route before accept) |
| right tool, wrong arguments | `05-route-accessible` (three constraints stated in prose), `12-propose-reroute` |
| output wrong for the next step | `07-get-trip` (must return proposals, not just the accepted route) |
| tool not exposed in this state | `11-companion-cannot-accept` |
