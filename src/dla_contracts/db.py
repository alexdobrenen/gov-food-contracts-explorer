from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Optional

from .config import DB_PATH
from .models import (
    Contract,
    ContractDocument,
    ContractModification,
    DataSource,
    DeliveryLocation,
    ProductCategory,
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS contracts (
    contract_number TEXT PRIMARY KEY,
    solicitation_number TEXT,
    contract_type TEXT,
    region TEXT,
    contractor_name TEXT,
    contractor_address TEXT,
    contractor_city_state TEXT,
    contractor_cage TEXT,
    period_of_performance_start TEXT,
    period_of_performance_end TEXT,
    award_date TEXT,
    obligated_amount REAL,
    total_amount REAL,
    naics_code TEXT,
    set_aside_type TEXT,
    description TEXT,
    commodity TEXT,
    status TEXT,
    conus_oconus TEXT,
    includes_navy_ships INTEGER,
    major_customers TEXT,
    admin_catalog_numbers TEXT,
    dla_contract_type TEXT,
    detail_url TEXT,
    source TEXT,
    source_url TEXT,
    scraped_at TEXT
);

CREATE TABLE IF NOT EXISTS delivery_locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_number TEXT NOT NULL,
    installation_name TEXT,
    address TEXT,
    state TEXT,
    FOREIGN KEY (contract_number) REFERENCES contracts(contract_number)
);

CREATE TABLE IF NOT EXISTS contract_modifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_number TEXT NOT NULL,
    mod_number TEXT NOT NULL,
    mod_date TEXT,
    description TEXT,
    amount_change REAL,
    FOREIGN KEY (contract_number) REFERENCES contracts(contract_number),
    UNIQUE(contract_number, mod_number)
);

CREATE TABLE IF NOT EXISTS product_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_number TEXT NOT NULL,
    category_name TEXT NOT NULL,
    FOREIGN KEY (contract_number) REFERENCES contracts(contract_number),
    UNIQUE(contract_number, category_name)
);

CREATE TABLE IF NOT EXISTS contract_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_number TEXT NOT NULL,
    document_url TEXT NOT NULL,
    document_type TEXT,
    local_path TEXT,
    page_count INTEGER,
    extracted INTEGER DEFAULT 0,
    extraction_summary TEXT,
    FOREIGN KEY (contract_number) REFERENCES contracts(contract_number),
    UNIQUE(contract_number, document_url)
);

CREATE TABLE IF NOT EXISTS collection_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    query_params TEXT,
    last_run TEXT,
    records_fetched INTEGER
);
"""


def get_connection(db_path: Path = DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db(db_path: Path = DB_PATH) -> None:
    conn = get_connection(db_path)
    conn.executescript(SCHEMA)
    conn.close()


def upsert_contract(conn: sqlite3.Connection, contract: Contract) -> None:
    conn.execute(
        """INSERT INTO contracts (
            contract_number, solicitation_number, contract_type, region,
            contractor_name, contractor_address, contractor_city_state, contractor_cage,
            period_of_performance_start, period_of_performance_end, award_date,
            obligated_amount, total_amount, naics_code, set_aside_type,
            description, commodity, status, conus_oconus, includes_navy_ships,
            major_customers, admin_catalog_numbers, dla_contract_type, detail_url,
            source, source_url, scraped_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(contract_number) DO UPDATE SET
            solicitation_number = COALESCE(excluded.solicitation_number, solicitation_number),
            contract_type = CASE WHEN excluded.contract_type != 'Unknown' THEN excluded.contract_type ELSE contract_type END,
            region = COALESCE(excluded.region, region),
            contractor_name = COALESCE(excluded.contractor_name, contractor_name),
            contractor_address = COALESCE(excluded.contractor_address, contractor_address),
            contractor_city_state = COALESCE(excluded.contractor_city_state, contractor_city_state),
            contractor_cage = COALESCE(excluded.contractor_cage, contractor_cage),
            period_of_performance_start = COALESCE(excluded.period_of_performance_start, period_of_performance_start),
            period_of_performance_end = COALESCE(excluded.period_of_performance_end, period_of_performance_end),
            award_date = COALESCE(excluded.award_date, award_date),
            obligated_amount = COALESCE(excluded.obligated_amount, obligated_amount),
            total_amount = COALESCE(excluded.total_amount, total_amount),
            naics_code = COALESCE(excluded.naics_code, naics_code),
            set_aside_type = COALESCE(excluded.set_aside_type, set_aside_type),
            description = COALESCE(excluded.description, description),
            commodity = COALESCE(excluded.commodity, commodity),
            status = COALESCE(excluded.status, status),
            conus_oconus = COALESCE(excluded.conus_oconus, conus_oconus),
            includes_navy_ships = COALESCE(excluded.includes_navy_ships, includes_navy_ships),
            major_customers = COALESCE(excluded.major_customers, major_customers),
            admin_catalog_numbers = COALESCE(excluded.admin_catalog_numbers, admin_catalog_numbers),
            dla_contract_type = COALESCE(excluded.dla_contract_type, dla_contract_type),
            detail_url = COALESCE(excluded.detail_url, detail_url),
            source = excluded.source,
            source_url = COALESCE(excluded.source_url, source_url),
            scraped_at = excluded.scraped_at
        """,
        (
            contract.contract_number,
            contract.solicitation_number,
            contract.contract_type.value,
            contract.region,
            contract.contractor_name,
            contract.contractor_address,
            contract.contractor_city_state,
            contract.contractor_cage,
            contract.period_of_performance_start.isoformat() if contract.period_of_performance_start else None,
            contract.period_of_performance_end.isoformat() if contract.period_of_performance_end else None,
            contract.award_date.isoformat() if contract.award_date else None,
            contract.obligated_amount,
            contract.total_amount,
            contract.naics_code,
            contract.set_aside_type,
            contract.description,
            contract.commodity,
            contract.status,
            contract.conus_oconus,
            1 if contract.includes_navy_ships else (0 if contract.includes_navy_ships is False else None),
            contract.major_customers,
            contract.admin_catalog_numbers,
            contract.dla_contract_type,
            contract.detail_url,
            contract.source.value,
            contract.source_url,
            contract.scraped_at.isoformat() if contract.scraped_at else datetime.now().isoformat(),
        ),
    )


def add_document(conn: sqlite3.Connection, doc: ContractDocument) -> None:
    conn.execute(
        """INSERT OR IGNORE INTO contract_documents
        (contract_number, document_url, document_type, local_path, page_count, extracted, extraction_summary)
        VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (doc.contract_number, doc.document_url, doc.document_type,
         doc.local_path, doc.page_count, int(doc.extracted), doc.extraction_summary),
    )


