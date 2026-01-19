const form = document.getElementById("menu-form");
const preview = document.getElementById("menu-preview");
const menuList = document.getElementById("menu-list");
const servingsInput = document.getElementById("servings-input");
const nutritionButton = document.getElementById("nutrition-button");
const deleteButton = document.getElementById("delete-button");
const nutritionPreview = document.getElementById("nutrition-preview");

let menus = [];
let currentMenu = null;

const parseFraction = (value) => {
  const [numerator, denominator] = value.split("/").map(Number);
  if (!denominator) {
    return null;
  }
  return numerator / denominator;
};

const parseQuantity = (text) => {
  const match = text.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(\.\d+)?)/);
  if (!match) {
    return { qty: null, rest: text };
  }
  const rawQty = match[1];
  let qty = null;
  if (rawQty.includes(" ")) {
    const [whole, fraction] = rawQty.split(/\s+/);
    const fractionValue = parseFraction(fraction);
    qty = Number(whole) + (fractionValue ?? 0);
  } else if (rawQty.includes("/")) {
    qty = parseFraction(rawQty);
  } else {
    qty = Number(rawQty);
  }
  const rest = text.slice(match[0].length).trim();
  return { qty, rest };
};

const parseIngredientLine = (line) => {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  const { qty, rest } = parseQuantity(trimmed);
  if (qty == null) {
    return { raw: trimmed };
  }
  if (!rest) {
    return { raw: trimmed, qty, unit: "", name: "" };
  }
  const parts = rest.split(/\s+/);
  if (parts.length === 1) {
    return { raw: trimmed, qty, unit: "", name: rest };
  }
  return {
    raw: trimmed,
    qty,
    unit: parts[0],
    name: parts.slice(1).join(" "),
  };
};

const parseIngredientsText = (text) =>
  text
    .split("\n")
    .map(parseIngredientLine)
    .filter(Boolean);

const formatQuantity = (value) => {
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) {
    return String(rounded);
  }
  return parseFloat(rounded.toFixed(2)).toString();
};

const formatIngredient = (item, scale) => {
  if (!item || item.qty == null) {
    return item?.raw || "";
  }
  const scaledQty = item.qty * scale;
  const qtyLabel = formatQuantity(scaledQty);
  const unit = item.unit ? ` ${item.unit}` : "";
  const name = item.name ? ` ${item.name}` : "";
  return `${qtyLabel}${unit}${name}`.trim();
};

const parseMaybeJson = (value) => {
  if (Array.isArray(value)) {
    return value;
  }
  if (!value) {
    return [];
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    return [];
  }
};

const normalizeMenu = (menu) => ({
  ...menu,
  appetizer_ingredients: parseMaybeJson(menu.appetizer_ingredients),
  main_ingredients: parseMaybeJson(menu.main_ingredients),
  dessert_ingredients: parseMaybeJson(menu.dessert_ingredients),
  base_servings: Number(menu.base_servings) || 1,
});

const renderMenu = (menu) => {
  if (!menu || !menu.appetizer) {
    preview.innerHTML =
      '<p class="empty">No menu saved yet. Fill out the form to create one.</p>';
    nutritionPreview.innerHTML = "";
    deleteButton.disabled = true;
    return;
  }
  deleteButton.disabled = false;

  const createdAt = menu.created_at
    ? new Date(menu.created_at).toLocaleString()
    : "";
  const targetServings = Number(servingsInput.value) || menu.base_servings || 1;
  const baseServings = menu.base_servings || 1;
  const scale = targetServings / baseServings;

  const appetizerList = menu.appetizer_ingredients
    .map((item) => `<div>${formatIngredient(item, scale)}</div>`)
    .join("");
  const mainList = menu.main_ingredients
    .map((item) => `<div>${formatIngredient(item, scale)}</div>`)
    .join("");
  const dessertList = menu.dessert_ingredients
    .map((item) => `<div>${formatIngredient(item, scale)}</div>`)
    .join("");

  preview.innerHTML = `
    <div class="item"><strong>Appetizer</strong><span>${menu.appetizer}</span></div>
    <div class="ingredients">${appetizerList || "<em>No ingredients listed.</em>"}</div>
    <div class="item"><strong>Main dish</strong><span>${menu.main}</span></div>
    <div class="ingredients">${mainList || "<em>No ingredients listed.</em>"}</div>
    <div class="item"><strong>Dessert</strong><span>${menu.dessert}</span></div>
    <div class="ingredients">${dessertList || "<em>No ingredients listed.</em>"}</div>
    <div class="timestamp">Scaled for ${targetServings} people (base: ${baseServings}).</div>
    <div class="timestamp">Saved ${createdAt}</div>
  `;
};

const renderMenuList = () => {
  if (!menus.length) {
    menuList.innerHTML = '<p class="empty">No menus saved yet.</p>';
    return;
  }
  menuList.innerHTML = menus
    .map(
      (menu) => `
      <button type="button" data-id="${menu.id}" class="${
        currentMenu?.id === menu.id ? "active" : ""
      }">
        ${menu.appetizer} / ${menu.main} / ${menu.dessert}
        <div class="timestamp">Saved ${new Date(
          menu.created_at
        ).toLocaleDateString()}</div>
      </button>
    `
    )
    .join("");
};

