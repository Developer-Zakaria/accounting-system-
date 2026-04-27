/* ===== Customers Page ===== */
import { db } from './firebase-config.js';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  formatCurrency, formatDate, esc, toast, openModal, closeModal,
  confirm, today, parseNum, debounce
} from './utils.js';

const COL = 'customers';
let allCustomers = [];
let allSales = [];

export async function loadCustomers(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2>العملاء 👥</h2>
        <p>إدارة العملاء وتتبع الذمم المدينة</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="btn-add-customer">+ إضافة عميل</button>
      </div>
    </div>
    <div class="stats-grid mb-3" id="cust-stats"></div>
    <div class="search-bar">
      <div class="search-input-wrap">
        <span class="search-icon">🔍</span>
        <input type="text" class="search-input" id="cust-search" placeholder="ابحث باسم العميل أو رقم الهاتف...">
      </div>
      <select class="form-control" id="cust-filter" style="width:auto;min-width:160px">
        <option value="">كل العملاء</option>
        <option value="debt">لديهم ذمة</option>
        <option value="clear">حسابهم صافٍ</option>
      </select>
    </div>
    <div class="card"><div class="card-body p-0" id="cust-table-wrap">
      <div class="loading-page"><div class="spinner"></div></div>
    </div></div>`;

  document.getElementById('btn-add-customer').addEventListener('click', () => openCustomerModal());
  document.getElementById('cust-search').addEventListener('input', debounce(renderCustomersTable, 250));
  document.getElementById('cust-filter').addEventListener('change', renderCustomersTable);

  await refreshCustomers();
}

async function refreshCustomers() {
  const [custSnap, salesSnap] = await Promise.all([
    getDocs(query(collection(db, COL), orderBy('name'))),
    getDocs(collection(db, 'sales'))
  ]);
  allCustomers = custSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  allSales     = salesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderCustomersStats();
  renderCustomersTable();
}

function renderCustomersStats() {
  const el = document.getElementById('cust-stats');
  if (!el) return;
  const totalReceivables = allCustomers.reduce((a, c) => a + Math.max(0, c.balance || 0), 0);
  const withDebt = allCustomers.filter(c => (c.balance || 0) > 0).length;

  el.innerHTML = `
    <div class="stat-card"><div class="stat-icon blue">👥</div><div class="stat-info">
      <div class="stat-label">إجمالي العملاء</div>
      <div class="stat-value">${allCustomers.length}</div>
    </div></div>
    <div class="stat-card"><div class="stat-icon red">💰</div><div class="stat-info">
      <div class="stat-label">إجمالي الذمم المدينة</div>
      <div class="stat-value text-danger">${formatCurrency(totalReceivables)}</div>
    </div></div>
    <div class="stat-card"><div class="stat-icon orange">⏳</div><div class="stat-info">
      <div class="stat-label">عملاء لديهم ذمة</div>
      <div class="stat-value text-warning">${withDebt}</div>
    </div></div>`;
}

function getFilteredCustomers() {
  const search = (document.getElementById('cust-search')?.value || '').toLowerCase();
  const filter = document.getElementById('cust-filter')?.value || '';
  return allCustomers.filter(c => {
    const matchSearch = !search || c.name?.toLowerCase().includes(search) || c.phone?.includes(search);
    const hasDebt = (c.balance || 0) > 0;
    const matchFilter = !filter || (filter === 'debt' ? hasDebt : !hasDebt);
    return matchSearch && matchFilter;
  });
}

function renderCustomersTable() {
  const wrap = document.getElementById('cust-table-wrap');
  if (!wrap) return;
  const customers = getFilteredCustomers();
  if (customers.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-state-icon">👥</div>
      <h3>لا يوجد عملاء</h3><p>أضف عميلاً جديداً</p></div>`;
    return;
  }
  wrap.innerHTML = `<div class="table-wrap"><table>
    <thead><tr>
      <th>#</th><th>الاسم</th><th>الهاتف</th><th>العنوان</th>
      <th>الذمة</th><th>الحالة</th><th>الإجراءات</th>
    </tr></thead>
    <tbody>${customers.map((c, i) => {
      const balance = c.balance || 0;
      return `<tr>
        <td class="text-muted text-sm">${i+1}</td>
        <td class="fw-600">${esc(c.name)}</td>
        <td class="text-muted">${esc(c.phone || '-')}</td>
        <td class="text-muted text-sm">${esc(c.address || '-')}</td>
        <td class="${balance > 0 ? 'text-danger fw-600' : 'text-muted'}">${formatCurrency(balance)}</td>
        <td>${balance > 0
          ? `<span class="badge badge-danger">مديون</span>`
          : `<span class="badge badge-success">نظيف</span>`}</td>
        <td><div class="table-actions">
          <button class="btn-icon-only" onclick="viewCustomer('${c.id}')" title="عرض سجل العميل">👁</button>
          <button class="btn-icon-only" onclick="editCustomer('${c.id}')" title="تعديل">✏️</button>
          <button class="btn-icon-only" onclick="addPaymentCustomer('${c.id}')" title="تسجيل دفعة">💳</button>
          <button class="btn-icon-only" onclick="deleteCustomer('${c.id}')" title="حذف">🗑️</button>
        </div></td>
      </tr>`;
    }).join('')}
    </tbody>
  </table></div>`;
}

