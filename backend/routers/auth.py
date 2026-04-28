from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from core.database import get_db
from core.auth import hash_password, verify_password, create_access_token
from models.user import User

router = APIRouter(prefix="/api/auth", tags=["认证"])

class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    avatar_grad: str
    bio: str
    daily_goal: int
    ai_style: str

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

@router.post("/register", response_model=TokenResponse)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    # 检查邮箱是否已注册
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=400, detail="邮箱已注册")
    if db.query(User).filter(User.username == req.username).first():
        raise HTTPException(status_code=400, detail="用户名已存在")

    user = User(
        username=req.username,
        email=req.email,
        hashed_password=hash_password(req.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))

@router.post("/login", response_model=TokenResponse)
def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.email == form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="邮箱或密码错误")

    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))

@router.get("/me", response_model=UserResponse)
def get_me(db: Session = Depends(get_db), token: str = Depends(__import__('core.deps', fromlist=['get_current_user']).get_current_user)):
    return token

class UpdateProfileRequest(BaseModel):
    username: str | None = None
    bio: str | None = None
    avatar_grad: str | None = None
    daily_goal: int | None = None
    ai_style: str | None = None

@router.put("/me", response_model=UserResponse)
def update_me(
    req: UpdateProfileRequest,
    current_user: User = Depends(__import__('core.deps', fromlist=['get_current_user']).get_current_user),
    db: Session = Depends(get_db)
):
    if req.username: current_user.username = req.username
    if req.bio: current_user.bio = req.bio
    if req.avatar_grad: current_user.avatar_grad = req.avatar_grad
    if req.daily_goal: current_user.daily_goal = req.daily_goal
    if req.ai_style: current_user.ai_style = req.ai_style
    db.commit()
    db.refresh(current_user)
    return current_user