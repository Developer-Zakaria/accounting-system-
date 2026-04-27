/* ===== Purchases Page ===== */
import { db } from './firebase-config.js';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  formatCurrency, formatDate, esc, toast, openModal, closeModal,
  confirm, today, parseNum, debounce, shortId
} from './utils.js';

const COL = 'purchases';
let allPurchases = [];
let purchaseItems = [];
let allProducts   = [];
let allSuppliers  = [];

export async function loadPurchases(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2>المشتريات 🛒</h2>
        <p>إدارة الطلبيات والمشتريات من الموردين</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="btn-new-purchase">+ فاتورة شراء جديدة</button>
      </div>
    </div>
    <div class="stats-grid mb-3" id="pur-stats"></div>
    <div class="search-bar">
      <div class="search-input-wrap">
        <span class="search-icon">🔍</span>
        <input type="text" class="search-input" id="pur-search" placeholder="ابحث باسم المورد أو رقم الفاتورة...">
      </div>
      <select class="form-control" id="pur-status" style="width:auto;min-width:150px">
        <option value="">كل الحالات</option>
        <option value="paid">مدفوعة</option>
        <option value="credit">آجل</option>
      </select>
      <input type="date" class="form-control" id="pur-date-from" style="width:auto">
      <input type="date" class="form-control" id="pur-date-to" style="width:auto">
    </div>
    <div class="card"><div class="card-body p-0" id="pur-table-wrap">
      <div class="loading-page"><div class="spinner"></div></div>
    </div></div>`;

  document.getElementById('btn-new-purchase').addEventListener('click', openNewPurchaseModal);
  ['pur-search','pur-status','pur-date-from','pur-date-to'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', debounce(renderPurchasesTable, 250));
  });

  await refreshPurchases();
}

async function refreshPurchases() {
  const [purchSnap, prodSnap, suppSnap] = await Promise.all([
    getDocs(query(collection(db, COL), orderBy('createdAt', 'desc'))),
    getDocs(collection(db, 'inventory')),
    getDocs(collection(db, 'suppliers'))
  ]);
  allPurchases = purchSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  allProducts  = prodSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  allSuppliers = suppSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderPurchasesStats();
  renderPurchasesTable();
}

function getFilteredPurchases() {
  const search   = (document.getElementById('pur-search')?.value || '').toLowerCase();
  const status   = document.getElementById('pur-status')?.value || '';
  const dateFrom = document.getElementById('pur-date-from')?.value || '';
  const dateTo   = document.getElementById('pur-date-to')?.value || '';
  return allPurchases.filter(p =>
    (!search || p.supplierName?.toLowerCase().includes(search) || p.refNo?.toLowerCase().includes(search)) &&
    (!status || p.status === status) &&
    (!dateFrom || p.date >= dateFrom) &&
    (!dateTo   || p.date <= dateTo)
  );
}

function renderPurchasesStats() {
  const el = document.getElementById('pur-stats');
  if (!el) return;
  const now  = new Date();
  const mPfx = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const monthP = allPurchases.filter(p => p.date?.startsWith(mPfx));
  const monthTotal = monthP.reduce((a, p) => a + (p.totalAmount || 0), 0);
  const unpaid = allPurchases.filter(p => p.status === 'credit')
                             .reduce((a, p) => a + ((p.totalAmount||0)-(p.paidAmount||0)), 0);

  el.innerHTML = `
    <div class="stat-card"><div class="stat-icon blue">🛒</div><div class="stat-info">
      <div class="stat-label">مشتريات الشهر</div>
      <div class="stat-value">${formatCurrency(monthTotal)}</div>
    </div></div>
    <div class="stat-card"><div class="stat-icon orange">📋</div><div class="stat-info">
      <div class="stat-label">عدد الفواتير (الشهر)</div>
      <div class="stat-value">${monthP.length}</div>
    </div></div>
    <div class="stat-card"><div class="stat-icon red">⏳</div><div class="stat-info">
      <div class="stat-label">ذمم للموردين</div>
      <div class="stat-value text-danger">${formatCurrency(unpaid)}</div>
    </div></div>
    <div class="stat-card"><div class="stat-icon green">✅</div><div class="stat-info">
      <div class="stat-label">إجمالي المشتريات</div>
      <div class="stat-value">${formatCurrency(allPurchases.reduce((a,p)=>a+(p.totalAmount||0),0))}</div>
    </div></div>`;
}

function renderPurchasesTable() {
  const wrap = document.getElementById('pur-table-wrap');
  if (!wrap) return;
  const purchases = getFilteredPurchases();
  if (purchases.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🛒</div>
      <h3>لا توجد مشتريات</h3><p>أضف فاتورة شراء جديدة</p></div>`;
    return;
  }
  wrap.innerHTML = `<div class="table-wrap"><table>
    <thead><tr>
      <th>#</th><th>رقم الفاتورة</th><th>المورد</th><th>التاريخ</th>
      <th>المبلغ</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th><th>الإجراءات</th>
    </tr></thead>
    <tbody>${purchases.map((p, i) => {
      const remaining = (p.totalAmount || 0) - (p.paidAmount || 0);
      return `<tr>
        <td class="text-muted text-sm">${i+1}</td>
        <td class="text-sm text-muted">${esc(p.refNo || '-')}</td>
        <td class="fw-600">${esc(p.supplierName || '-')}</td>
        <td class="text-muted">${formatDate(p.date)}</td>
        <td class="fw-600 text-primary">${formatCurrency(p.totalAmount)}</td>
        <td class="text-success">${formatCurrency(p.paidAmount)}</td>
        <td class="${remaining > 0 ? 'text-danger fw-600' : 'text-muted'}">${formatCurrency(remaining)}</td>
        <td>${p.status === 'paid'
          ? `<span class="badge badge-success">✅ مدفوع</span>`
          : `<span class="badge badge-warning">⏳ آجل</span>`}</td>
        <td><div class="table-actions">
          <button class="btn-icon-only" onclick="viewPurchase('${p.id}')" title="عرض">👁</button>
          ${p.status === 'credit'
            ? `<button class="btn-icon-only" onclick="markPurchasePaid('${p.id}')" title="تسديد">💳</button>`
            : ''}
          <button class="btn-icon-only" onclick="deletePurchase('${p.id}')" title="حذف">🗑️</button>
        </div></td>
      </tr>`;
    }).join('')}
    </tbody>
    <tfoot><tr>
      <td colspan="4" class="fw-bold">الإجمالي (${purchases.length} فاتورة)</td>
      <td class="fw-bold text-primary">${formatCurrency(purchases.reduce((a,p)=>a+(p.totalAmount||0),0))}</td>
      <td class="fw-bold text-success">${formatCurrency(purchases.reduce((a,p)=>a+(p.paidAmount||0),0))}</td>
      <td class="fw-bold text-danger">${formatCurrency(purchases.reduce((a,p)=>a+((p.totalAmount||0)-(p.paidAmount||0)),0))}</td>
      <td colspan="2"></td>
    </tr></tfoot>
  </table></div>`;
}