const loadMenuById = async (id) => {
  const response = await fetch(`/api/menus/${id}`);
  if (!response.ok) {
    return;
  }
  currentMenu = normalizeMenu(await response.json());
  servingsInput.value = currentMenu.base_servings;
  nutritionPreview.innerHTML = "";
  renderMenu(currentMenu);
  renderMenuList();
};

const loadMenus = async () => {
  const response = await fetch("/api/menus");
  menus = await response.json();
  if (!currentMenu && menus.length) {
    await loadMenuById(menus[0].id);
  } else {
    renderMenuList();
    renderMenu(currentMenu);
  }
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  payload.base_servings = Number(payload.base_servings) || 1;
  payload.appetizer_ingredients = parseIngredientsText(
    payload.appetizer_ingredients
  );
  payload.main_ingredients = parseIngredientsText(payload.main_ingredients);
  payload.dessert_ingredients = parseIngredientsText(payload.dessert_ingredients);

  const response = await fetch("/api/menus", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (response.ok) {
    const menu = normalizeMenu(await response.json());
    currentMenu = menu;
    await loadMenus();
    servingsInput.value = menu.base_servings;
    renderMenu(menu);
    form.reset();
    form.elements.base_servings.value = payload.base_servings;
    return;
  }

  const error = await response.json();
  preview.innerHTML = `<p class="empty">${error.error}</p>`;
});

menuList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-id]");
  if (!button) {
    return;
  }
  loadMenuById(button.dataset.id);
});

servingsInput.addEventListener("input", () => {
  nutritionPreview.innerHTML = "";
  renderMenu(currentMenu);
});

nutritionButton.addEventListener("click", async () => {
  if (!currentMenu) {
    nutritionPreview.innerHTML = "<p class='empty'>Pick a menu first.</p>";
    return;
  }
  const targetServings = Number(servingsInput.value) || currentMenu.base_servings;
  const scale = targetServings / (currentMenu.base_servings || 1);
  const ingredients = [
    ...currentMenu.appetizer_ingredients,
    ...currentMenu.main_ingredients,
    ...currentMenu.dessert_ingredients,
  ]
    .map((item) => {
      if (!item) {
        return "";
      }
      if (item.name) {
        return item.name;
      }
      if (item.raw) {
        return item.raw.replace(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(\.\d+)?)/, "").trim();
      }
      return formatIngredient(item, scale);
    })
    .filter(Boolean);

  if (!ingredients.length) {
    nutritionPreview.innerHTML =
      "<p class='empty'>Add ingredient quantities to fetch nutrition data.</p>";
    return;
  }

  nutritionButton.disabled = true;
  nutritionButton.textContent = "Loading...";
  nutritionPreview.innerHTML = "";

  try {
    const response = await fetch("/api/nutrition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ingredients }),
    });
    const data = await response.json();
    if (!response.ok) {
      nutritionPreview.innerHTML = `<p class="empty">${
        data.error || "Unable to load nutrition data."
      }</p>`;
      return;
    }
    const itemsMarkup = data.items
      .map((item) => {
        if (item.error) {
          return `<div><strong>${item.ingredient}</strong>: ${item.error}</div>`;
        }
        const nutrients = item.nutriments || {};
        const calories = nutrients.calories ?? "n/a";
        const protein = nutrients.protein_g ?? "n/a";
        const fat = nutrients.fat_g ?? "n/a";
        const carbs = nutrients.carbs_g ?? "n/a";
        return `
          <div class="nutrition-item">
            <strong>${item.product_name}</strong>
            <div>Calories: ${calories} kcal (per 100g)</div>
            <div>Protein: ${protein} g</div>
            <div>Fat: ${fat} g</div>
            <div>Carbs: ${carbs} g</div>
          </div>
        `;
      })
      .join("");
    nutritionPreview.innerHTML = `
      <div><strong>Nutrition per ingredient (per 100g)</strong></div>
      ${itemsMarkup}
    `;
  } catch (error) {
    nutritionPreview.innerHTML =
      "<p class='empty'>Nutrition service is unavailable.</p>";
  } finally {
    nutritionButton.disabled = false;
    nutritionButton.textContent = "Get nutrition";
  }
});

loadMenus();

deleteButton.addEventListener("click", async () => {
  if (!currentMenu?.id) {
    return;
  }
  const confirmed = window.confirm(
    "Delete this menu? This cannot be undone."
  );
  if (!confirmed) {
    return;
  }
  deleteButton.disabled = true;
  try {
    const response = await fetch(`/api/menus/${currentMenu.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      let message = "Unable to delete menu.";
      try {
        const data = await response.json();
        if (data?.error) {
          message = data.error;
        }
      } catch (error) {
        // Ignore JSON parsing errors.
      }
      window.alert(message);
      return;
    }
    currentMenu = null;
    await loadMenus();
  } finally {
    deleteButton.disabled = false;
  }
});
