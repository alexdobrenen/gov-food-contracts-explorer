from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class ContractType(str, Enum):
    PRIME_VENDOR = "Prime Vendor"
    MARKET_FRESH = "Market Fresh"
    DIRECT_VENDOR = "Direct Vendor"
    BEVERAGE = "Beverage"
    UNKNOWN = "Unknown"


class DataSource(str, Enum):
    DLA = "DLA"
    SAM = "SAM"
    PDF = "PDF"


class Contract(BaseModel):
    contract_number: str
    solicitation_number: Optional[str] = None
    contract_type: ContractType = ContractType.UNKNOWN
    region: Optional[str] = None
    contractor_name: Optional[str] = None
    contractor_address: Optional[str] = None
    contractor_city_state: Optional[str] = None
    contractor_cage: Optional[str] = None
    period_of_performance_start: Optional[date] = None
    period_of_performance_end: Optional[date] = None
    award_date: Optional[date] = None
    obligated_amount: Optional[float] = None
    total_amount: Optional[float] = None
    naics_code: Optional[str] = None
    set_aside_type: Optional[str] = None
    description: Optional[str] = None
    commodity: Optional[str] = None
    status: Optional[str] = None
    conus_oconus: Optional[str] = None
    includes_navy_ships: Optional[bool] = None
    major_customers: Optional[str] = None
    admin_catalog_numbers: Optional[str] = None
    dla_contract_type: Optional[str] = None
    detail_url: Optional[str] = None
    source: DataSource = DataSource.DLA
    source_url: Optional[str] = None
    scraped_at: Optional[datetime] = None


class DeliveryLocation(BaseModel):
    contract_number: str
    installation_name: Optional[str] = None
    address: Optional[str] = None
    state: Optional[str] = None


class ContractModification(BaseModel):
    contract_number: str
    mod_number: str
    mod_date: Optional[date] = None
    description: Optional[str] = None
    amount_change: Optional[float] = None


class ProductCategory(BaseModel):
    contract_number: str
    category_name: str


class ContractDocument(BaseModel):
    contract_number: str
    document_url: str
    document_type: Optional[str] = None
    local_path: Optional[str] = None
    page_count: Optional[int] = None
    extracted: bool = False
    extraction_summary: Optional[str] = None
