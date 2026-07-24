import os
from django.core.management.base import BaseCommand
from chatbotAPI.rag.ingest import get_chroma_client, get_or_create_collection, ingest_all, COLLECTION_NAME

class Command(BaseCommand):
    help = 'Chunk and embed eSim documentation into ChromaDB for RAG retrieval'

    def add_arguments(self, parser):
        parser.add_argument(
            '--reset',
            action='store_true',
            help='Delete and recreate the ChromaDB collection before ingesting'
        )
        parser.add_argument(
            '--verbose',
            action='store_true',
            help='Print detailed progress per chunk'
        )

    def handle(self, *args, **options):
        source_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'rag', 'source')
        
        self.stdout.write("Initialising ChromaDB client...")
        client = get_chroma_client()
        collection = get_or_create_collection(client, reset=options['reset'])
        
        if options['reset']:
            self.stdout.write("Collection reset complete.")
            
        self.stdout.write(f"Reading markdown files from {source_dir} ...")
        
        if not os.path.exists(source_dir):
            self.stdout.write(self.style.ERROR(f"ERROR: source directory not found at {source_dir}. Please create it and add .md files."))
            return
            
        md_files = [f for f in os.listdir(source_dir) if f.endswith('.md')]
        if len(md_files) == 0:
            self.stdout.write(self.style.WARNING("WARNING: No .md files found in source directory. Add documentation files and re-run. Collection has been reset/cleared but contains 0 chunks."))
            return
            
        total = ingest_all(source_dir, collection, verbose=options['verbose'])
        self.stdout.write(f"Ingest complete. {total} chunks stored in ChromaDB collection '{COLLECTION_NAME}'.")
        self.stdout.write(f"Collection now contains {collection.count()} total chunks.")
