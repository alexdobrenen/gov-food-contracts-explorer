from __future__ import annotations

import re
from datetime import date, datetime
from pathlib import Path

import pdfplumber
from rich.console import Console

from .db import (
    get_connection,
    init_db,
    upsert_contract,
    add_modification,
    add_delivery_location,
    mark_document_extracted,
)
from .models import (
    Contract,
    ContractModification,
    ContractType,
    DataSource,
    DeliveryLocation,
)

console = Console()


def parse_date(text: str) -> date | None:
    text = text.strip().rstrip(".")
    for fmt in [
        "%m/%d/%Y", "%m-%d-%Y", "%Y-%m-%d", "%m/%d/%y",
        "%B %d, %Y", "%B %d %Y",
        "%Y %b %d", "%Y %B %d",
        "%b %d, %Y", "%b %d %Y",
        "%d %B %Y", "%d %b %Y",
    ]:
        try:
            return datetime.strptime(text.strip(), fmt).date()
        except ValueError:
            continue
    # Handle "2024 OCT 08" style
    match = re.match(r"(\d{4})\s+([A-Z]{3})\s+(\d{1,2})", text)
    if match:
        try:
            return datetime.strptime(f"{match.group(1)} {match.group(2)} {match.group(3)}", "%Y %b %d").date()
        except ValueError:
            pass
    return None


def parse_amount(text: str) -> float | None:
    try:
        cleaned = re.sub(r"[^\d.]", "", text)
        return float(cleaned) if cleaned else None
    except (ValueError, AttributeError):
        return None


def detect_form_type(text: str) -> str | None:
    text_upper = text.upper()
    if "SOLICITATION/CONTRACT/ORDER FOR COMMERCIAL" in text_upper:
        return "SF1449"
    if "AMENDMENT OF SOLICITATION/MODIFICATION OF CONTRACT" in text_upper:
        return "SF30"
    if "ORDER FOR SUPPLIES OR SERVICES" in text_upper:
        return "SF1449"
    return None


def normalize_contract_id(raw: str) -> str:
    """Normalize contract IDs like SPE30024R0050 → SPE300-24-R-0050."""
    # Already formatted
    if "-" in raw:
        return raw
    # Try to insert dashes: SPE300 24 R 0050
    match = re.match(r"(SPE\d{3}|SPM\d{3})(\d{2})([A-Z])(\d{4})", raw)
    if match:
        return f"{match.group(1)}-{match.group(2)}-{match.group(3)}-{match.group(4)}"
    return raw


def extract_contract_number(text: str, first_page: str, fallback_id: str | None = None) -> str | None:
    """Extract the primary contract/solicitation number from an SF1449 or SF30."""
    # SF1449: Look for "2. CONTRACT NO." or "5. SOLICITATION NUMBER" on page 1
    # The format is typically SPE300-24-R-0050
    patterns = [
        # "5. SOLICITATION NUMBER ... SPE300-24-R-0050"
        r"(?:SOLICITATION\s+NUMBER|5\.\s*SOLICITATION)\s+.*?(SPE\d{3}-\d{2}-[A-Z]-\d{4})",
        # "2. CONTRACT NO. ... SPE300-25-D-3005"
        r"(?:CONTRACT\s+NO|2\.\s*CONTRACT)\s+.*?(SPE\d{3}-\d{2}-[A-Z]-\d{4})",
        # Standalone SPE pattern
        r"(SPE\d{3}-\d{2}-[A-Z]-\d{4})",
        r"(SPM\d{3}-\d{2}-[A-Z]-\d{4})",
        # Condensed format without dashes: SPE30024R0050
        r"(SPE\d{3}\d{2}[A-Z]\d{4})",
        r"(SPM\d{3}\d{2}[A-Z]\d{4})",
    ]
    for pattern in patterns:
        match = re.search(pattern, first_page)
        if match:
            return normalize_contract_id(match.group(1))
    # Try full text
    for pattern in patterns[:4]:
        match = re.search(pattern, text)
        if match:
            return normalize_contract_id(match.group(1))
    return fallback_id


def extract_solicitation_number(text: str, first_page: str) -> str | None:
    """Extract the solicitation number (may differ from contract number on awards)."""
    patterns = [
        r"(?:5\.\s*SOLICITATION\s+NUMBER|SOLICITATION\s+NUMBER)\s+.*?(SPE\d{3}-\d{2}-[A-Z]-\d{4})",
        r"SOLICITATION\s+NO\.?\s*:?\s*(SPE\d{3}-\d{2}-[A-Z]-\d{4})",
        # SF30 block 9A
        r"9A\.\s*AMENDMENT\s+OF\s+SOLICITATION\s+NO\.?\s*\n?\s*(SPE\d{3}[\-]?\d{2}[\-]?[A-Z][\-]?\d{4})",
    ]
    for pattern in patterns:
        match = re.search(pattern, first_page, re.IGNORECASE)
        if match:
            return normalize_contract_id(match.group(1))
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return normalize_contract_id(match.group(1))
    return None


