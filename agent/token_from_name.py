"""Extração do token a partir do nome do executável (sem dependências pesadas)."""
from __future__ import annotations

import os
import re
import sys
from typing import Optional

_TOKEN_EXE_RE = re.compile(r"(?i)TOKEN_(.+)\.exe$")


def extract_token_from_executable_name(argv0: Optional[str] = None) -> Optional[str]:
    """
    Extrai o token do nome do ficheiro (ex.: OlhoVivo_TOKEN_abc123.exe).
    Retorna None se o padrão não existir.
    """
    path = argv0 if argv0 is not None else sys.argv[0]
    base = os.path.basename(path)
    m = _TOKEN_EXE_RE.search(base)
    if not m:
        return None
    return m.group(1).strip()
