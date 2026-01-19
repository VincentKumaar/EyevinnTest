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

const allQuery = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });

const ensureColumn = async (table, column, definition) => {
  const columns = await allQuery(`PRAGMA table_info(${table})`);
  const exists = columns.some((item) => item.name === column);
  if (!exists) {
    await runQuery(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
};

const initializeDb = async () => {
  await runQuery(
    "CREATE TABLE IF NOT EXISTS menus (id INTEGER PRIMARY KEY AUTOINCREMENT, appetizer TEXT NOT NULL, main TEXT NOT NULL, dessert TEXT NOT NULL, appetizer_ingredients TEXT NOT NULL DEFAULT '[]', main_ingredients TEXT NOT NULL DEFAULT '[]', dessert_ingredients TEXT NOT NULL DEFAULT '[]', base_servings INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)"
  );
  await ensureColumn("menus", "appetizer_ingredients", "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn("menus", "main_ingredients", "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn("menus", "dessert_ingredients", "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn("menus", "base_servings", "INTEGER NOT NULL DEFAULT 1");
};

app.get("/api/menu", async (req, res) => {
  try {
    const menu = await getQuery(
      "SELECT id, appetizer, main, dessert, appetizer_ingredients, main_ingredients, dessert_ingredients, base_servings, created_at FROM menus ORDER BY id DESC LIMIT 1"
    );
    if (!menu) {
      res.json({
        id: null,
        appetizer: "",
        main: "",
        dessert: "",
        appetizer_ingredients: "[]",
        main_ingredients: "[]",
        dessert_ingredients: "[]",
        base_servings: 1,
        created_at: null,
      });
      return;
    }
    res.json(menu);
  } catch (error) {
    res.status(500).json({ error: "Failed to load menu." });
  }
});

app.get("/api/menus", async (req, res) => {
  try {
    const menus = await allQuery(
      "SELECT id, appetizer, main, dessert, base_servings, created_at FROM menus ORDER BY id DESC"
    );
    res.json(menus);
  } catch (error) {
    res.status(500).json({ error: "Failed to load menus." });
  }
});

app.get("/api/menus/:id", async (req, res) => {
  try {
    const menu = await getQuery(
      "SELECT id, appetizer, main, dessert, appetizer_ingredients, main_ingredients, dessert_ingredients, base_servings, created_at FROM menus WHERE id = ?",
      [req.params.id]
    );
    if (!menu) {
      res.status(404).json({ error: "Menu not found." });
      return;
    }
    res.json(menu);
  } catch (error) {
    res.status(500).json({ error: "Failed to load menu." });
  }
});

app.delete("/api/menus/:id", async (req, res) => {
  try {
    const result = await runQuery("DELETE FROM menus WHERE id = ?", [
      req.params.id,
    ]);
    if (result.changes === 0) {
      res.status(404).json({ error: "Menu not found." });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete menu." });
  }
});

app.post("/api/menus", async (req, res) => {
  const {
    appetizer,
    main,
    dessert,
    appetizer_ingredients,
    main_ingredients,
    dessert_ingredients,
    base_servings,
  } = req.body;
  if (!appetizer || !main || !dessert) {
    res.status(400).json({ error: "All fields are required." });
    return;
  }
  try {
    const createdAt = new Date().toISOString();
    const baseServings = Number.isFinite(Number(base_servings))
      ? Math.max(1, Number(base_servings))
      : 1;
    const appetizerIngredients = JSON.stringify(appetizer_ingredients || []);
    const mainIngredients = JSON.stringify(main_ingredients || []);
    const dessertIngredients = JSON.stringify(dessert_ingredients || []);
    const result = await runQuery(
      "INSERT INTO menus (appetizer, main, dessert, appetizer_ingredients, main_ingredients, dessert_ingredients, base_servings, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        appetizer,
        main,
        dessert,
        appetizerIngredients,
        mainIngredients,
        dessertIngredients,
        baseServings,
        createdAt,
      ]
    );
    res.json({
      id: result.lastID,
      appetizer,
      main,
      dessert,
      appetizer_ingredients: appetizerIngredients,
      main_ingredients: mainIngredients,
      dessert_ingredients: dessertIngredients,
      base_servings: baseServings,
      created_at: createdAt,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to save menu." });
  }
});

app.post("/api/nutrition", async (req, res) => {
  const { ingredients } = req.body;
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    res.status(400).json({ error: "Ingredients are required." });
    return;
  }
  try {
    const lookups = await Promise.all(
      ingredients.map(async (ingredient) => {
        const query = encodeURIComponent(ingredient);
        const response = await fetch(
          `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${query}&search_simple=1&action=process&json=1&page_size=1`
        );
        if (!response.ok) {
          return { ingredient, error: "Lookup failed." };
        }
        const data = await response.json();
        const product = data?.products?.[0];
        if (!product) {
          return { ingredient, error: "No match found." };
        }
        const nutriments = product.nutriments || {};
        return {
          ingredient,
          product_name: product.product_name || ingredient,
          nutriments: {
            calories: nutriments["energy-kcal_100g"],
            protein_g: nutriments.proteins_100g,
            fat_g: nutriments.fat_100g,
            carbs_g: nutriments.carbohydrates_100g,
          },
        };
      })
    );
    res.json({ items: lookups });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch nutrition data." });
  }
});

initializeDb().then(() => {
  app.listen(port, () => {
    console.log(`Menu Maker app running on http://localhost:${port}`);
  });
});
