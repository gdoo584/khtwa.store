import json
import os
import sqlite3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get("DATA_DIR", ROOT)
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "khotwa.sqlite")

PRODUCTS = [
    ("حذاء ستيب أبيض", "shoes", 289, "https://images.unsplash.com/photo-1552346154-21d32810aba3?auto=format&fit=crop&w=700&q=80"),
    ("تيشرت أساسي أبيض", "shirts", 119, "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=700&q=80"),
    ("سنيكرز كلاسيك أسود", "shoes", 329, "https://images.unsplash.com/photo-1495555961986-6d4c1ecb7be3?auto=format&fit=crop&w=700&q=80"),
    ("تيشرت نسائي وردي", "women", 129, "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=700&q=80"),
    ("تيشرت نسائي كلاسيك", "women", 139, "https://images.unsplash.com/photo-1506629905607-d9c297d95d0a?auto=format&fit=crop&w=700&q=80"),
    ("تيشرت نسائي أسود", "women", 149, "https://images.unsplash.com/photo-1485968579580-b6d095142e6e?auto=format&fit=crop&w=700&q=80"),
]

def connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

with connection() as db:
    db.executescript("""
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
            category TEXT NOT NULL, price_sar INTEGER NOT NULL, image TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT, customer_name TEXT NOT NULL,
            items_json TEXT NOT NULL, subtotal_sdg INTEGER NOT NULL, discount_sdg INTEGER NOT NULL DEFAULT 0,
            delivery_fee_sdg INTEGER, payment_fee_sdg INTEGER NOT NULL DEFAULT 0, total_sdg INTEGER,
            delivery_area TEXT NOT NULL, delivery_rate REAL, payment_method TEXT NOT NULL,
            payment_details_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    """)
    if db.execute("SELECT COUNT(*) FROM products").fetchone()[0] == 0:
        db.executemany("INSERT INTO products (name, category, price_sar, image) VALUES (?, ?, ?, ?)", PRODUCTS)

class Handler(SimpleHTTPRequestHandler):
    def end_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/api/products":
            with connection() as db:
                rows = db.execute("SELECT id, name, category, price_sar, image FROM products WHERE active=1 ORDER BY id").fetchall()
            return self.end_json(200, [dict(row) for row in rows])
        if self.path == "/api/orders":
            with connection() as db:
                rows = db.execute("SELECT * FROM orders ORDER BY id DESC").fetchall()
            result = []
            for row in rows:
                item = dict(row)
                item["items"] = json.loads(item.pop("items_json"))
                item["payment_details"] = json.loads(item.pop("payment_details_json"))
                result.append(item)
            return self.end_json(200, result)
        return super().do_GET()

    def do_POST(self):
        if self.path != "/api/orders":
            return self.end_json(404, {"error": "المسار غير موجود"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length))
            if not payload.get("customerName") or not payload.get("items") or not payload.get("delivery") or not payload.get("payment"):
                return self.end_json(400, {"error": "بيانات الطلب غير مكتملة"})
            with connection() as db:
                cursor = db.execute("""
                    INSERT INTO orders (customer_name, items_json, subtotal_sdg, discount_sdg,
                    delivery_fee_sdg, payment_fee_sdg, total_sdg, delivery_area, delivery_rate,
                    payment_method, payment_details_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    str(payload["customerName"])[:120], json.dumps(payload["items"], ensure_ascii=False),
                    int(payload.get("subtotal") or 0), int(payload.get("discount") or 0),
                    payload.get("deliveryFee"), int(payload.get("paymentFee") or 0), payload.get("total"),
                    payload["delivery"].get("area", "other"), payload["delivery"].get("rate"),
                    payload["payment"].get("method", "unknown"),
                    json.dumps(payload["payment"].get("details", {}), ensure_ascii=False)
                ))
                order_id = cursor.lastrowid
            return self.end_json(201, {"id": order_id, "status": "pending"})
        except (ValueError, TypeError, json.JSONDecodeError):
            return self.end_json(400, {"error": "بيانات الطلب غير صالحة"})

os.chdir(ROOT)
port = int(os.environ.get("PORT", "3000"))
server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
print(f"Khotwa store: http://localhost:{port}")
server.serve_forever()
