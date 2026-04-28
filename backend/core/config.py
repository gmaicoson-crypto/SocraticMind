from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    deepseek_api_key: str
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"
    secret_key: str
    database_url: str = "sqlite:///./socraticmind.db"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7天

    class Config:
        env_file = ".env"

settings = Settings()