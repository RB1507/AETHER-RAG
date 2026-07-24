import structlog
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import settings

logger = structlog.get_logger()

db_url = settings.DATABASE_URL
engine = None

# If standard postgres configuration is provided, try connecting, otherwise fall back to SQLite
if db_url.startswith("postgresql"):
    try:
        engine = create_engine(db_url, connect_args={"connect_timeout": 2})
        # Test connection quickly
        conn = engine.connect()
        conn.close()
        logger.info("Successfully connected to PostgreSQL database")
    except Exception as e:
        logger.warning(
            "Failed to connect to PostgreSQL database. Falling back to local SQLite.",
            error=str(e)
        )
        db_url = "sqlite:///./sql_app.db"
        engine = create_engine(db_url, connect_args={"check_same_thread": False})
else:
    # Use SQLite directly (e.g. for testing)
    engine = create_engine(db_url, connect_args={"check_same_thread": False})
    logger.info("Using SQLite database", url=db_url)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()
