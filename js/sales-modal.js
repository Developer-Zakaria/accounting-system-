/* ===== Sales Modal — New Sale Form ===== */
import { db } from './firebase-config.js';
import {
  collection, serverTimestamp, writeBatch, doc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  formatCurrency, esc, toast, openModal, closeModal,
  today, parseNum, shortId, debounce
} from './utils.js';
import { allProducts, allCustomers, refreshSales } from './sales.js';

const saleItems = [];

export function openNewSaleModal() {
  saleItems.splice(0);
  openModal('🧾 فاتورة بيع جديدة', buildSaleForm(), 'lg');
  window.closeModal = closeModal;
  bindSaleFormEvents();
}

function buildSaleForm() {
  const customerOptions = `<option value="">👤 عميل نقدي</option>` +
    allCustomers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');

  return `
    <!-- التاريخ والعميل -->
    <div class="form-grid mb-3">
      <div class="form-group mb-0">
        <label class="form-label">📅 التاريخ</label>
        <input type="date" id="s-date" class="form-control" value="${today()}">
      </div>
      <div class="form-group mb-0">
        <label class="form-label">👤 العميل</label>
        <select id="s-customer" class="form-control">${customerOptions}</select>
      </div>
    </div>

    <!-- بحث سريع عن المنتجات -->
    <div class="sale-search-section mb-3">
      <div class="sale-search-bar">
        <div style="position:relative;flex:1">
          <span style="position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:16px;opacity:.5;pointer-events:none">🔍</span>
          <input type="text" id="s-prod-search" class="form-control"
                 placeholder="ابحث عن منتج لإضافته للفاتورة..."
                 style="padding-right:40px" autocomplete="off">
        </div>
        <input type="number" id="s-qty" class="form-control sale-qty-input"
               value="1" min="0.01" step="0.01" placeholder="الكمية">
      </div>
      <div id="s-prod-results" class="sale-prod-results"></div>
    </div>

    <!-- بنود الفاتورة -->
    <div id="sale-items-wrap" class="mb-3">
      <div class="sale-items-empty">
        <span style="font-size:36px">🧾</span>
        <p>ابحث عن منتج بالأعلى وانقر عليه لإضافته للفاتورة</p>
      </div>
    </div>

    <!-- الإجماليات والدفع -->
    <div class="form-grid">
      <div>
        <div class="form-group">
          <label class="form-label">الخصم</label>
          <input type="number" id="s-discount" class="form-control" min="0" value="0">
        </div>
        <div class="form-group">
          <label class="form-label">طريقة الدفع</label>
          <select id="s-status" class="form-control">
            <option value="paid">💵 نقدي (مدفوع)</option>
            <option value="credit">📋 آجل</option>
          </select>
        </div>
        <div class="form-group mb-0">
          <label class="form-label">ملاحظات</label>
          <textarea id="s-notes" class="form-control" rows="2" placeholder="اختياري..."></textarea>
        </div>
      </div>
      <div id="sale-totals" class="totals-box" style="height:fit-content"></div>
    </div>

    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>
      <button class="btn btn-primary" id="btn-save-sale">💾 حفظ الفاتورة</button>
    </div>`;
}

function bindSaleFormEvents() {
  document.getElementById('s-prod-search')
    ?.addEventListener('input', debounce(renderProductResults, 150));
  document.getElementById('s-qty')
    ?.addEventListener('input', renderProductResults);
  document.getElementById('s-discount')
    ?.addEventListener('input', renderSaleTotals);
  document.getElementById('btn-save-sale')
    ?.addEventListener('click', saveSale);
}

