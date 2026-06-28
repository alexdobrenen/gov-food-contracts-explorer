from pathlib import Path
from dotenv import load_dotenv
import os

load_dotenv()

PROJECT_ROOT = Path(__file__).parent.parent.parent
DATA_DIR = PROJECT_ROOT / "data"
PDF_DIR = DATA_DIR / "pdfs"
DB_PATH = DATA_DIR / "contracts.db"
RAW_RESPONSES_DIR = DATA_DIR / "raw_responses"

DLA_BASE_URL = "https://www.dla.mil"
DLA_CONTRACT_SEARCH_URL = f"{DLA_BASE_URL}/Troop-Support/Subsistence/Food-Services/Contract-Search/"
DLA_FOOD_SERVICES_URL = f"{DLA_BASE_URL}/Troop-Support/Subsistence/Food-Services/"
DLA_PDF_BASE = f"{DLA_BASE_URL}/Portals/104/Documents/TroopSupport/Subsistence/Food%20Services"

SAM_GOV_API_KEY = os.getenv("SAM_GOV_API_KEY", "")
SAM_AWARDS_URL = "https://api.sam.gov/contract-awards/v1/search"
SAM_OPPORTUNITIES_URL = "https://api.sam.gov/opportunities/v2/search"

REGIONS = ["East", "West", "Pacific", "Middle East", "South"]
CONTRACT_TYPES = {
    "PV": "Prime Vendor",
    "MF": "Market Fresh",
    "DV": "Direct Vendor",
}

SCRAPE_DELAY_MIN = 2.0
SCRAPE_DELAY_MAX = 5.0

for d in [DATA_DIR, PDF_DIR, RAW_RESPONSES_DIR]:
    d.mkdir(parents=True, exist_ok=True)
