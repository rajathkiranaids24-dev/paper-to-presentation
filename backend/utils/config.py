import os
import tempfile
from typing import Optional


def _read_streamlit_secret(key: str) -> Optional[str]:
    try:
        import streamlit as st

        if key in st.secrets:
            val = str(st.secrets[key]).strip()
            return val or None
    except Exception:
        return None
    return None


def get_gemini_api_key() -> str:
    """Resolve GEMINI_API_KEY from st.secrets first, then environment variables."""
    secret_val = _read_streamlit_secret("GEMINI_API_KEY")
    if secret_val and secret_val != "MY_GEMINI_API_KEY":
        return secret_val

    env_val = os.getenv("GEMINI_API_KEY", "").strip()
    if env_val and env_val != "MY_GEMINI_API_KEY":
        return env_val

    raise RuntimeError(
        "GEMINI_API_KEY is not configured. Add GEMINI_API_KEY in Streamlit Cloud Secrets "
        '(Settings -> Secrets -> GEMINI_API_KEY = "...") or in your local environment.'
    )


def has_gemini_api_key() -> bool:
    try:
        return bool(get_gemini_api_key())
    except RuntimeError:
        return False


def get_chat_model_name() -> str:
    return (
        _read_streamlit_secret("GEMINI_CHAT_MODEL")
        or os.getenv("GEMINI_CHAT_MODEL", "gemini-2.5-flash").strip()
        or "gemini-2.5-flash"
    )


def get_embedding_model_name() -> str:
    return (
        _read_streamlit_secret("GEMINI_EMBEDDING_MODEL")
        or os.getenv("GEMINI_EMBEDDING_MODEL", "models/gemini-embedding-001").strip()
        or "models/gemini-embedding-001"
    )


def get_chroma_persist_dir() -> str:
    configured = os.getenv("CHROMA_PERSIST_DIR", "").strip()
    if configured:
        return configured
    return os.path.join(tempfile.gettempdir(), "paperwise_chroma_db")
