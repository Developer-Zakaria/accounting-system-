/* ===== Suppliers Page ===== */
import { db } from './firebase-config.js';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  formatCurrency, formatDate, esc, toast, openModal, closeModal,
  confirm, today, parseNum, debounce
} from './utils.js';

const COL = 'suppliers';
let allSuppliers = [];
let allPurchases = [];

export async function loadSuppliers(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2>الموردون 🏭</h2>
        <p>إدارة الموردين وتتبع الذمم الدائنة</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="btn-add-supplier">+ إضافة مورد</button>
      </div>
    </div>
    <div class="stats-grid mb-3" id="supp-stats"></div>
    <div class="search-bar">
      <div class="search-input-wrap">
        <span class="search-icon">🔍</span>
        <input type="text" class="search-input" id="supp-search" placeholder="ابحث باسم المورد أو الهاتف...">
      </div>
      <select class="form-control" id="supp-filter" style="width:auto;min-width:160px">
        <option value="">كل الموردين</option>
        <option value="debt">لديهم ذمة</option>
        <option value="clear">حسابهم صافٍ</option>
      </select>
    </div>
    <div class="card"><div class="card-body p-0" id="supp-table-wrap">
      <div class="loading-page"><div class="spinner"></div></div>
    </div></div>`;

  document.getElementById('btn-add-supplier').addEventListener('click', () => openSupplierModal());
  document.getElementById('supp-search').addEventListener('input', debounce(renderSuppliersTable, 250));
  document.getElementById('supp-filter').addEventListener('change', renderSuppliersTable);

  await refreshSuppliers();
}

async function refreshSuppliers() {
  const [suppSnap, purchSnap] = await Promise.all([
    getDocs(query(collection(db, COL), orderBy('name'))),
    getDocs(collection(db, 'purchases'))
  ]);
  allSuppliers = suppSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  allPurchases = purchSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderSuppliersStats();
  renderSuppliersTable();
}

function renderSuppliersStats() {
  const el = document.getElementById('supp-stats');
  if (!el) return;
  const totalPayables = allSuppliers.reduce((a, s) => a + Math.max(0, s.balance || 0), 0);
  const withDebt = allSuppliers.filter(s => (s.balance || 0) > 0).length;

  el.innerHTML = `
    <div class="stat-card"><div class="stat-icon blue">🏭</div><div class="stat-info">
      <div class="stat-label">إجمالي الموردين</div>
      <div class="stat-value">${allSuppliers.length}</div>
    </div></div>
    <div class="stat-card"><div class="stat-icon red">💸</div><div class="stat-info">
      <div class="stat-label">إجمالي الذمم الدائنة</div>
      <div class="stat-value text-danger">${formatCurrency(totalPayables)}</div>
    </div></div>
    <div class="stat-card"><div class="stat-icon orange">⏳</div><div class="stat-info">
      <div class="stat-label">موردون لديهم ذمة</div>
      <div class="stat-value text-warning">${withDebt}</div>
    </div></div>`;
}

function getFilteredSuppliers() {
  const search = (document.getElementById('supp-search')?.value || '').toLowerCase();
  const filter = document.getElementById('supp-filter')?.value || '';
  return allSuppliers.filter(s => {
    const matchSearch = !search || s.name?.toLowerCase().includes(search) || s.phone?.includes(search);
    const hasDebt = (s.balance || 0) > 0;
    const matchFilter = !filter || (filter === 'debt' ? hasDebt : !hasDebt);
    return matchSearch && matchFilter;
  });
}

function renderSuppliersTable() {
  const wrap = document.getElementById('supp-table-wrap');
  if (!wrap) return;
  const suppliers = getFilteredSuppliers();
  if (suppliers.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🏭</div>
      <h3>لا يوجد موردون</h3><p>أضف مورداً جديداً</p></div>`;
    return;
  }
  wrap.innerHTML = `<div class="table-wrap"><table>
    <thead><tr>
      <th>#</th><th>الاسم</th><th>الهاتف</th><th>العنوان</th>
      <th>الذمة</th><th>الحالة</th><th>الإجراءات</th>
    </tr></thead>
    <tbody>${suppliers.map((s, i) => {
      const balance = s.balance || 0;
      return `<tr>
        <td class="text-muted text-sm">${i+1}</td>
        <td class="fw-600">${esc(s.name)}</td>
        <td class="text-muted">${esc(s.phone || '-')}</td>
        <td class="text-muted text-sm">${esc(s.address || '-')}</td>
        <td class="${balance > 0 ? 'text-danger fw-600' : 'text-muted'}">${formatCurrency(balance)}</td>
        <td>${balance > 0
          ? `<span class="badge badge-danger">مستحق الدفع</span>`
          : `<span class="badge badge-success">نظيف</span>`}</td>
        <td><div class="table-actions">
          <button class="btn-icon-only" onclick="viewSupplier('${s.id}')" title="عرض السجل">👁</button>
          <button class="btn-icon-only" onclick="editSupplier('${s.id}')" title="تعديل">✏️</button>
          <button class="btn-icon-only" onclick="paySupplier('${s.id}')" title="تسجيل دفع">💳</button>
          <button class="btn-icon-only" onclick="deleteSupplier('${s.id}')" title="حذف">🗑️</button>
        </div></td>
      </tr>`;
    }).join('')}
    </tbody>
  </table></div>`;
}

