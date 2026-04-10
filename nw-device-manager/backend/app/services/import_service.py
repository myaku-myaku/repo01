import io
import re

import pandas as pd


def detect_vendor_format(df: pd.DataFrame) -> str:
    columns = set(df.columns.str.strip())
    # ZTE
    if "Ne Name" in columns and "Port Used Status" in columns:
        return "zte_port"
    if "NE Name" in columns and "Port Name" in columns and "Detail Information" in columns:
        return "zte_optical"
    # Huawei
    if "NE" in columns and "Slot Number" in columns:
        return "huawei_ltp"
    if "NE Name" in columns and "NE Type" in columns and "Slot Number" in columns:
        return "huawei_ltp"
    # Ribbon - specific formats first
    if "NE Name" in columns and "Card" in columns and "Port" in columns and "Serial Number" in columns:
        return "rbbn_sfp"
    if "NE Name" in columns and "Card" in columns and "SN" in columns and "Slot" in columns:
        return "rbbn_card"
    # Ribbon - legacy
    if "NE User Label" in columns and "Product Name" in columns:
        return "rbbn_ne"
    if "NE Name" in columns and "Board Name" in columns and "Layer Rate" in columns:
        return "rbbn_port"
    # Huawei NE (generic - must be after more specific checks)
    if "NE Name" in columns and "NE Type" in columns:
        return "huawei_ne"
    return "generic"


def skip_metadata_rows(content: bytes, filename: str) -> pd.DataFrame:
    """Skip metadata/title rows before the actual CSV header."""
    text = content.decode("utf-8", errors="replace")
    # Remove BOM
    if text.startswith("\ufeff"):
        text = text[1:]
    lines = text.splitlines()

    if not lines:
        return pd.DataFrame()

    # Heuristic: find the header row (first row with many commas, typical CSV header)
    header_idx = 0
    for i, line in enumerate(lines[:10]):
        stripped = line.strip()
        # Header row usually has many comma-separated column names
        if "," in stripped:
            cols = stripped.split(",")
            # Check if it looks like a header (has known column names)
            col_str = stripped.lower()
            if any(kw in col_str for kw in ["ne name", "ne,", "ne type", "port", "slot", "board"]):
                header_idx = i
                break

    remaining = "\n".join(lines[header_idx:])
    return pd.read_csv(io.StringIO(remaining))


def extract_office_code(hostname: str) -> str | None:
    """Extract office code from hostname.
    Pattern: 3-letter region + 1-letter area code + 3-digit number + suffix
    e.g. TKYC004e-PTN01z -> C004, AICF002b-PTN01z -> F002
    """
    base = hostname.split("-")[0] if "-" in hostname else hostname
    # Remove trailing non-standard chars like (new)
    base = re.sub(r"\(.*\)$", "", base)
    if len(base) >= 7:
        area_code = base[3]      # 4th char = area code letter
        num = base[4:7]           # chars 5-7 = 3-digit number
        if area_code.isalpha() and num.isdigit():
            return area_code.upper() + num
    return None


def parse_import_data(df: pd.DataFrame, vendor_format: str) -> list[dict]:
    df.columns = df.columns.str.strip()
    parsers = {
        "huawei_ltp": _parse_huawei_ltp,
        "huawei_ne": _parse_huawei_ne,
        "zte_port": _parse_zte_port,
        "zte_optical": _parse_zte_optical,
        "rbbn_ne": _parse_rbbn_ne,
        "rbbn_port": _parse_rbbn_port,
        "rbbn_card": _parse_rbbn_card,
        "rbbn_sfp": _parse_rbbn_sfp,
        "generic": _parse_generic,
    }
    parser = parsers.get(vendor_format, _parse_generic)
    return parser(df)


def _safe_str(val) -> str | None:
    if pd.isna(val):
        return None
    s = str(val).strip()
    # Remove leading/trailing tabs (Huawei LTP exports tab-padded numbers)
    s = s.strip("\t ")
    return s if s else None


_HUAWEI_PTN_MODELS = {
    "OptiX PTN 3900",
    "OptiX PTN 3900-8",
    "OptiX PTN 960",
    "OptiX PTN 970",
    "OptiX PTN 980",
    "OptiX PTN 7900-12",
    "OptiX PTN 7900E-32",
    "OptiX PTN 7900-32",
}


def _is_huawei_ptn(hostname: str, model: str | None) -> bool:
    """PTN装置のみ対象: ホスト名に'PTN'を含む、または機種名がPTNモデル一覧に一致."""
    if "PTN" in hostname.upper():
        return True
    if model and model in _HUAWEI_PTN_MODELS:
        return True
    return False


