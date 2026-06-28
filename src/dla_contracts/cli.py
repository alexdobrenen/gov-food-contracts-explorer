from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Optional

import typer
from rich.console import Console
from rich.table import Table

from .db import get_connection, get_stats, get_contract_with_details, init_db

app = typer.Typer(name="dla-contracts", help="DLA Food Services Contract Data Pipeline")
console = Console()


@app.command()
def scrape_dla(
    max_pdfs: Optional[int] = typer.Option(None, "--max-pdfs", "-n", help="Max PDFs to download (for testing)"),
    max_pages: Optional[int] = typer.Option(None, "--max-pages", help="Max table pages to scrape (for testing)"),
    regions: Optional[str] = typer.Option(None, "--regions", "-r", help="Comma-separated regions to scrape"),
    types: Optional[str] = typer.Option(None, "--types", "-t", help="Comma-separated contract types (PV,MF,DV)"),
    headless: bool = typer.Option(False, "--headless", help="Run in headless mode (may be blocked by site)"),
    skip_pdfs: bool = typer.Option(False, "--skip-pdfs", help="Skip PDF downloads, just scrape metadata"),
):
    """Scrape the DLA website for contract data and PDFs."""
    from .dla_scraper import run_scraper

    region_list = [r.strip() for r in regions.split(",")] if regions else None
    type_list = [t.strip() for t in types.split(",")] if types else None

    asyncio.run(run_scraper(
        max_pdfs=max_pdfs, regions=region_list, contract_types=type_list,
        headless=headless, max_pages=max_pages, skip_pdfs=skip_pdfs,
    ))


@app.command()
def extract_pdfs():
    """Extract structured data from downloaded contract PDFs."""
    from .pdf_extractor import process_all_pdfs

    process_all_pdfs()


@app.command()
def export(
    format: str = typer.Option("json", "--format", "-f", help="Export format: json or csv"),
    output: Optional[str] = typer.Option(None, "--output", "-o", help="Output file path"),
):
    """Export contract data to JSON or CSV."""
    from .export import export_json, export_csv

    output_path = Path(output) if output else None

    if format == "json":
        path = export_json(output_path)
    elif format == "csv":
        path = export_csv(output_path)
    else:
        console.print(f"[red]Unknown format: {format}. Use 'json' or 'csv'.[/red]")
        raise typer.Exit(1)

    console.print(f"\n[bold]Output: {path}[/bold]")


@app.command()
def stats():
    """Show collection statistics."""
    init_db()
    conn = get_connection()
    s = get_stats(conn)
    conn.close()

    console.print(f"\n[bold]DLA Contract Database Stats[/bold]")
    console.print(f"  Total contracts: {s['total_contracts']}")

    if s["by_type"]:
        console.print("\n  [bold]By Contract Type:[/bold]")
        for ct, count in sorted(s["by_type"].items()):
            console.print(f"    {ct}: {count}")

    if s["by_region"]:
        console.print("\n  [bold]By Region:[/bold]")
        for region, count in sorted(s["by_region"].items(), key=lambda x: x[0] or ""):
            console.print(f"    {region or 'Unknown'}: {count}")

    console.print(f"\n  Total documents: {s['total_documents']}")
    console.print(f"  Extracted documents: {s['extracted_documents']}")
    console.print(f"  Modifications tracked: {s['total_modifications']}")


@app.command()
def show(
    contract_number: str = typer.Argument(help="Contract number to display"),
):
    """Show details for a specific contract."""
    init_db()
    conn = get_connection()
    details = get_contract_with_details(conn, contract_number)
    conn.close()

    if not details:
        console.print(f"[red]Contract not found: {contract_number}[/red]")
        raise typer.Exit(1)

    console.print(json.dumps(details, indent=2, default=str))


@app.command()
def list_contracts(
    region: Optional[str] = typer.Option(None, "--region", "-r", help="Filter by region"),
    contract_type: Optional[str] = typer.Option(None, "--type", "-t", help="Filter by contract type"),
    limit: int = typer.Option(50, "--limit", "-l", help="Max results to show"),
):
    """List contracts in the database."""
    init_db()
    conn = get_connection()

    query = "SELECT contract_number, contract_type, region, contractor_name FROM contracts WHERE 1=1"
    params = []

    if region:
        query += " AND region LIKE ?"
        params.append(f"%{region}%")
    if contract_type:
        query += " AND contract_type LIKE ?"
        params.append(f"%{contract_type}%")

    query += " ORDER BY contract_number LIMIT ?"
    params.append(limit)

    rows = conn.execute(query, params).fetchall()
    conn.close()

    if not rows:
        console.print("[yellow]No contracts found matching filters.[/yellow]")
        return

    table = Table(title="Contracts")
    table.add_column("Contract #", style="cyan")
    table.add_column("Type")
    table.add_column("Region")
    table.add_column("Contractor")

    for r in rows:
        table.add_row(
            r["contract_number"],
            r["contract_type"] or "",
            r["region"] or "",
            (r["contractor_name"] or "")[:40],
        )

    console.print(table)
    console.print(f"\nShowing {len(rows)} contracts")


if __name__ == "__main__":
    app()