def add_modification(conn: sqlite3.Connection, mod: ContractModification) -> None:
    conn.execute(
        """INSERT OR IGNORE INTO contract_modifications
        (contract_number, mod_number, mod_date, description, amount_change)
        VALUES (?, ?, ?, ?, ?)""",
        (mod.contract_number, mod.mod_number,
         mod.mod_date.isoformat() if mod.mod_date else None,
         mod.description, mod.amount_change),
    )


def add_delivery_location(conn: sqlite3.Connection, loc: DeliveryLocation) -> None:
    conn.execute(
        """INSERT INTO delivery_locations
        (contract_number, installation_name, address, state)
        VALUES (?, ?, ?, ?)""",
        (loc.contract_number, loc.installation_name, loc.address, loc.state),
    )


def add_product_category(conn: sqlite3.Connection, cat: ProductCategory) -> None:
    conn.execute(
        """INSERT OR IGNORE INTO product_categories (contract_number, category_name) VALUES (?, ?)""",
        (cat.contract_number, cat.category_name),
    )


def mark_document_extracted(conn: sqlite3.Connection, doc_id: int, summary: Optional[str] = None) -> None:
    conn.execute(
        "UPDATE contract_documents SET extracted = 1, extraction_summary = ? WHERE id = ?",
        (summary, doc_id),
    )


def get_all_contracts(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute("SELECT * FROM contracts ORDER BY contract_number").fetchall()
    return [dict(r) for r in rows]


def get_contract_with_details(conn: sqlite3.Connection, contract_number: str) -> Optional[dict]:
    row = conn.execute("SELECT * FROM contracts WHERE contract_number = ?", (contract_number,)).fetchone()
    if not row:
        return None
    result = dict(row)
    result["documents"] = [dict(r) for r in conn.execute(
        "SELECT * FROM contract_documents WHERE contract_number = ?", (contract_number,)
    ).fetchall()]
    result["modifications"] = [dict(r) for r in conn.execute(
        "SELECT * FROM contract_modifications WHERE contract_number = ?", (contract_number,)
    ).fetchall()]
    result["delivery_locations"] = [dict(r) for r in conn.execute(
        "SELECT * FROM delivery_locations WHERE contract_number = ?", (contract_number,)
    ).fetchall()]
    result["product_categories"] = [dict(r) for r in conn.execute(
        "SELECT * FROM product_categories WHERE contract_number = ?", (contract_number,)
    ).fetchall()]
    return result


def get_stats(conn: sqlite3.Connection) -> dict:
    stats = {}
    stats["total_contracts"] = conn.execute("SELECT COUNT(*) FROM contracts").fetchone()[0]
    stats["by_type"] = {r[0]: r[1] for r in conn.execute(
        "SELECT contract_type, COUNT(*) FROM contracts GROUP BY contract_type"
    ).fetchall()}
    stats["by_region"] = {r[0]: r[1] for r in conn.execute(
        "SELECT region, COUNT(*) FROM contracts GROUP BY region"
    ).fetchall()}
    stats["total_documents"] = conn.execute("SELECT COUNT(*) FROM contract_documents").fetchone()[0]
    stats["extracted_documents"] = conn.execute(
        "SELECT COUNT(*) FROM contract_documents WHERE extracted = 1"
    ).fetchone()[0]
    stats["total_modifications"] = conn.execute("SELECT COUNT(*) FROM contract_modifications").fetchone()[0]
    return stats
