from pydantic import BaseModel

from app.models.host import HostStatus
from app.models.port import UsageStatus
from app.models.slot import SlotStatus


class PortResponse(BaseModel):
    id: int
    slot_id: int
    port_number: str
    port_name: str | None
    port_type: str | None
    port_rate: str | None
    layer_rate: str | None
    admin_status: str | None
    oper_status: str | None
    usage_status: UsageStatus
    description: str | None
    sfp_info: dict | None

    model_config = {"from_attributes": True}


class PortUpdate(BaseModel):
    description: str | None = None
    usage_status: UsageStatus | None = None


class SlotResponse(BaseModel):
    id: int
    host_id: int
    slot_number: str
    board_name: str | None
    board_type: str | None
    status: SlotStatus
    ports: list[PortResponse]

    model_config = {"from_attributes": True}


class HostResponse(BaseModel):
    id: int
    office_id: int
    hostname: str
    model: str | None
    vendor: str | None
    ip_address: str | None
    software_version: str | None
    ne_type: str | None
    status: HostStatus
    slots: list[SlotResponse]

    model_config = {"from_attributes": True}


class HostSummary(BaseModel):
    id: int
    hostname: str
    model: str | None
    vendor: str | None
    status: HostStatus
    total_ports: int = 0
    available_ports: int = 0

    model_config = {"from_attributes": True}
