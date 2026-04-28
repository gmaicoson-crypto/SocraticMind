from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel
from core.database import get_db
from core.auth import hash_password, verify_password, create_access_token
from core.deps import get_current_user
from models.user import User
from models.topic import Topic
from models.node import Node

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

class UpdateProfileRequest(BaseModel):
    username: str | None = None
    bio: str | None = None
    avatar_grad: str | None = None
    daily_goal: int | None = None
    ai_style: str | None = None


def init_default_topic(db: Session, user_id: int):
    """注册时自动创建 Python 基础主题和节点"""
    topic = Topic(user_id=user_id, title="Python 基础知识", emoji="🐍")
    db.add(topic)
    db.flush()

    default_nodes = [
        ("py-basics",    "Python 基础", "Fundamentals",     300, 140, "available", ""),
        ("vars",         "变量",        "Variables",        130, 260, "locked",    "py-basics"),
        ("types",        "数据类型",    "Data Types",       300, 260, "locked",    "py-basics"),
        ("operators",    "运算符",      "Operators",        470, 260, "locked",    "py-basics"),
        ("conditionals", "条件语句",    "if · elif · else", 200, 400, "locked",    "vars,types"),
        ("comparison",   "比较运算",    "== · != · >",      400, 400, "locked",    "operators,types"),
        ("loops",        "循环",        "for · while",      130, 540, "locked",    "conditionals"),
        ("functions",    "函数",        "def · return",     320, 540, "locked",    "conditionals,comparison"),
        ("scope",        "作用域",      "Scope",            480, 540, "locked",    "operators,functions"),
        ("data-struct",  "数据结构",    "list · dict",      220, 660, "locked",    "loops,functions"),
        ("modules",      "模块",        "import",           410, 660, "locked",    "functions,scope"),
    ]

    for key, label, sub, x, y, state, parents in default_nodes:
        db.add(Node(
            topic_id=topic.id,
            node_key=key, label=label, sub=sub,
            x=x, y=y, state=state, parent_keys=parents,
        ))
    db.commit()


@router.post("/register", response_model=TokenResponse)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
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

    # 自动初始化默认主题
    init_default_topic(db, user.id)

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
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=UserResponse)
def update_me(
    req: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if req.username is not None: current_user.username = req.username
    if req.bio is not None: current_user.bio = req.bio
    if req.avatar_grad is not None: current_user.avatar_grad = req.avatar_grad
    if req.daily_goal is not None: current_user.daily_goal = req.daily_goal
    if req.ai_style is not None: current_user.ai_style = req.ai_style
    db.commit()
    db.refresh(current_user)
    return current_user