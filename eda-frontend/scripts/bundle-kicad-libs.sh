#!/bin/sh
# Rebuild the bundled standard symbol library used by the legacy .sch importer.
# Concatenates every KiCad legacy .lib the backend seeds its component DB from;
# parseLegacyLib ignores the repeated file headers, so plain concatenation works.
# Run from eda-frontend/: sh scripts/bundle-kicad-libs.sh
set -e
BACKEND_LIBS="../esim-cloud-backend/kicad-symbols"
OUT="public/kicad-libs/standard.lib"
cat "$BACKEND_LIBS"/default/*.lib "$BACKEND_LIBS"/additional/*.lib > "$OUT"
echo "wrote $OUT ($(wc -c < "$OUT") bytes, $(grep -c '^DEF ' "$OUT") symbols)"
