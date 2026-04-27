/* ===== Inventory / Products Page ===== */
import { db } from './firebase-config.js';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, orderBy, query, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  formatCurrency, esc, toast, openModal, closeModal,
  confirm, today, parseNum, debounce
} from './utils.js';

const COL = 'inventory';

export async function loadInventory(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2>المخزون 📦</h2>
        <p>إدارة المنتجات وتتبع الكميات</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="btn-add-product">+ إضافة منتج</button>
      </div>
    </div>

    <!-- Stats -->
    <div class="stats-grid mb-3" id="inv-stats"></div>

    <!-- Filter -->
    <div class="search-bar">
      <div class="search-input-wrap">
        <span class="search-icon">🔍</span>
        <input type="text" class="search-input" id="inv-search" placeholder="ابحث عن منتج...">
      </div>
      <select class="form-control" id="inv-category" style="width:auto;min-width:160px">
        <option value="">كل الفئات</option>
      </select>
      <select class="form-control" id="inv-filter-stock" style="width:auto;min-width:160px">
        <option value="">كل المنتجات</option>
        <option value="low">مخزون منخفض</option>
        <option value="ok">مخزون كافٍ</option>
      </select>
    </div>

    <!-- Table -->
    <div class="card">
      <div class="card-body p-0" id="inv-table-wrap">
        <div class="loading-page"><div class="spinner"></div></div>
      </div>
    </div>`;

  document.getElementById('btn-add-product').addEventListener('click', () => openProductModal());
  document.getElementById('inv-search').addEventListener('input',
    debounce(() => renderTable(getFilteredProducts()), 300));
  document.getElementById('inv-category').addEventListener('change', () => renderTable(getFilteredProducts()));
  document.getElementById('inv-filter-stock').addEventListener('change', () => renderTable(getFilteredProducts()));

  await refreshInventory();
}

let allProducts = [];

async function refreshInventory() {
  const snap = await getDocs(query(collection(db, COL), orderBy('name')));
  allProducts = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Fill categories
  const cats = [...new Set(allProducts.map(p => p.category).filter(Boolean))].sort();
  const catSel = document.getElementById('inv-category');
  if (catSel) {
    const cur = catSel.value;
    catSel.innerHTML = `<option value="">كل الفئات</option>` +
      cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    catSel.value = cur;
  }

  renderStats();
  renderTable(getFilteredProducts());

  // Update badge
  const lowCount = allProducts.filter(p => (p.quantity || 0) <= (p.minQuantity || 0)).length;
  const badge = document.getElementById('badge-inventory');
  if (badge) badge.textContent = lowCount > 0 ? lowCount : '';
}

function getFilteredProducts() {
  const search = (document.getElementById('inv-search')?.value || '').toLowerCase();
  const cat    = document.getElementById('inv-category')?.value || '';
  const stockF = document.getElementById('inv-filter-stock')?.value || '';

  return allProducts.filter(p => {
    const matchSearch = !search ||
      p.name?.toLowerCase().includes(search) ||
      p.category?.toLowerCase().includes(search);
    const matchCat   = !cat    || p.category === cat;
    const isLow      = (p.quantity || 0) <= (p.minQuantity || 0);
    const matchStock = !stockF || (stockF === 'low' ? isLow : !isLow);
    return matchSearch && matchCat && matchStock;
  });
}

function renderStats() {
  const el = document.getElementById('inv-stats');
  if (!el) return;
  const totalItems = allProducts.length;
  const lowStock   = allProducts.filter(p => (p.quantity || 0) <= (p.minQuantity || 0)).length;
  const totalValue = allProducts.reduce((s, p) => s + (p.quantity || 0) * (p.buyPrice || 0), 0);
  const sellValue  = allProducts.reduce((s, p) => s + (p.quantity || 0) * (p.sellPrice || 0), 0);

  el.innerHTML = `
    <div class="stat-card">
      <div class="stat-icon blue">📦</div>
      <div class="stat-info">
        <div class="stat-label">إجمالي المنتجات</div>
        <div class="stat-value">${totalItems}</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon red">⚠️</div>
      <div class="stat-info">
        <div class="stat-label">مخزون منخفض</div>
        <div class="stat-value text-danger">${lowStock}</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon orange">💰</div>
      <div class="stat-info">
        <div class="stat-label">قيمة المخزون (شراء)</div>
        <div class="stat-value">${formatCurrency(totalValue)}</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon green">📈</div>
      <div class="stat-info">
        <div class="stat-label">قيمة المخزون (بيع)</div>
        <div class="stat-value text-success">${formatCurrency(sellValue)}</div>
      </div>
    </div>`;
}

function renderTable(products) {
  const wrap = document.getElementById('inv-table-wrap');
  if (!wrap) return;

  if (products.length === 0) {
    wrap.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">📦</div>
      <h3>لا توجد منتجات</h3>
      <p>أضف منتجاً جديداً للبدء</p>
    </div>`;
    return;
  }

  wrap.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>اسم المنتج</th>
            <th>الفئة</th>
            <th>الوحدة</th>
            <th>سعر الشراء</th>
            <th>سعر البيع</th>
            <th>الكمية</th>
            <th>الحد الأدنى</th>
            <th>الحالة</th>
            <th>الإجراءات</th>
          </tr>
        </thead>
        <tbody>
          ${products.map((p, i) => {
            const isLow = (p.quantity || 0) <= (p.minQuantity || 0);
            return `
            <tr>
              <td class="text-muted text-sm">${i + 1}</td>
              <td class="fw-600">${esc(p.name)}</td>
              <td class="text-muted">${esc(p.category || '-')}</td>
              <td class="text-muted">${esc(p.unit || '-')}</td>
              <td>${formatCurrency(p.buyPrice)}</td>
              <td class="text-success">${formatCurrency(p.sellPrice)}</td>
              <td class="${isLow ? 'text-danger fw-bold' : 'fw-600'}">${p.quantity || 0}</td>
              <td class="text-muted">${p.minQuantity || 0}</td>
              <td>${isLow
                ? `<span class="badge badge-danger">⚠️ منخفض</span>`
                : `<span class="badge badge-success">✅ كافٍ</span>`}</td>
              <td>
                <div class="table-actions">
                  <button class="btn-icon-only" onclick="editProduct('${p.id}')" title="تعديل">✏️</button>
                  <button class="btn-icon-only" onclick="adjustQty('${p.id}')" title="تعديل الكمية">📊</button>
                  <button class="btn-icon-only" onclick="deleteProduct('${p.id}')" title="حذف">🗑️</button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

// ── Product Modal ─────────────────────────────────────────
function openProductModal(product = null) {
  const isEdit = !!product;
  const title  = isEdit ? 'تعديل منتج' : 'إضافة منتج جديد';

  openModal(title, `
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">اسم المنتج <span class="required">*</span></label>
        <input type="text" id="f-name" class="form-control" value="${esc(product?.name || '')}" placeholder="اسم المنتج">
      </div>
      <div class="form-group">
        <label class="form-label">الفئة</label>
        <input type="text" id="f-category" class="form-control" value="${esc(product?.category || '')}" placeholder="مثال: مشروبات، مواد غذائية">
      </div>
      <div class="form-group">
        <label class="form-label">وحدة القياس</label>
        <select id="f-unit" class="form-control">
          ${['قطعة','كيلو','غرام','لتر','علبة','صندوق','كرتون','حبة','رزمة','كيس','أخرى']
            .map(u => `<option${product?.unit === u ? ' selected' : ''}>${u}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">الكمية الحالية</label>
        <input type="number" id="f-qty" class="form-control" min="0" value="${product?.quantity ?? 0}">
      </div>
      <div class="form-group">
        <label class="form-label">الحد الأدنى للتنبيه</label>
        <input type="number" id="f-min-qty" class="form-control" min="0" value="${product?.minQuantity ?? 5}">
      </div>
      <div class="form-group">
        <label class="form-label">سعر الشراء <span class="required">*</span></label>
        <input type="number" id="f-buy-price" class="form-control" min="0" step="0.01" value="${product?.buyPrice ?? ''}">
      </div>
      <div class="form-group">
        <label class="form-label">سعر البيع (جملة) <span class="required">*</span></label>
        <input type="number" id="f-sell-price" class="form-control" min="0" step="0.01" value="${product?.sellPrice ?? ''}">
      </div>
      <div class="form-group form-full">
        <label class="form-label">ملاحظات</label>
        <textarea id="f-notes" class="form-control" rows="2">${esc(product?.notes || '')}</textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>
      <button class="btn btn-primary" id="btn-save-product">
        ${isEdit ? '💾 حفظ التعديلات' : '+ إضافة المنتج'}
      </button>
    </div>
  `);

  // Expose closeModal globally for onclick
  window.closeModal = closeModal;

  document.getElementById('btn-save-product').addEventListener('click', () =>
    saveProduct(product?.id || null));
}

async function saveProduct(id) {
  const name      = document.getElementById('f-name')?.value.trim();
  const category  = document.getElementById('f-category')?.value.trim();
  const unit      = document.getElementById('f-unit')?.value;
  const qty       = parseNum(document.getElementById('f-qty')?.value);
  const minQty    = parseNum(document.getElementById('f-min-qty')?.value);
  const buyPrice  = parseNum(document.getElementById('f-buy-price')?.value);
  const sellPrice = parseNum(document.getElementById('f-sell-price')?.value);
  const notes     = document.getElementById('f-notes')?.value.trim();

  if (!name) return toast('الرجاء إدخال اسم المنتج', 'error');
  if (buyPrice <= 0)  return toast('الرجاء إدخال سعر الشراء', 'error');
  if (sellPrice <= 0) return toast('الرجاء إدخال سعر البيع', 'error');

  const data = { name, category, unit, quantity: qty, minQuantity: minQty,
                 buyPrice, sellPrice, notes, updatedAt: serverTimestamp() };

  try {
    const btn = document.getElementById('btn-save-product');
    btn.disabled = true;
    if (id) {
      await updateDoc(doc(db, COL, id), data);
      toast('تم تحديث المنتج بنجاح', 'success');
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, COL), data);
      toast('تم إضافة المنتج بنجاح', 'success');
    }
    closeModal();
    await refreshInventory();
  } catch (err) {
    toast('حدث خطأ: ' + err.message, 'error');
    document.getElementById('btn-save-product').disabled = false;
  }
}

// Adjust quantity modal
function openAdjustModal(product) {
  openModal('تعديل الكمية', `
    <p class="mb-2">المنتج: <strong>${esc(product.name)}</strong></p>
    <p class="mb-3">الكمية الحالية: <strong class="text-primary">${product.quantity || 0} ${esc(product.unit || '')}</strong></p>
    <div class="form-group">
      <label class="form-label">نوع التعديل</label>
      <select id="adj-type" class="form-control">
        <option value="add">إضافة (وارد)</option>
        <option value="sub">خصم (صادر)</option>
        <option value="set">تعيين مباشر</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">الكمية</label>
      <input type="number" id="adj-qty" class="form-control" min="0" placeholder="أدخل الكمية">
    </div>
    <div class="form-group">
      <label class="form-label">سبب التعديل</label>
      <input type="text" id="adj-note" class="form-control" placeholder="مثال: جرد، تالف...">
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>
      <button class="btn btn-primary" id="btn-adj-save">حفظ</button>
    </div>
  `, 'sm');

  document.getElementById('btn-adj-save').addEventListener('click', async () => {
    const type = document.getElementById('adj-type').value;
    const qty  = parseNum(document.getElementById('adj-qty').value);
    if (!qty && type !== 'set') return toast('أدخل الكمية', 'error');

    let newQty = product.quantity || 0;
    if (type === 'add') newQty += qty;
    else if (type === 'sub') newQty = Math.max(0, newQty - qty);
    else newQty = qty;

    await updateDoc(doc(db, COL, product.id), { quantity: newQty, updatedAt: serverTimestamp() });
    toast('تم تحديث الكمية', 'success');
    closeModal();
    await refreshInventory();
  });
}

// Global functions for onclick
window.editProduct   = id => openProductModal(allProducts.find(p => p.id === id));
window.adjustQty     = id => openAdjustModal(allProducts.find(p => p.id === id));
window.deleteProduct = async id => {
  if (await confirm('هل تريد حذف هذا المنتج؟', 'لا يمكن التراجع عن هذا الإجراء')) {
    await deleteDoc(doc(db, COL, id));
    toast('تم حذف المنتج', 'success');
    await refreshInventory();
  }
};

export { allProducts };
