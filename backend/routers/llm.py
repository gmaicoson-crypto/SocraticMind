from fastapi import APIRouter, Depends, HTTPException

from core.ai_client import list_llm_profiles
from core.deps import get_current_user
from models.user import User


router = APIRouter(prefix="/api/llm", tags=["LLM"])


@router.get("/models")
def get_llm_models(current_user: User = Depends(get_current_user)):
    """返回当前服务已配置的模型选项，不返回任何凭据。"""
    try:
        return {"models": list_llm_profiles()}
    except ValueError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
