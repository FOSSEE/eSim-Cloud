import os
import chromadb
from chatbotAPI.rag.ingest import get_chroma_client, get_or_create_collection, embed_text, COLLECTION_NAME

_chroma_client = None
_chroma_collection = None
# Note: Initialising this singleton once per process is acceptable.
# If the Django process restarts, these will simply be None again
# and will lazily re-initialise on the next request.

def _get_collection():
    global _chroma_client, _chroma_collection
    if _chroma_client is None or _chroma_collection is None:
        try:
            _chroma_client = get_chroma_client()
            _chroma_collection = get_or_create_collection(_chroma_client, reset=False)
        except Exception as e:
            print(f"WARNING: ChromaDB unavailable: {e}")
            return None
    return _chroma_collection

def retrieve(query, k=5):
    collection = _get_collection()
    if collection is None:
        return []

    query_embedding = embed_text(query)
    if query_embedding is None:
        return []

    if collection.count() == 0:
        return []

    try:
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=min(k, collection.count()),
            include=['documents', 'metadatas', 'distances']
        )
        
        parsed_results = []
        # Results are lists-of-lists because query supports multiple vectors. Take index [0]
        if not results.get('documents') or not results['documents'][0]:
            return []
            
        docs = results['documents'][0]
        
        for i in range(len(docs)):
            try:
                score = results['distances'][0][i]
            except Exception:
                score = 0.0
                
            try:
                meta = results['metadatas'][0][i] or {}
            except Exception:
                meta = {}
                
            parsed_results.append({
                    'text': docs[i],
                    'title': meta.get('title', 'eSim Documentation'),
                    'url': meta.get('url', ''),
                    'score': score
                })
        
        # Sort ascending by score (lower distance = more relevant)
        parsed_results.sort(key=lambda x: x['score'])
        return parsed_results
        
    except Exception as e:
        print(f"Error during ChromaDB retrieve: {e}")
        return []
