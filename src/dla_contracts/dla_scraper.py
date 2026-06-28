from __future__ import annotations

import asyncio
import json
import random
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin, urlparse, parse_qs, urlencode

from playwright.async_api import async_playwright, Page
from rich.console import Console
from rich.progress import Progress

from .config import (
    DLA_BASE_URL,
    DLA_CONTRACT_SEARCH_URL,
    PDF_DIR,
    RAW_RESPONSES_DIR,
    SCRAPE_DELAY_MIN,
    SCRAPE_DELAY_MAX,
)
from .db import (
    get_connection,
    init_db,
    upsert_contract,
    add_document,
)
from .models import Contract, ContractDocument, ContractType, DataSource

console = Console()


async def random_delay():
    await asyncio.sleep(random.uniform(SCRAPE_DELAY_MIN, SCRAPE_DELAY_MAX))


def classify_contract_type(text: str) -> ContractType:
    text_lower = text.lower()
    if "prime vendor" in text_lower:
        return ContractType.PRIME_VENDOR
    if "market fresh" in text_lower:
        return ContractType.MARKET_FRESH
    if "direct vendor" in text_lower:
        return ContractType.DIRECT_VENDOR
    if "beverage" in text_lower:
        return ContractType.BEVERAGE
    return ContractType.UNKNOWN


async def launch_browser(headless: bool = False) -> tuple:
    pw = await async_playwright().start()
    browser = await pw.chromium.launch(
        headless=headless,
        args=["--disable-blink-features=AutomationControlled", "--no-sandbox"],
    )
    context = await browser.new_context(
        user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        viewport={"width": 1920, "height": 1080},
        accept_downloads=True,
    )
    await context.add_init_script("""
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        window.chrome = { runtime: {} };
    """)
    return pw, browser, context


async def safe_goto(page: Page, url: str, retries: int = 3) -> bool:
    for attempt in range(retries):
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=60000)
            await asyncio.sleep(2)
            return True
        except Exception as e:
            console.print(f"[yellow]Navigation attempt {attempt + 1} failed: {e}[/yellow]")
            if attempt < retries - 1:
                await asyncio.sleep(3)
    return False


def parse_contract_table(html: str) -> list[dict]:
    """Parse the UDT contract table from the HTML."""
    contracts = []
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.DOTALL)
    for row in rows:
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.DOTALL)
        if len(cells) < 6:
            continue
        contract_num = re.sub(r"<[^>]+>", "", cells[1]).strip()
        if not contract_num or not re.match(r"SPE\d{3}", contract_num):
            continue

        # Extract detail link
        detail_links = re.findall(r'href="([^"]*udt_98194_param_detail=[^"]+)"', cells[0])
        detail_url = detail_links[0] if detail_links else None

        region = re.sub(r"<[^>]+>", "", cells[2]).strip()
        state_country = re.sub(r"<[^>]+>", "", cells[3]).strip().replace("&amp;", "&")
        vendor_type = re.sub(r"<[^>]+>", "", cells[4]).strip()
        commodity = re.sub(r"<[^>]+>", "", cells[5]).strip().replace("&amp;", "&")
        status = re.sub(r"<[^>]+>", "", cells[6]).strip() if len(cells) > 6 else ""

        contracts.append({
            "contract_number": contract_num,
            "region": region,
            "state_country": state_country,
            "vendor_type": vendor_type,
            "commodity": commodity,
            "status": status,
            "detail_url": detail_url,
        })
    return contracts


def get_max_page(html: str) -> int:
    """Find the highest page number from pagination links."""
    pages = re.findall(r"udt_98194_param_page=(\d+)", html)
    if pages:
        return max(int(p) for p in pages)
    return 1


def parse_detail_tables(html: str) -> dict:
    """Parse the Category/Details tables on a contract detail page."""
    fields = {}
    tables = re.findall(r"<table[^>]*>(.*?)</table>", html, re.DOTALL)
    for table in tables:
        cells = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", table, re.DOTALL)
        cleaned = [re.sub(r"<[^>]+>", "", c).strip() for c in cells]
        if len(cleaned) < 4 or cleaned[0] != "Category":
            continue
        # Cells alternate: label, value (skipping header row "Category", "Details")
        i = 2
        while i + 1 < len(cleaned):
            label = cleaned[i].rstrip(":")
            value = cleaned[i + 1]
            if label and value:
                fields[label] = value
            i += 2
    return fields


async def scrape_contract_detail(page: Page, base_url: str, detail_path: str) -> dict:
    """Scrape a contract detail page for PDF links and structured fields."""
    url = urljoin(base_url, detail_path) if not detail_path.startswith("http") else detail_path
    if not await safe_goto(page, url):
        return {"pdf_links": [], "fields": {}}

    html = await page.content()

    # Parse structured fields from detail tables
    fields = parse_detail_tables(html)

    # Find all PDF links
    pdf_links = []
    for match in re.finditer(r'href="([^"]*\.pdf[^"]*)"', html, re.IGNORECASE):
        href = match.group(1)
        full_url = urljoin(DLA_BASE_URL, href)
        if "food" in full_url.lower() or "subsistence" in full_url.lower() or "troop" in full_url.lower():
            pdf_links.append(full_url)

    return {"pdf_links": pdf_links, "fields": fields}


