# Work-order authoring review

Reviewed 2026-10-13 against commit `bef1b7da5eeaf338e1b87f30cee3c3dc7a2554d7`.
HTML SHA-256: `c96eafd12882414386ee3b23f21c09b3a0ba4b20aae8bd7f6e16f49da58120a7`.
The application HTML was not modified for this documentation delivery.

Result: **Document audit passed. Feature implementations have not been performed by this
work-order authoring task, and their acceptance tests have not been run.**

The folder contains exactly 20 numbered standalone orders, one for each proposed feature.
Each includes its own application context, shared contracts, numbered requirements,
implementation sequence, interfaces/algorithms/formats, acceptance cases, source anchors,
code-comment requirements and reproducible validation/evidence instructions.

| Authoring check | Result |
|---|---|
| Numbered orders 01–20, unique and indexed | 20 present |
| Implementation requirements | 240, all mapped to acceptance cases |
| Acceptance cases with scenarios and pass conditions | 160 |
| JSON/JSON-RPC examples parsed | 50 valid records |
| Current HTML integration references | 202 references found |
| Individual order lengths | 3,765–4,693 words |
| Combined numbered-order text | 81,952 words |
| Manifest document hashes and requirement mappings | Match |
| Required standalone sections, fenced blocks and relative links | Pass |
| Application source baseline | Unchanged |
| Auditor rejection-path/control self-tests | 8/8 pass |

Standalone review checked that no order requires another work order, hidden conversation,
existing test suite, private media fixture or user browser. Each order specifies a real
minimal shared foundation to implement if absent. Optional companions must be created by
the implementing agent from the supplied HTML; GitHub Pages remains a static host.

Integration review corrected source anchor names against the current HTML and tightened
these implementation-critical boundaries:

- Existing focused-file links still carry the full room secret; genuine file-only
  invitations use independent object keys and isolated capability actors.
- Existing chain CIDs remain unchanged; authenticated random access uses a separately
  signed proof index with explicit leaf/tree encodings and legacy fallback.
- Erasure coding encrypts before coding, meets provider minimum cell lengths, and uses
  a new private record format instead of overloading legacy replica records.
- Large CDC chunks are framed to meet provider limits; private equality indexes never
  become public convergent-encryption identifiers.
- Global retention completion requires byte commits and recoverable private metadata.
  Mailbox append authority is separate from authenticated read/list authority.
- Handoff finalization is serialized by an explicit authoritative coordinator; local
  locks and timeout heuristics are not represented as cross-device consensus.
- MCP legacy and 2026 adapters have separate wire behavior. Current protocol references
  were checked; optional clientInfo, required metadata/headers and durable-job lifetime
  are distinguished from transport request cancellation.
- Every order requires nearby tagged source comments and a requirement-to-code-to-test
  evidence report. Real 24-hour observations are required where specified.

Run the reproducible document audit from the repository root:

```sh
python3 workorders/validate.py --check-source-baseline --self-test
```

The self-test modifies only temporary copies: remove a requirement heading, remove its
acceptance coverage, corrupt JSON, add a nonexistent source anchor, omit essential context,
change the HTML baseline and remove an entire order; all must be detected. An unchanged
copy must pass. [Machine-readable results](audit-results.json) record this run.

This review verifies specification consistency and coverage. It does not establish
cryptographic implementation correctness, protocol conformance, accessibility compliance,
performance, successful deployment or runtime stability of future changes. Each implementing
agent must produce and pass the executable validation required by its own order.
