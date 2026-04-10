from pydantic import BaseModel

from app.models.user import UserRole


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: int
    username: str
    display_name: str | None
    role: UserRole
    is_active: bool

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    username: str
    display_name: str | None = None
    password: str
    role: UserRole = UserRole.USER
