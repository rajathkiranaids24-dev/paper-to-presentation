from typing import List, Optional
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from backend.utils.config import (
    get_embedding_api_model_name,
    get_gemini_api_key,
    resolve_embedding_model_name,
)


class PaperwiseEmbeddingProvider:
    """Provides dense embeddings using the centralized Gemini embedding model (gemini-embedding-001)."""

    def __init__(self, model_name: Optional[str] = None) -> None:
        api_key = get_gemini_api_key()
        self.model_name = resolve_embedding_model_name(model_name)
        self.api_model_name = get_embedding_api_model_name(self.model_name)
        self._gemini_embeddings = GoogleGenerativeAIEmbeddings(
            model=self.api_model_name,
            google_api_key=api_key,
        )

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
        try:
            batch_size = 32
            all_vectors: List[List[float]] = []
            for i in range(0, len(texts), batch_size):
                batch = texts[i : i + batch_size]
                vectors = self._gemini_embeddings.embed_documents(batch)
                if len(vectors) != len(batch):
                    raise RuntimeError(
                        f"Embedding count mismatch: expected {len(batch)}, received {len(vectors)}."
                    )
                all_vectors.extend(vectors)
            return all_vectors
        except Exception as exc:
            raise RuntimeError(
                f"Gemini embedding generation failed ({self.model_name}): {exc}"
            ) from exc

    def embed_query(self, query: str) -> List[float]:
        try:
            return self._gemini_embeddings.embed_query(query)
        except Exception as exc:
            raise RuntimeError(
                f"Gemini query embedding failed ({self.model_name}): {exc}"
            ) from exc
