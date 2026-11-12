#!/usr/bin/env python3
"""Build a clean English SRT from the recorded PACT narration timeline.

Cues are curated at sentence/clause boundaries rather than greedy word packs.
Timing is allocated within each narration segment by character count. The final
master has a 2.0 s title card before the 180.1 s main footage, so every cue is
shifted by INTRO_OFFSET to match the MP4.

This script does not touch the picture or audio. It only writes an SRT.
"""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parent.parent
TIMELINE = ROOT / "production" / "timeline.json"
OUT_SRT = ROOT / "submission" / "PACT_Hackathon_Demo.srt"
OUT_MANIFEST = ROOT / "production" / "subtitles_manifest.txt"

INTRO_OFFSET = 2.0
MAX_LINE_CHARS = 48

# Curated cue boundaries. Joining each list with one space must reproduce the
# narration text for that timeline segment exactly (asserted below).
CUES = {
    "01_opening": [
        "An AI agent can choose what to buy, but it should never decide how much authority it has.",
        "PACT is the permission layer between AI intent and money movement.",
    ],
    "02_problem": [
        "An unrestricted payment credential",
        "turns a model mistake or prompt injection into financial loss.",
        "A confirmation dialog is not a boundary; it is UI state.",
        "PACT decides whether a proposal is allowed.",
    ],
    "03_solution": [
        "PACT separates four decisions:",
        "AI proposes, PACT verifies against a signed mandate,",
        "the owner authorizes exceptions, and PayPal processes.",
        "The agent never gets a payment secret.",
    ],
    "04_dashboard": [
        "This is a real Postgres-backed account.",
        "Mandates, blocked evaluations and signed audit events are persisted records.",
        "PayPal is not configured, so no payment is claimed.",
    ],
    "05_mandate": [
        "Authority is a signed instrument.",
        "This mandate fixes a two-hundred-dollar ceiling,",
        "fifty dollars per transaction, four authorizations,",
        "an expiry, one merchant and one category.",
        "PACT rebuilds the payload at decision time.",
        "Change a signed field and the proof breaks.",
    ],
    "06_agent": [
        "The agent has its own Ed25519 identity, so every proposal is attributable.",
        "Only the public half is exposed.",
        "It can propose, but cannot approve itself or reach PayPal credentials.",
    ],
    "07_payment": [
        "The agent selects from the server-controlled catalog and creates a signed proposal.",
        "PACT re-checks signature, ownership, status, expiry,",
        "merchant, category, amount, budget, count, replay and delegation.",
        "The proposal is authorized and the budget is reserved atomically.",
        "This is still not a payment.",
    ],
    "08_trace": [
        "Here is the boundary.",
        "PACT authorized thirty-eight dollars and reserved it locally.",
        "PayPal approval has not started, no order exists, and no capture exists.",
    ],
    "09_security": [
        "Each scenario ran against the real engine",
        "with a signed harness mandate and a manipulated proposal.",
        "Prompt injection is treated as text, merchant substitution is blocked,",
        "replay is rejected, and concurrent spending is serialized by a row lock.",
    ],
    "10_decision": [
        "This is a rejected proposal, not a settlement.",
        "Forty dollars exceeded the remaining budget.",
        "Sixteen checks passed, one failed, and PayPal was never reached.",
        "No transaction is created.",
    ],
    "11_delegation": [
        "Delegation is attenuated.",
        "The child receives only a subset of the parent's budget, scope and expiry.",
        "When the parent is revoked,",
        "the child is withdrawn even though its signature remains valid.",
    ],
    "12_audit": [
        "Every sensitive action appends a hash-chained, signed record.",
        "The page recomputes the chain: one hundred percent integrity, zero signature failures.",
        "This is application evidence, not immutable storage.",
    ],
    "13_paypal": [
        "No PayPal Sandbox credentials exist here.",
        "PACT fails closed and will not fabricate a payment.",
        "The loopback contract test proves the adapter, not a genuine Sandbox transaction.",
        "Live verification is still pending.",
    ],
    "14_close": [
        "AI proposes. PACT verifies.",
        "The owner authorizes. PayPal processes.",
        "Bounded, auditable permission to buy, without giving the agent the keys.",
    ],
}


