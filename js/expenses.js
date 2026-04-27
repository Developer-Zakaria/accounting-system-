/* ===== Expenses Page ===== */
import { db } from './firebase-config.js';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  formatCurrency, formatDate, esc, toast, openModal, closeModal,
  confirm, today, parseNum, debounce, AR_MONTHS
} from './utils.js';

const COL = 'expenses';
const CATEGORIES = [
  'إيجار', 'رواتب', 'كهرباء', 'مياه', 'وقود', 'صيانة',
  'تسويق', 'شحن ونقل', 'اتصالات', 'مستلزمات مكتبية', 'أخرى'
];

let allExpenses = [];

export async function loadExpenses(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2>المصاريف 💸</h2>
        <p>تتبع وإدارة مصاريف المؤسسة</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="btn-add-expense">+ إضافة مصروف</button>
      </div>
    </div>
    <div class="stats-grid mb-3" id="exp-stats"></div>
    <div class="search-bar">
      <div class="search-input-wrap">
        <span class="search-icon">🔍</span>
        <input type="text" class="search-input" id="exp-search" placeholder="ابحث في المصاريف...">
      </div>
      <select class="form-control" id="exp-category" style="width:auto;min-width:160px">
        <option value="">كل الفئات</option>
        ${CATEGORIES.map(c => `<option>${c}</option>`).join('')}
      </select>
      <input type="date" class="form-control" id="exp-date-from" style="width:auto">
      <input type="date" class="form-control" id="exp-date-to" style="width:auto">
    </div>

    <div class="grid-2 mb-3">
      <div class="card">
        <div class="card-header"><span class="card-title">📊 المصاريف حسب الفئة</span></div>
        <div class="card-body"><div class="chart-container" style="height:240px">
          <canvas id="chart-exp-cat"></canvas>
        </div></div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">📅 المصاريف الشهرية</span></div>
        <div class="card-body"><div class="chart-container" style="height:240px">
          <canvas id="chart-exp-monthly"></canvas>
        </div></div>
      </div>
    </div>

    <div class="card"><div class="card-body p-0" id="exp-table-wrap">
      <div class="loading-page"><div class="spinner"></div></div>
    </div></div>`;

  document.getElementById('btn-add-expense').addEventListener('click', () => openExpenseModal());
  ['exp-search','exp-category','exp-date-from','exp-date-to'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', debounce(renderExpensesTable, 250));
  });
  document.getElementById('exp-category')?.addEventListener('change', renderExpensesTable);

  await refreshExpenses();
}

async function refreshExpenses() {
  const snap = await getDocs(query(collection(db, COL), orderBy('createdAt', 'desc')));
  allExpenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderExpensesStats();
  renderExpensesTable();
  renderExpensesCharts();
}

function getFilteredExpenses() {
  const search   = (document.getElementById('exp-search')?.value || '').toLowerCase();
  const cat      = document.getElementById('exp-category')?.value || '';
  const dateFrom = document.getElementById('exp-date-from')?.value || '';
  const dateTo   = document.getElementById('exp-date-to')?.value || '';
  return allExpenses.filter(e =>
    (!search || e.description?.toLowerCase().includes(search) || e.category?.toLowerCase().includes(search)) &&
    (!cat    || e.category === cat) &&
    (!dateFrom || e.date >= dateFrom) &&
    (!dateTo   || e.date <= dateTo)
  );
}

function renderExpensesStats() {
  const el = document.getElementById('exp-stats');
  if (!el) return;
  const now  = new Date();
  const mPfx = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const thisMonth = allExpenses.filter(e => e.date?.startsWith(mPfx));
  const monthTotal = thisMonth.reduce((a, e) => a + (e.amount || 0), 0);
  const yearTotal  = allExpenses
    .filter(e => e.date?.startsWith(`${now.getFullYear()}`))
    .reduce((a, e) => a + (e.amount || 0), 0);

  el.innerHTML = `
    <div class="stat-card"><div class="stat-icon red">💸</div><div class="stat-info">
      <div class="stat-label">مصاريف الشهر</div>
      <div class="stat-value text-danger">${formatCurrency(monthTotal)}</div>
    </div></div>
    <div class="stat-card"><div class="stat-icon orange">📅</div><div class="stat-info">
      <div class="stat-label">مصاريف هذا العام</div>
      <div class="stat-value">${formatCurrency(yearTotal)}</div>
    </div></div>
    <div class="stat-card"><div class="stat-icon blue">📋</div><div class="stat-info">
      <div class="stat-label">عدد المصاريف (الشهر)</div>
      <div class="stat-value">${thisMonth.length}</div>
    </div></div>`;
}

function renderExpensesTable() {
  const wrap = document.getElementById('exp-table-wrap');
  if (!wrap) return;
  const expenses = getFilteredExpenses();
  if (expenses.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💸</div>
      <h3>لا توجد مصاريف</h3><p>أضف مصروفاً جديداً</p></div>`;
    return;
  }
  wrap.innerHTML = `<div class="table-wrap"><table>
    <thead><tr>
      <th>#</th><th>التاريخ</th><th>الفئة</th><th>الوصف</th><th>المبلغ</th><th>الإجراءات</th>
    </tr></thead>
    <tbody>${expenses.map((e, i) => `
      <tr>
        <td class="text-muted text-sm">${i+1}</td>
        <td class="text-muted">${formatDate(e.date)}</td>
        <td><span class="badge badge-info">${esc(e.category || 'أخرى')}</span></td>
        <td>${esc(e.description || '-')}</td>
        <td class="text-danger fw-600">${formatCurrency(e.amount)}</td>
        <td><div class="table-actions">
          <button class="btn-icon-only" onclick="editExpense('${e.id}')" title="تعديل">✏️</button>
          <button class="btn-icon-only" onclick="deleteExpense('${e.id}')" title="حذف">🗑️</button>
        </div></td>
      </tr>`).join('')}
    </tbody>
    <tfoot><tr>
      <td colspan="4" class="fw-bold">الإجمالي</td>
      <td class="fw-bold text-danger">${formatCurrency(expenses.reduce((a,e)=>a+(e.amount||0),0))}</td>
      <td></td>
    </tr></tfoot>
  </table></div>`;
}

