"""Parse iMaster NCE-T REST NBI responses into PRISM import records.

Transforms NCE JSON data (NE, cards, LTPs) into the same dict format
used by import_service.parse_import_data(), so the existing DB upsert
logic in import_.py can be reused.

Verified field names against LAB NCE (V800R020C05):
  NE:   name, product-name, ip-address, software-version, res-id
  Card: ne-id, slot-number, name, product-name, card-category
  LTP:  ne-id, slot-number, port-number, name, layer-rate,
        admin-status, operate-status, bandwidth, ltp-type-name
"""

import re

from app.services.import_service import extract_office_code

# NCE NE types that correspond to PTN equipment
_PTN_NE_TYPES = {
    "PTN 960", "PTN 970", "PTN 980",
    "PTN 3900", "PTN 3900-8",
    "PTN 7900-12", "PTN 7900-32", "PTN 7900E-32",
}


def _is_ptn_device(ne_name: str, ne_type: str | None) -> bool:
    """Check if an NE is a PTN device (same logic as CSV import)."""
    if "PTN" in ne_name.upper():
        return True
    if ne_type:
        for ptn in _PTN_NE_TYPES:
            if ptn in ne_type:
                return True
    return False


def _safe(val) -> str | None:
    if val is None:
        return None
    s = str(val).strip()
    return s if s else None


def parse_ne_list(ne_items: list[dict]) -> list[dict]:
    """Parse NE list into host-level records.

    NCE fields:
    - name: NE name (hostname)
    - product-name / detail-dev-type-name: device model
    - ip-address: management IP
    - software-version: software version
    - res-id: NCE internal UUID
    - admin-status: "active" etc.
    """
    records = []
    for ne in ne_items:
        hostname = _safe(ne.get("name") or ne.get("neName") or ne.get("ne-name"))
        if not hostname:
            continue
        ne_type = _safe(
            ne.get("product-name")
            or ne.get("detail-dev-type-name")
            or ne.get("neType")
            or ne.get("productName")
        )
        if not _is_ptn_device(hostname, ne_type):
            continue
        office_code = extract_office_code(hostname)

        records.append({
            "office_code": office_code,
            "hostname": hostname,
            "vendor": "Huawei",
            "model": ne_type,
            "ne_type": ne_type,
            "ip_address": _safe(ne.get("ip-address") or ne.get("ipAddress")),
            "software_version": _safe(ne.get("software-version") or ne.get("softwareVersion")),
            "_nce_ne_id": _safe(ne.get("res-id") or ne.get("neId")),
        })
    return records


def parse_card_list(card_items: list[dict], ne_map: dict[str, str] | None = None) -> list[dict]:
    """Parse card (board/slot) list into slot-level records.

    NCE fields:
    - ne-id: parent NE UUID (use ne_map to resolve hostname)
    - slot-number: slot number
    - name / product-name: board name
    - card-category: POWER, INTERFACE, MAIN, etc.
    - service-state: 0=normal
    """
    records = []
    for card in card_items:
        # Resolve NE name via ne-id -> ne_map
        ne_id = _safe(card.get("ne-id") or card.get("neId"))
        ne_name = None
        if ne_map and ne_id:
            ne_name = ne_map.get(ne_id)
        if not ne_name:
            ne_name = _safe(card.get("neName") or card.get("ne-name"))
        if not ne_name:
            continue

        if not _is_ptn_device(ne_name, None):
            continue

        slot_no = _safe(card.get("slot-number") or card.get("slotNumber") or card.get("slotNo"))
        if not slot_no:
            continue

        office_code = extract_office_code(ne_name)
        board_name = _safe(card.get("name") or card.get("product-name") or card.get("boardName"))
        board_type = _safe(card.get("product-name") or card.get("boardType"))

        records.append({
            "office_code": office_code,
            "hostname": ne_name,
            "vendor": "Huawei",
            "slot_number": slot_no,
            "board_name": board_name,
            "board_type": board_type,
        })
    return records


