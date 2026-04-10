from pydantic import BaseModel


class RegionBase(BaseModel):
    name: str
    code: str


class PrefectureBase(BaseModel):
    name: str
    code: str


class OfficeBase(BaseModel):
    name: str
    code: str
    address: str | None = None


class OfficeResponse(OfficeBase):
    id: int
    prefecture_id: int
    host_count: int = 0

    model_config = {"from_attributes": True}


class PrefectureResponse(PrefectureBase):
    id: int
    region_id: int
    office_count: int = 0

    model_config = {"from_attributes": True}


class RegionResponse(RegionBase):
    id: int
    prefecture_count: int = 0

    model_config = {"from_attributes": True}


class TreePrefecture(PrefectureBase):
    id: int


class TreeRegion(RegionBase):
    id: int
    prefectures: list[TreePrefecture]


class TreeOffice(OfficeBase):
    id: int
    host_count: int = 0


class TreeHost(BaseModel):
    id: int
    hostname: str
    model: str | None
    vendor: str | None
    status: str
