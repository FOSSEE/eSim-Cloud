from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser
from rest_framework import status

from saveAPI.spice_parser import convert_spice


class SpiceImportView(APIView):
    parser_classes = [MultiPartParser]

    def post(self, request):
        upload = request.FILES.get('file')
        if not upload:
            return Response({'status': 'error', 'errors': ['No file uploaded']},
                            status=status.HTTP_400_BAD_REQUEST)

        name = upload.name.lower()
        if not name.endswith(('.cir', '.net', '.asc')):
            return Response({'status': 'error', 'errors': ['Only .cir/.net/.asc allowed']},
                            status=status.HTTP_400_BAD_REQUEST)

        text = upload.read().decode('utf-8', errors='ignore')

        try:
            result = convert_spice(text)
        except Exception as e:
            return Response({'status': 'error', 'filename': upload.name,
                             'errors': ['Parser failed: ' + str(e)]},
                            status=status.HTTP_400_BAD_REQUEST)

        cleaned = [l for l in text.splitlines() if l.strip()]
        return Response({
            'status': 'ok',
            'filename': upload.name,
            'line_count': len(cleaned),
            'component_count': len(result.get('components', [])),
            'components': result.get('components', []),
            'netlist': result.get('netlist', ''),
            'errors': result.get('errors', []),
        })
