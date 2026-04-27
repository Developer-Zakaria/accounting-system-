/* ===== Purchases Page ===== */
import { db } from './firebase-config.js';
import {
  collection, getDocs, updateDoc, deleteDoc,
  doc, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  formatCurrency, formatDate, esc, toast, openModal, closeModal,
  confirm, debounce
} from './utils.js';
import { openNewPurchaseModal } from './purchases-modal.js';

const COL = 'purchases';
export let allPurchases = [];
export let allProducts  = [];
export let allSuppliers = [];

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

export async function refreshPurchases() {
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