function openSupplierModal(supplier = null) {
  const isEdit = !!supplier;
  openModal(isEdit ? 'تعديل مورد' : 'إضافة مورد جديد', `
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">الاسم <span class="required">*</span></label>
        <input type="text" id="s-name" class="form-control" value="${esc(supplier?.name||'')}" placeholder="اسم المورد">
      </div>
      <div class="form-group">
        <label class="form-label">رقم الهاتف</label>
        <input type="tel" id="s-phone" class="form-control" value="${esc(supplier?.phone||'')}" placeholder="07XX XXXXXXX">
      </div>
      <div class="form-group form-full">
        <label class="form-label">العنوان / الشركة</label>
        <input type="text" id="s-address" class="form-control" value="${esc(supplier?.address||'')}" placeholder="المدينة أو اسم الشركة">
      </div>
      <div class="form-group">
        <label class="form-label">الرصيد الابتدائي (ذمة)</label>
        <input type="number" id="s-balance" class="form-control" min="0" value="${supplier?.balance ?? 0}">
        <div class="form-hint">المبلغ المستحق للمورد حالياً</div>
      </div>
      <div class="form-group">
        <label class="form-label">ملاحظات</label>
        <textarea id="s-notes" class="form-control" rows="2">${esc(supplier?.notes||'')}</textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>
      <button class="btn btn-primary" id="btn-save-supp">${isEdit ? '💾 حفظ' : '+ إضافة'}</button>
    </div>
  `, 'sm');

  window.closeModal = closeModal;
  document.getElementById('btn-save-supp').addEventListener('click', () => saveSupplier(supplier?.id||null));
}

async function saveSupplier(id) {
  const name    = document.getElementById('s-name')?.value.trim();
  const phone   = document.getElementById('s-phone')?.value.trim();
  const address = document.getElementById('s-address')?.value.trim();
  const balance = parseNum(document.getElementById('s-balance')?.value);
  const notes   = document.getElementById('s-notes')?.value.trim();

  if (!name) return toast('أدخل اسم المورد', 'error');

  const data = { name, phone, address, balance, notes, updatedAt: serverTimestamp() };
  const btn  = document.getElementById('btn-save-supp');
  btn.disabled = true;

  try {
    if (id) {
      await updateDoc(doc(db, COL, id), data);
      toast('تم تحديث المورد', 'success');
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, COL), data);
      toast('تم إضافة المورد', 'success');
    }
    closeModal();
    await refreshSuppliers();
  } catch (err) {
    toast('خطأ: ' + err.message, 'error');
    btn.disabled = false;
  }
}