def extract_naics(text: str) -> str | None:
    match = re.search(r"NAICS:\s*(\d{6}|\d{3})", text)
    if match:
        return match.group(1)
    match = re.search(r"NAICS\s+(?:CODE)?:?\s*(\d{6}|\d{3})", text, re.IGNORECASE)
    if match:
        return match.group(1)
    return None


def extract_issuing_office(text: str) -> str | None:
    """Extract the issuing office info from block 9."""
    match = re.search(
        r"(?:9\.\s*ISSUED\s+BY|ISSUED\s+BY)\s+CODE\s+\w+\s+\n?(.*?)(?:\n\s*\n|(?:10|11)\.)",
        text, re.DOTALL | re.IGNORECASE
    )
    if match:
        lines = [l.strip() for l in match.group(1).strip().split("\n") if l.strip()]
        return "\n".join(lines[:5])
    return None


def extract_contractor_info(text: str) -> tuple[str | None, str | None]:
    """Extract contractor name and address from SF1449 block 17a or SF30 block 8."""
    name = None
    address = None

    patterns = [
        # SF1449 block 17a — look for name between CONTRACTOR/OFFEROR and TELEPHONE
        r"17a\.\s*CONTRACTOR/?\s*CODE.*?\n(.*?)(?:TELEPHONE|17b\.|18a\.)",
        # Generic contractor block
        r"CONTRACTOR.*?NAME.*?ADDRESS.*?\n(.*?)(?:TELEPHONE|CODE\s+FACILITY)",
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if match:
            block = match.group(1).strip()
            lines = [l.strip() for l in block.split("\n") if l.strip()]
            # Filter out form field labels and codes
            filtered = [
                l for l in lines
                if not re.match(r"^(CODE|FACILITY|OFFEROR|TELEPHONE|SPE\d|SPM\d|\(X\)|X$|9[AB]\.|SEE\s)", l, re.IGNORECASE)
                and len(l) > 3
                and not re.match(r"^[A-Z0-9]{6,}$", l)  # Skip bare codes
            ]
            if filtered:
                name = filtered[0]
                if len(filtered) > 1:
                    address = ", ".join(filtered[1:4])
            break

    return name, address


def extract_effective_date(first_page: str) -> date | None:
    """Extract the effective/award date from block 3 or 6."""
    patterns = [
        # "3. AWARD/EFFECTIVE DATE ... 2024 OCT 08" or "3. EFFECTIVE DATE"
        r"(?:3\.\s*(?:AWARD/)?EFFECTIVE\s*DATE|EFFECTIVE\s+DATE)\s+.*?(\d{4}\s+[A-Z]{3}\s+\d{1,2})",
        r"(?:3\.\s*(?:AWARD/)?EFFECTIVE\s*DATE|EFFECTIVE\s+DATE)\s+.*?(\d{1,2}/\d{1,2}/\d{4})",
        # "6. SOLICITATION ISSUE DATE"
        r"6\.\s*SOLICITATION\s+ISSUE\s*DATE\s+(\d{4}\s+[A-Z]{3}\s+\d{1,2})",
        r"6\.\s*SOLICITATION\s+ISSUE\s*DATE\s+(\d{1,2}/\d{1,2}/\d{4})",
    ]
    for pattern in patterns:
        match = re.search(pattern, first_page, re.IGNORECASE)
        if match:
            d = parse_date(match.group(1))
            if d:
                return d
    return None


def extract_offer_due_date(first_page: str) -> date | None:
    """Extract offer due date from block 8."""
    patterns = [
        r"(?:8\.\s*OFFER\s+DUE\s+DATE|OFFER\s+DUE\s+DATE)\s*/?.*?(\d{4}\s+[A-Z]{3}\s+\d{1,2})",
        r"(?:8\.\s*OFFER\s+DUE\s+DATE|OFFER\s+DUE\s+DATE)\s*/?.*?(\d{1,2}/\d{1,2}/\d{4})",
    ]
    for pattern in patterns:
        match = re.search(pattern, first_page, re.IGNORECASE)
        if match:
            d = parse_date(match.group(1))
            if d:
                return d
    return None


def extract_amounts(text: str) -> tuple[float | None, float | None]:
    """Extract obligated and total award amounts."""
    obligated = None
    total = None

    # "26. TOTAL AWARD AMOUNT"
    match = re.search(r"26\.\s*TOTAL\s+AWARD\s+AMOUNT.*?\$\s*([\d,]+\.?\d{0,2})", text, re.IGNORECASE)
    if match:
        total = parse_amount(match.group(1))

    # Generic amount patterns
    patterns = [
        r"TOTAL\s+(?:CONTRACT\s+)?(?:AWARD\s+)?AMOUNT.*?\$\s*([\d,]+\.?\d{0,2})",
        r"ESTIMATED\s+(?:CONTRACT\s+)?(?:VALUE|AMOUNT).*?\$\s*([\d,]+\.?\d{0,2})",
        r"OBLIGATED\s+AMOUNT.*?\$\s*([\d,]+\.?\d{0,2})",
    ]

    if not total:
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                val = parse_amount(match.group(1))
                if val and val > 0:
                    total = val
                    break

    return obligated, total


def extract_modification_info(text: str, first_page: str) -> tuple[str | None, date | None, str | None]:
    """Extract modification number, date, and description from SF30."""
    mod_number = None
    mod_date = None
    mod_desc = None

    # Block 2: AMENDMENT/MODIFICATION NO.
    match = re.search(r"2\.\s*AMENDMENT/MODIFICATION\s+NO\.\s+.*?(\d{4})", first_page, re.IGNORECASE)
    if match:
        mod_number = match.group(1)

    # Block 3: EFFECTIVE DATE
    match = re.search(r"3\.\s*EFFECTIVE\s+DATE\s+.*?(\d{1,2}/\d{1,2}/\d{4})", first_page, re.IGNORECASE)
    if match:
        mod_date = parse_date(match.group(1))

    # Description from continuation pages
    desc_patterns = [
        r"(?:Solicitation|Contract)\s+SPE\d{3}.*?(?:Amendment|Modification)\s+\d+.*?is\s+being\s+issued\s+to\s+(.+?)(?:\n\s*\n|(?:STATEMENT|See\s+Attached))",
        r"(?:is\s+being\s+issued\s+to|purpose\s+of\s+this\s+(?:amendment|modification)\s+is\s+to)\s+(.+?)(?:\.\s*\n|\n\s*\n)",
    ]
    for pattern in desc_patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if match:
            mod_desc = match.group(1).strip()[:500]
            break

    return mod_number, mod_date, mod_desc


def extract_delivery_locations(text: str) -> list[dict]:
    """Extract military delivery locations/installations."""
    locations = []
    seen = set()
    # DoDAAC code followed by installation name with military keywords
    # DoDAAC codes are exactly 6 alphanumeric characters
    pattern = r"([A-Z][A-Z0-9]{5})-?\s+(.+?(?:DFAC|DINING\s+FACILITY|GALLEY|MESS\s+HALL).*?)(?:\n|$)"
    for match in re.finditer(pattern, text, re.IGNORECASE):
        code = match.group(1).strip()
        name = match.group(2).strip()
        # Filter false positives: must be short-ish and look like a facility name
        if len(name) < 100 and code not in seen:
            seen.add(code)
            locations.append({"code": code, "name": name})
    return locations


def extract_from_pdf(pdf_path: str | Path, contract_number_hint: str | None = None) -> dict:
    """Extract structured data from a contract PDF."""
    pdf_path = Path(pdf_path)
    if not pdf_path.exists():
        return {"error": f"File not found: {pdf_path}"}

    result = {
        "file": str(pdf_path),
        "page_count": 0,
        "form_type": None,
        "contract_number": None,
        "solicitation_number": None,
        "contractor_name": None,
        "contractor_address": None,
        "naics_code": None,
        "effective_date": None,
        "offer_due_date": None,
        "obligated_amount": None,
        "total_amount": None,
        "modification_number": None,
        "modification_date": None,
        "modification_description": None,
        "delivery_locations": [],
        "full_text": "",
        "text_readable": True,
    }

    try:
        with pdfplumber.open(pdf_path) as pdf:
            result["page_count"] = len(pdf.pages)
            all_text = []

            for page in pdf.pages:
                text = page.extract_text() or ""
                all_text.append(text)

            full_text = "\n".join(all_text)
            first_page = all_text[0] if all_text else ""

            # Check if text is readable (CID-encoded PDFs produce garbage)
            if "(cid:" in first_page or len(first_page.strip()) < 20:
                result["text_readable"] = False
                if len(full_text.replace("(cid:", "").strip()) < 100:
                    result["full_text"] = "[Text not extractable - CID-encoded font]"
                    return result

            result["full_text"] = full_text
            result["form_type"] = detect_form_type(first_page) or detect_form_type(full_text)

            result["contract_number"] = extract_contract_number(full_text, first_page, contract_number_hint)
            result["solicitation_number"] = extract_solicitation_number(full_text, first_page)
            result["naics_code"] = extract_naics(full_text)

            name, addr = extract_contractor_info(full_text)
            result["contractor_name"] = name
            result["contractor_address"] = addr

            result["effective_date"] = extract_effective_date(first_page)
            result["offer_due_date"] = extract_offer_due_date(first_page)

            obl, total = extract_amounts(full_text)
            result["obligated_amount"] = obl
            result["total_amount"] = total

            if result["form_type"] == "SF30":
                mod_num, mod_date, mod_desc = extract_modification_info(full_text, first_page)
                result["modification_number"] = mod_num
                result["modification_date"] = mod_date
                result["modification_description"] = mod_desc

            result["delivery_locations"] = extract_delivery_locations(full_text)

    except Exception as e:
        result["error"] = str(e)
        console.print(f"[red]Error extracting {pdf_path.name}: {e}[/red]")

    return result


def process_all_pdfs() -> dict:
    """Process all unextracted PDFs in the database."""
    init_db()
    conn = get_connection()

    docs = conn.execute(
        "SELECT id, contract_number, local_path FROM contract_documents WHERE extracted = 0 AND local_path IS NOT NULL"
    ).fetchall()

    stats = {"total": len(docs), "extracted": 0, "errors": 0, "unreadable": 0}
    console.print(f"\n[bold]Processing {len(docs)} unextracted PDFs...[/bold]")

    for doc in docs:
        doc_id = doc["id"]
        contract_number = doc["contract_number"]
        local_path = doc["local_path"]

        if not Path(local_path).exists():
            console.print(f"[yellow]Missing file: {local_path}[/yellow]")
            stats["errors"] += 1
            continue

        console.print(f"[blue]Extracting: {Path(local_path).name}[/blue]")
        extracted = extract_from_pdf(local_path, contract_number)

        if "error" in extracted:
            stats["errors"] += 1
            continue

        if not extracted.get("text_readable", True):
            console.print(f"[yellow]  Text not extractable (CID-encoded font)[/yellow]")
            stats["unreadable"] += 1
            conn.execute(
                "UPDATE contract_documents SET document_type = ?, page_count = ?, extracted = 1, extraction_summary = ? WHERE id = ?",
                (extracted["form_type"], extracted["page_count"], "CID-encoded - text not extractable", doc_id),
            )
            conn.commit()
            continue

        # Use the original contract_number from the DB (not the one extracted from PDF)
        # to avoid creating duplicates (e.g., "24R0050" vs "SPE300-24-R-0050")
        # Store the full extracted number as the solicitation_number if different
        extracted_num = extracted["contract_number"]
        use_contract_number = contract_number

        sol_number = extracted["solicitation_number"]
        if extracted_num and extracted_num != contract_number:
            sol_number = sol_number or extracted_num

        contract = Contract(
            contract_number=use_contract_number,
            solicitation_number=sol_number,
            contractor_name=extracted["contractor_name"],
            contractor_address=extracted["contractor_address"],
            naics_code=extracted["naics_code"],
            period_of_performance_start=extracted["effective_date"],
            period_of_performance_end=extracted["offer_due_date"],
            obligated_amount=extracted["obligated_amount"],
            total_amount=extracted["total_amount"],
            source=DataSource.PDF,
        )
        upsert_contract(conn, contract)

        # Add modification if this is an SF30
        if extracted.get("modification_number"):
            mod = ContractModification(
                contract_number=use_contract_number,
                mod_number=extracted["modification_number"],
                mod_date=extracted.get("modification_date"),
                description=extracted.get("modification_description"),
            )
            add_modification(conn, mod)

        # Add delivery locations
        for loc in extracted.get("delivery_locations", []):
            dl = DeliveryLocation(
                contract_number=use_contract_number,
                installation_name=loc.get("name"),
                address=loc.get("code"),
            )
            add_delivery_location(conn, dl)

        # Build extraction summary
        fields_found = []
        for field in ["contract_number", "solicitation_number", "contractor_name", "naics_code", "effective_date"]:
            if extracted.get(field):
                fields_found.append(field)
        summary = f"Extracted: {', '.join(fields_found)}" if fields_found else "No fields extracted"

        conn.execute(
            "UPDATE contract_documents SET document_type = ?, page_count = ?, extracted = 1, extraction_summary = ? WHERE id = ?",
            (extracted["form_type"], extracted["page_count"], summary, doc_id),
        )

        conn.commit()
        stats["extracted"] += 1
        console.print(f"  [green]{summary}[/green]")

    conn.close()

    console.print(f"\n[bold green]PDF extraction complete![/bold green]")
    console.print(f"  Processed: {stats['extracted']}/{stats['total']}")
    console.print(f"  Unreadable: {stats['unreadable']}")
    console.print(f"  Errors: {stats['errors']}")

    return stats