// ── Customer Modal ─────────────────────────────────────────
function openCustomerModal(customer = null) {
  const isEdit = !!customer;
  openModal(isEdit ? 'تعديل عميل' : 'إضافة عميل جديد', `
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">الاسم <span class="required">*</span></label>
        <input type="text" id="c-name" class="form-control" value="${esc(customer?.name||'')}" placeholder="اسم العميل">
      </div>
      <div class="form-group">
        <label class="form-label">رقم الهاتف</label>
        <input type="tel" id="c-phone" class="form-control" value="${esc(customer?.phone||'')}" placeholder="07XX XXXXXXX">
      </div>
      <div class="form-group form-full">
        <label class="form-label">العنوان</label>
        <input type="text" id="c-address" class="form-control" value="${esc(customer?.address||'')}" placeholder="المدينة / الحي">
      </div>
      <div class="form-group">
        <label class="form-label">الرصيد الابتدائي (ذمة)</label>
        <input type="number" id="c-balance" class="form-control" min="0" value="${customer?.balance ?? 0}">
        <div class="form-hint">ذمة العميل الحالية على المؤسسة</div>
      </div>
      <div class="form-group">
        <label class="form-label">ملاحظات</label>
        <textarea id="c-notes" class="form-control" rows="2">${esc(customer?.notes||'')}</textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>
      <button class="btn btn-primary" id="btn-save-cust">
        ${isEdit ? '💾 حفظ' : '+ إضافة'}
      </button>
    </div>
  `, 'sm');

  window.closeModal = closeModal;
  document.getElementById('btn-save-cust').addEventListener('click', () => saveCustomer(customer?.id||null));
}

async function saveCustomer(id) {
  const name    = document.getElementById('c-name')?.value.trim();
  const phone   = document.getElementById('c-phone')?.value.trim();
  const address = document.getElementById('c-address')?.value.trim();
  const balance = parseNum(document.getElementById('c-balance')?.value);
  const notes   = document.getElementById('c-notes')?.value.trim();

  if (!name) return toast('أدخل اسم العميل', 'error');

  const data = { name, phone, address, balance, notes, updatedAt: serverTimestamp() };
  const btn  = document.getElementById('btn-save-cust');
  btn.disabled = true;

  try {
    if (id) {
      await updateDoc(doc(db, COL, id), data);
      toast('تم تحديث العميل', 'success');
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, COL), data);
      toast('تم إضافة العميل', 'success');
    }
    closeModal();
    await refreshCustomers();
  } catch (err) {
    toast('خطأ: ' + err.message, 'error');
    btn.disabled = false;
  }
}