window.viewSupplier = id => {
  const s = allSuppliers.find(x => x.id === id);
  if (!s) return;
  const suppPurchases = allPurchases.filter(p => p.supplierId === id);
  const totalBought = suppPurchases.reduce((a, p) => a + (p.totalAmount || 0), 0);

  openModal(`سجل المورد: ${s.name}`, `
    <div class="stats-grid mb-3">
      <div class="stat-card"><div class="stat-icon blue">📋</div><div class="stat-info">
        <div class="stat-label">عدد الطلبيات</div>
        <div class="stat-value">${suppPurchases.length}</div>
      </div></div>
      <div class="stat-card"><div class="stat-icon orange">💰</div><div class="stat-info">
        <div class="stat-label">إجمالي المشتريات</div>
        <div class="stat-value">${formatCurrency(totalBought)}</div>
      </div></div>
      <div class="stat-card"><div class="stat-icon red">⏳</div><div class="stat-info">
        <div class="stat-label">الذمة الحالية</div>
        <div class="stat-value text-danger">${formatCurrency(s.balance)}</div>
      </div></div>
    </div>
    ${suppPurchases.length > 0 ? `
    <div class="table-wrap"><table>
      <thead><tr><th>#</th><th>المرجع</th><th>التاريخ</th><th>المبلغ</th><th>الحالة</th></tr></thead>
      <tbody>${suppPurchases.slice(0,10).map((p,i)=>`
        <tr>
          <td>${i+1}</td><td class="text-muted text-sm">${esc(p.refNo||'-')}</td>
          <td>${formatDate(p.date)}</td>
          <td class="fw-600">${formatCurrency(p.totalAmount)}</td>
          <td>${p.status==='paid'
            ? `<span class="badge badge-success">مدفوع</span>`
            : `<span class="badge badge-warning">آجل</span>`}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>` : `<div class="empty-state"><p>لا توجد مشتريات من هذا المورد</p></div>`}
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">إغلاق</button>
    </div>
  `, 'lg');
  window.closeModal = closeModal;
};

window.paySupplier = id => {
  const s = allSuppliers.find(x => x.id === id);
  if (!s) return;
  openModal(`تسجيل دفع للمورد - ${s.name}`, `
    <p class="mb-2">الذمة الحالية: <strong class="text-danger">${formatCurrency(s.balance)}</strong></p>
    <div class="form-group">
      <label class="form-label">مبلغ الدفع</label>
      <input type="number" id="pay-supp-amount" class="form-control" min="0" placeholder="0">
    </div>
    <div class="form-group">
      <label class="form-label">التاريخ</label>
      <input type="date" id="pay-supp-date" class="form-control" value="${today()}">
    </div>
    <div class="form-group">
      <label class="form-label">ملاحظات</label>
      <input type="text" id="pay-supp-notes" class="form-control" placeholder="مرجع أو ملاحظة">
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>
      <button class="btn btn-success" id="btn-pay-supp">✅ تسجيل الدفع</button>
    </div>
  `, 'sm');
  window.closeModal = closeModal;

  document.getElementById('btn-pay-supp').addEventListener('click', async () => {
    const amount = parseNum(document.getElementById('pay-supp-amount')?.value);
    if (amount <= 0) return toast('أدخل مبلغاً صحيحاً', 'error');
    const newBalance = Math.max(0, (s.balance || 0) - amount);
    await updateDoc(doc(db, COL, id), { balance: newBalance, updatedAt: serverTimestamp() });
    toast('تم تسجيل الدفع ✅', 'success');
    closeModal();
    await refreshSuppliers();
  });
};

window.editSupplier   = id => openSupplierModal(allSuppliers.find(s => s.id === id));
window.deleteSupplier = async id => {
  if (await confirm('هل تريد حذف هذا المورد؟')) {
    await deleteDoc(doc(db, COL, id));
    toast('تم الحذف', 'success');
    await refreshSuppliers();
  }
};
