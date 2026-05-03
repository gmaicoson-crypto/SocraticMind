from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    deepseek_api_key: str
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"
    secret_key: str
    database_url: str = "sqlite:///./socraticmind.db"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7天

    # SMTP 配置：未配置 smtp_host 时，验证码会打印到控制台（开发用）
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_use_tls: bool = True
    app_name: str = "SocraticMind"

    class Config:
        env_file = ".env"

settings = Settings()