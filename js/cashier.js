/* ===== Cashier / POS Page ===== */
import { db } from './firebase-config.js';
import {
  collection, getDocs, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  formatCurrency, esc, toast, parseNum
} from './utils.js';
import { openQtyModal, completeSale } from './cashier-sale.js';

// ── State ─────────────────────────────────────────────────
let allProducts  = [];
let allCustomers = [];
let cart         = [];
let activeCategory = '';
let paymentType  = 'paid';

// ── Load Page ─────────────────────────────────────────────
export async function loadCashier(container) {
  container.innerHTML = `
    <div class="page-header mb-2">
      <div>
        <h2>🧮 الكاشير</h2>
        <p>نقطة البيع السريعة — بيع مباشر بدون تعقيد</p>
      </div>
    </div>

    <div class="cashier-wrap">
      <!-- Products Panel -->
      <div class="cashier-products">
        <div class="cashier-products-header">
          <input type="text" class="cashier-search" id="pos-search"
                 placeholder="🔍 ابحث عن منتج...">
          <span style="font-size:13px;opacity:.8;white-space:nowrap"
                id="pos-count"></span>
        </div>
        <div class="cashier-cat-tabs" id="pos-cat-tabs">
          <button class="cat-tab active" data-cat="">الكل</button>
        </div>
        <div class="cashier-grid" id="pos-grid">
          <div class="loading-page" style="grid-column:1/-1">
            <div class="spinner"></div>
          </div>
        </div>
      </div>

      <!-- Cart Panel -->
      <div class="cashier-cart">
        <div class="cashier-cart-header">
          <h3>🛒 السلة</h3>
          <div class="customer-row">
            <select class="customer-select" id="pos-customer">
              <option value="">👤 عميل نقدي</option>
            </select>
          </div>
        </div>

        <div class="cart-items-wrap" id="pos-cart-items">
          <div class="cart-empty">
            <div class="cart-empty-icon">🛒</div>
            <p>اضغط على منتج من اليسار<br>لإضافته إلى السلة</p>
          </div>
        </div>

        <div class="cashier-cart-footer">
          <div class="discount-row">
            <label>خصم:</label>
            <input type="number" id="pos-discount" class="discount-input"
                   min="0" value="0" placeholder="0">
            <span style="font-size:13px;color:var(--text-muted)">د.ع</span>
          </div>

          <div class="totals-mini" id="pos-totals">
            <div class="row"><span>المجموع</span><span>0 د.ع</span></div>
            <div class="row grand"><span>الإجمالي</span><span>0 د.ع</span></div>
          </div>

          <div class="payment-type mb-2">
            <button class="pay-btn cash active" id="pay-cash" data-type="paid">💵 نقدي</button>
            <button class="pay-btn credit" id="pay-credit" data-type="credit">📋 آجل</button>
          </div>

          <button class="complete-btn" id="pos-complete-btn" disabled>
            ✅ إتمام البيع وطباعة الفاتورة
          </button>
          <button class="clear-btn" id="pos-clear-btn">🗑 مسح السلة</button>
        </div>
      </div>
    </div>`;

  await fetchData();
  buildCategoryTabs();
  renderGrid();
  fillCustomers();
  bindEvents();
}

// ── Fetch Data ────────────────────────────────────────────
async function fetchData() {
  const [prodSnap, custSnap] = await Promise.all([
    getDocs(query(collection(db, 'inventory'), orderBy('name'))),
    getDocs(collection(db, 'customers'))
  ]);
  allProducts  = prodSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  allCustomers = custSnap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Category Tabs ─────────────────────────────────────────
function buildCategoryTabs() {
  const cats = [...new Set(allProducts.map(p => p.category).filter(Boolean))].sort();
  const tabs  = document.getElementById('pos-cat-tabs');
  if (!tabs) return;
  cats.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'cat-tab';
    btn.dataset.cat = cat;
    btn.textContent = cat;
    tabs.appendChild(btn);
  });
}

