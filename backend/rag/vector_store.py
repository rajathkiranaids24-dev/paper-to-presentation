import os
from typing import Any, Dict, List
import chromadb
from chromadb.config import Settings
from rag.embeddings import PaperwiseEmbeddingProvider


class PaperwiseChromaStore:
    """Manages document-isolated ChromaDB persistent collections."""

    def __init__(self) -> None:
        persist_dir = os.getenv("CHROMA_PERSIST_DIR", "./chroma_db")
        os.makedirs(persist_dir, exist_ok=True)
        self.client = chromadb.PersistentClient(
            path=persist_dir,
            settings=Settings(anonymized_telemetry=False),
        )
        self.embedder = PaperwiseEmbeddingProvider()

    @staticmethod
    def collection_name_for(document_id: str) -> str:
        safe = "".join(c for c in document_id if c.isalnum() or c in ("_", "-"))
        return f"paperwise_collection_{safe}"

    def index_chunks(self, document_id: str, chunks: List[Dict[str, Any]]) -> str:
        col_name = self.collection_name_for(document_id)
        try:
            self.client.delete_collection(col_name)
        except Exception:
            pass

        collection = self.client.create_collection(
            name=col_name,
            metadata={"hnsw:space": "cosine", "document_id": document_id},
        )
        texts = [c["text"] for c in chunks]
        embeddings = self.embedder.embed_documents(texts)
        ids = [c["id"] for c in chunks]
        metadatas = [
            {
                "document_id": document_id,
                "page_number": int(c["page_number"]),
                "chunk_index": int(c["chunk_index"]),
                "section_hint": str(c["section_hint"]),
            }
            for c in chunks
        ]
        collection.add(ids=ids, documents=texts, embeddings=embeddings, metadatas=metadatas)
        return col_name

    def query(self, document_id: str, query_text: str, top_k: int = 5) -> Dict[str, Any]:
        col_name = self.collection_name_for(document_id)
        collection = self.client.get_collection(col_name)
        total_chunks = collection.count()

        if not query_text.strip():
            peek = collection.get(limit=top_k, include=["documents", "metadatas"])
            chunks = []
            for idx, doc_text in enumerate(peek.get("documents", [])):
                meta = (peek.get("metadatas") or [{}])[idx]
                chunks.append({
                    "id": peek["ids"][idx],
                    "document_id": document_id,
                    "chunk_index": meta.get("chunk_index", idx),
                    "page_number": meta.get("page_number", 1),
                    "section_hint": meta.get("section_hint", "Body"),
                    "text": doc_text,
                    "score": 1.0,
                })
            return {
                "collection_name": col_name,
                "total_chunks": total_chunks,
                "embedding_model": self.embedder.model_name,
                "chunks": chunks,
            }

        query_vec = self.embedder.embed_query(query_text)
        results = collection.query(
            query_embeddings=[query_vec],
            n_results=min(top_k, max(1, total_chunks)),
            include=["documents", "metadatas", "distances"],
        )

        chunks = []
        docs = (results.get("documents") or [[]])[0]
        metas = (results.get("metadatas") or [[]])[0]
        dists = (results.get("distances") or [[]])[0]
        ids = (results.get("ids") or [[]])[0]

        for idx, text in enumerate(docs):
            meta = metas[idx]
            # Chroma cosine distance = 1 - cosine_similarity
            similarity = max(0.0, min(1.0, 1.0 - float(dists[idx])))
            chunks.append({
                "id": ids[idx],
                "document_id": document_id,
                "chunk_index": meta.get("chunk_index", idx),
                "page_number": meta.get("page_number", 1),
                "section_hint": meta.get("section_hint", "Body"),
                "text": text,
                "score": round(similarity, 4),
            })

        return {
            "collection_name": col_name,
            "total_chunks": total_chunks,
            "embedding_model": self.embedder.model_name,
            "chunks": chunks,
        }

    def delete_document(self, document_id: str) -> None:
        col_name = self.collection_name_for(document_id)
        try:
            self.client.delete_collection(col_name)
        except Exception:
            pass
