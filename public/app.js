const form = document.getElementById("menu-form");
const preview = document.getElementById("menu-preview");
const menuList = document.getElementById("menu-list");
const servingsInput = document.getElementById("servings-input");
const nutritionButton = document.getElementById("nutrition-button");
const deleteButton = document.getElementById("delete-button");
const nutritionPreview = document.getElementById("nutrition-preview");
const suggestionCache = new Map();
const suggestionState = new Map();
const suggestionConfig = [
  {
    input: form.elements.appetizer,
    textarea: form.elements.appetizer_ingredients,
    course: "appetizer",
  },
  {
    input: form.elements.main,
    textarea: form.elements.main_ingredients,
    course: "main",
  },
  {
    input: form.elements.dessert,
    textarea: form.elements.dessert_ingredients,
    course: "dessert",
  },
];

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

const formatNutrient = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.round(numeric * 10) / 10;
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

const filterMealsByCourse = (meals, course) => {
  const normalized = course?.toLowerCase();
  if (!normalized) {
    return meals;
  }
  const appetizerCategories = new Set(["starter", "side", "appetizer"]);
  const dessertCategories = new Set(["dessert"]);
  return meals.filter((meal) => {
    const category = (meal?.strCategory || "").toLowerCase();
    if (normalized === "appetizer") {
      return appetizerCategories.has(category);
    }
    if (normalized === "dessert") {
      return dessertCategories.has(category);
    }
    if (normalized === "main") {
      if (!category) {
        return true;
      }
      return (
        !appetizerCategories.has(category) &&
        !dessertCategories.has(category)
      );
    }
    return true;
  });
};

const getMealSuggestions = async (query, course) => {
  const trimmedQuery = query.trim().toLowerCase();
  if (!trimmedQuery) {
    return [];
  }
  const key = `${course || "any"}:${trimmedQuery}`;
  if (suggestionCache.has(key)) {
    return suggestionCache.get(key);
  }
  const response = await fetch(
    `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(
      key
    )}`
  );
  if (!response.ok) {
    return [];
  }
  const data = await response.json();
  const meals = Array.isArray(data?.meals) ? data.meals : [];
  const filtered = filterMealsByCourse(meals, course);
  const trimmed = filtered.slice(0, 5);
  suggestionCache.set(key, trimmed);
  return trimmed;
};

const buildIngredientLines = (meal) => {
  if (!meal) {
    return [];
  }
  const lines = [];
  for (let i = 1; i <= 20; i += 1) {
    const ingredient = meal[`strIngredient${i}`];
    const measure = meal[`strMeasure${i}`];
    if (ingredient && ingredient.trim()) {
      const label = `${measure || ""} ${ingredient}`.trim();
      lines.push(label);
    }
  }
  return lines;
};

const createSuggestionContainer = (input) => {
  const container = document.createElement("div");
  container.className = "suggestions";
  container.hidden = true;
  input.parentElement.appendChild(container);
  return container;
};

const renderSuggestions = (container, meals) => {
  if (!meals.length) {
    container.innerHTML = '<div class="suggestion-empty">No matches found.</div>';
    container.hidden = false;
    return;
  }
  container.innerHTML = meals
    .map(
      (meal) => `
        <button type="button" class="suggestion-item" data-meal="${meal.idMeal}">
          <span>${meal.strMeal}</span>
          <small>${meal.strArea || "Global"} • ${meal.strCategory || "Dish"}</small>
        </button>
      `
    )
    .join("");
  container.hidden = false;
};

const setupSuggestions = ({ input, textarea, course }) => {
  if (!input || !textarea) {
    return;
  }
  const container = createSuggestionContainer(input);
  suggestionState.set(input.name, { container, meals: [] });

  const handleInput = () => {
    const value = input.value.trim();
    if (value.length < 2) {
      container.hidden = true;
      container.innerHTML = "";
      return;
    }
    const currentState = suggestionState.get(input.name);
    if (currentState?.timeoutId) {
      clearTimeout(currentState.timeoutId);
    }
    const timeoutId = window.setTimeout(async () => {
      const meals = await getMealSuggestions(value, course);
      const updatedState = suggestionState.get(input.name) || {};
      updatedState.meals = meals;
      suggestionState.set(input.name, { ...updatedState, container });
      renderSuggestions(container, meals);
    }, 250);
    suggestionState.set(input.name, { ...currentState, timeoutId, container });
  };

  input.addEventListener("input", handleInput);
  input.addEventListener("focus", handleInput);

  container.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-meal]");
    if (!button) {
      return;
    }
    const state = suggestionState.get(input.name);
    const meals = state?.meals || [];
    const selected = meals.find((meal) => meal.idMeal === button.dataset.meal);
    if (!selected) {
      return;
    }
    input.value = selected.strMeal;
    const lines = buildIngredientLines(selected);
    if (lines.length) {
      textarea.value = lines.join("\n");
    }
    container.hidden = true;
  });

  document.addEventListener("click", (event) => {
    if (event.target === input || container.contains(event.target)) {
      return;
    }
    container.hidden = true;
  });
};

suggestionConfig.forEach(setupSuggestions);

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
    let totalCalories = 0;
    let totalCount = 0;
    const itemsMarkup = data.items
      .map((item) => {
        if (item.error) {
          return `<div><strong>${item.ingredient}</strong>: ${item.error}</div>`;
        }
        const nutrients = item.nutriments || {};
        const caloriesValue = formatNutrient(nutrients.calories);
        const proteinValue = formatNutrient(nutrients.protein_g);
        const fatValue = formatNutrient(nutrients.fat_g);
        const carbsValue = formatNutrient(nutrients.carbs_g);
        const caloriesScaled =
          caloriesValue == null ? null : formatNutrient(caloriesValue * scale);
        const proteinScaled =
          proteinValue == null ? null : formatNutrient(proteinValue * scale);
        const fatScaled =
          fatValue == null ? null : formatNutrient(fatValue * scale);
        const carbsScaled =
          carbsValue == null ? null : formatNutrient(carbsValue * scale);
        if (caloriesScaled != null) {
          totalCalories += caloriesScaled;
          totalCount += 1;
        }
        return `
          <div class="nutrition-item">
            <strong>${item.product_name}</strong>
            <div>Calories: ${caloriesScaled ?? "n/a"} kcal</div>
            <div>Protein: ${proteinScaled ?? "n/a"} g</div>
            <div>Fat: ${fatScaled ?? "n/a"} g</div>
            <div>Carbs: ${carbsScaled ?? "n/a"} g</div>
          </div>
        `;
      })
      .join("");
    const totalCaloriesLabel =
      totalCount > 0 ? `${Math.round(totalCalories)} kcal` : "n/a";
    nutritionPreview.innerHTML = `
      <div><strong>Nutrition per ingredient (scaled for ${targetServings} portions)</strong></div>
      ${itemsMarkup}
      <div class="nutrition-total"><strong>Total meal calories:</strong> ${totalCaloriesLabel}</div>
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
