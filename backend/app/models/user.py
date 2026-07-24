from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from app.db.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    # Offline password recovery: the owner proves identity by answering their
    # own security question (the answer is stored hashed, never in plaintext).
    # Nullable so accounts created before this feature keep working.
    security_question = Column(String, nullable=True)
    security_answer_hash = Column(String, nullable=True)