def _parse_huawei_ltp(df: pd.DataFrame) -> list[dict]:
    records = []
    for _, row in df.iterrows():
        hostname = _safe_str(row.get("NE")) or _safe_str(row.get("NE Name")) or ""
        if not hostname:
            continue
        model = _safe_str(row.get("NE Type (MPU TYPE)")) or _safe_str(row.get("NE Type"))
        if not _is_huawei_ptn(hostname, model):
            continue
        office_code = extract_office_code(hostname)
        records.append({
            "office_code": office_code,
            "hostname": hostname,
            "vendor": "Huawei",
            "model": _safe_str(row.get("NE Type (MPU TYPE)")) or _safe_str(row.get("NE Type")),
            "ne_type": _safe_str(row.get("NE Type (MPU TYPE)")) or _safe_str(row.get("NE Type")),
            "slot_number": _safe_str(row.get("Slot Number")) or "0",
            "board_name": _safe_str(row.get("Port Full Name")),
            "board_type": None,
            "port_number": _safe_str(row.get("Port Number")) or _safe_str(row.get("Port No")) or "0",
            "port_name": _safe_str(row.get("Port Name")) or _safe_str(row.get("Port Full Name")),
            "port_type": _safe_str(row.get("Port Type")),
            "port_rate": _safe_str(row.get("Port Rate (kbit/s)")),
            "admin_status": _safe_str(row.get("Administrative Status")),
            "oper_status": _safe_str(row.get("Operational Status")),
            "description": _safe_str(row.get("Port Description")),
            "usage_status": _huawei_usage(
                _safe_str(row.get("Administrative Status")),
                _safe_str(row.get("Operational Status")),
            ),
        })
    return records


def _huawei_usage(admin: str | None, oper: str | None) -> str | None:
    """Active+Up = in_use, otherwise available."""
    if admin and admin.lower() == "active" and oper and oper.lower() == "up":
        return "used"
    return "free"


def _parse_huawei_ne(df: pd.DataFrame) -> list[dict]:
    records = []
    for _, row in df.iterrows():
        hostname = _safe_str(row.get("NE Name")) or ""
        if not hostname:
            continue
        model = _safe_str(row.get("NE Type"))
        if not _is_huawei_ptn(hostname, model):
            continue
        office_code = extract_office_code(hostname)
        records.append({
            "office_code": office_code,
            "hostname": hostname,
            "vendor": "Huawei",
            "model": _safe_str(row.get("NE Type")),
            "ip_address": _safe_str(row.get("NE IP Address")),
            "software_version": _safe_str(row.get("Software Version")),
            "ne_type": _safe_str(row.get("NE Type")),
        })
    return records


def _parse_zte_port(df: pd.DataFrame) -> list[dict]:
    records = []
    for _, row in df.iterrows():
        hostname = _safe_str(row.get("Ne Name")) or ""
        if not hostname:
            continue
        office_code = extract_office_code(hostname)
        records.append({
            "office_code": office_code,
            "hostname": hostname,
            "vendor": "ZTE",
            "model": _safe_str(row.get("Ne Type")),
            "ne_type": _safe_str(row.get("Ne Type")),
            "slot_number": _extract_slot_from_board(row.get("Board Name")),
            "board_name": _safe_str(row.get("Board Name")),
            "port_number": _safe_str(row.get("Port No")) or "0",
            "port_name": None,
            "port_type": _safe_str(row.get("Port Type")),
            "usage_status": _safe_str(row.get("Port Used Status")),
            "port_label": _safe_str(row.get("Port Label")),
            "description": _safe_str(row.get("Port Label")),
        })
    return records


def _parse_zte_optical(df: pd.DataFrame) -> list[dict]:
    records = []
    for _, row in df.iterrows():
        hostname = _safe_str(row.get("NE Name")) or ""
        if not hostname:
            continue
        office_code = extract_office_code(hostname)
        records.append({
            "office_code": office_code,
            "hostname": hostname,
            "vendor": "ZTE",
            "model": _safe_str(row.get("Device Type")),
            "ne_type": _safe_str(row.get("Device Type")),
            "slot_number": _extract_slot_from_port_name(row.get("Port Name")),
            "port_number": _safe_str(row.get("Port Name")) or "0",
            "port_name": _safe_str(row.get("Port Name")),
            "sfp_info": {"detail": _safe_str(row.get("Detail Information"))},
        })
    return records


