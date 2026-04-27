/* ===== Cashier / POS Page ===== */
import { db } from './firebase-config.js';
import {
  collection, getDocs, query, orderBy, serverTimestamp, writeBatch, doc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  formatCurrency, esc, toast, openModal, closeModal,
  today, parseNum, shortId
} from './utils.js';

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
    const isOut   = (p.quantity || 0) <= 0;
    const isLow   = !isOut && (p.quantity || 0) <= (p.minQuantity || 0);
    const icon    = UNIT_ICONS[p.unit] || '📦';
    return `
    <div class="product-tile${isOut ? ' out-of-stock' : ''}"
         onclick="posAddProduct('${p.id}')" title="${esc(p.name)}">
      <span class="tile-stock ${isLow ? 'low' : ''}">${p.quantity || 0}</span>
      <span class="tile-icon">${icon}</span>
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
  openQtyModal(product);
};

function openQtyModal(product) {
  const isWeight = ['كيلو','غرام','لتر'].includes(product.unit);
  const quickQtys = isWeight
    ? ['¼', '½', '¾', '1', '2', '3', '5', '10']
    : ['1', '2', '3', '5', '10', '20', '50', '100'];
  const quickVals = isWeight
    ? [0.25, 0.5, 0.75, 1, 2, 3, 5, 10]
    : [1, 2, 3, 5, 10, 20, 50, 100];

  openModal(`إضافة للسلة`, `
    <div class="qty-modal-body">
      <div class="qty-modal-product">${esc(product.name)}</div>
      <div class="qty-modal-unit">
        سعر البيع: <strong>${formatCurrency(product.sellPrice)} / ${esc(product.unit||'وحدة')}</strong>
        &nbsp;|&nbsp; متوفر: <strong>${product.quantity || 0} ${esc(product.unit||'')}</strong>
      </div>

      <div class="quick-qty-grid">
        ${quickQtys.map((label, i) => `
          <button class="quick-qty-btn${i===3?' selected':''}"
                  data-val="${quickVals[i]}"
                  onclick="posSetQty(${quickVals[i]},this)">${label}</button>`
        ).join('')}
      </div>

      <div class="custom-qty-wrap">
        <input type="number" id="modal-qty" class="custom-qty-input"
               value="${isWeight ? 1 : 1}" min="0.01" step="${isWeight ? 0.25 : 1}"
               placeholder="كمية مخصصة">
        <span style="font-size:16px;font-weight:700;color:var(--text-muted)">${esc(product.unit||'')}</span>
      </div>

      <div class="qty-preview" id="qty-preview">
        الإجمالي: <strong>${formatCurrency(product.sellPrice)}</strong>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>
      <button class="btn btn-primary btn-lg" id="btn-add-to-cart">
        🛒 إضافة للسلة
      </button>
    </div>
  `, 'sm');

  window.closeModal = closeModal;

  // Live price preview
  const qtyInput = document.getElementById('modal-qty');
  const preview  = document.getElementById('qty-preview');
  qtyInput?.addEventListener('input', () => {
    const q = parseNum(qtyInput.value, 0);
    if (preview) preview.innerHTML = `الإجمالي: <strong>${formatCurrency(q * product.sellPrice)}</strong>`;
    document.querySelectorAll('.quick-qty-btn').forEach(b => b.classList.remove('selected'));
  });

  document.getElementById('btn-add-to-cart')?.addEventListener('click', () => {
    const qty = parseNum(document.getElementById('modal-qty')?.value, 0);
    if (qty <= 0) return toast('أدخل كمية صحيحة', 'error');
    if (qty > (product.quantity || 0)) return toast(`الكمية المتوفرة ${product.quantity} فقط`, 'warning');
    addToCart(product, qty);
    closeModal();
    toast(`✅ تمت إضافة ${qty} ${product.unit || ''} ${product.name}`, 'success', 1500);
  });
}

window.posSetQty = (val, btn) => {
  const input = document.getElementById('modal-qty');
  if (input) {
    input.value = val;
    input.dispatchEvent(new Event('input'));
  }
  document.querySelectorAll('.quick-qty-btn').forEach(b => b.classList.remove('selected'));
  btn?.classList.add('selected');
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
  const subtotal = cart.reduce((a, i) => a + i.total, 0);
  const totalCost = cart.reduce((a, i) => a + i.qty * i.buyPrice, 0);
  const discount = parseNum(document.getElementById('pos-discount')?.value);
  const total    = subtotal - discount;
  const profit   = total - totalCost;

  const el = document.getElementById('pos-totals');
  if (!el) return;
  el.innerHTML = `
    <div class="row"><span>المجموع الفرعي</span><span>${formatCurrency(subtotal)}</span></div>
    ${discount > 0 ? `<div class="row"><span>الخصم</span><span class="text-danger">- ${formatCurrency(discount)}</span></div>` : ''}
    <div class="row grand"><span>الإجمالي</span><span>${formatCurrency(total)}</span></div>
    <div class="row profit"><span>الربح المتوقع</span><span>📈 ${formatCurrency(profit)}</span></div>`;
}

// Cart item controls
window.posRemoveItem = i => {
  cart.splice(i, 1);
  renderCart();
};

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
  if (qty <= 0) { posRemoveItem(i); return; }
  if (qty > (product?.quantity || 0)) {
    toast(`الكمية المتوفرة ${product?.quantity || 0} فقط`, 'warning');
    return;
  }
  cart[i].qty   = qty;
  cart[i].total = qty * cart[i].sellPrice;
  renderCart();
};

// ── Complete Sale ─────────────────────────────────────────
async function completeSale() {
  if (cart.length === 0) return toast('السلة فارغة!', 'error');

  const custId    = document.getElementById('pos-customer')?.value || '';
  const discount  = parseNum(document.getElementById('pos-discount')?.value);
  const subtotal  = cart.reduce((a, i) => a + i.total, 0);
  const totalCost = cart.reduce((a, i) => a + i.qty * i.buyPrice, 0);
  const total     = subtotal - discount;
  const profit    = total - totalCost;
  const customer  = allCustomers.find(c => c.id === custId);
  const invoiceNo = shortId();

  const saleData = {
    invoiceNo,
    date:         today(),
    customerId:   custId,
    customerName: customer?.name || 'عميل نقدي',
    items:        [...cart],
    subtotal,
    discount,
    totalAmount:  total,
    totalCost,
    profit,
    status:       paymentType,
    paidAmount:   paymentType === 'paid' ? total : 0,
    notes:        'كاشير',
    createdAt:    serverTimestamp()
  };

  const btn = document.getElementById('pos-complete-btn');
  if (btn) btn.disabled = true;

  try {
    const batch    = writeBatch(db);
    const saleRef  = doc(collection(db, 'sales'));
    batch.set(saleRef, saleData);

    // Decrease stock
    cart.forEach(item => {
      const prod = allProducts.find(p => p.id === item.productId);
      if (prod) {
        batch.update(doc(db, 'inventory', item.productId), {
          quantity:  Math.max(0, (prod.quantity || 0) - item.qty),
          updatedAt: serverTimestamp()
        });
        prod.quantity = Math.max(0, (prod.quantity || 0) - item.qty);
      }
    });

    // Update customer balance if credit
    if (custId && paymentType === 'credit') {
      const c = allCustomers.find(x => x.id === custId);
      if (c) {
        batch.update(doc(db, 'customers', custId), {
          balance: (c.balance || 0) + total
        });
      }
    }

    await batch.commit();
    printReceipt(saleData);
    cart = [];
    renderCart();
    renderGrid();
    document.getElementById('pos-discount').value = '0';
    toast('✅ تم البيع وجاري طباعة الفاتورة!', 'success');
  } catch (err) {
    toast('خطأ: ' + err.message, 'error');
    if (btn) btn.disabled = false;
  }
}

// ── Print Receipt ─────────────────────────────────────────
function printReceipt(sale) {
  const now = new Date().toLocaleString('ar-SA');
  const html = `<!DOCTYPE html><html dir="rtl"><head>
    <meta charset="UTF-8"><title>فاتورة ${sale.invoiceNo}</title>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" rel="stylesheet">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:Cairo,sans-serif; max-width:320px; margin:0 auto; padding:16px; font-size:13px; }
      .center { text-align:center; }
      .logo { font-size:20px; font-weight:900; color:#0D47A1; }
      .sub  { font-size:12px; color:#64748B; margin-bottom:8px; }
      .divider { border-top:1px dashed #CBD5E1; margin:8px 0; }
      .info  { display:flex; justify-content:space-between; font-size:12px; margin:3px 0; color:#374151; }
      table  { width:100%; border-collapse:collapse; margin:6px 0; }
      th     { font-size:11px; padding:5px 3px; border-bottom:1px solid #E2E8F0; text-align:right; }
      td     { font-size:12px; padding:5px 3px; border-bottom:1px solid #F1F5F9; }
      .total-row { display:flex; justify-content:space-between; padding:4px 0; font-size:13px; }
      .grand     { font-size:17px; font-weight:900; color:#0D47A1; border-top:2px solid #0D47A1; padding-top:6px; margin-top:4px; }
      .footer    { text-align:center; margin-top:14px; font-size:11px; color:#94A3B8; }
      @media print { @page { margin:0; size:80mm auto; } }
    </style></head><body>
    <div class="center">
      <div class="logo">مؤسسة جون سعادة</div>
      <div class="sub">نظام المحاسبة للجملة</div>
    </div>
    <div class="divider"></div>
    <div class="info"><span>رقم الفاتورة:</span><strong>${sale.invoiceNo}</strong></div>
    <div class="info"><span>التاريخ:</span><span>${now}</span></div>
    <div class="info"><span>العميل:</span><span>${esc(sale.customerName)}</span></div>
    <div class="info"><span>الدفع:</span><span>${sale.status === 'paid' ? 'نقدي' : 'آجل'}</span></div>
    <div class="divider"></div>
    <table>
      <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>المجموع</th></tr></thead>
      <tbody>
        ${(sale.items||[]).map(item => `
          <tr>
            <td>${esc(item.productName)}</td>
            <td>${item.qty} ${esc(item.unit||'')}</td>
            <td>${item.sellPrice.toLocaleString()}</td>
            <td><strong>${item.total.toLocaleString()}</strong></td>
          </tr>`).join('')}
      </tbody>
    </table>
    <div class="divider"></div>
    <div class="total-row"><span>المجموع الفرعي</span><span>${sale.subtotal.toLocaleString()}</span></div>
    ${sale.discount > 0
      ? `<div class="total-row"><span>الخصم</span><span>- ${sale.discount.toLocaleString()}</span></div>`
      : ''}
    <div class="total-row grand"><span>الإجمالي</span><span>${sale.totalAmount.toLocaleString()} د.ع</span></div>
    <div class="footer">
      شكراً لتعاملكم مع مؤسسة جون سعادة 🙏
    </div>
    <script>window.onload=()=>{window.print();}<\/script>
  </body></html>`;

  const win = window.open('', '_blank', 'width=400,height=600');
  if (win) { win.document.write(html); win.document.close(); }
}

// ── Events ────────────────────────────────────────────────
function bindEvents() {
  // Search
  document.getElementById('pos-search')?.addEventListener('input', renderGrid);

  // Category tabs
  document.getElementById('pos-cat-tabs')?.addEventListener('click', e => {
    const btn = e.target.closest('.cat-tab');
    if (!btn) return;
    document.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeCategory = btn.dataset.cat || '';
    renderGrid();
  });

  // Discount
  document.getElementById('pos-discount')?.addEventListener('input', updateTotals);

  // Payment type
  document.querySelectorAll('.pay-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      paymentType = btn.dataset.type || 'paid';
      document.querySelectorAll('.pay-btn').forEach(b => {
        b.classList.remove('active');
      });
      btn.classList.add('active');
    });
  });

  // Complete sale
  document.getElementById('pos-complete-btn')?.addEventListener('click', completeSale);

  // Clear cart
  document.getElementById('pos-clear-btn')?.addEventListener('click', () => {
    if (cart.length === 0) return;
    cart = [];
    renderCart();
    renderGrid();
    toast('تم مسح السلة', 'info', 1500);
  });
}
