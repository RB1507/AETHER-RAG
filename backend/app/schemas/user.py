from datetime import datetime
from pydantic import BaseModel, EmailStr, ConfigDict

class UserBase(BaseModel):
    email: EmailStr

class UserCreate(UserBase):
    password: str
    security_question: str
    security_answer: str

class PasswordReset(UserBase):
    security_answer: str
    new_password: str

class SecurityQuestionOut(BaseModel):
    # The question to challenge the user with during reset. ``None`` means the
    # account predates this feature and has no security question set.
    security_question: str | None

class UserOut(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    is_active: bool
    created_at: datetime

class Token(BaseModel):
    access_token: str
    token_type: str
    refresh_token: str | None = None

class TokenRefreshRequest(BaseModel):
    refresh_token: str

class AccessToken(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TokenData(BaseModel):
    email: str | None = None