function renderExpensesCharts() {
  // Category breakdown
  const byCat = {};
  allExpenses.forEach(e => {
    const cat = e.category || 'أخرى';
    byCat[cat] = (byCat[cat] || 0) + (e.amount || 0);
  });
  const catLabels = Object.keys(byCat);
  const catValues = Object.values(byCat);
  const colors = ['#1565C0','#FF8F00','#C62828','#2E7D32','#7B1FA2','#0277BD',
                  '#E65100','#4CAF50','#9C27B0','#F57F17','#795548'];

  const ctx1 = document.getElementById('chart-exp-cat')?.getContext('2d');
  if (ctx1 && catLabels.length > 0) {
    new Chart(ctx1, {
      type: 'doughnut',
      data: {
        labels: catLabels,
        datasets: [{ data: catValues, backgroundColor: colors, borderWidth: 2, borderColor: '#fff', hoverOffset: 6 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { font: { size: 11 } } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${formatCurrency(ctx.raw)}` } }
        }
      }
    });
  }

  // Monthly trend
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const pfx = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const total = allExpenses.filter(e => e.date?.startsWith(pfx)).reduce((a,e)=>a+(e.amount||0),0);
    months.push({ label: AR_MONTHS[d.getMonth()], total });
  }

  const ctx2 = document.getElementById('chart-exp-monthly')?.getContext('2d');
  if (ctx2) {
    new Chart(ctx2, {
      type: 'line',
      data: {
        labels: months.map(m => m.label),
        datasets: [{
          label: 'المصاريف الشهرية',
          data: months.map(m => m.total),
          borderColor: '#C62828',
          backgroundColor: 'rgba(198,40,40,.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#C62828'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: v => formatCurrency(v) } },
          x: { grid: { display: false } }
        }
      }
    });
  }
}

// ── Expense Modal ─────────────────────────────────────────
function openExpenseModal(expense = null) {
  const isEdit = !!expense;
  openModal(isEdit ? 'تعديل مصروف' : 'إضافة مصروف جديد', `
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">التاريخ <span class="required">*</span></label>
        <input type="date" id="e-date" class="form-control" value="${expense?.date || today()}">
      </div>
      <div class="form-group">
        <label class="form-label">الفئة <span class="required">*</span></label>
        <select id="e-category" class="form-control">
          ${CATEGORIES.map(c => `<option${expense?.category===c?' selected':''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">المبلغ <span class="required">*</span></label>
        <input type="number" id="e-amount" class="form-control" min="0" step="0.01" value="${expense?.amount || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">الوصف</label>
        <input type="text" id="e-desc" class="form-control" value="${esc(expense?.description||'')}" placeholder="وصف المصروف">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>
      <button class="btn btn-primary" id="btn-save-exp">${isEdit ? '💾 حفظ' : '+ إضافة'}</button>
    </div>
  `, 'sm');

  window.closeModal = closeModal;
  document.getElementById('btn-save-exp').addEventListener('click', () => saveExpense(expense?.id||null));
}

async function saveExpense(id) {
  const date     = document.getElementById('e-date')?.value;
  const category = document.getElementById('e-category')?.value;
  const amount   = parseNum(document.getElementById('e-amount')?.value);
  const desc     = document.getElementById('e-desc')?.value.trim();

  if (!date)     return toast('أدخل التاريخ', 'error');
  if (!category) return toast('اختر الفئة', 'error');
  if (amount <= 0) return toast('أدخل المبلغ', 'error');

  const data = { date, category, amount, description: desc, updatedAt: serverTimestamp() };
  const btn  = document.getElementById('btn-save-exp');
  btn.disabled = true;

  try {
    if (id) {
      await updateDoc(doc(db, COL, id), data);
      toast('تم تحديث المصروف', 'success');
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, COL), data);
      toast('تم إضافة المصروف', 'success');
    }
    closeModal();
    await refreshExpenses();
  } catch (err) {
    toast('خطأ: ' + err.message, 'error');
    btn.disabled = false;
  }
}

window.editExpense   = id => openExpenseModal(allExpenses.find(e => e.id === id));
window.deleteExpense = async id => {
  if (await confirm('هل تريد حذف هذا المصروف؟')) {
    await deleteDoc(doc(db, COL, id));
    toast('تم الحذف', 'success');
    await refreshExpenses();
  }
};
