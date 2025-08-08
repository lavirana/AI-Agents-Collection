// AURUM Frontend Logic — products, rendering, and cart interactions

const products = [
  {
    id: "aurora-ring",
    name: "Aurora Ring",
    price: 129.0,
    badge: "New",
    image: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "nova-necklace",
    name: "Nova Necklace",
    price: 179.0,
    badge: "Bestseller",
    image: "https://images.unsplash.com/photo-1520962918287-7448c2878f65?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "luxe-watch",
    name: "Luxe Watch",
    price: 329.0,
    image: "https://images.unsplash.com/photo-1518544801976-3e188ae9f69a?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "gilded-earrings",
    name: "Gilded Earrings",
    price: 99.0,
    image: "https://images.unsplash.com/photo-1617038260897-3d8c23ae248d?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "onyx-wallet",
    name: "Onyx Wallet",
    price: 89.0,
    badge: "Limited",
    image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "midnight-sneakers",
    name: "Midnight Sneakers",
    price: 149.0,
    image: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "velvet-jacket",
    name: "Velvet Jacket",
    price: 259.0,
    image: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "obsidian-sunglasses",
    name: "Obsidian Sunglasses",
    price: 139.0,
    image: "https://images.unsplash.com/photo-1511407397940-d57f68e81203?auto=format&fit=crop&w=1200&q=80",
  },
];

const state = {
  cart: new Map(), // productId -> { product, qty }
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function formatCurrency(value) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value);
}

function renderProducts() {
  const grid = $("#productGrid");
  grid.innerHTML = products
    .map((p) => {
      return `
        <article class="product-card">
          <div class="product-media">
            <img src="${p.image}" alt="${p.name}" loading="lazy" />
            ${p.badge ? `<span class="badge">${p.badge}</span>` : ""}
          </div>
          <div class="product-info">
            <h3 class="product-title">${p.name}</h3>
            <div class="product-meta">
              <span>${formatCurrency(p.price)}</span>
              <button class="btn-gold add-to-cart" data-id="${p.id}">Add to Cart</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  $$(".add-to-cart").forEach((btn) => btn.addEventListener("click", onAddToCart));
}

function onAddToCart(e) {
  const id = e.currentTarget.getAttribute("data-id");
  const product = products.find((p) => p.id === id);
  if (!product) return;

  const existing = state.cart.get(id);
  if (existing) {
    existing.qty += 1;
  } else {
    state.cart.set(id, { product, qty: 1 });
  }
  renderCart();
  openCart();
}

function renderCart() {
  const items = Array.from(state.cart.values());
  const container = $("#cartItems");
  const count = items.reduce((sum, item) => sum + item.qty, 0);
  const total = items.reduce((sum, { product, qty }) => sum + product.price * qty, 0);

  $("#cartCount").textContent = count;
  $("#cartTotal").textContent = formatCurrency(total);

  if (items.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; color: var(--text-200); padding: 24px 0;">
        Your cart is empty.
      </div>
    `;
    return;
  }

  container.innerHTML = items
    .map(({ product, qty }) => {
      return `
        <div class="cart-item">
          <img src="${product.image}" alt="${product.name}" />
          <div>
            <div style="font-weight:600;">${product.name}</div>
            <div style="color:var(--text-200);">${formatCurrency(product.price)}</div>
          </div>
          <div style="display:grid; gap:8px; justify-items:end;">
            <div class="qty" aria-label="Quantity controls for ${product.name}">
              <button data-id="${product.id}" data-action="dec" aria-label="Decrease quantity">−</button>
              <span aria-live="polite">${qty}</span>
              <button data-id="${product.id}" data-action="inc" aria-label="Increase quantity">+</button>
            </div>
            <button class="icon-btn" data-id="${product.id}" data-action="remove" aria-label="Remove ${product.name} from cart">Remove</button>
          </div>
        </div>
      `;
    })
    .join("");

  // Bind qty and remove handlers
  $$(".qty button, .cart-item .icon-btn").forEach((el) => el.addEventListener("click", onCartAction));
}

function onCartAction(e) {
  const id = e.currentTarget.getAttribute("data-id");
  const action = e.currentTarget.getAttribute("data-action");
  const entry = state.cart.get(id);
  if (!entry) return;

  if (action === "inc") entry.qty += 1;
  if (action === "dec") entry.qty = Math.max(1, entry.qty - 1);
  if (action === "remove") state.cart.delete(id);

  renderCart();
}

function openCart() {
  const drawer = $("#cartDrawer");
  const scrim = $("#scrim");
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  $("#cartButton").setAttribute("aria-expanded", "true");
  scrim.classList.add("show");
}

function closeCart() {
  const drawer = $("#cartDrawer");
  const scrim = $("#scrim");
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
  $("#cartButton").setAttribute("aria-expanded", "false");
  scrim.classList.remove("show");
}

function bindHeader() {
  $("#cartButton").addEventListener("click", openCart);
  $("#closeCart").addEventListener("click", closeCart);
  $("#scrim").addEventListener("click", closeCart);
}

function initYear() {
  const y = new Date().getFullYear();
  const el = document.getElementById("year");
  if (el) el.textContent = y;
}

function init() {
  renderProducts();
  renderCart();
  bindHeader();
  initYear();
}

window.addEventListener("DOMContentLoaded", init);