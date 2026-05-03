from sqlalchemy import Column, Integer, String, DateTime, Boolean, Index
from sqlalchemy.sql import func
from core.database import Base


class EmailCode(Base):
    __tablename__ = "email_codes"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, nullable=False)
    code = Column(String, nullable=False)
    purpose = Column(String, nullable=False)  # register / reset
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # 校验时按 (email, purpose) 取最新未过期未使用的一条
    __table_args__ = (
        Index("ix_email_codes_email_purpose", "email", "purpose"),
    )