// ── New Purchase Modal ─────────────────────────────────────
function openNewPurchaseModal() {
  purchaseItems = [];
  const supplierOpts = `<option value="">-- اختر المورد --</option>` +
    allSuppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  const productOpts = allProducts
    .map(p => `<option value="${p.id}" data-buy="${p.buyPrice}" data-unit="${esc(p.unit||'')}">
      ${esc(p.name)} (${esc(p.unit||'')})</option>`).join('');

  openModal('فاتورة شراء جديدة', `
    <div class="form-grid mb-2">
      <div class="form-group">
        <label class="form-label">التاريخ</label>
        <input type="date" id="p-date" class="form-control" value="${today()}">
      </div>
      <div class="form-group">
        <label class="form-label">المورد</label>
        <select id="p-supplier" class="form-control">${supplierOpts}</select>
      </div>
    </div>

    <div class="card mb-2" style="background:#F8FAFF">
      <div class="card-body">
        <div class="form-grid-3">
          <div class="form-group mb-0">
            <label class="form-label">المنتج</label>
            <select id="p-prod" class="form-control">
              <option value="">-- اختر المنتج --</option>${productOpts}
            </select>
          </div>
          <div class="form-group mb-0">
            <label class="form-label">الكمية</label>
            <input type="number" id="p-qty" class="form-control" min="1" value="1">
          </div>
          <div class="form-group mb-0">
            <label class="form-label">سعر الشراء</label>
            <input type="number" id="p-price" class="form-control" min="0" step="0.01">
          </div>
        </div>
        <button class="btn btn-outline mt-2" id="btn-add-pur-item">+ إضافة للفاتورة</button>
      </div>
    </div>

    <div id="pur-items-wrap" class="mb-2"></div>

    <div class="form-grid">
      <div>
        <div class="form-group">
          <label class="form-label">طريقة الدفع</label>
          <select id="p-status" class="form-control">
            <option value="paid">نقدي (مدفوع)</option>
            <option value="credit">آجل</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">ملاحظات</label>
          <textarea id="p-notes" class="form-control" rows="2"></textarea>
        </div>
      </div>
      <div id="pur-totals" class="totals-box" style="height:fit-content"></div>
    </div>

    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>
      <button class="btn btn-primary" id="btn-save-purchase">💾 حفظ فاتورة الشراء</button>
    </div>
  `, 'lg');

  window.closeModal = closeModal;

  document.getElementById('p-prod')?.addEventListener('change', () => {
    const opt = document.getElementById('p-prod').options[document.getElementById('p-prod').selectedIndex];
    document.getElementById('p-price').value = opt.dataset.buy || '';
  });

  document.getElementById('btn-add-pur-item')?.addEventListener('click', addPurchaseItem);
  document.getElementById('btn-save-purchase')?.addEventListener('click', savePurchase);
}

