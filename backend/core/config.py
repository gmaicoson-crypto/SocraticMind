import hashlib
import json
import re
from io import StringIO
from pathlib import Path
from typing import Mapping

from dotenv import dotenv_values
from pydantic import BaseModel, ConfigDict
from pydantic_settings import BaseSettings, DotEnvSettingsSource, PydanticBaseSettingsSource
from pydantic_settings.sources import parse_env_vars


class MultilineLLMDotEnvSource(DotEnvSettingsSource):
    """Allow an unquoted, pretty-printed LLM_MODELS array in .env files."""

    def _read_env_file(self, file_path: Path) -> Mapping[str, str | None]:
        lines = file_path.read_text(encoding=self.env_file_encoding or "utf-8").splitlines(
            keepends=True
        )
        dotenv_lines = []
        multiline_models = None
        index = 0
        while index < len(lines):
            line = lines[index]
            start = re.fullmatch(
                r"([ \t]*)(?:export[ \t]+)?LLM_MODELS[ \t]*=[ \t]*\[[ \t]*",
                line.rstrip("\r\n"),
            )
            if start:
                closing = re.compile(rf"{re.escape(start.group(1))}\][ \t]*")
                end = index + 1
                while end < len(lines) and not closing.fullmatch(lines[end].rstrip("\r\n")):
                    end += 1
                if end < len(lines):
                    multiline_models = (
                        line.partition("=")[2] + "".join(lines[index + 1 : end + 1])
                    ).strip()
                    index = end + 1
                    continue
            dotenv_lines.append(line)
            index += 1

        values = dotenv_values(
            stream=StringIO("".join(dotenv_lines)), encoding=self.env_file_encoding or "utf-8"
        )
        if multiline_models is not None:
            values["LLM_MODELS"] = multiline_models
        return parse_env_vars(
            values, self.case_sensitive, self.env_ignore_empty, self.env_parse_none_str
        )


class LLMProfile(BaseModel):
    """一个 OpenAI 兼容服务的连接配置。密钥只在后端进程内使用。"""

    id: str
    name: str
    api_key: str
    base_url: str
    model: str


class LLMConfig(BaseModel):
    """用户填写的四项服务配置；运行时 ID 由服务地址和模型生成。"""

    model_config = ConfigDict(extra="forbid")

    model: str
    api_key: str
    base_url: str
    name: str


class Settings(BaseSettings):
    # 保留旧变量，未配置 LLM_MODELS 时继续支持单模型部署。
    llm_api_key: str = ""
    llm_base_url: str = ""
    llm_model: str = ""
    # JSON 数组中的模型只需 MODEL、API_KEY、BASE_URL、NAME。
    llm_models: str = ""
    llm_default_model_id: str = ""
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

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: DotEnvSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        return (
            init_settings,
            env_settings,
            MultilineLLMDotEnvSource(
                settings_cls,
                env_file=(".env" if dotenv_settings.env_file == () else dotenv_settings.env_file),
                env_file_encoding=dotenv_settings.env_file_encoding,
                case_sensitive=dotenv_settings.case_sensitive,
                env_prefix=dotenv_settings.env_prefix,
                env_nested_delimiter=dotenv_settings.env_nested_delimiter,
                env_ignore_empty=dotenv_settings.env_ignore_empty,
                env_parse_none_str=dotenv_settings.env_parse_none_str,
                env_parse_enums=dotenv_settings.env_parse_enums,
            ),
            file_secret_settings,
        )

    @property
    def cors_origins_list(self) -> list[str]:
        """将逗号分隔的字符串解析为列表，过滤空白项。"""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def llm_profiles(self) -> list[LLMProfile]:
        """解析多模型配置，并为旧版环境变量生成一个兼容 profile。"""
        if self.llm_models.strip():
            try:
                raw_profiles = json.loads(self.llm_models)
            except json.JSONDecodeError as error:
                raise ValueError("LLM_MODELS 必须是合法的 JSON 数组") from error
            if not isinstance(raw_profiles, list) or not raw_profiles:
                raise ValueError("LLM_MODELS 必须是非空 JSON 数组")
            profiles = []
            for raw_profile in raw_profiles:
                if not isinstance(raw_profile, dict):
                    raise ValueError("LLM_MODELS 中的每项必须是对象")
                values = {key.lower(): value for key, value in raw_profile.items()}
                legacy_id = values.pop("id", None)
                config = LLMConfig.model_validate(values)
                profile_id = (
                    legacy_id
                    or "env:"
                    + hashlib.sha256(
                        f"{config.base_url.rstrip('/')}\0{config.model}".encode()
                    ).hexdigest()[:16]
                )
                profiles.append(LLMProfile(id=profile_id, **config.model_dump()))
        else:
            if not all((self.llm_api_key, self.llm_base_url, self.llm_model)):
                raise ValueError(
                    "请配置 LLM_MODELS，或同时配置 LLM_API_KEY、LLM_BASE_URL、LLM_MODEL"
                )
            profiles = [
                LLMProfile(
                    id="default",
                    name="默认模型",
                    api_key=self.llm_api_key,
                    base_url=self.llm_base_url,
                    model=self.llm_model,
                )
            ]

        ids = [profile.id for profile in profiles]
        if len(ids) != len(set(ids)):
            raise ValueError("LLM_MODELS 中的 id 必须唯一")
        return profiles

    @property
    def default_llm_profile_id(self) -> str:
        if self.llm_default_model_id:
            matches = [
                profile
                for profile in self.llm_profiles
                if self.llm_default_model_id in (profile.id, profile.name, profile.model)
            ]
            if len(matches) == 1:
                return matches[0].id
        return self.llm_profiles[0].id

    class Config:
        # The built-in dotenv source is created before custom sources; keep it empty.
        env_file = ()


settings = Settings()
