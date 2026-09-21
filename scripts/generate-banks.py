"""Generate the static bank list from the public Cartao BNDES reference."""

from __future__ import annotations

import html
import json
import re
import sys
import urllib.request
from pathlib import Path


SOURCE_URL = (
    "https://www.cartaobndes.gov.br/cartaobndes/paginascartao/"
    "Fornecedor_PopUp.asp?Papel=1&Acao=AFILLB&Cod=1546325"
)


def clean(value: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", "", value)).split())


def main() -> None:
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "src/data/banks.json")
    request = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "SABE-2026/1.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        source = response.read().decode("latin-1")

    pairs = re.findall(
        r"<TD[^>]*>(\d+)</TD>\s*<TD[^>]*>(.*?)</TD>",
        source,
        flags=re.IGNORECASE | re.DOTALL,
    )
    banks: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for code, name in pairs:
        item = (code.zfill(3), clean(name))
        if item in seen:
            continue
        seen.add(item)
        banks.append({"codigo": item[0], "nome": item[1]})

    banks.sort(key=lambda item: item["nome"].casefold())
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(banks, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {len(banks)} banks in {target}")


if __name__ == "__main__":
    main()