function addPurchaseItem() {
  const prodSel = document.getElementById('p-prod');
  const prodId  = prodSel?.value;
  const qty     = parseNum(document.getElementById('p-qty')?.value, 0);
  const price   = parseNum(document.getElementById('p-price')?.value, 0);

  if (!prodId)  return toast('اختر منتجاً', 'error');
  if (qty <= 0) return toast('أدخل كمية صحيحة', 'error');

  const product = allProducts.find(p => p.id === prodId);
  if (!product) return;

  const existing = purchaseItems.find(i => i.productId === prodId);
  if (existing) {
    existing.qty   += qty;
    existing.total  = existing.qty * price;
    existing.buyPrice = price;
  } else {
    purchaseItems.push({
      productId: prodId, productName: product.name,
      unit: product.unit || '', qty, buyPrice: price, total: qty * price
    });
  }
  renderPurchaseItems();
  renderPurchaseTotals();
  document.getElementById('p-qty').value = 1;
  document.getElementById('p-prod').value = '';
  document.getElementById('p-price').value = '';
}

function renderPurchaseItems() {
  const wrap = document.getElementById('pur-items-wrap');
  if (!wrap) return;
  if (purchaseItems.length === 0) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = `<div class="items-table"><table>
    <thead><tr><th>#</th><th>المنتج</th><th>الوحدة</th><th>الكمية</th><th>السعر</th><th>المجموع</th><th></th></tr></thead>
    <tbody>${purchaseItems.map((item, i) => `
      <tr>
        <td>${i+1}</td>
        <td class="fw-600">${esc(item.productName)}</td>
        <td class="text-muted">${esc(item.unit)}</td>
        <td><input type="number" class="qty-input" value="${item.qty}" min="1"
             onchange="updatePurItem(${i},'qty',this.value)"></td>
        <td><input type="number" class="price-input" value="${item.buyPrice}" min="0" step="0.01"
             onchange="updatePurItem(${i},'price',this.value)"></td>
        <td class="fw-600 text-primary">${formatCurrency(item.total)}</td>
        <td><button class="btn-icon-only" onclick="removePurItem(${i})">✕</button></td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}

function renderPurchaseTotals() {
  const wrap = document.getElementById('pur-totals');
  if (!wrap) return;
  const total = purchaseItems.reduce((a, i) => a + i.total, 0);
  wrap.innerHTML = `
    <div class="totals-row grand"><span>الإجمالي</span><span>${formatCurrency(total)}</span></div>
    <div class="totals-row"><span>عدد الأصناف</span><span>${purchaseItems.length}</span></div>`;
}

window.updatePurItem = (i, field, val) => {
  if (field === 'qty')   { purchaseItems[i].qty = parseNum(val); }
  if (field === 'price') { purchaseItems[i].buyPrice = parseNum(val); }
  purchaseItems[i].total = purchaseItems[i].qty * purchaseItems[i].buyPrice;
  renderPurchaseItems(); renderPurchaseTotals();
};
window.removePurItem = i => { purchaseItems.splice(i, 1); renderPurchaseItems(); renderPurchaseTotals(); };

