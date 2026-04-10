import pandas as pd


def detect_vendor_format(df: pd.DataFrame) -> str:
    columns = set(df.columns.str.strip())
    if "NE Name" in columns and "NE Type" in columns and "Slot Number" in columns:
        return "huawei_ltp"
    if "NE Name" in columns and "NE Type" in columns:
        return "huawei_ne"
    if "Ne Name" in columns and "Port Used Status" in columns:
        return "zte_port"
    if "NE Name" in columns and "Port Name" in columns and "Detail Information" in columns:
        return "zte_optical"
    if "NE User Label" in columns and "Product Name" in columns:
        return "rbbn_ne"
    if "NE Name" in columns and "Board Name" in columns and "Layer Rate" in columns:
        return "rbbn_port"
    return "generic"


def parse_import_data(df: pd.DataFrame, vendor_format: str) -> list[dict]:
    df.columns = df.columns.str.strip()
    parsers = {
        "huawei_ltp": _parse_huawei_ltp,
        "huawei_ne": _parse_huawei_ne,
        "zte_port": _parse_zte_port,
        "zte_optical": _parse_zte_optical,
        "rbbn_ne": _parse_rbbn_ne,
        "rbbn_port": _parse_rbbn_port,
        "generic": _parse_generic,
    }
    parser = parsers.get(vendor_format, _parse_generic)
    return parser(df)


def _safe_str(val) -> str | None:
    if pd.isna(val):
        return None
    return str(val).strip()


def _parse_hostname_location(hostname: str) -> dict:
    """Extract region/prefecture/office from hostname convention.
    Default fallback returns 'UNKNOWN' placeholders."""
    return {
        "region_code": "UNKNOWN",
        "region_name": "未分類",
        "prefecture_code": "UNKNOWN",
        "prefecture_name": "未分類",
        "office_code": "UNKNOWN",
        "office_name": "未分類",
    }


def _parse_huawei_ltp(df: pd.DataFrame) -> list[dict]:
    records = []
    for _, row in df.iterrows():
        hostname = _safe_str(row.get("NE")) or _safe_str(row.get("NE Name")) or ""
        loc = _parse_hostname_location(hostname)
        records.append({
            **loc,
            "hostname": hostname,
            "vendor": "Huawei",
            "model": _safe_str(row.get("NE Type")),
            "ne_type": _safe_str(row.get("NE Type")),
            "slot_number": _safe_str(row.get("Slot Number")) or "0",
            "board_name": _safe_str(row.get("Board Name")),
            "board_type": _safe_str(row.get("Board Type")),
            "port_number": _safe_str(row.get("Port Number")) or _safe_str(row.get("Port No")) or "0",
            "port_name": _safe_str(row.get("Port Name")),
            "port_type": _safe_str(row.get("Port Type")),
            "port_rate": _safe_str(row.get("Port Rate")),
            "admin_status": _safe_str(row.get("Administrative Status")),
            "oper_status": _safe_str(row.get("Operational Status")),
            "description": _safe_str(row.get("Port Description")),
            "usage_status": _safe_str(row.get("Port Used Status")),
        })
    return records


def _parse_huawei_ne(df: pd.DataFrame) -> list[dict]:
    records = []
    for _, row in df.iterrows():
        hostname = _safe_str(row.get("NE Name")) or ""
        loc = _parse_hostname_location(hostname)
        records.append({
            **loc,
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
        loc = _parse_hostname_location(hostname)
        records.append({
            **loc,
            "hostname": hostname,
            "vendor": "ZTE",
            "model": _safe_str(row.get("Ne Type")),
            "ne_type": _safe_str(row.get("Ne Type")),
            "slot_number": _extract_slot_from_board(row.get("Board Name")),
            "board_name": _safe_str(row.get("Board Name")),
            "port_number": _safe_str(row.get("Port No")) or "0",
            "port_type": _safe_str(row.get("Port Type")),
            "usage_status": _safe_str(row.get("Port Used Status")),
        })
    return records


def _parse_zte_optical(df: pd.DataFrame) -> list[dict]:
    records = []
    for _, row in df.iterrows():
        hostname = _safe_str(row.get("NE Name")) or ""
        loc = _parse_hostname_location(hostname)
        records.append({
            **loc,
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
        loc = _parse_hostname_location(hostname)
        records.append({
            **loc,
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
        loc = _parse_hostname_location(hostname)
        records.append({
            **loc,
            "hostname": hostname,
            "vendor": "RBBN",
            "slot_number": _extract_slot_from_board(row.get("Board Name")),
            "board_name": _safe_str(row.get("Board Name")),
            "port_number": _safe_str(row.get("Port")) or "0",
            "layer_rate": _safe_str(row.get("Layer Rate")),
        })
    return records


def _parse_generic(df: pd.DataFrame) -> list[dict]:
    records = []
    for _, row in df.iterrows():
        hostname = _safe_str(row.get("hostname")) or _safe_str(row.get("Hostname")) or _safe_str(row.get("NE Name")) or ""
        loc = _parse_hostname_location(hostname)
        record = {**loc, "hostname": hostname}
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
