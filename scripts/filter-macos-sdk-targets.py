#!/usr/bin/env python3
"""Prepare an operator-owned SDK 27 copy for TAPI 1600.

Remove unsupported arm64e.x1 target declarations while preserving all other
SDK stub content. Never run this against the original XIP.
"""
import argparse
import json
import os
from pathlib import Path
import re
import tempfile


TARGET_LIST = re.compile(r"(?P<prefix>\btargets:\s*\[)(?P<values>[^\]]*)(?P<suffix>\])", re.DOTALL)
X1_TARGET = re.compile(r"arm64e\.x1-[A-Za-z0-9_.-]+")


def remove_x1_targets(values):
    matches = list(X1_TARGET.finditer(values))
    for match in reversed(matches):
        start, end = match.span()
        previous = start - 1
        while previous >= 0 and values[previous].isspace():
            previous -= 1
        if previous >= 0 and values[previous] == ",":
            start = previous
        else:
            following = end
            while following < len(values) and values[following].isspace():
                following += 1
            if following < len(values) and values[following] == ",":
                end = following + 1
                while end < len(values) and values[end].isspace():
                    end += 1
        values = values[:start] + values[end:]
    return values


def target_names(values):
    return [entry.strip() for entry in values.split(",") if entry.strip()]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sdk", type=Path)
    args = parser.parse_args()
    sdk = args.sdk.resolve(strict=True)
    settings = json.loads((sdk / "SDKSettings.json").read_text())
    if settings["Version"] != "27.0":
        raise SystemExit("This compatibility preparation only supports SDK 27.0.")

    replacements = []
    for root, directories, files in os.walk(sdk, followlinks=False):
        directories[:] = [name for name in directories if not (Path(root) / name).is_symlink()]
        for name in files:
            path = Path(root) / name
            if path.suffix != ".tbd" or path.is_symlink():
                continue
            text = path.read_text()
            if "arm64e.x1-" not in text:
                continue

            declarations = list(TARGET_LIST.finditer(text))
            target_occurrences = sum(len(X1_TARGET.findall(match["values"])) for match in declarations)
            if target_occurrences != len(X1_TARGET.findall(text)):
                raise SystemExit(f"Found an X1 target outside a targets list: {path}")

            changed = 0

            def filter_list(match):
                nonlocal changed
                original_values = match["values"]
                names_before = target_names(original_values)
                filtered_values = remove_x1_targets(original_values)
                names_after = target_names(filtered_values)
                expected = [name for name in names_before if not name.startswith("arm64e.x1-")]
                if not expected:
                    raise SystemExit(f"Targets list contains only unsupported X1 targets: {path}")
                if names_after != expected:
                    raise SystemExit(f"Target declarations changed: {path}")
                changed += len(names_before) - len(names_after)
                return match["prefix"] + filtered_values + match["suffix"]

            output = TARGET_LIST.sub(filter_list, text)
            if X1_TARGET.search(output):
                raise SystemExit(f"Could not remove every X1 target declaration: {path}")
            if not changed or output == text:
                raise SystemExit(f"Could not prepare SDK stub: {path}")
            replacements.append((path, output))

    for path, output in replacements:
        mode = path.stat().st_mode
        with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as temporary:
            temporary.write(output)
            temporary_path = Path(temporary.name)
        temporary_path.chmod(mode)
        temporary_path.replace(path)

    print(f"Prepared {len(replacements)} SDK stubs; preserved every non-X1 target declaration.")


if __name__ == "__main__":
    main()
