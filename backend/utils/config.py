import os
import tempfile
from typing import Optional

from langchain_google_genai import ChatGoogleGenerativeAI

# Central Gemini Model Configuration
GEMINI_CHAT_MODEL = "gemini-3.8-flash"
GEMINI_EMBEDDING_MODEL = "gemini-embedding-001"

_DEPRECATED_CHAT_MODELS = {
    "gemini-2.5-flash",
    "models/gemini-2.5-flash",
    "gemini-2.5-pro",
    "models/gemini-2.5-pro",
    "gemini-2.0-flash",
    "models/gemini-2.0-flash",
    "gemini-2.0-pro",
    "models/gemini-2.0-pro",
    "gemini-1.5-flash",
    "models/gemini-1.5-flash",
    "gemini-1.5-pro",
    "models/gemini-1.5-pro",
    "gemini-pro",
    "models/gemini-pro",
}

_DEPRECATED_EMBEDDING_MODELS = {
    "text-embedding-004",
    "models/text-embedding-004",
    "embedding-001",
    "models/embedding-001",
}


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
    """Resolve GEMINI_API_KEY securely from st.secrets first, then environment variables."""
    secret_val = _read_streamlit_secret("GEMINI_API_KEY")
    if secret_val and secret_val != "MY_GEMINI_API_KEY":
        return secret_val

    env_val = os.getenv("GEMINI_API_KEY", "").strip()
    if env_val and env_val != "MY_GEMINI_API_KEY":
        return env_val

    raise RuntimeError(
        "GEMINI_API_KEY is not configured. Add GEMINI_API_KEY in Streamlit Cloud Secrets "
        '(Settings -> Secrets -> GEMINI_API_KEY = "...") or in .streamlit/secrets.toml.'
    )


def has_gemini_api_key() -> bool:
    try:
        return bool(get_gemini_api_key())
    except RuntimeError:
        return False


def resolve_chat_model_name(candidate: Optional[str] = None) -> str:
    """Return a valid supported Gemini chat model, rejecting deprecated/unavailable names."""
    raw = (
        (candidate or "").strip()
        or (_read_streamlit_secret("GEMINI_CHAT_MODEL") or "")
        or os.getenv("GEMINI_CHAT_MODEL", "").strip()
    )
    if not raw or raw.lower() in _DEPRECATED_CHAT_MODELS or "embedding" in raw.lower():
        return GEMINI_CHAT_MODEL
    if raw.startswith("models/"):
        return raw[len("models/") :]
    return raw


def get_chat_model_name() -> str:
    return resolve_chat_model_name()


def resolve_embedding_model_name(candidate: Optional[str] = None) -> str:
    """Return a valid supported Gemini embedding model; never returns a chat or deprecated model."""
    raw = (
        (candidate or "").strip()
        or (_read_streamlit_secret("GEMINI_EMBEDDING_MODEL") or "")
        or os.getenv("GEMINI_EMBEDDING_MODEL", "").strip()
    )
    if not raw or raw.lower() in _DEPRECATED_EMBEDDING_MODELS or "embedding" not in raw.lower():
        return GEMINI_EMBEDDING_MODEL
    if raw.startswith("models/"):
        return raw[len("models/") :]
    return raw


def get_embedding_model_name() -> str:
    return resolve_embedding_model_name()


def get_embedding_api_model_name(candidate: Optional[str] = None) -> str:
    """Return embedding model name formatted with 'models/' prefix for google-generativeai compatibility."""
    clean = resolve_embedding_model_name(candidate)
    return clean if clean.startswith("models/") else f"models/{clean}"


def get_chat_llm(
    model_name: Optional[str] = None,
    temperature: float = 0.2,
) -> ChatGoogleGenerativeAI:
    """Central factory for ChatGoogleGenerativeAI used by all agents and services."""
    api_key = get_gemini_api_key()
    chosen_model = resolve_chat_model_name(model_name)
    return ChatGoogleGenerativeAI(
        model=chosen_model,
        google_api_key=api_key,
        temperature=temperature,
    )


def get_chroma_persist_dir() -> str:
    configured = os.getenv("CHROMA_PERSIST_DIR", "").strip()
    if configured:
        return configured
    return os.path.join(tempfile.gettempdir(), "paperwise_chroma_db")
