const form = document.getElementById("menu-form");
const preview = document.getElementById("menu-preview");

const renderMenu = (menu) => {
  if (!menu || !menu.appetizer) {
    preview.innerHTML =
      '<p class="empty">No menu saved yet. Fill out the form to create one.</p>';
    return;
  }

  const createdAt = menu.created_at
    ? new Date(menu.created_at).toLocaleString()
    : "";

  preview.innerHTML = `
    <div class="item"><strong>Appetizer</strong><span>${menu.appetizer}</span></div>
    <div class="item"><strong>Main dish</strong><span>${menu.main}</span></div>
    <div class="item"><strong>Dessert</strong><span>${menu.dessert}</span></div>
    <div class="timestamp">Saved ${createdAt}</div>
  `;
};

const loadMenu = async () => {
  const response = await fetch("/api/menu");
  const menu = await response.json();
  renderMenu(menu);
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  const response = await fetch("/api/menu", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (response.ok) {
    const menu = await response.json();
    renderMenu(menu);
    form.reset();
    return;
  }

  const error = await response.json();
  preview.innerHTML = `<p class="empty">${error.error}</p>`;
});

loadMenu();