async def download_pdf(page: Page, url: str, contract_number: str) -> str | None:
    """Download a PDF by intercepting the network response."""
    contract_dir = PDF_DIR / contract_number
    contract_dir.mkdir(parents=True, exist_ok=True)

    filename = urlparse(url).path.split("/")[-1]
    if not filename:
        filename = f"{contract_number}.pdf"
    # URL decode the filename
    from urllib.parse import unquote
    filename = unquote(filename)
    local_path = contract_dir / filename

    if local_path.exists() and local_path.stat().st_size > 1000:
        console.print(f"[dim]  Already downloaded: {filename}[/dim]")
        return str(local_path)

    try:
        download_page = await page.context.new_page()
        pdf_bytes = None

        async def handle_route(route):
            nonlocal pdf_bytes
            response = await route.fetch()
            body = await response.body()
            if body and len(body) > 100 and body[:5] == b"%PDF-":
                pdf_bytes = body
            await route.fulfill(response=response)

        await download_page.route("**/*.pdf*", handle_route)

        try:
            await download_page.goto(url, wait_until="commit", timeout=30000)
            await asyncio.sleep(1)

            if pdf_bytes:
                local_path.write_bytes(pdf_bytes)
                console.print(f"[green]  Downloaded: {filename} ({len(pdf_bytes) / 1024:.0f} KB)[/green]")
                return str(local_path)

            console.print(f"[red]  Failed: {filename} (not a valid PDF)[/red]")
            return None
        finally:
            await download_page.close()
    except Exception as e:
        console.print(f"[red]  Error downloading {filename}: {e}[/red]")
        return None


def save_raw_html(name: str, html: str) -> None:
    path = RAW_RESPONSES_DIR / f"{name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.html"
    path.write_text(html, encoding="utf-8")


