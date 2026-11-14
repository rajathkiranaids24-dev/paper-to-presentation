from typing import List
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from backend.utils.config import get_embedding_model_name, get_gemini_api_key


class PaperwiseEmbeddingProvider:
    """Provides dense embeddings using a supported Gemini embedding model (gemini-embedding-001)."""

    def __init__(self) -> None:
        api_key = get_gemini_api_key()
        self.model_name = get_embedding_model_name()
        if not self.model_name.startswith("models/"):
            self.model_name = f"models/{self.model_name}"

        self._gemini_embeddings = GoogleGenerativeAIEmbeddings(
            model=self.model_name,
            google_api_key=api_key,
        )

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
        try:
            # Batch in safe chunks to respect API payload limits
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
