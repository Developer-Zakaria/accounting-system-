/* ===== Sales Page ===== */
import { db } from './firebase-config.js';
import {
  collection, getDocs, updateDoc, deleteDoc,
  doc, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  formatCurrency, formatDate, esc, toast, openModal, closeModal,
  confirm, debounce
} from './utils.js';
import { openNewSaleModal } from './sales-modal.js';

const COL = 'sales';
export let allSales     = [];
export let allProducts  = [];
export let allCustomers = [];

export async function loadSales(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2>المبيعات 🧾</h2>
        <p>إدارة فواتير المبيعات وتتبع الأرباح</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="btn-new-sale">+ فاتورة بيع جديدة</button>
      </div>
    </div>
    <div class="stats-grid mb-3" id="sales-stats"></div>
    <div class="search-bar">
      <div class="search-input-wrap">
        <span class="search-icon">🔍</span>
        <input type="text" class="search-input" id="sales-search" placeholder="ابحث باسم العميل أو رقم الفاتورة...">
      </div>
      <select class="form-control" id="sales-status" style="width:auto;min-width:150px">
        <option value="">كل الحالات</option>
        <option value="paid">مدفوعة</option>
        <option value="credit">آجل</option>
      </select>
      <input type="date" class="form-control" id="sales-date-from" style="width:auto">
      <input type="date" class="form-control" id="sales-date-to" style="width:auto">
    </div>
    <div class="card"><div class="card-body p-0" id="sales-table-wrap">
      <div class="loading-page"><div class="spinner"></div></div>
    </div></div>`;

  document.getElementById('btn-new-sale').addEventListener('click', openNewSaleModal);
  ['sales-search','sales-status','sales-date-from','sales-date-to'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', debounce(renderSalesTable, 250));
  });

  await refreshSales();
}

export async function refreshSales() {
  const [salesSnap, productsSnap, customersSnap] = await Promise.all([
    getDocs(query(collection(db, COL), orderBy('createdAt', 'desc'))),
    getDocs(collection(db, 'inventory')),
    getDocs(collection(db, 'customers'))
  ]);
  allSales     = salesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  allProducts  = productsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  allCustomers = customersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderSalesStats();
  renderSalesTable();
}

function getFilteredSales() {
  const search   = (document.getElementById('sales-search')?.value || '').toLowerCase();
  const status   = document.getElementById('sales-status')?.value || '';
  const dateFrom = document.getElementById('sales-date-from')?.value || '';
  const dateTo   = document.getElementById('sales-date-to')?.value || '';
  return allSales.filter(s =>
    (!search || s.customerName?.toLowerCase().includes(search) || s.invoiceNo?.toLowerCase().includes(search)) &&
    (!status || s.status === status) &&
    (!dateFrom || s.date >= dateFrom) &&
    (!dateTo   || s.date <= dateTo)
  );
}

function renderSalesStats() {
  const el = document.getElementById('sales-stats');
  if (!el) return;
  const now   = new Date();
  const mPfx  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const monthS = allSales.filter(s => s.date?.startsWith(mPfx));
  const monthRevenue = monthS.reduce((a, s) => a + (s.totalAmount || 0), 0);
  const monthProfit  = monthS.reduce((a, s) => a + (s.profit      || 0), 0);
  const unpaid = allSales.filter(s => s.status === 'credit')
                         .reduce((a, s) => a + ((s.totalAmount || 0) - (s.paidAmount || 0)), 0);
  el.innerHTML = `
    <div class="stat-card"><div class="stat-icon orange">💰</div><div class="stat-info">
      <div class="stat-label">مبيعات الشهر</div>
      <div class="stat-value">${formatCurrency(monthRevenue)}</div>
    </div></div>
    <div class="stat-card"><div class="stat-icon green">📈</div><div class="stat-info">
      <div class="stat-label">ربح الشهر</div>
      <div class="stat-value text-success">${formatCurrency(monthProfit)}</div>
    </div></div>
    <div class="stat-card"><div class="stat-icon blue">🧾</div><div class="stat-info">
      <div class="stat-label">عدد الفواتير (الشهر)</div>
      <div class="stat-value">${monthS.length}</div>
    </div></div>
    <div class="stat-card"><div class="stat-icon red">⏳</div><div class="stat-info">
      <div class="stat-label">آجل غير محصّل</div>
      <div class="stat-value text-danger">${formatCurrency(unpaid)}</div>
    </div></div>`;
}

function renderSalesTable() {
  const wrap = document.getElementById('sales-table-wrap');
  if (!wrap) return;
  const sales = getFilteredSales();
  if (sales.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🧾</div>
      <h3>لا توجد مبيعات</h3><p>أضف فاتورة بيع جديدة</p></div>`;
    return;
  }
  wrap.innerHTML = `<div class="table-wrap"><table>
    <thead><tr>
      <th>#</th><th>رقم الفاتورة</th><th>العميل</th><th>التاريخ</th>
      <th>المبلغ</th><th>التكلفة</th><th>الربح</th><th>الحالة</th><th>الإجراءات</th>
    </tr></thead>
    <tbody>${sales.map((s, i) => `
      <tr>
        <td class="text-muted text-sm">${i+1}</td>
        <td class="text-sm text-muted">${esc(s.invoiceNo || '-')}</td>
        <td class="fw-600">${esc(s.customerName || 'عميل نقدي')}</td>
        <td class="text-muted">${formatDate(s.date)}</td>
        <td class="text-primary fw-600">${formatCurrency(s.totalAmount)}</td>
        <td class="text-warning">${formatCurrency(s.totalCost)}</td>
        <td class="text-success fw-600">${formatCurrency(s.profit)}</td>
        <td>${s.status === 'paid'
          ? `<span class="badge badge-success">✅ مدفوع</span>`
          : `<span class="badge badge-warning">⏳ آجل</span>`}</td>
        <td><div class="table-actions">
          <button class="btn-icon-only" onclick="viewSale('${s.id}')" title="عرض">👁</button>
          <button class="btn-icon-only" onclick="printSale('${s.id}')" title="طباعة">🖨️</button>
          ${s.status === 'credit'
            ? `<button class="btn-icon-only" onclick="markSalePaid('${s.id}')" title="تحصيل">💳</button>`
            : ''}
          <button class="btn-icon-only" onclick="deleteSale('${s.id}')" title="حذف">🗑️</button>
        </div></td>
      </tr>`).join('')}
    </tbody>
    <tfoot><tr>
      <td colspan="4" class="fw-bold">الإجمالي (${sales.length} فاتورة)</td>
      <td class="fw-bold text-primary">${formatCurrency(sales.reduce((a,s)=>a+(s.totalAmount||0),0))}</td>
      <td class="fw-bold text-warning">${formatCurrency(sales.reduce((a,s)=>a+(s.totalCost||0),0))}</td>
      <td class="fw-bold text-success">${formatCurrency(sales.reduce((a,s)=>a+(s.profit||0),0))}</td>
      <td colspan="2"></td>
    </tr></tfoot>
  </table></div>`;
}