// ── Product Search Results ────────────────────────────────
function renderProductResults() {
  const search     = (document.getElementById('s-prod-search')?.value || '').toLowerCase().trim();
  const resultsEl  = document.getElementById('s-prod-results');
  if (!resultsEl) return;
  if (!search) { resultsEl.innerHTML = ''; return; }

  const matches = allProducts
    .filter(p => p.name?.toLowerCase().includes(search) || p.category?.toLowerCase().includes(search))
    .slice(0, 8);

  if (matches.length === 0) {
    resultsEl.innerHTML = `<div class="sale-prod-empty">🔍 لا توجد نتائج لـ "${esc(search)}"</div>`;
    return;
  }

  resultsEl.innerHTML = matches.map(p => {
    const isOut = (p.quantity || 0) <= 0;
    const thumb = p.imageBase64
      ? `<img src="${p.imageBase64}" class="prod-thumb" style="width:36px;height:36px" alt="">`
      : `<span class="prod-thumb-icon" style="width:36px;height:36px;font-size:18px">📦</span>`;
    return `
      <div class="sale-prod-item${isOut ? ' sale-prod-out' : ''}" onclick="quickAddSaleProduct('${p.id}')">
        ${thumb}
        <div style="flex:1;min-width:0">
          <div class="fw-600" style="font-size:14px">${esc(p.name)}</div>
          <div style="font-size:12px;color:var(--text-muted)">
            ${formatCurrency(p.sellPrice)} / ${esc(p.unit||'وحدة')}
            &nbsp;·&nbsp;
            <span class="${isOut ? 'text-danger' : 'text-success'}">
              ${isOut ? 'نفد' : `متوفر: ${p.quantity}`}
            </span>
          </div>
        </div>
        <button class="btn btn-primary btn-sm" ${isOut ? 'disabled' : ''}>+ إضافة</button>
      </div>`;
  }).join('');
}

// ── Quick Add Product ─────────────────────────────────────
window.quickAddSaleProduct = id => {
  const product = allProducts.find(p => p.id === id);
  if (!product || (product.quantity || 0) <= 0) return toast('نفد هذا المنتج من المخزون', 'warning');

  const qty       = Math.max(0.01, parseNum(document.getElementById('s-qty')?.value, 1) || 1);
  const available = product.quantity || 0;
  if (qty > available) return toast(`الكمية المتوفرة ${available} ${product.unit||''} فقط`, 'warning');

  const existing = saleItems.find(i => i.productId === id);
  if (existing) {
    const newQty = +(existing.qty + qty).toFixed(3);
    if (newQty > available) return toast(`الكمية المتوفرة ${available} فقط`, 'warning');
    existing.qty   = newQty;
    existing.total = +(newQty * existing.sellPrice).toFixed(2);
  } else {
    saleItems.push({
      productId:   id,
      productName: product.name,
      unit:        product.unit || '',
      qty,
      buyPrice:    product.buyPrice  || 0,
      sellPrice:   product.sellPrice || 0,
      total:       +(qty * (product.sellPrice || 0)).toFixed(2),
      imageBase64: product.imageBase64 || null
    });
  }

  renderSaleItems();
  renderSaleTotals();

  const searchEl = document.getElementById('s-prod-search');
  if (searchEl) searchEl.value = '';
  document.getElementById('s-prod-results').innerHTML = '';
  document.getElementById('s-qty').value = 1;
  toast(`✅ ${product.name} — ${qty} ${product.unit||''}`, 'success', 1500);
};

