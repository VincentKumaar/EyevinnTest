import express from "express";
import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "menu.db");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const db = new sqlite3.Database(dbPath);

const runQuery = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function runResult(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this);
    });
  });

const getQuery = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });

const initializeDb = async () => {
  await runQuery(
    "CREATE TABLE IF NOT EXISTS menus (id INTEGER PRIMARY KEY AUTOINCREMENT, appetizer TEXT NOT NULL, main TEXT NOT NULL, dessert TEXT NOT NULL, created_at TEXT NOT NULL)"
  );
};

app.get("/api/menu", async (req, res) => {
  try {
    const menu = await getQuery(
      "SELECT appetizer, main, dessert, created_at FROM menus ORDER BY id DESC LIMIT 1"
    );
    if (!menu) {
      res.json({ appetizer: "", main: "", dessert: "", created_at: null });
      return;
    }
    res.json(menu);
  } catch (error) {
    res.status(500).json({ error: "Failed to load menu." });
  }
});

app.post("/api/menu", async (req, res) => {
  const { appetizer, main, dessert } = req.body;
  if (!appetizer || !main || !dessert) {
    res.status(400).json({ error: "All fields are required." });
    return;
  }
  try {
    const createdAt = new Date().toISOString();
    await runQuery(
      "INSERT INTO menus (appetizer, main, dessert, created_at) VALUES (?, ?, ?, ?)",
      [appetizer, main, dessert, createdAt]
    );
    res.json({ appetizer, main, dessert, created_at: createdAt });
  } catch (error) {
    res.status(500).json({ error: "Failed to save menu." });
  }
});

initializeDb().then(() => {
  app.listen(port, () => {
    console.log(`Menu Maker app running on http://localhost:${port}`);
  });
});