// ── View Customer History ─────────────────────────────────
window.viewCustomer = id => {
  const c = allCustomers.find(x => x.id === id);
  if (!c) return;
  const custSales = allSales.filter(s => s.customerId === id);
  const totalBought = custSales.reduce((a, s) => a + (s.totalAmount || 0), 0);

  openModal(`سجل العميل: ${c.name}`, `
    <div class="stats-grid mb-3">
      <div class="stat-card">
        <div class="stat-icon blue">🧾</div>
        <div class="stat-info">
          <div class="stat-label">عدد الفواتير</div>
          <div class="stat-value">${custSales.length}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon orange">💰</div>
        <div class="stat-info">
          <div class="stat-label">إجمالي المشتريات</div>
          <div class="stat-value">${formatCurrency(totalBought)}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon red">⏳</div>
        <div class="stat-info">
          <div class="stat-label">الذمة الحالية</div>
          <div class="stat-value text-danger">${formatCurrency(c.balance)}</div>
        </div>
      </div>
    </div>

    <h4 class="mb-2">آخر الفواتير</h4>
    ${custSales.length === 0
      ? `<div class="empty-state"><p>لا توجد فواتير لهذا العميل</p></div>`
      : `<div class="table-wrap"><table>
          <thead><tr><th>#</th><th>الفاتورة</th><th>التاريخ</th><th>المبلغ</th><th>الحالة</th></tr></thead>
          <tbody>${custSales.slice(0,10).map((s,i)=>`
            <tr>
              <td>${i+1}</td><td class="text-muted text-sm">${esc(s.invoiceNo||'-')}</td>
              <td>${formatDate(s.date)}</td>
              <td class="fw-600">${formatCurrency(s.totalAmount)}</td>
              <td>${s.status==='paid'
                ? `<span class="badge badge-success">مدفوع</span>`
                : `<span class="badge badge-warning">آجل</span>`}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>`}
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">إغلاق</button>
    </div>
  `, 'lg');
  window.closeModal = closeModal;
};

// ── Payment Modal ─────────────────────────────────────────
window.addPaymentCustomer = id => {
  const c = allCustomers.find(x => x.id === id);
  if (!c) return;
  openModal(`تسجيل دفعة - ${c.name}`, `
    <p class="mb-2">الذمة الحالية: <strong class="text-danger">${formatCurrency(c.balance)}</strong></p>
    <div class="form-group">
      <label class="form-label">مبلغ الدفعة</label>
      <input type="number" id="pay-amount" class="form-control" min="0" max="${c.balance}" placeholder="0">
    </div>
    <div class="form-group">
      <label class="form-label">التاريخ</label>
      <input type="date" id="pay-date" class="form-control" value="${today()}">
    </div>
    <div class="form-group">
      <label class="form-label">ملاحظات</label>
      <input type="text" id="pay-notes" class="form-control" placeholder="مرجع أو ملاحظة">
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>
      <button class="btn btn-success" id="btn-pay-cust">✅ تسجيل الدفعة</button>
    </div>
  `, 'sm');
  window.closeModal = closeModal;

  document.getElementById('btn-pay-cust').addEventListener('click', async () => {
    const amount = parseNum(document.getElementById('pay-amount')?.value);
    if (amount <= 0) return toast('أدخل مبلغاً صحيحاً', 'error');
    const newBalance = Math.max(0, (c.balance || 0) - amount);
    await updateDoc(doc(db, COL, id), { balance: newBalance, updatedAt: serverTimestamp() });
    toast('تم تسجيل الدفعة ✅', 'success');
    closeModal();
    await refreshCustomers();
  });
};

window.editCustomer   = id => openCustomerModal(allCustomers.find(c => c.id === id));
window.deleteCustomer = async id => {
  if (await confirm('هل تريد حذف هذا العميل؟')) {
    await deleteDoc(doc(db, COL, id));
    toast('تم الحذف', 'success');
    await refreshCustomers();
  }
};
