from __future__ import annotations

import argparse
import re
from datetime import datetime
from pathlib import Path
from typing import Optional


def normalize_whitespace(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\n", " ")
    return re.sub(r"\s+", " ", text).strip()


def normalize_multiline_quoted_cells(raw: str) -> str:
    """Turn multiline double-quoted blocks into single-line blocks.

    - Inside double quotes: newlines -> spaces, collapse whitespace.
    - Outside quotes: keep non-empty lines, collapse whitespace.
    """

    raw = raw.replace("\ufeff", "")

    out_lines: list[str] = []
    buf: list[str] = []
    in_quotes = False

    def flush_outside() -> None:
        nonlocal buf
        if not buf:
            return
        text = "".join(buf)
        buf = []
        for line in text.splitlines():
            line = normalize_whitespace(line)
            if line:
                out_lines.append(line)

    i = 0
    while i < len(raw):
        ch = raw[i]

        if ch == '"':
            if in_quotes:
                # closing quote
                cell = "".join(buf)
                buf = []
                cell = normalize_whitespace(cell)
                out_lines.append(f'"{cell}"')
                in_quotes = False
            else:
                # opening quote
                flush_outside()
                in_quotes = True
                buf = []
            i += 1
            continue

        buf.append(ch)
        i += 1

    # finalize trailing buffer
    if in_quotes:
        cell = normalize_whitespace("".join(buf))
        out_lines.append(f'"{cell}"')
    else:
        flush_outside()

    return "\n".join(out_lines) + "\n"


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Normalize multiline quoted cells into single lines")
    parser.add_argument("input", type=Path, help="Input file path")
    parser.add_argument("--inplace", action="store_true", help="Overwrite input file")
    parser.add_argument(
        "--backup",
        action="store_true",
        help="Create a timestamped .bak copy next to the input file (only with --inplace)",
    )
    parser.add_argument("--output", type=Path, default=None, help="Write to this path instead of stdout")
    args = parser.parse_args(argv)

    raw = args.input.read_text(encoding="utf-8", errors="replace")
    normalized = normalize_multiline_quoted_cells(raw)

    if args.inplace:
        if args.backup:
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_path = args.input.with_suffix(args.input.suffix + f".{ts}.bak")
            backup_path.write_text(raw, encoding="utf-8")
        args.input.write_text(normalized, encoding="utf-8")
        print(f"✅ updated: {args.input}")
        return 0

    if args.output is not None:
        args.output.write_text(normalized, encoding="utf-8")
        print(f"✅ wrote: {args.output}")
        return 0

    print(normalized, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
