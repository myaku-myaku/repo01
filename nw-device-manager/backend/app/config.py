from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:nwdevmgr2026@localhost:5432/nw_device_manager"
    SECRET_KEY: str = "dev_secret_key_change_in_production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 hours
    CORS_ORIGINS: str = "http://localhost:5173"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
