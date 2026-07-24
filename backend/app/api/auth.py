from jose import jwt, JWTError
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user
from app.core.config import settings
from app.core.rate_limit import login_rate_limit
from app.core.security import (
    ALGORITHM,
    get_password_hash,
    verify_password,
    create_access_token,
    create_refresh_token,
)
from app.models.user import User
from app.schemas.user import (
    UserCreate,
    UserOut,
    Token,
    AccessToken,
    TokenRefreshRequest,
    PasswordReset,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register_user(user_in: UserCreate, db: Session = Depends(get_db)) -> User:
    """
    Registers a new user account.
    """
    existing_user = db.query(User).filter(User.email == user_in.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )
    
    hashed_pwd = get_password_hash(user_in.password)
    new_user = User(
        email=user_in.email,
        hashed_password=hashed_pwd,
        is_active=True
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.post("/reset-password", response_model=UserOut, dependencies=[Depends(login_rate_limit)])
def reset_password(body: PasswordReset, db: Session = Depends(get_db)) -> User:
    """
    Resets a local account's password directly.

    AETHER RAG is a single-machine desktop app with no mail server, so there
    is no emailed reset link. Anyone with access to this machine already has
    access to its data, so the account owner recovers access by supplying
    their email and choosing a new password.
    """
    user = db.query(User).filter(User.email == body.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account found with that email",
        )

    user.hashed_password = get_password_hash(body.new_password)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.post("/login", response_model=Token, dependencies=[Depends(login_rate_limit)])
def login_for_access_token(
    db: Session = Depends(get_db), form_data: OAuth2PasswordRequestForm = Depends()
) -> dict:
    """
    Logs in an existing user and returns a bearer JWT token.
    Supports OAuth2 form credentials (username/password).
    """
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return {
        "access_token": create_access_token(subject=user.email),
        "refresh_token": create_refresh_token(subject=user.email),
        "token_type": "bearer",
    }

@router.post("/refresh", response_model=AccessToken)
def refresh_access_token(
    body: TokenRefreshRequest, db: Session = Depends(get_db)
) -> dict:
    """
    Exchanges a valid refresh token for a new short-lived access token, so the
    client can keep a session alive without forcing the user to log in again.
    """
    invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired refresh token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            body.refresh_token, settings.SECRET_KEY, algorithms=[ALGORITHM]
        )
    except JWTError:
        raise invalid

    if payload.get("type") != "refresh":
        raise invalid
    email = payload.get("sub")
    if not email:
        raise invalid

    user = db.query(User).filter(User.email == email).first()
    if user is None or not user.is_active:
        raise invalid

    return {
        "access_token": create_access_token(subject=user.email),
        "token_type": "bearer",
    }

@router.get("/me", response_model=UserOut)
def get_user_me(current_user: User = Depends(get_current_user)) -> User:
    """
    Returns details of the currently authenticated user.
    """
    return current_user
