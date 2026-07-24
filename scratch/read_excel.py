import openpyxl
import sys

sys.stdout.reconfigure(encoding='utf-8')
wb = openpyxl.load_workbook('Acompanhamento_Metas_Diarias_Circuito.xlsx')
sheet = wb.active

print("=== TOP 15 ROWS OF ACOMPANHAMENTO METAS DIARIAS CIRCUITO ===")
for r in range(1, 20):
    vals = [sheet.cell(row=r, column=c).value for c in range(1, 15)]
    print(f"Row {r}: {vals}")