def parse_ltp_list(ltp_items: list[dict], ne_map: dict[str, str] | None = None) -> list[dict]:
    """Parse LTP (port) list into port-level records.

    NCE fields:
    - ne-id: parent NE UUID
    - slot-number: slot number
    - port-number: port number
    - name: port display name (e.g. "GigabitEthernet0/3/1")
    - layer-rate: e.g. "LR_DSR_10GBase_W"
    - ltp-type-name: e.g. "ETH", "POS"
    - bandwidth: port bandwidth in kbps
    - admin-status: "active" / "inactive"
    - operate-status: "0" (up) / "1" (down)
    - sc-ltp-type: "ETH", "POS", etc.
    """
    records = []
    for ltp in ltp_items:
        # Resolve NE name
        ne_id = _safe(ltp.get("ne-id") or ltp.get("neId"))
        ne_name = None
        if ne_map and ne_id:
            ne_name = ne_map.get(ne_id)
        if not ne_name:
            ne_name = _safe(ltp.get("neName") or ltp.get("ne-name"))
        if not ne_name:
            continue

        if not _is_ptn_device(ne_name, None):
            continue

        slot_no = _safe(ltp.get("slot-number") or ltp.get("slotNumber") or ltp.get("slotNo"))
        port_no = _safe(ltp.get("port-number") or ltp.get("portNumber") or ltp.get("portNo"))

        # Skip sub-LTPs (virtual ports)
        if ltp.get("is-sub-ltp"):
            continue

        if not slot_no or not port_no:
            continue

        office_code = extract_office_code(ne_name)
        admin = _safe(ltp.get("admin-status") or ltp.get("adminStatus"))
        oper = _safe(ltp.get("operate-status") or ltp.get("operStatus"))
        bandwidth = ltp.get("bandwidth")
        port_rate = _bandwidth_to_rate(bandwidth) if bandwidth else None
        ltp_type = _safe(ltp.get("ltp-type-name") or ltp.get("sc-ltp-type"))

        records.append({
            "office_code": office_code,
            "hostname": ne_name,
            "vendor": "Huawei",
            "slot_number": slot_no,
            "port_number": port_no,
            "port_name": _safe(ltp.get("name") or ltp.get("portName")),
            "port_type": ltp_type,
            "port_rate": port_rate,
            "layer_rate": _safe(ltp.get("layer-rate") or ltp.get("layerRate")),
            "admin_status": admin,
            "oper_status": _oper_status_label(oper),
            "usage_status": _nce_usage(admin, oper),
        })
    return records


def build_ne_id_map(ne_items: list[dict]) -> dict[str, str]:
    """Build a mapping of NCE res-id -> NE name for cross-referencing cards/LTPs."""
    mapping: dict[str, str] = {}
    for ne in ne_items:
        ne_id = _safe(ne.get("res-id") or ne.get("neId") or ne.get("ne-id"))
        ne_name = _safe(ne.get("name") or ne.get("neName") or ne.get("ne-name"))
        if ne_id and ne_name:
            mapping[ne_id] = ne_name
    return mapping


def _nce_usage(admin: str | None, oper: str | None) -> str:
    """Map NCE admin/oper status to usage status string.

    admin-status: "active" = enabled
    operate-status: "0" = up, "1" = down
    """
    admin_up = admin and admin.lower() in ("active", "up")
    oper_up = oper and str(oper).strip() == "0"
    if admin_up and oper_up:
        return "used"
    return "free"


def _oper_status_label(oper: str | None) -> str | None:
    """Convert NCE numeric operate-status to readable label."""
    if oper is None:
        return None
    s = str(oper).strip()
    if s == "0":
        return "up"
    if s == "1":
        return "down"
    return s


def _bandwidth_to_rate(bandwidth) -> str | None:
    """Convert bandwidth (kbps float) to human-readable rate string."""
    try:
        bw = float(bandwidth)
    except (TypeError, ValueError):
        return None
    if bw >= 100_000_000:
        return f"{bw / 1_000_000:.0f}G"
    if bw >= 1_000_000:
        return f"{bw / 1_000_000:.0f}G"
    if bw >= 1_000:
        return f"{bw / 1_000:.0f}M"
    return f"{bw:.0f}K"
