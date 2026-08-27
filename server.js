const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const Database = require("better-sqlite3");

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "0.0.0.0";
const database = new Database(path.join(process.env.DATA_DIR || __dirname, "khotwa.sqlite"));
database.pragma("journal_mode = WAL");
database.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('shoes', 'shirts')),
    price_sar INTEGER NOT NULL CHECK (price_sar >= 0),
    image TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    items_json TEXT NOT NULL,
    subtotal_sdg INTEGER NOT NULL,
    discount_sdg INTEGER NOT NULL DEFAULT 0,
    delivery_fee_sdg INTEGER,
    payment_fee_sdg INTEGER NOT NULL DEFAULT 0,
    total_sdg INTEGER,
    delivery_area TEXT NOT NULL,
    delivery_rate REAL,
    payment_method TEXT NOT NULL,
    payment_details_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const productCount = database.prepare("SELECT COUNT(*) AS count FROM products").get().count;
if (!productCount) {
  const insert = database.prepare("INSERT INTO products (name, category, price_sar, image) VALUES (?, ?, ?, ?)");
  const seed = [
    ["حذاء ستيب أبيض", "shoes", 289, "https://images.unsplash.com/photo-1552346154-21d32810aba3?auto=format&fit=crop&w=700&q=80"],
    ["تيشرت أساسي أبيض", "shirts", 119, "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=700&q=80"],
    ["سنيكرز كلاسيك أسود", "shoes", 329, "https://images.unsplash.com/photo-1495555961986-6d4c1ecb7be3?auto=format&fit=crop&w=700&q=80"],
    ["تيشرت أوفر سايز أسود", "shirts", 99, "https://images.unsplash.com/photo-1583743814966-8936f37f4678?auto=format&fit=crop&w=700&q=80"],
    ["لوفر جلد بني", "shoes", 249, "https://images.unsplash.com/photo-1543508282-6319a3e2621f?auto=format&fit=crop&w=700&q=80"],
    ["حذاء جري فليكس", "shoes", 279, "https://images.unsplash.com/photo-1608231387042-66d1773070a5?auto=format&fit=crop&w=700&q=80"],
    ["تيشرت يومي بيج", "shirts", 129, "https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=700&q=80"],
    ["حذاء أبيض ستريت", "shoes", 299, "https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?auto=format&fit=crop&w=700&q=80"],
    ["تيشرت كاجوال أخضر", "shirts", 139, "https://images.unsplash.com/photo-1627225924765-552d49cf47ad?auto=format&fit=crop&w=700&q=80"]
  ];
  const seedProducts = database.transaction(() => seed.forEach(product => insert.run(...product)));
  seedProducts();
}

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", chunk => { body += chunk; if (body.length > 1_000_000) reject(new Error("Payload too large")); });
    request.on("end", () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error("Invalid JSON")); } });
    request.on("error", reject);
  });
}

const server = http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
    return response.end();
  }
  const url = new URL(request.url, `http://${request.headers.host}`);
  try {
    if (request.method === "GET" && url.pathname === "/api/products") {
      return json(response, 200, database.prepare("SELECT id, name, category, price_sar, image FROM products WHERE active = 1 ORDER BY id").all());
    }
    if (request.method === "POST" && url.pathname === "/api/orders") {
      const payload = await readBody(request);
      const required = ["customerName", "items", "delivery", "payment"];
      if (required.some(field => payload[field] === undefined) || !Array.isArray(payload.items) || !payload.items.length) return json(response, 400, { error: "بيانات الطلب غير مكتملة" });
      const statement = database.prepare(`
        INSERT INTO orders (customer_name, items_json, subtotal_sdg, discount_sdg, delivery_fee_sdg, payment_fee_sdg, total_sdg, delivery_area, delivery_rate, payment_method, payment_details_json)
        VALUES (@customerName, @items, @subtotal, @discount, @deliveryFee, @paymentFee, @total, @deliveryArea, @deliveryRate, @paymentMethod, @paymentDetails)
      `);
      const order = statement.run({
        customerName: String(payload.customerName).slice(0, 120),
        items: JSON.stringify(payload.items),
        subtotal: Number(payload.subtotal) || 0,
        discount: Number(payload.discount) || 0,
        deliveryFee: payload.deliveryFee == null ? null : Number(payload.deliveryFee),
        paymentFee: Number(payload.paymentFee) || 0,
        total: payload.total == null ? null : Number(payload.total),
        deliveryArea: String(payload.delivery.area || "other"),
        deliveryRate: payload.delivery.rate == null ? null : Number(payload.delivery.rate),
        paymentMethod: String(payload.payment.method || "unknown"),
        paymentDetails: JSON.stringify(payload.payment.details || {})
      });
      return json(response, 201, { id: order.lastInsertRowid, status: "pending" });
    }
    if (request.method === "GET" && url.pathname === "/api/orders") {
      const orders = database.prepare("SELECT * FROM orders ORDER BY id DESC").all().map(order => ({ ...order, items: JSON.parse(order.items_json), payment_details: JSON.parse(order.payment_details_json) }));
      return json(response, 200, orders);
    }
    if (request.method === "GET" && url.pathname === "/") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return response.end(fs.readFileSync(path.join(__dirname, "index.html")));
    }
    return json(response, 404, { error: "المسار غير موجود" });
  } catch (error) {
    console.error(error);
    return json(response, 500, { error: "حدث خطأ في الخادم" });
  }
});

server.listen(port, host, () => console.log(`Khotwa store running on ${host}:${port}`));