def _parse_rbbn_ne(df: pd.DataFrame) -> list[dict]:
    records = []
    for _, row in df.iterrows():
        hostname = _safe_str(row.get("NE User Label")) or ""
        if not hostname:
            continue
        office_code = extract_office_code(hostname)
        records.append({
            "office_code": office_code,
            "hostname": hostname,
            "vendor": "RBBN",
            "model": _safe_str(row.get("Product Name")),
            "ne_type": _safe_str(row.get("NE Type")),
            "ip_address": _safe_str(row.get("IP Address")),
        })
    return records


def _parse_rbbn_port(df: pd.DataFrame) -> list[dict]:
    records = []
    for _, row in df.iterrows():
        hostname = _safe_str(row.get("NE Name")) or ""
        if not hostname:
            continue
        office_code = extract_office_code(hostname)
        records.append({
            "office_code": office_code,
            "hostname": hostname,
            "vendor": "RBBN",
            "slot_number": _extract_slot_from_board(row.get("Board Name")),
            "board_name": _safe_str(row.get("Board Name")),
            "port_number": _safe_str(row.get("Port")) or "0",
            "layer_rate": _safe_str(row.get("Layer Rate")),
        })
    return records


def _parse_rbbn_card(df: pd.DataFrame) -> list[dict]:
    """Ribbon CardInventory: NE Name, NE Type, NE IP, Slot, Card, Type, SN, Vendor, ..."""
    records = []
    for _, row in df.iterrows():
        hostname = _safe_str(row.get("NE Name")) or ""
        if not hostname:
            continue
        office_code = extract_office_code(hostname)
        records.append({
            "office_code": office_code,
            "hostname": hostname,
            "vendor": "Ribbon",
            "model": _safe_str(row.get("NE Type")),
            "ne_type": _safe_str(row.get("NE Type")),
            "ip_address": _safe_str(row.get("NE IP")),
            "slot_number": _safe_str(row.get("Slot")) or "0",
            "board_name": _safe_str(row.get("Card")),
            "board_type": _safe_str(row.get("Type")),
        })
    return records


def _parse_rbbn_sfp(df: pd.DataFrame) -> list[dict]:
    """Ribbon SFPInventory: NE Name, NE Type, Slot, Card, Port, Type, Serial Number, ..."""
    records = []
    for _, row in df.iterrows():
        hostname = _safe_str(row.get("NE Name")) or ""
        if not hostname:
            continue
        office_code = extract_office_code(hostname)
        sfp_type = _safe_str(row.get("Type"))
        serial = _safe_str(row.get("Serial Number"))
        desc = _safe_str(row.get("General Description"))
        app_code = _safe_str(row.get("Application Code"))
        sfp_info = None
        if sfp_type and sfp_type != "Absent":
            sfp_info = {}
            if sfp_type:
                sfp_info["type"] = sfp_type
            if serial:
                sfp_info["serial"] = serial
            if desc:
                sfp_info["description"] = desc
            if app_code:
                sfp_info["application_code"] = app_code
        records.append({
            "office_code": office_code,
            "hostname": hostname,
            "vendor": "Ribbon",
            "model": _safe_str(row.get("NE Type")),
            "ne_type": _safe_str(row.get("NE Type")),
            "slot_number": _safe_str(row.get("Slot")) or "0",
            "board_name": _safe_str(row.get("Card")),
            "port_number": _safe_str(row.get("Port")) or "0",
            "port_name": _safe_str(row.get("Port")),
            "port_type": sfp_type if sfp_type and sfp_type != "Absent" else None,
            "usage_status": "used" if sfp_type and sfp_type != "Absent" else "free",
            "sfp_info": sfp_info,
        })
    return records


def _parse_generic(df: pd.DataFrame) -> list[dict]:
    records = []
    for _, row in df.iterrows():
        hostname = _safe_str(row.get("hostname")) or _safe_str(row.get("Hostname")) or _safe_str(row.get("NE Name")) or ""
        if not hostname:
            continue
        office_code = extract_office_code(hostname)
        record = {"office_code": office_code, "hostname": hostname}
        for col in ["model", "vendor", "ip_address", "slot_number", "port_number"]:
            val = _safe_str(row.get(col))
            if val:
                record[col] = val
        records.append(record)
    return records


def _extract_slot_from_board(board_name) -> str:
    if pd.isna(board_name):
        return "0"
    parts = str(board_name).strip().split("-")
    return parts[0] if parts else "0"


def _extract_slot_from_port_name(port_name) -> str:
    if pd.isna(port_name):
        return "0"
    parts = str(port_name).strip().split("/")
    return parts[0] if parts else "0"
