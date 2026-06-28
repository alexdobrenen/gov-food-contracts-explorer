from __future__ import annotations

import csv
import json
from pathlib import Path

from rich.console import Console

from .config import DATA_DIR
from .db import get_connection, get_all_contracts, get_contract_with_details, init_db

console = Console()


def export_json(output_path: Path | None = None, pretty: bool = True) -> Path:
    """Export all contracts with full details to JSON."""
    init_db()
    conn = get_connection()

    contracts = get_all_contracts(conn)
    full_data = []

    for c in contracts:
        details = get_contract_with_details(conn, c["contract_number"])
        if details:
            # Remove internal fields
            details.pop("scraped_at", None)
            full_data.append(details)

    conn.close()

    if output_path is None:
        output_path = DATA_DIR / "contracts_export.json"

    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w") as f:
        json.dump(full_data, f, indent=2 if pretty else None, default=str)

    console.print(f"[green]Exported {len(full_data)} contracts to {output_path}[/green]")
    return output_path


def export_csv(output_path: Path | None = None) -> Path:
    """Export contracts to CSV (one row per contract, flat structure)."""
    init_db()
    conn = get_connection()

    contracts = get_all_contracts(conn)
    conn.close()

    if output_path is None:
        output_path = DATA_DIR / "contracts_export.csv"

    output_path.parent.mkdir(parents=True, exist_ok=True)

    if not contracts:
        console.print("[yellow]No contracts to export[/yellow]")
        return output_path

    fieldnames = list(contracts[0].keys())

    with open(output_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(contracts)

    console.print(f"[green]Exported {len(contracts)} contracts to {output_path}[/green]")
    return output_path
