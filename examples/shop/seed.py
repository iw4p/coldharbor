"""Builds examples/shop/shop.db: a small made-up shop to try ColdHarbor with the SQLite MCP server.

    python3 examples/shop/seed.py

Customers live in real cities (with coordinates, so maps work), products have categories and prices,
and there are six months of orders with statuses. Seeded, so every run makes the same data.
"""
import random
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

random.seed(7)
DB = Path(__file__).with_name("shop.db")
DB.unlink(missing_ok=True)

CITIES = [
    ("Berlin", "Germany", 52.52, 13.40), ("Vienna", "Austria", 48.21, 16.37), ("Paris", "France", 48.86, 2.35),
    ("London", "United Kingdom", 51.51, -0.13), ("Madrid", "Spain", 40.42, -3.70), ("Rome", "Italy", 41.90, 12.50),
    ("Amsterdam", "Netherlands", 52.37, 4.90), ("Stockholm", "Sweden", 59.33, 18.07), ("Warsaw", "Poland", 52.23, 21.01),
    ("Istanbul", "Turkey", 41.01, 28.98), ("Tehran", "Iran", 35.69, 51.39), ("Dubai", "United Arab Emirates", 25.20, 55.27),
    ("New York", "United States", 40.71, -74.01), ("Toronto", "Canada", 43.65, -79.38), ("Tokyo", "Japan", 35.68, 139.69),
    ("Sydney", "Australia", -33.87, 151.21), ("São Paulo", "Brazil", -23.55, -46.63),
]
FIRST = ["Anna", "Omid", "Lena", "Marco", "Sara", "Yuki", "Liam", "Nora", "Ali", "Chloe", "Mateo", "Ines", "Kai", "Mina", "Jonas", "Leila"]
LAST = ["Berg", "Karimi", "Rossi", "Müller", "Dubois", "Tanaka", "Smith", "Nowak", "Silva", "Haddad", "Jansen", "Garcia"]
PRODUCTS = [
    ("Trail Running Shoes", "Shoes", 129.0), ("City Sneakers", "Shoes", 89.0), ("Rain Jacket", "Clothing", 159.0),
    ("Merino T-Shirt", "Clothing", 49.0), ("Wool Beanie", "Accessories", 25.0), ("Daypack 20L", "Bags", 79.0),
    ("Travel Duffel", "Bags", 119.0), ("Insulated Bottle", "Accessories", 32.0), ("Headlamp", "Gear", 45.0),
    ("Camping Stove", "Gear", 99.0), ("Sleeping Bag", "Gear", 189.0), ("Sunglasses", "Accessories", 69.0),
]
STATUSES = ["pending", "shipped", "delivered", "returned"]

db = sqlite3.connect(DB)
db.executescript("""
CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT, city TEXT, country TEXT, latitude REAL, longitude REAL, joined_at TEXT);
CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, category TEXT, price REAL);
CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER REFERENCES customers(id), product_id INTEGER REFERENCES products(id),
                     quantity INTEGER, total REAL, status TEXT, created_at TEXT);
""")

now = datetime(2026, 9, 26, tzinfo=timezone.utc)
for i in range(1, 61):
    city, country, lat, lon = random.choice(CITIES)
    joined = now - timedelta(days=random.randint(30, 700))
    db.execute("INSERT INTO customers VALUES (?,?,?,?,?,?,?)",
               (i, f"{random.choice(FIRST)} {random.choice(LAST)}", city, country, lat, lon, joined.date().isoformat()))
for i, (name, cat, price) in enumerate(PRODUCTS, 1):
    db.execute("INSERT INTO products VALUES (?,?,?,?)", (i, name, cat, price))

for i in range(1, 601):
    days_ago = random.randint(0, 180)
    created = now - timedelta(days=days_ago, hours=random.randint(0, 23))
    pid = random.randint(1, len(PRODUCTS))
    qty = random.choice([1, 1, 1, 2, 2, 3])
    # Recent orders are more likely still on their way.
    status = random.choice(["pending", "shipped"]) if days_ago < 5 else random.choices(STATUSES, [1, 3, 20, 2])[0]
    db.execute("INSERT INTO orders VALUES (?,?,?,?,?,?,?)",
               (i, random.randint(1, 60), pid, qty, round(PRODUCTS[pid - 1][2] * qty, 2), status, created.isoformat()))

db.commit()
print(f"wrote {DB} · 60 customers · {len(PRODUCTS)} products · 600 orders")
