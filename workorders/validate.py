#!/usr/bin/env python3
"""Audit authored work-order documents, not future feature implementations.

The manifest deliberately captures document bytes and the original HTML baseline.
This script uses only Python's standard library and never changes application data.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import sys
import tempfile


SECTIONS = (
    "Outcome",
    "Execution contract: this file and index.html are sufficient project inputs",
    "Current application facts to preserve",
    "Shared implementation contract, reproduced here deliberately",
    "Required validation environment and evidence",
    "In-code documentation and completion gate",
    "Existing-code integration map",
    "Implementation requirements",
    "Implementation sequence",
    "Interfaces, algorithms and formats",
    "Acceptance tests and expected evidence",
    "Feature-specific code comments",
    "Implementation handoff and traceability",
)


def audit(root, check_source_baseline=False):
    """Return errors and a summary; deliberately distinguish authored vs executed tests."""
    errors = []
    manifest = json.loads((root / "manifest.json").read_text())
    html = (root.parent / "index.html").read_bytes()
    source = html.decode()
    source_sha = hashlib.sha256(html).hexdigest()
    orders = manifest["orders"]
    if manifest.get("status") != "specified-not-implemented":
        errors.append("Manifest must distinguish specifications from implementations")
    if [o["number"] for o in orders] != list(range(1, 21)):
        errors.append("Manifest must list exactly orders 01 through 20, once, in order")
    expected_files = {o["file"] for o in orders}
    actual_files = {p.name for p in root.glob("[0-9][0-9]-*.md")}
    if actual_files != expected_files:
        errors.append(f"Numbered files differ from manifest: {actual_files ^ expected_files}")
    if check_source_baseline and source_sha != manifest["baselineHtmlSha256"]:
        errors.append("index.html differs from the authoring baseline")
    readme = (root / "README.md").read_text()
    totals = {"orders": len(orders), "requirements": 0, "acceptanceCases": 0,
              "jsonExamples": 0, "anchors": 0, "words": 0}
    for order in orders:
        ident, filename = order["id"], order["file"]
        path = root / filename
        if not path.is_file():
            errors.append(f"{ident}: missing {filename}")
            continue
        data = path.read_bytes()
        text = data.decode()
        normalized = re.sub(r"\s+", " ", text)
        if hashlib.sha256(data).hexdigest() != order["sha256"]:
            errors.append(f"{ident}: document digest differs from reviewed manifest")
        if len(text.split()) != order["words"]:
            errors.append(f"{ident}: word count differs from manifest")
        if not text.startswith(f"# {ident} — {order['title']}\n"):
            errors.append(f"{ident}: title/order mismatch")
        for section in SECTIONS:
            if f"\n## {section}\n" not in text:
                errors.append(f"{ident}: missing section {section}")
        for invariant in (
            "this document is not an implementation", "sha256-chain-v1",
            "transaction `oncomplete`", "@workorder " + ident,
            "@requirement " + ident + "-Rnn", "principal-bound",
            "Do not claim unrelated future features", "Node 24",
            "Chromium and", "Firefox", "Provider", "comments",
            "another work order", "pass/fail/pending",
            f"tests/wo-{order['number']:02d}-browser.mjs",
            f"artifacts/wo-{order['number']:02d}/validation.md",
        ):
            if invariant not in normalized:
                errors.append(f"{ident}: missing standalone invariant {invariant!r}")
        if re.search(r"(?:WO|wo)-XX|\bTBD\b", text):
            errors.append(f"{ident}: unresolved authoring placeholder")
        if text.count("\n```") % 2:
            errors.append(f"{ident}: unbalanced fenced code blocks")
        reqs = re.findall(r"^### (WO-\d{2}-R\d{2})$", text, re.M)
        cases = re.findall(r"^### (WO-\d{2}-A\d{2})$", text, re.M)
        if reqs != order["requirements"] or len(reqs) != len(set(reqs)):
            errors.append(f"{ident}: requirement headings differ from manifest")
        if cases != [c["id"] for c in order["acceptanceCases"]]:
            errors.append(f"{ident}: acceptance headings differ from manifest")
        covered = set()
        for case in order["acceptanceCases"]:
            section = text.split(f"### {case['id']}\n", 1)[-1].split("\n### ", 1)[0]
            refs = re.findall(r"`(WO-\d{2}-R\d{2})`", section.split("**Exercise:**", 1)[0])
            if refs != case["requirements"]:
                errors.append(f"{case['id']}: requirement mapping differs from manifest")
            if not refs or not set(refs).issubset(reqs):
                errors.append(f"{case['id']}: missing or undefined requirement reference")
            if "**Exercise:**" not in section or "**Pass condition:**" not in section:
                errors.append(f"{case['id']}: missing executable scenario/pass criterion")
            covered.update(refs)
        if covered != set(reqs):
            errors.append(f"{ident}: requirements without acceptance coverage: {set(reqs) - covered}")
        for anchor in order["anchors"]:
            if anchor not in source:
                errors.append(f"{ident}: missing index.html anchor {anchor}")
            if f"- `{anchor}`" not in text:
                errors.append(f"{ident}: manifest anchor absent from document: {anchor}")
        for block in re.findall(r"```json\n(.*?)\n```", text, re.S):
            try:
                json.loads(block)
                totals["jsonExamples"] += 1
            except json.JSONDecodeError:
                # Several examples are intentionally newline-delimited JSON-RPC frames.
                try:
                    frames = [line for line in block.splitlines() if line.strip()]
                    for line in frames:
                        json.loads(line)
                    totals["jsonExamples"] += len(frames)
                except json.JSONDecodeError as exc:
                    errors.append(f"{ident}: invalid JSON example: {exc}")
        if f"]({filename})" not in readme:
            errors.append(f"{ident}: missing index link")
        for target in re.findall(r"\]\(([^)]+)\)", text + readme):
            if not re.match(r"(?:https?://|#|/)", target):
                if not (root / target.split("#", 1)[0]).exists():
                    errors.append(f"{ident}: missing relative link {target}")
        totals["requirements"] += len(reqs)
        totals["acceptanceCases"] += len(cases)
        totals["anchors"] += len(order["anchors"])
        totals["words"] += len(text.split())
    totals["htmlSha256"] = source_sha
    totals["baselineMatches"] = source_sha == manifest["baselineHtmlSha256"]
    totals["implementationTestsRun"] = False
    return errors, totals


def self_test(root):
    """Verify rejection paths against isolated copies; never mutate the working tree."""
    results = []
    with tempfile.TemporaryDirectory(prefix="tracker-workorder-audit-") as temporary:
        base = Path(temporary)
        target = base / "workorders"
        shutil.copytree(root, target)
        snapshot = {p: p.read_bytes() for p in target.iterdir() if p.is_file()}
        first = target / "01-shared-command-engine.md"

        def reset():
            for path, data in snapshot.items():
                path.write_bytes(data)
            shutil.copy2(root.parent / "index.html", base / "index.html")

        def edit(path, old, new):
            path.write_text(path.read_text().replace(old, new))

        def bad_anchor():
            path = target / "manifest.json"
            data = json.loads(path.read_text())
            data["orders"][0]["anchors"].append("nonexistent_workorder_audit_canary")
            path.write_text(json.dumps(data))

        scenarios = (
            ("missing requirement heading",
             lambda: edit(first, "### WO-01-R01", "### Removed requirement"),
             "requirement headings differ"),
            ("requirement has no acceptance coverage",
             lambda: edit(first, "`WO-01-R01`", "`WO-01-R02`"),
             "requirements without acceptance coverage"),
            ("broken JSON example",
             lambda: edit(first, '"ok":true', '"ok":tru'), "invalid JSON example"),
            ("source reference missing", bad_anchor, "missing index.html anchor"),
            ("standalone section omitted",
             lambda: edit(first, "## Current application facts to preserve", "## Removed context"),
             "missing section Current application facts"),
            ("source baseline changed",
             lambda: (base / "index.html").write_bytes((base / "index.html").read_bytes() + b"\n"),
             "index.html differs from the authoring baseline"),
            ("numbered order missing", first.unlink, "Numbered files differ from manifest"),
        )
        for name, mutation, expected in scenarios:
            reset()
            mutation()
            errors, _ = audit(target, check_source_baseline=True)
            passed = any(expected in error for error in errors)
            results.append({"case": name, "result": "PASS" if passed else "FAIL"})
        reset()
        errors, _ = audit(target, check_source_baseline=True)
        results.append({"case": "unaltered complete handoff", "result": "FAIL" if errors else "PASS"})
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check-source-baseline", action="store_true")
    parser.add_argument("--self-test", action="store_true",
                        help="Test the auditor against isolated deliberately damaged copies")
    args = parser.parse_args()
    try:
        root = Path(__file__).resolve().parent
        errors, totals = audit(root, args.check_source_baseline)
        if args.self_test:
            totals["auditorSelfTests"] = self_test(root)
            if any(case["result"] != "PASS" for case in totals["auditorSelfTests"]):
                errors.append("Auditor rejection-path self-test failed")
    except (OSError, ValueError, KeyError) as exc:
        print(f"Document audit failed: {exc}", file=sys.stderr)
        sys.exit(1)
    print(json.dumps({"documentAudit": "FAIL" if errors else "PASS",
                      **totals, "errors": errors}, indent=2))
    sys.exit(bool(errors))
