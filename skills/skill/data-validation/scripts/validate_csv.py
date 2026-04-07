# /// script
# requires-python = ">=3.11"
# ///
"""Validate a CSV file for structural and data quality issues."""

import argparse
import csv
import json
import sys
from pathlib import Path


def validate_csv(file_path: str) -> dict:
    """Validate a CSV file and return structured results."""
    path = Path(file_path)
    if not path.exists():
        return {"file": file_path, "valid": False, "errors": [{"line": 0, "column": "", "message": f"File not found: {file_path}"}], "warnings": [], "summary": {"rows": 0, "errors": 1, "warnings": 0}}

    errors: list[dict] = []
    warnings: list[dict] = []
    row_count = 0

    with path.open(newline="", encoding="utf-8") as f:
        try:
            reader = csv.DictReader(f)
            headers = reader.fieldnames

            if not headers:
                return {"file": file_path, "valid": False, "errors": [{"line": 1, "column": "", "message": "No header row found"}], "warnings": [], "summary": {"rows": 0, "errors": 1, "warnings": 0}}

            # Check for empty headers
            for i, h in enumerate(headers):
                if not h or not h.strip():
                    errors.append({"line": 1, "column": f"column_{i}", "message": f"Empty header at position {i}"})

            seen_rows: set[str] = set()  # O(1) lookup (was list: O(n) per row)
            for line_num, row in enumerate(reader, start=2):
                row_count += 1
                row_key = "|".join(str(v) for v in row.values())

                # Check for duplicate rows
                if row_key in seen_rows:
                    warnings.append({"line": line_num, "column": "", "message": "Duplicate row"})
                else:
                    seen_rows.add(row_key)

                # Check for empty values
                for col, val in row.items():
                    if val is None or val.strip() == "":
                        warnings.append({"line": line_num, "column": col or "", "message": "Empty value"})

        except csv.Error as e:
            errors.append({"line": 0, "column": "", "message": f"CSV parse error: {e}"})

    valid = len(errors) == 0
    return {
        "file": file_path,
        "valid": valid,
        "errors": errors,
        "warnings": warnings,
        "summary": {"rows": row_count, "errors": len(errors), "warnings": len(warnings)},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate a CSV file for data quality issues")
    parser.add_argument("file", help="Path to the CSV file")
    args = parser.parse_args()

    result = validate_csv(args.file)
    json.dump(result, sys.stdout, indent=2)
    print()
    sys.exit(0 if result["valid"] else 1)


if __name__ == "__main__":
    main()