async def run_scraper(
    max_pdfs: int | None = None,
    regions: list[str] | None = None,
    contract_types: list[str] | None = None,
    headless: bool = False,
    max_pages: int | None = None,
    skip_pdfs: bool = False,
) -> dict:
    """
    Main scraper entry point.

    Args:
        max_pdfs: Maximum PDFs to download (for testing)
        regions: Filter to specific regions
        contract_types: Filter to specific contract types (PV, MF, DV)
        headless: Run browser in headless mode
        max_pages: Maximum table pages to scrape (for testing)
        skip_pdfs: Skip PDF downloads (just scrape metadata)
    """
    init_db()
    conn = get_connection()
    pw, browser, context = await launch_browser(headless=headless)
    page = await context.new_page()

    all_contracts = []
    stats = {"pages_scraped": 0, "contracts_found": 0, "details_scraped": 0, "pdfs_downloaded": 0}

    try:
        # Phase 1: Scrape contract table (paginated)
        console.print("\n[bold]Phase 1: Scraping contract search table...[/bold]")

        if not await safe_goto(page, DLA_CONTRACT_SEARCH_URL):
            console.print("[red]Failed to load contract search page[/red]")
            return stats

        html = await page.content()
        save_raw_html("contract_search", html)

        # Check if we got blocked
        if "Access Denied" in html:
            console.print("[red]Access Denied by CDN. Try running without --headless.[/red]")
            return stats

        # Parse first page
        page_contracts = parse_contract_table(html)
        all_contracts.extend(page_contracts)
        total_pages = get_max_page(html)
        stats["pages_scraped"] += 1

        console.print(f"[green]Page 1: {len(page_contracts)} contracts (total pages: {total_pages})[/green]")

        # Paginate
        page_limit = min(total_pages, max_pages) if max_pages else total_pages
        for page_num in range(2, page_limit + 1):
            page_url = f"{DLA_CONTRACT_SEARCH_URL}?udt_98194_param_page={page_num}"
            console.print(f"[blue]Scraping page {page_num}/{page_limit}...[/blue]")

            if not await safe_goto(page, page_url):
                continue
            await random_delay()

            html = await page.content()
            page_contracts = parse_contract_table(html)
            all_contracts.extend(page_contracts)
            stats["pages_scraped"] += 1
            console.print(f"[green]Page {page_num}: {len(page_contracts)} contracts[/green]")

        # Apply filters
        if regions:
            region_lower = [r.lower() for r in regions]
            all_contracts = [c for c in all_contracts if c["region"].lower() in region_lower]
        if contract_types:
            type_map = {"pv": "Prime Vendor", "mf": "Market Fresh", "dv": "Direct Vendor"}
            type_names = [type_map.get(t.lower(), t) for t in contract_types]
            all_contracts = [c for c in all_contracts if c["vendor_type"] in type_names]

        stats["contracts_found"] = len(all_contracts)
        console.print(f"\n[bold green]Total contracts found: {len(all_contracts)}[/bold green]")

        # Phase 2: Store initial contract metadata from table
        console.print(f"\n[bold]Phase 2: Storing contract metadata...[/bold]")
        for c in all_contracts:
            contract = Contract(
                contract_number=c["contract_number"],
                contract_type=classify_contract_type(c["vendor_type"]),
                region=c["region"],
                description=f"{c['commodity']} - {c['state_country']}",
                commodity=c.get("commodity"),
                status=c.get("status"),
                detail_url=c.get("detail_url"),
                source=DataSource.DLA,
                source_url=DLA_CONTRACT_SEARCH_URL,
                scraped_at=datetime.now(),
            )
            upsert_contract(conn, contract)
        conn.commit()
        console.print(f"[green]Stored {len(all_contracts)} contracts[/green]")

        # Phase 3: Scrape detail pages for rich metadata + PDF links
        console.print(f"\n[bold]Phase 3: Scraping detail pages...[/bold]")

        pdf_count = 0
        with Progress() as progress:
            task = progress.add_task("Scraping details...", total=len(all_contracts))

            for c in all_contracts:
                if not c.get("detail_url"):
                    progress.advance(task)
                    continue

                detail = await scrape_contract_detail(page, DLA_CONTRACT_SEARCH_URL, c["detail_url"])
                stats["details_scraped"] += 1
                fields = detail.get("fields", {})

                if fields:
                    # Parse dates
                    award_date = None
                    pop_start = None
                    for date_field, date_val in [
                        ("Award Date", fields.get("Award Date")),
                        ("Contracting Ordering Period Start Date", fields.get("Contracting Ordering Period Start Date")),
                    ]:
                        if date_val:
                            try:
                                parsed = datetime.strptime(date_val.strip(), "%m/%d/%Y").date()
                                if "Award" in date_field:
                                    award_date = parsed
                                else:
                                    pop_start = parsed
                            except ValueError:
                                pass

                    navy_ships = None
                    navy_val = fields.get("Includes Navy Ships?", "").strip().lower()
                    if navy_val == "yes":
                        navy_ships = True
                    elif navy_val == "no":
                        navy_ships = False

                    contract = Contract(
                        contract_number=c["contract_number"],
                        solicitation_number=fields.get("Solicitation Number"),
                        contract_type=classify_contract_type(c["vendor_type"]),
                        region=fields.get("Region") or c["region"],
                        contractor_name=fields.get("Vendor Name"),
                        contractor_city_state=fields.get("Vendor City/State"),
                        contractor_cage=fields.get("Vendor CAGE"),
                        award_date=award_date,
                        period_of_performance_start=pop_start,
                        commodity=fields.get("Commodity") or c.get("commodity"),
                        status=fields.get("Status") or c.get("status"),
                        conus_oconus=fields.get("CONUS/OCONUS"),
                        includes_navy_ships=navy_ships,
                        major_customers=fields.get("Major Customers"),
                        admin_catalog_numbers=fields.get("Administrative Catalog No."),
                        dla_contract_type=fields.get("Contract Type"),
                        description=f"{fields.get('Commodity', c.get('commodity', ''))} - {fields.get('State/Country', c.get('state_country', ''))}",
                        detail_url=c.get("detail_url"),
                        source=DataSource.DLA,
                        source_url=DLA_CONTRACT_SEARCH_URL,
                        scraped_at=datetime.now(),
                    )
                    upsert_contract(conn, contract)
                    conn.commit()

                    extracted = [k for k in ["Vendor Name", "Vendor CAGE", "Solicitation Number",
                                             "Award Date", "Major Customers", "CONUS/OCONUS"] if fields.get(k)]
                    console.print(f"[green]  {c['contract_number']}: {', '.join(extracted)}[/green]")

                # Download PDFs
                if not skip_pdfs:
                    for pdf_url in detail["pdf_links"]:
                        if max_pdfs and pdf_count >= max_pdfs:
                            break
                        local_path = await download_pdf(page, pdf_url, c["contract_number"])
                        if local_path:
                            doc = ContractDocument(
                                contract_number=c["contract_number"],
                                document_url=pdf_url,
                                local_path=local_path,
                            )
                            add_document(conn, doc)
                            pdf_count += 1
                            stats["pdfs_downloaded"] += 1
                        conn.commit()
                        await random_delay()

                await random_delay()
                progress.advance(task)

        if skip_pdfs:
            console.print("[yellow]Skipped PDF downloads (--skip-pdfs)[/yellow]")

    finally:
        await context.close()
        await browser.close()
        await pw.stop()
        conn.close()

    console.print(f"\n[bold green]Scraping complete![/bold green]")
    console.print(f"  Pages scraped: {stats['pages_scraped']}")
    console.print(f"  Contracts found: {stats['contracts_found']}")
    console.print(f"  Details scraped: {stats['details_scraped']}")
    console.print(f"  PDFs downloaded: {stats['pdfs_downloaded']}")

    return stats