// ── Render Sale Items ─────────────────────────────────────
function renderSaleItems() {
  const wrap = document.getElementById('sale-items-wrap');
  if (!wrap) return;

  if (saleItems.length === 0) {
    wrap.innerHTML = `<div class="sale-items-empty">
      <span style="font-size:36px">🧾</span>
      <p>ابحث عن منتج بالأعلى وانقر عليه لإضافته للفاتورة</p>
    </div>`;
    return;
  }

  wrap.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <span style="font-weight:700;font-size:14px">بنود الفاتورة</span>
      <span class="badge badge-primary">${saleItems.length} ${saleItems.length === 1 ? 'صنف' : 'أصناف'}</span>
    </div>
    <div class="items-table">
      <table>
        <thead><tr>
          <th>#</th><th>المنتج</th><th>الكمية</th><th>السعر</th><th>المجموع</th><th></th>
        </tr></thead>
        <tbody>${saleItems.map((item, i) => {
          const thumb = item.imageBase64
            ? `<img src="${item.imageBase64}" class="prod-thumb" style="width:28px;height:28px;border-radius:6px" alt="">`
            : '';
          return `
          <tr>
            <td class="text-muted">${i+1}</td>
            <td><div class="prod-name-cell">
              ${thumb}
              <span class="fw-600">${esc(item.productName)}</span>
              <span class="text-muted text-sm">${esc(item.unit)}</span>
            </div></td>
            <td><input type="number" class="qty-input" value="${item.qty}" min="0.01" step="0.01"
                 onchange="updateSaleItem(${i},'qty',this.value)"></td>
            <td><input type="number" class="price-input" value="${item.sellPrice}" min="0" step="0.01"
                 onchange="updateSaleItem(${i},'price',this.value)"></td>
            <td class="fw-600 text-primary">${formatCurrency(item.total)}</td>
            <td><button class="btn-icon-only" style="color:var(--danger)"
                onclick="removeSaleItem(${i})" title="حذف">✕</button></td>
          </tr>`;
        }).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderSaleTotals() {
  const wrap      = document.getElementById('sale-totals');
  if (!wrap) return;
  const subtotal  = saleItems.reduce((a, i) => a + i.total, 0);
  const totalCost = saleItems.reduce((a, i) => a + i.qty * i.buyPrice, 0);
  const discount  = parseNum(document.getElementById('s-discount')?.value);
  const total     = subtotal - discount;
  const profit    = total - totalCost;

  wrap.innerHTML = `
    <div class="totals-row"><span>المجموع الفرعي</span><span>${formatCurrency(subtotal)}</span></div>
    <div class="totals-row"><span>الخصم</span><span class="text-danger">- ${formatCurrency(discount)}</span></div>
    <div class="totals-row grand"><span>الإجمالي</span><span>${formatCurrency(total)}</span></div>
    <div class="totals-row profit"><span>الربح المتوقع</span><span>${formatCurrency(profit)}</span></div>`;
}

window.updateSaleItem = (i, field, val) => {
  if (field === 'qty')   { saleItems[i].qty = parseNum(val); saleItems[i].total = +(saleItems[i].qty * saleItems[i].sellPrice).toFixed(2); }
  if (field === 'price') { saleItems[i].sellPrice = parseNum(val); saleItems[i].total = +(saleItems[i].qty * saleItems[i].sellPrice).toFixed(2); }
  renderSaleItems(); renderSaleTotals();
};
window.removeSaleItem = i => { saleItems.splice(i, 1); renderSaleItems(); renderSaleTotals(); };

// ── Save Sale ─────────────────────────────────────────────
async function saveSale() {
  if (saleItems.length === 0) return toast('أضف منتجاً واحداً على الأقل', 'error');

  const date     = document.getElementById('s-date')?.value;
  const custId   = document.getElementById('s-customer')?.value;
  const discount = parseNum(document.getElementById('s-discount')?.value);
  const status   = document.getElementById('s-status')?.value;
  const notes    = document.getElementById('s-notes')?.value.trim();

  if (!date) return toast('أدخل التاريخ', 'error');

  const customer    = allCustomers.find(c => c.id === custId);
  const subtotal    = saleItems.reduce((a, i) => a + i.total, 0);
  const totalCost   = saleItems.reduce((a, i) => a + i.qty * i.buyPrice, 0);
  const totalAmount = subtotal - discount;
  const profit      = totalAmount - totalCost;
  const invoiceNo   = shortId();

  const saleData = {
    invoiceNo, date, customerId: custId, customerName: customer?.name || 'عميل نقدي',
    items: saleItems.slice(), subtotal, discount, totalAmount, totalCost, profit,
    status, paidAmount: status === 'paid' ? totalAmount : 0,
    notes, createdAt: serverTimestamp()
  };

  const btn = document.getElementById('btn-save-sale');
  btn.disabled = true;

  try {
    const batch   = writeBatch(db);
    const saleRef = doc(collection(db, 'sales'));
    batch.set(saleRef, saleData);

    saleItems.forEach(item => {
      const prod = allProducts.find(p => p.id === item.productId);
      if (prod) {
        batch.update(doc(db, 'inventory', item.productId), {
          quantity: Math.max(0, (prod.quantity || 0) - item.qty),
          updatedAt: serverTimestamp()
        });
      }
    });

    if (custId && status === 'credit') {
      const c = allCustomers.find(x => x.id === custId);
      batch.update(doc(db, 'customers', custId), {
        balance: ((c?.balance || 0) + totalAmount),
        updatedAt: serverTimestamp()
      });
    }

    await batch.commit();
    toast(`✅ تم حفظ الفاتورة — ${saleItems.length} صنف`, 'success');
    closeModal();
    await refreshSales();
  } catch (err) {
    toast('خطأ: ' + err.message, 'error');
    btn.disabled = false;
  }
}
