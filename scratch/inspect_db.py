import sqlite3

def check_db(dbname):
    print(f"=== {dbname} ===")
    conn = sqlite3.connect(dbname)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [t[0] for t in cursor.fetchall()]
    for t in tables:
        cursor.execute(f"PRAGMA table_info({t})")
        cols = [c[1] for c in cursor.fetchall()]
        
        # See if there are columns related to loja/store or if we have rows with '9175'
        has_loja = any(c.lower() in ('loja', 'unidade', 'store', 'cod_loja') for c in cols)
        
        cursor.execute(f"SELECT count(*) FROM {t}")
        cnt = cursor.fetchone()[0]
        
        print(f"Table: {t} | Rows: {cnt} | Columns: {cols}")
        
        if cnt > 0 and has_loja:
            # check if 9175 is in there
            loja_col = [c for c in cols if c.lower() in ('loja', 'unidade', 'store', 'cod_loja')][0]
            cursor.execute(f"SELECT count(*) FROM {t} WHERE {loja_col} = '9175' OR {loja_col} = 9175")
            loja_cnt = cursor.fetchone()[0]
            print(f"  -> Rows for 9175: {loja_cnt}")
            if loja_cnt > 0:
                cursor.execute(f"SELECT * FROM {t} WHERE {loja_col} = '9175' OR {loja_col} = 9175 LIMIT 3")
                print("  -> Sample rows:", cursor.fetchall())

check_db('database.db')
check_db('controle_caixa.db')
