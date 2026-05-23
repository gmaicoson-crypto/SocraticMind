from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    deepseek_api_key: str
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"
    secret_key: str
    database_url: str = "mysql+pymysql://root@localhost:3306/socraticmind"
    access_token_expire_minutes: int = 60 * 24 * 7  # 默认 7 天

    # 允许的前端源，逗号分隔；生产环境需改为实际域名，禁止保留 localhost
    cors_origins: str = "http://localhost:5173"

    # SMTP 邮件配置；smtp_host 为空时验证码只打印到控制台，适合本地开发调试
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_use_tls: bool = True
    app_name: str = "SocraticMind"

    @property
    def cors_origins_list(self) -> list[str]:
        """将逗号分隔的字符串解析为列表，过滤空白项。"""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    class Config:
        env_file = ".env"


settings = Settings()
