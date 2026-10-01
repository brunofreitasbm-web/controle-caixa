#!/usr/bin/env python3
"""Importa a meta diária (coluna "$ Meta Total") das planilhas de exportação
por loja (ex.: 9175.xlsx) para a tabela metas_diarias_lojas, que alimenta o
Meta Hora a Hora.

Reconhecimento (não depende de posição fixa):
  - Cabeçalho: primeira linha (até a 15ª) que tenha "Data" e "Meta Total".
  - Coluna da meta: cabeçalho que seja exatamente "$ Meta Total" (ignora
    "Meta D-1", "Meta Total Tíquetes" e "Meta Total TM"). Se não achar pelo
    nome, cai para a coluna G.
  - Coluna da data: cabeçalho "Data" (fallback: coluna A).
  - Loja: código (9175/4304/9201) no texto "Filtros aplicados" da planilha
    ou no nome do arquivo.
  - Linhas sem data válida (Total, rodapé, filtros) são ignoradas.

Uso:
  python scripts/importar_metas_diarias.py "C:/.../9175.xlsx"            # simula
  python scripts/importar_metas_diarias.py "C:/.../9175.xlsx" --aplicar  # grava no SQLite local
  python scripts/importar_metas_diarias.py a.xlsx b.xlsx --aplicar --api https://host   # grava via API
"""
import argparse
import json
import re
import sqlite3
import sys
import unicodedata
import urllib.request
import warnings
from datetime import date, datetime
from pathlib import Path

import openpyxl

warnings.filterwarnings("ignore")

LOJAS = {"9175": "Marambaia", "4304": "Icoaraci", "9201": "Mário Covas"}
RAIZ = Path(__file__).resolve().parent.parent


def norm(v):
    s = unicodedata.normalize("NFKD", str(v or ""))
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", s).strip().lower()


def para_data(v):
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, str):
        m = re.match(r"^\s*(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})\s*$", v)
        if m:
            d, mo, a = m.groups()
            a = "20" + a if len(a) == 2 else a
            return f"{a}-{int(mo):02d}-{int(d):02d}"
    return None


def para_valor(v):
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str) and v.strip():
        s = re.sub(r"[^\d,.\-]", "", v)
        if "," in s:
            s = s.replace(".", "").replace(",", ".")
        try:
            return float(s)
        except ValueError:
            return None
    return None


def detectar_loja(ws, caminho):
    textos = [str(c.value) for row in ws.iter_rows() for c in row if isinstance(c.value, str)]
    for t in textos + [Path(caminho).stem]:
        m = re.search(r"\b(9175|4304|9201)\b", t)
        if m:
            return m.group(1)
    return None


def ler_planilha(caminho, loja_cod=None):
    wb = openpyxl.load_workbook(caminho, data_only=True)
    ws = wb.worksheets[0]
    linhas = list(ws.iter_rows(values_only=True))

    cab = None
    for i, row in enumerate(linhas[:15]):
        n = [norm(c) for c in row]
        if "data" in n and any("meta total" in c for c in n):
            cab = i
            break
    if cab is None:
        idx_data, idx_meta, cab = 0, 6, 0  # fallback: colunas A e G
        aviso = "cabeçalho não reconhecido; usando colunas A e G"
    else:
        n = [norm(c) for c in linhas[cab]]
        idx_data = n.index("data")
        # só "$ meta total" puro: exclui "meta total tiquetes" e "meta total tm"
        exato = [i for i, c in enumerate(n) if c in ("$ meta total", "meta total")]
        if not exato:
            raise SystemExit(f"{caminho}: coluna '$ Meta Total' não encontrada.")
        idx_meta = exato[0]
        aviso = None
        if idx_meta != 6:
            aviso = f"'$ Meta Total' está na coluna {openpyxl.utils.get_column_letter(idx_meta + 1)}, não G"

    saida = {}
    for row in linhas[cab + 1:]:
        d = para_data(row[idx_data]) if len(row) > idx_data else None
        v = para_valor(row[idx_meta]) if len(row) > idx_meta else None
        if d and v is not None:
            saida[d] = round(v, 2)

    cod = loja_cod or detectar_loja(ws, caminho)
    return cod, [{"data": d, "valor": v, "origem": "diaria"} for d, v in sorted(saida.items())], aviso


def gravar_sqlite(db_path, loja, linhas):
    agora = datetime.utcnow().isoformat() + "Z"
    con = sqlite3.connect(db_path)
    con.executemany(
        """INSERT INTO metas_diarias_lojas (id, loja, data, valor, origem, criadoEm)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(loja, data) DO UPDATE SET valor = excluded.valor, origem = excluded.origem""",
        [(f"{loja}_{l['data']}", loja, l["data"], l["valor"], l["origem"], agora) for l in linhas],
    )
    con.commit()
    con.close()


def gravar_api(base, loja, linhas):
    req = urllib.request.Request(
        base.rstrip("/") + "/api/metas-lojas/importar",
        data=json.dumps({"loja": loja, "linhas": linhas}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("arquivos", nargs="+")
    ap.add_argument("--loja", choices=list(LOJAS), help="força o código da loja")
    ap.add_argument("--aplicar", action="store_true", help="grava (sem isso, só simula)")
    ap.add_argument("--api", help="URL base do servidor; sem isso grava no SQLite local")
    ap.add_argument("--db", default=str(RAIZ / "database.db"))
    args = ap.parse_args()

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    for arq in args.arquivos:
        cod, linhas, aviso = ler_planilha(arq, args.loja)
        if cod not in LOJAS:
            print(f"{arq}: loja não identificada — use --loja 9175|4304|9201")
            continue
        loja = LOJAS[cod]
        total = sum(l["valor"] for l in linhas)
        print(f"\n{Path(arq).name} → {loja} ({cod}): {len(linhas)} dias, {linhas[0]['data']} a {linhas[-1]['data']}, total R$ {total:,.2f}")
        if aviso:
            print(f"  ! {aviso}")
        for l in linhas:
            print(f"  {l['data']}  R$ {l['valor']:>10,.2f}")
        if not args.aplicar:
            print("  (simulação — nada gravado; use --aplicar)")
            continue
        if args.api:
            r = gravar_api(args.api, loja, linhas)
            print(f"  gravado via API: {r}")
        else:
            gravar_sqlite(args.db, loja, linhas)
            print(f"  gravado em {args.db}")


if __name__ == "__main__":
    main()