def srt_time(seconds: float) -> str:
    milliseconds = max(0, round(seconds * 1000))
    hours, milliseconds = divmod(milliseconds, 3_600_000)
    minutes, milliseconds = divmod(milliseconds, 60_000)
    secs, milliseconds = divmod(milliseconds, 1_000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{milliseconds:03d}"


def wrap_cue(cue: str) -> str:
    """Wrap a cue to two balanced lines of <= 48 characters."""
    if len(cue) <= MAX_LINE_CHARS:
        return cue
    words = cue.split()
    best = None
    for split in range(1, len(words)):
        left = " ".join(words[:split])
        right = " ".join(words[split:])
        if max(len(left), len(right)) > MAX_LINE_CHARS:
            continue
        # Prefer the shortest longest-line, then the most even split.
        score = (max(len(left), len(right)), abs(len(left) - len(right)))
        if best is None or score < best[0]:
            best = (score, [left, right])
    if best is None:
        # Defensive fallback for an unexpectedly long word/cue.
        midpoint = max(1, len(words) // 2)
        return "\n".join([" ".join(words[:midpoint]), " ".join(words[midpoint:])])
    return "\n".join(best[1])


def main():
    timeline = json.loads(TIMELINE.read_text(encoding="utf-8"))
    segments = [s for s in timeline["segments"] if s.get("text") and s["name"] != "tail"]

    entries = []
    for segment in segments:
        name = segment["name"]
        if name not in CUES:
            raise SystemExit(f"missing curated cues for {name}")
        original = re.sub(r"\s+", " ", segment["text"]).strip()
        joined = " ".join(CUES[name])
        if joined != original:
            raise SystemExit(f"cue text does not match narration for {name}\n{joined!r}\n{original!r}")

        cues = CUES[name]
        total_chars = sum(len(c) for c in cues)
        elapsed = 0
        start = float(segment["start"]) + INTRO_OFFSET
        duration = float(segment["end"]) - float(segment["start"])
        for i, cue in enumerate(cues):
            cue_chars = len(cue)
            cue_start = start + duration * (elapsed / total_chars)
            elapsed += cue_chars
            cue_end = start + duration * (elapsed / total_chars)
            if i == len(cues) - 1:
                cue_end = float(segment["end"]) + INTRO_OFFSET
            entries.append((cue_start, cue_end, wrap_cue(cue)))

    # Validate subtitle hygiene.
    for i, (start, end, cue) in enumerate(entries):
        assert end > start, f"cue {i + 1} has non-positive duration"
        assert len(cue.splitlines()) <= 2, f"cue {i + 1} has too many lines"
        assert all(len(line) <= MAX_LINE_CHARS for line in cue.splitlines()), f"cue {i + 1} line too long"
        assert 1.2 <= end - start <= 6.6, f"cue {i + 1} duration {end - start:.2f}s outside range"
        if i:
            assert start >= entries[i - 1][1] - 0.001, f"cue {i + 1} overlaps previous cue"

    blocks = []
    for i, (start, end, cue) in enumerate(entries, 1):
        blocks.append(f"{i}\n{srt_time(start)} --> {srt_time(end)}\n{cue}\n")
    OUT_SRT.write_text("\n".join(blocks), encoding="utf-8")

    manifest = [
        f"cues={len(entries)}",
        f"segments={len(segments)}",
        f"first={srt_time(entries[0][0])}",
        f"last={srt_time(entries[-1][1])}",
        f"min_cue_seconds={min(e - s for s, e, _ in entries):.3f}",
        f"max_cue_seconds={max(e - s for s, e, _ in entries):.3f}",
        f"max_line_chars={max(len(line) for _, _, c in entries for line in c.splitlines())}",
        f"intro_offset={INTRO_OFFSET}",
    ]
    OUT_MANIFEST.write_text("\n".join(manifest) + "\n", encoding="utf-8")
    print("\n".join(manifest))
    print(f"wrote {OUT_SRT}")


if __name__ == "__main__":
    main()