function fillCustomers() {
  const sel = document.getElementById('pos-customer');
  if (!sel) return;
  allCustomers.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `👤 ${c.name}${c.balance > 0 ? ` (ذمة: ${formatCurrency(c.balance)})` : ''}`;
    sel.appendChild(opt);
  });
}

// ── Product Grid ──────────────────────────────────────────
function getFilteredProducts() {
  const search = (document.getElementById('pos-search')?.value || '').toLowerCase();
  return allProducts.filter(p =>
    (!activeCategory || p.category === activeCategory) &&
    (!search || p.name?.toLowerCase().includes(search))
  );
}

const UNIT_ICONS = {
  'كيلو': '⚖️', 'غرام': '⚖️', 'لتر': '🧴', 'قطعة': '📦',
  'علبة': '📦', 'صندوق': '📦', 'كرتون': '📦', 'حبة': '🔵',
  'رزمة': '📦', 'كيس': '🛍️'
};

function renderGrid() {
  const grid    = document.getElementById('pos-grid');
  const countEl = document.getElementById('pos-count');
  if (!grid) return;

  const products = getFilteredProducts();
  if (countEl) countEl.textContent = `${products.length} منتج`;

  if (products.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-state-icon">📦</div>
      <h3>لا توجد منتجات</h3>
    </div>`;
    return;
  }

  grid.innerHTML = products.map(p => {
    const isOut  = (p.quantity || 0) <= 0;
    const isLow  = !isOut && (p.quantity || 0) <= (p.minQuantity || 0);
    const media  = p.imageBase64
      ? `<img src="${p.imageBase64}" class="tile-img" alt="">`
      : `<span class="tile-icon">${UNIT_ICONS[p.unit] || '📦'}</span>`;
    return `
    <div class="product-tile${isOut ? ' out-of-stock' : ''}"
         onclick="posAddProduct('${p.id}')" title="${esc(p.name)}">
      <span class="tile-stock ${isLow ? 'low' : ''}">${p.quantity || 0}</span>
      ${media}
      <span class="tile-name">${esc(p.name)}</span>
      <span class="tile-price">${formatCurrency(p.sellPrice)}</span>
      <span class="tile-unit">/ ${esc(p.unit || 'وحدة')}</span>
    </div>`;
  }).join('');
}

// ── Add to Cart ───────────────────────────────────────────
window.posAddProduct = id => {
  const product = allProducts.find(p => p.id === id);
  if (!product) return;
  openQtyModal(product, addToCart);
};

function addToCart(product, qty) {
  const existing = cart.find(i => i.productId === product.id);
  if (existing) {
    const newQty = existing.qty + qty;
    if (newQty > (product.quantity || 0)) {
      toast(`الكمية المتوفرة ${product.quantity} فقط`, 'warning');
      return;
    }
    existing.qty   = newQty;
    existing.total = newQty * existing.sellPrice;
  } else {
    cart.push({
      productId:   product.id,
      productName: product.name,
      unit:        product.unit || '',
      qty,
      buyPrice:    product.buyPrice || 0,
      sellPrice:   product.sellPrice || 0,
      total:       qty * (product.sellPrice || 0)
    });
  }
  renderCart();
}

// ── Render Cart ───────────────────────────────────────────
function renderCart() {
  const wrap = document.getElementById('pos-cart-items');
  if (!wrap) return;

  if (cart.length === 0) {
    wrap.innerHTML = `<div class="cart-empty">
      <div class="cart-empty-icon">🛒</div>
      <p>اضغط على منتج من اليسار<br>لإضافته إلى السلة</p>
    </div>`;
    updateTotals();
    document.getElementById('pos-complete-btn')?.setAttribute('disabled', '');
    return;
  }

  wrap.innerHTML = cart.map((item, i) => `
    <div class="cart-item" id="cart-item-${i}">
      <div class="cart-item-top">
        <span class="cart-item-name">${esc(item.productName)}</span>
        <button class="cart-item-remove" onclick="posRemoveItem(${i})">✕</button>
      </div>
      <div class="cart-item-controls">
        <div class="qty-controls">
          <button class="qty-btn" onclick="posChangeQty(${i},-1)">−</button>
          <input type="number" class="qty-display" value="${item.qty}"
                 onchange="posSetCartQty(${i}, this.value)" min="0.01" step="0.01">
          <button class="qty-btn" onclick="posChangeQty(${i},1)">+</button>
        </div>
        <span class="cart-item-unit">${esc(item.unit)}</span>
        <span class="cart-item-total">${formatCurrency(item.total)}</span>
      </div>
    </div>`).join('');

  document.getElementById('pos-complete-btn')?.removeAttribute('disabled');
  updateTotals();
}

function updateTotals() {
  const subtotal  = cart.reduce((a, i) => a + i.total, 0);
  const totalCost = cart.reduce((a, i) => a + i.qty * i.buyPrice, 0);
  const discount  = parseNum(document.getElementById('pos-discount')?.value);
  const total     = subtotal - discount;
  const profit    = total - totalCost;

  const el = document.getElementById('pos-totals');
  if (!el) return;
  el.innerHTML = `
    <div class="row"><span>المجموع الفرعي</span><span>${formatCurrency(subtotal)}</span></div>
    ${discount > 0 ? `<div class="row"><span>الخصم</span><span class="text-danger">- ${formatCurrency(discount)}</span></div>` : ''}
    <div class="row grand"><span>الإجمالي</span><span>${formatCurrency(total)}</span></div>
    <div class="row profit"><span>الربح المتوقع</span><span>📈 ${formatCurrency(profit)}</span></div>`;
}

// Cart item controls
window.posRemoveItem = i => { cart.splice(i, 1); renderCart(); };

window.posChangeQty = (i, delta) => {
  const item    = cart[i];
  const product = allProducts.find(p => p.id === item.productId);
  const isWeight = ['كيلو','غرام','لتر'].includes(item.unit);
  const step    = isWeight ? 0.25 : 1;
  const newQty  = Math.max(step, +(item.qty + delta * step).toFixed(2));
  if (newQty > (product?.quantity || 0)) {
    toast(`الكمية المتوفرة ${product?.quantity || 0} فقط`, 'warning');
    return;
  }
  cart[i].qty   = newQty;
  cart[i].total = newQty * item.sellPrice;
  renderCart();
};

window.posSetCartQty = (i, val) => {
  const qty     = parseNum(val, 0);
  const product = allProducts.find(p => p.id === cart[i]?.productId);
  if (qty <= 0) { window.posRemoveItem(i); return; }
  if (qty > (product?.quantity || 0)) {
    toast(`الكمية المتوفرة ${product?.quantity || 0} فقط`, 'warning');
    return;
  }
  cart[i].qty   = qty;
  cart[i].total = qty * cart[i].sellPrice;
  renderCart();
};

// ── Events ────────────────────────────────────────────────
function bindEvents() {
  document.getElementById('pos-search')?.addEventListener('input', renderGrid);

  document.getElementById('pos-cat-tabs')?.addEventListener('click', e => {
    const btn = e.target.closest('.cat-tab');
    if (!btn) return;
    document.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeCategory = btn.dataset.cat || '';
    renderGrid();
  });

  document.getElementById('pos-discount')?.addEventListener('input', updateTotals);

  document.querySelectorAll('.pay-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      paymentType = btn.dataset.type || 'paid';
      document.querySelectorAll('.pay-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.getElementById('pos-complete-btn')?.addEventListener('click', () => {
    completeSale({
      cart,
      allProducts,
      allCustomers,
      paymentType,
      getDiscount:    () => parseNum(document.getElementById('pos-discount')?.value),
      getCustomerId:  () => document.getElementById('pos-customer')?.value || '',
      onSuccess: () => {
        cart = [];
        renderCart();
        renderGrid();
        const discEl = document.getElementById('pos-discount');
        if (discEl) discEl.value = '0';
      }
    });
  });

  document.getElementById('pos-clear-btn')?.addEventListener('click', () => {
    if (cart.length === 0) return;
    cart = [];
    renderCart();
    renderGrid();
    toast('تم مسح السلة', 'info', 1500);
  });
}