// ── View / Print / Delete ─────────────────────────────────
window.viewSale = id => {
  const s = allSales.find(x => x.id === id);
  if (!s) return;
  openModal(`فاتورة رقم ${s.invoiceNo || id}`, `
    <div class="mb-2 flex-between flex-wrap gap-2">
      <div><strong>العميل:</strong> ${esc(s.customerName || 'نقدي')}</div>
      <div><strong>التاريخ:</strong> ${formatDate(s.date)}</div>
    </div>
    <div class="items-table mb-2"><table>
      <thead><tr><th>#</th><th>المنتج</th><th>الكمية</th><th>الوحدة</th><th>السعر</th><th>المجموع</th></tr></thead>
      <tbody>${(s.items || []).map((item, i) => `
        <tr>
          <td>${i+1}</td><td>${esc(item.productName)}</td>
          <td>${item.qty}</td><td>${esc(item.unit||'-')}</td>
          <td>${formatCurrency(item.sellPrice)}</td>
          <td class="fw-600">${formatCurrency(item.total)}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>
    <div class="totals-box">
      <div class="totals-row"><span>المجموع الفرعي</span><span>${formatCurrency(s.subtotal)}</span></div>
      <div class="totals-row"><span>الخصم</span><span>- ${formatCurrency(s.discount)}</span></div>
      <div class="totals-row grand"><span>الإجمالي</span><span>${formatCurrency(s.totalAmount)}</span></div>
      <div class="totals-row profit"><span>الربح</span><span>${formatCurrency(s.profit)}</span></div>
    </div>
    ${s.notes ? `<p class="mt-2 text-muted text-sm">ملاحظات: ${esc(s.notes)}</p>` : ''}
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">إغلاق</button>
      <button class="btn btn-outline" onclick="printSale('${s.id}')">🖨️ طباعة</button>
    </div>
  `, 'lg');
  window.closeModal = closeModal;
};

window.printSale = id => {
  const s = allSales.find(x => x.id === id);
  if (!s) return;
  const html = `<!DOCTYPE html><html dir="rtl"><head>
    <meta charset="UTF-8"><title>فاتورة ${s.invoiceNo}</title>
    <style>
      body{font-family:Cairo,sans-serif;margin:0;padding:24px;color:#1A202C}
      h1{font-size:26px;color:#0D47A1;margin:0}
      .header{display:flex;justify-content:space-between;margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid #0D47A1}
      table{width:100%;border-collapse:collapse;margin:16px 0}
      th{background:#0D47A1;color:white;padding:10px;text-align:right}
      td{padding:9px 10px;border-bottom:1px solid #E2E8F0}
      .totals{margin-right:auto;margin-left:0;max-width:300px}
      .row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #E2E8F0}
      .grand{font-size:18px;font-weight:900;color:#0D47A1;border-top:2px solid #0D47A1}
      @media print{body{padding:16px}}
    </style></head><body>
    <div class="header">
      <div><h1>مؤسسة جون سعادة</h1><p>نظام المحاسبة للجملة</p></div>
      <div style="text-align:left">
        <div><strong>رقم الفاتورة:</strong> ${s.invoiceNo}</div>
        <div><strong>التاريخ:</strong> ${formatDate(s.date)}</div>
        <div><strong>العميل:</strong> ${esc(s.customerName || 'نقدي')}</div>
      </div>
    </div>
    <table>
      <thead><tr><th>#</th><th>المنتج</th><th>الوحدة</th><th>الكمية</th><th>السعر</th><th>المجموع</th></tr></thead>
      <tbody>${(s.items||[]).map((item,i)=>`
        <tr><td>${i+1}</td><td>${esc(item.productName)}</td><td>${esc(item.unit||'-')}</td>
        <td>${item.qty}</td><td>${formatCurrency(item.sellPrice)}</td>
        <td><strong>${formatCurrency(item.total)}</strong></td></tr>`).join('')}
      </tbody>
    </table>
    <div class="totals">
      <div class="row"><span>المجموع الفرعي</span><span>${formatCurrency(s.subtotal)}</span></div>
      <div class="row"><span>الخصم</span><span>${formatCurrency(s.discount)}</span></div>
      <div class="row grand"><span>الإجمالي</span><span>${formatCurrency(s.totalAmount)}</span></div>
    </div>
    ${s.notes ? `<p><strong>ملاحظات:</strong> ${esc(s.notes)}</p>` : ''}
    <p style="margin-top:40px;color:#888;font-size:12px;text-align:center">شكراً لتعاملكم مع مؤسسة جون سعادة</p>
    <script>window.onload=()=>{window.print();window.close();}<\/script>
  </body></html>`;

  const frame = document.getElementById('print-frame');
  frame.src = 'about:blank';
  frame.onload = () => { frame.contentDocument.write(html); frame.contentDocument.close(); };
};

window.markSalePaid = async id => {
  await updateDoc(doc(db, COL, id), { status: 'paid', paidAmount: allSales.find(s=>s.id===id)?.totalAmount });
  const s = allSales.find(x => x.id === id);
  if (s?.customerId) {
    const c = allCustomers.find(x => x.id === s.customerId);
    if (c) await updateDoc(doc(db, 'customers', s.customerId), {
      balance: Math.max(0, (c.balance || 0) - (s.totalAmount || 0))
    });
  }
  toast('تم تحصيل الفاتورة ✅', 'success');
  await refreshSales();
};

window.deleteSale = async id => {
  if (await confirm('هل تريد حذف هذه الفاتورة؟', 'لا يمكن التراجع عن هذا الإجراء')) {
    await deleteDoc(doc(db, COL, id));
    toast('تم حذف الفاتورة', 'success');
    await refreshSales();
  }
};
