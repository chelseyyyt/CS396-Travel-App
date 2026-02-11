import json
import sys
from pathlib import Path

from ollama_extractor import extract_with_ollama


def main() -> None:
    if len(sys.argv) < 2:
        print('Usage: python scripts/ollama_harness.py path/to/transcript.json')
        sys.exit(1)

    path = Path(sys.argv[1])
    transcript = json.loads(path.read_text())
    result = extract_with_ollama(transcript, None)
    if result.error:
        print('OLLAMA ERROR:', result.error)
    print('Segment count sent:', result.segment_count)
    print('Raw output:\n', result.output_raw)
    if result.output_json:
        print('Parsed candidates:', json.dumps(result.output_json, indent=2))


if __name__ == '__main__':
    main()
