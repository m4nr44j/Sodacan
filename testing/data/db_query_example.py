# db_query_example.py

def load_users(conn):
    sql = "SELECT id, name FROM users WHERE active = 1"
    cur = conn.cursor()
    cur.execute(sql)
    return cur.fetchall() 