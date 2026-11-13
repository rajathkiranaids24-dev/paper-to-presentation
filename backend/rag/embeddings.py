import os
from typing import List
from langchain_google_genai import GoogleGenerativeAIEmbeddings


class PaperwiseEmbeddingProvider:
    """Provides dense embeddings using Google Gemini or local Sentence Transformers."""

    def __init__(self) -> None:
        self.backend = os.getenv("EMBEDDING_BACKEND", "gemini").lower()
        if self.backend == "sentence-transformers":
            from sentence_transformers import SentenceTransformer

            model_name = os.getenv("SENTENCE_TRANSFORMER_MODEL", "all-MiniLM-L6-v2")
            self._st_model = SentenceTransformer(model_name)
            self._gemini_embeddings = None
            self.model_name = model_name
        else:
            api_key = os.getenv("GEMINI_API_KEY", "")
            if not api_key:
                raise RuntimeError("GEMINI_API_KEY is required when EMBEDDING_BACKEND=gemini.")
            self._gemini_embeddings = GoogleGenerativeAIEmbeddings(
                model="models/text-embedding-004",
                google_api_key=api_key,
            )
            self._st_model = None
            self.model_name = "models/text-embedding-004"

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        if self._st_model is not None:
            return self._st_model.encode(texts, normalize_embeddings=True).tolist()
        assert self._gemini_embeddings is not None
        return self._gemini_embeddings.embed_documents(texts)

    def embed_query(self, query: str) -> List[float]:
        if self._st_model is not None:
            return self._st_model.encode([query], normalize_embeddings=True)[0].tolist()
        assert self._gemini_embeddings is not None
        return self._gemini_embeddings.embed_query(query)
