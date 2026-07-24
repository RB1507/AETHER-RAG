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
    SecurityQuestionOut,
    SecurityQuestionUpdate,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _normalize_answer(answer: str) -> str:
    """Security answers are matched case-insensitively and whitespace-trimmed
    so the user isn't tripped up by capitalization or a trailing space."""
    return answer.strip().lower()

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
        is_active=True,
        security_question=user_in.security_question,
        security_answer_hash=get_password_hash(_normalize_answer(user_in.security_answer)),
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.get("/security-question", response_model=SecurityQuestionOut)
def get_security_question(email: str, db: Session = Depends(get_db)) -> dict:
    """
    Returns the security question for an account so the reset flow can
    challenge the user. 404 if no such account; ``security_question`` is null
    for legacy accounts created before this feature (they can't self-reset).
    """
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account found with that email",
        )
    return {"security_question": user.security_question}


@router.put("/security-question", response_model=SecurityQuestionOut)
def update_security_question(
    body: SecurityQuestionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """
    Sets or changes the logged-in user's security question. Requires the
    current password so a walked-up, unlocked session can't silently swap the
    recovery question. Also lets accounts created before this feature opt in.
    """
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password",
        )

    current_user.security_question = body.security_question
    current_user.security_answer_hash = get_password_hash(_normalize_answer(body.security_answer))
    db.add(current_user)
    db.commit()
    return {"security_question": current_user.security_question}


@router.post("/reset-password", response_model=UserOut, dependencies=[Depends(login_rate_limit)])
def reset_password(body: PasswordReset, db: Session = Depends(get_db)) -> User:
    """
    Resets a local account's password after the owner answers their own
    security question. AETHER RAG is a single-machine desktop app with no mail
    server, so identity is proven by the pre-set security answer rather than an
    emailed reset link. This stops one local account from taking over another.
    """
    user = db.query(User).filter(User.email == body.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account found with that email",
        )

    if not user.security_answer_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account has no security question set, so it can't be reset here.",
        )

    if not verify_password(_normalize_answer(body.security_answer), user.security_answer_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect answer to the security question",
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
