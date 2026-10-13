# Implementation work orders

Twenty standalone implementation orders for the Tracker monofile. Give an implementing
agent **one numbered work order and `index.html`**. Each order repeats the necessary
application facts, protocol/security contracts, persistence rules, test bootstrap and
completion gate. This index, the manifest, other orders and any prior conversation are
not prerequisites. Tests and optional companions are deliverables created by the agent.

These are **specifications, not implemented features**. The authoring audit checks document
structure, source anchors, self-contained context and requirement/acceptance coverage; it
does not execute or certify future feature implementations. Every order requires its own
real implementation, comments, reproducible tests and evidence before completion.

| Order | Feature | Requirements | Acceptance cases |
|---|---|---:|---:|
| [WO-01](01-shared-command-engine.md) | One command engine for humans and agents | 12 | 8 |
| [WO-02](02-self-describing-agent-surface.md) | A self-describing TrackerAgent surface | 12 | 8 |
| [WO-03](03-mcp-connectors.md) | Actual MCP connectivity | 12 | 8 |
| [WO-04](04-persistent-headless-peer.md) | A persistent headless peer | 12 | 8 |
| [WO-05](05-streaming-agent-file-io.md) | Streaming file input and output for agents | 12 | 8 |
| [WO-06](06-durable-jobs.md) | Durable jobs with recoverable handles | 12 | 8 |
| [WO-07](07-resumable-room-events.md) | A resumable room event feed | 12 | 8 |
| [WO-08](08-scoped-agent-authority.md) | Scoped agent authority | 12 | 8 |
| [WO-09](09-file-only-invitations.md) | Genuine file-only invitations | 12 | 8 |
| [WO-10](10-safe-concurrent-operations.md) | Safe concurrent operations | 12 | 8 |
| [WO-11](11-room-filesystem.md) | Rooms mounted as filesystems | 12 | 8 |
| [WO-12](12-authenticated-random-access.md) | Authenticated random-access reads | 12 | 8 |
| [WO-13](13-private-delta-transfers.md) | Private delta transfers | 12 | 8 |
| [WO-14](14-erasure-coded-global-storage.md) | Erasure-coded global storage | 12 | 8 |
| [WO-15](15-automatic-retention-caretaker.md) | Automatic retention caretaker | 12 | 8 |
| [WO-16](16-offline-courier-bundles.md) | Offline courier bundles | 12 | 8 |
| [WO-17](17-encrypted-offline-delivery.md) | Encrypted delivery to offline recipients | 12 | 8 |
| [WO-18](18-cross-device-transfer-handoff.md) | Cross-device transfer handoff | 12 | 8 |
| [WO-19](19-bandwidth-energy-budgets.md) | Bandwidth and energy budgets | 12 | 8 |
| [WO-20](20-accessible-searchable-representations.md) | Accessible, searchable content representations | 12 | 8 |

There are 240 numbered requirements and 160 acceptance cases. Common validation,
architecture and code-comment rules are additional mandatory invariants in every order.
Some requirements intentionally contain several related obligations; test every clause,
not just the requirement heading. Twenty-four-hour tests require actual wall-clock
observation and cannot be replaced by simulated time or a short demo.

Suggested integration order is 01–08 for shared agent foundations; 09–13 for scoped access,
concurrency, filesystem and byte interfaces; 14–17 for retention/offline delivery; 18–20 for
handoff, budgets and representations. This is scheduling advice only. Each order states how
to build its necessary foundation when it is the first order implemented. Parallel changes
to shared interfaces should coordinate schema/command versions rather than fork them.

`manifest.json` records the authoring baseline, file hashes, source anchors and all local
requirement-to-acceptance mappings. Run the authoring audit from any working directory:

```sh
python3 workorders/validate.py --check-source-baseline --self-test
```

Without `--check-source-baseline`, the validator checks documents and anchor presence
against the supplied HTML without insisting it is byte-identical to the authoring snapshot.
After implementation legitimately changes source anchors, review/update the affected
specification and manifest explicitly. Do not weaken production acceptance tests to make
a document audit pass. `AUDIT.md` records the authored specification review; implementation
validation belongs in each order’s requested `artifacts/wo-NN/validation.md`.

The auditor's self-test damages isolated temporary copies to verify detection of missing
orders/context/requirements, broken acceptance coverage, invalid JSON, absent source anchors
and a changed HTML baseline. It leaves the workspace and browser data untouched. See the
[authoring review](AUDIT.md) and [machine-readable results](audit-results.json).
