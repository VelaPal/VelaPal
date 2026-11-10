"""Bounded subprocess for untrusted PDF extraction (stdin bytes, stdout JSON)."""
import io
import json
import sys


def main():
    try:
        try:
            import resource
            resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024,) * 2)
            resource.setrlimit(resource.RLIMIT_CPU, (10, 10))
        except ImportError:
            pass  # Windows: parent still enforces wall timeout and input/output limits.
        from pypdf import PdfReader
        raw = sys.stdin.buffer.read(5 * 1024 * 1024 + 1)
        if len(raw) > 5 * 1024 * 1024:
            raise ValueError("PDF exceeds 5 MB")
        reader = PdfReader(io.BytesIO(raw), strict=True)
        if reader.is_encrypted or not 1 <= len(reader.pages) <= 5:
            raise ValueError("Encrypted PDF or page count outside 1..5")
        pages = []
        for i, page in enumerate(reader.pages, 1):
            text = page.extract_text() or ""
            if len(text) > 10000:
                raise ValueError("PDF page exceeds the MVP text limit")
            pages.append({"locator": f"page:{i}", "text": text})
        print(json.dumps({"pages": pages}))
    except Exception:
        print(json.dumps({"error": "PDF_UNREADABLE_OR_LIMIT_EXCEEDED"}))
        raise SystemExit(2)


if __name__ == "__main__":
    main()
