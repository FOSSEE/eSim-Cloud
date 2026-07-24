import os
import json
import re
import pathlib
import time
import chromadb
import requests

# This is where ChromaDB will persist its data on disk
CHROMA_DATA_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'chroma_data')
# Collection name for documents
COLLECTION_NAME = 'esim_docs'
# Chunking settings
CHUNK_SIZE_CHARS = 1800
CHUNK_OVERLAP_CHARS = 200
# Ollama embedding endpoint
OLLAMA_EMBED_URL = os.environ.get('OLLAMA_BASE_URL', 'http://host.docker.internal:11434') + '/api/embeddings'
# Model to use for embeddings
EMBED_MODEL = 'nomic-embed-text'
# Maximum retries for embedding requests
MAX_RETRIES = 3

def _build_docs_url(stem):
    parts = stem.split('_', 1)
    if len(parts) == 2:
        folder, page = parts[0], parts[1]
        if folder == 'eSim' and page.startswith('on_Cloud'):
            folder = 'eSim_on_Cloud'
            page = page[len('on_Cloud_'):]
        if page == 'index':
            return f"https://esim-cloud.readthedocs.io/en/latest/{folder}/"
        return f"https://esim-cloud.readthedocs.io/en/latest/{folder}/{page}.html"
    return "https://esim-cloud.readthedocs.io/"

def get_chroma_client():
    """Returns a chromadb.HttpClient connecting to the remote chromadb service."""
    print(f"ChromaDB data directory: {os.path.abspath(CHROMA_DATA_DIR)}")
    return chromadb.HttpClient(host='chromadb', port=8000)

def get_or_create_collection(client, reset=False):
    """
    Returns the ChromaDB collection with COLLECTION_NAME.
    If reset=True, deletes it first if it exists.
    """
    if reset:
        try:
            client.delete_collection(name=COLLECTION_NAME)
        except Exception:
            pass
    return client.get_or_create_collection(name=COLLECTION_NAME)

def chunk_text(text, source_title, source_url):
    """
    Splits text into chunks of CHUNK_SIZE_CHARS with CHUNK_OVERLAP_CHARS overlap.
    """
    # Strip all markdown heading markers (## ### ####) but keep the heading text
    text = re.sub(r'^#+\s+', '', text, flags=re.MULTILINE)
    
    chunks = []
    chunk_index = 0
    start = 0
    while start < len(text):
        end = min(start + CHUNK_SIZE_CHARS, len(text))
        chunk_str = text[start:end]
        
        if len(chunk_str.strip()) >= 50:
            chunks.append({
                'text': chunk_str,
                'title': source_title,
                'url': source_url,
                'chunk_index': chunk_index
            })
            chunk_index += 1
            
        if end >= len(text):
            break
        start += CHUNK_SIZE_CHARS - CHUNK_OVERLAP_CHARS
        
    return chunks

def embed_text(text):
    """
    Makes an HTTP POST request to OLLAMA_EMBED_URL with the text.
    # Requires: ollama pull nomic-embed-text on host machine
    """
    payload = {
        "model": EMBED_MODEL,
        "prompt": text
    }
    for attempt in range(MAX_RETRIES):
        try:
            res = requests.post(OLLAMA_EMBED_URL, json=payload, timeout=120)
            if res.status_code == 200:
                data = res.json()
                return data.get('embedding')
        except Exception as e:
            print(f"Embedding attempt {attempt+1} failed: {e}")
        if attempt < MAX_RETRIES - 1:
            time.sleep(2)
            
    print(f"Error: Failed to embed text after {MAX_RETRIES} attempts.")
    return None

def ingest_from_file(filepath, collection, verbose=False):
    """
    Reads a markdown file, chunks it, embeds it, and upserts into ChromaDB.
    Batches up to 50 chunks at a time.
    """
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        if verbose:
            print(f"Failed to read file {filepath}: {e}")
        return 0

    # Extract a title from the first # heading found (or uses the filename if no heading)
    title_match = re.search(r'^#\s+(.+)$', content, flags=re.MULTILINE)
    source_title = title_match.group(1).strip() if title_match else pathlib.Path(filepath).name
    source_url = _build_docs_url(pathlib.Path(filepath).stem)

    chunks = chunk_text(content, source_title, source_url)
    
    successful_chunks = 0
    batch_documents = []
    batch_embeddings = []
    batch_metadatas = []
    batch_ids = []
    
    filepath_stem = pathlib.Path(filepath).stem
    
    for chunk in chunks:
        emb = embed_text(chunk['text'])
        if emb is None:
            print(f"Warning: Failed to embed chunk {chunk['chunk_index']} of {filepath}")
            continue
            
        batch_documents.append(chunk['text'])
        batch_embeddings.append(emb)
        batch_metadatas.append({
            'title': chunk['title'],
            'url': chunk['url'],
            'chunk_index': chunk['chunk_index']
        })
        batch_ids.append(f"{filepath_stem}__chunk_{chunk['chunk_index']}")
        successful_chunks += 1
        
        if len(batch_documents) == 50:
            collection.upsert(
                documents=batch_documents,
                embeddings=batch_embeddings,
                metadatas=batch_metadatas,
                ids=batch_ids
            )
            batch_documents = []
            batch_embeddings = []
            batch_metadatas = []
            batch_ids = []

    if batch_documents:
        collection.upsert(
            documents=batch_documents,
            embeddings=batch_embeddings,
            metadatas=batch_metadatas,
            ids=batch_ids
        )
        
    return successful_chunks

def ingest_all(source_dir, collection, verbose=False):
    """
    Reads all .md files from source_dir and ingests them.
    """
    total_chunks = 0
    md_files = list(pathlib.Path(source_dir).glob('*.md'))
    for md_file in md_files:
        count = ingest_from_file(md_file, collection, verbose)
        total_chunks += count
        if verbose:
            print(f"Ingested {count} chunks from {md_file.name}")
    return total_chunks
