from pydantic import BaseModel


class SummaryStats(BaseModel):
    total_hosts: int
    total_slots: int
    total_ports: int
    available_ports: int
    in_use_ports: int
    reserved_ports: int
    faulty_ports: int


class ModelStats(BaseModel):
    model: str | None
    vendor: str | None
    host_count: int
    total_ports: int
    available_ports: int
    utilization_pct: float


class RegionStats(BaseModel):
    region_name: str
    host_count: int
    total_ports: int
    available_ports: int
    utilization_pct: float


class BoardStats(BaseModel):
    board_name: str | None
    slot_count: int
    total_ports: int
    available_ports: int
    in_use_ports: int
    utilization_pct: float


class RateStats(BaseModel):
    rate_category: str
    total_ports: int
    available_ports: int
    in_use_ports: int
    reserved_ports: int
    utilization_pct: float