async function savePurchase() {
  if (purchaseItems.length === 0) return toast('أضف منتجاً واحداً على الأقل', 'error');

  const date    = document.getElementById('p-date')?.value;
  const suppId  = document.getElementById('p-supplier')?.value;
  const status  = document.getElementById('p-status')?.value;
  const notes   = document.getElementById('p-notes')?.value.trim();

  if (!date) return toast('أدخل التاريخ', 'error');
  if (!suppId) return toast('اختر المورد', 'error');

  const supplier    = allSuppliers.find(s => s.id === suppId);
  const totalAmount = purchaseItems.reduce((a, i) => a + i.total, 0);
  const refNo       = shortId();

  const data = {
    refNo, date, supplierId: suppId, supplierName: supplier?.name || '-',
    items: purchaseItems, totalAmount,
    status, paidAmount: status === 'paid' ? totalAmount : 0,
    notes, createdAt: serverTimestamp()
  };

  const btn = document.getElementById('btn-save-purchase');
  btn.disabled = true;

  try {
    const batch = writeBatch(db);
    const purRef = doc(collection(db, COL));
    batch.set(purRef, data);

    // Increase inventory quantities and update buy prices
    purchaseItems.forEach(item => {
      const prod = allProducts.find(p => p.id === item.productId);
      if (prod) {
        batch.update(doc(db, 'inventory', item.productId), {
          quantity: (prod.quantity || 0) + item.qty,
          buyPrice: item.buyPrice,
          updatedAt: serverTimestamp()
        });
      }
    });

    // Update supplier balance if credit
    if (suppId && status === 'credit') {
      const s = allSuppliers.find(x => x.id === suppId);
      batch.update(doc(db, 'suppliers', suppId), {
        balance: ((s?.balance || 0) + totalAmount),
        updatedAt: serverTimestamp()
      });
    }

    await batch.commit();
    toast('تم حفظ فاتورة الشراء بنجاح ✅', 'success');
    closeModal();
    await refreshPurchases();
  } catch (err) {
    toast('خطأ: ' + err.message, 'error');
    btn.disabled = false;
  }
}

window.viewPurchase = id => {
  const p = allPurchases.find(x => x.id === id);
  if (!p) return;
  openModal(`فاتورة شراء ${p.refNo || id}`, `
    <div class="mb-2 flex-between flex-wrap gap-2">
      <div><strong>المورد:</strong> ${esc(p.supplierName || '-')}</div>
      <div><strong>التاريخ:</strong> ${formatDate(p.date)}</div>
    </div>
    <div class="items-table mb-2"><table>
      <thead><tr><th>#</th><th>المنتج</th><th>الكمية</th><th>الوحدة</th><th>سعر الشراء</th><th>المجموع</th></tr></thead>
      <tbody>${(p.items||[]).map((item,i)=>`
        <tr><td>${i+1}</td><td>${esc(item.productName)}</td>
        <td>${item.qty}</td><td>${esc(item.unit||'-')}</td>
        <td>${formatCurrency(item.buyPrice)}</td>
        <td class="fw-600">${formatCurrency(item.total)}</td></tr>`).join('')}
      </tbody>
    </table></div>
    <div class="totals-box">
      <div class="totals-row grand"><span>الإجمالي</span><span>${formatCurrency(p.totalAmount)}</span></div>
      <div class="totals-row"><span>المدفوع</span><span class="text-success">${formatCurrency(p.paidAmount)}</span></div>
      <div class="totals-row"><span>المتبقي</span><span class="text-danger">${formatCurrency((p.totalAmount||0)-(p.paidAmount||0))}</span></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">إغلاق</button>
    </div>
  `, 'lg');
  window.closeModal = closeModal;
};

window.markPurchasePaid = async id => {
  const p = allPurchases.find(x => x.id === id);
  if (!p) return;
  await updateDoc(doc(db, COL, id), { status: 'paid', paidAmount: p.totalAmount });
  if (p.supplierId) {
    const s = allSuppliers.find(x => x.id === p.supplierId);
    if (s) await updateDoc(doc(db, 'suppliers', p.supplierId), {
      balance: Math.max(0, (s.balance || 0) - (p.totalAmount || 0))
    });
  }
  toast('تم تسجيل الدفع ✅', 'success');
  await refreshPurchases();
};

window.deletePurchase = async id => {
  if (await confirm('هل تريد حذف هذه الفاتورة؟', 'لا يمكن التراجع عن هذا الإجراء')) {
    await deleteDoc(doc(db, COL, id));
    toast('تم الحذف', 'success');
    await refreshPurchases();
  }
};
