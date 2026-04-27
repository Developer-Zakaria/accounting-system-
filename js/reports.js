/* ===== Reports Page ===== */
import { db } from './firebase-config.js';
import {
  collection, getDocs, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  formatCurrency, formatDate, esc, AR_MONTHS, lastNMonths
} from './utils.js';

export async function loadReports(container) {
  const now = new Date();
  const defaultFrom = `${now.getFullYear()}-01-01`;
  const defaultTo   = now.toISOString().split('T')[0];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2>التقارير 📈</h2>
        <p>تحليل الأداء المالي لمؤسسة جون سعادة</p>
      </div>
    </div>

    <!-- Date Range Filter -->
    <div class="card mb-3">
      <div class="card-body">
        <div class="flex flex-wrap gap-2" style="align-items:flex-end">
          <div class="form-group mb-0">
            <label class="form-label">من تاريخ</label>
            <input type="date" id="rep-from" class="form-control" value="${defaultFrom}">
          </div>
          <div class="form-group mb-0">
            <label class="form-label">إلى تاريخ</label>
            <input type="date" id="rep-to" class="form-control" value="${defaultTo}">
          </div>
          <button class="btn btn-primary" id="btn-gen-report">📊 توليد التقرير</button>
          <button class="btn btn-outline" id="btn-print-report">🖨️ طباعة</button>
        </div>
      </div>
    </div>

    <div id="reports-content">
      <div class="empty-state">
        <div class="empty-state-icon">📊</div>
        <h3>اضغط على "توليد التقرير" لعرض البيانات</h3>
      </div>
    </div>`;

  document.getElementById('btn-gen-report').addEventListener('click', generateReport);
  document.getElementById('btn-print-report').addEventListener('click', printReport);

  // Auto-generate on load
  await generateReport();
}

async function generateReport() {
  const from = document.getElementById('rep-from')?.value || '';
  const to   = document.getElementById('rep-to')?.value   || '';
  const content = document.getElementById('reports-content');
  if (!content) return;

  content.innerHTML = `<div class="loading-page"><div class="spinner"></div><p>جاري تحليل البيانات...</p></div>`;

  try {
    const [salesSnap, purchasesSnap, expensesSnap, inventorySnap] = await Promise.all([
      getDocs(query(collection(db, 'sales'),     orderBy('date'))),
      getDocs(query(collection(db, 'purchases'), orderBy('date'))),
      getDocs(query(collection(db, 'expenses'),  orderBy('date'))),
      getDocs(collection(db, 'inventory'))
    ]);

    const sales     = salesSnap.docs.map(d => ({ id: d.id, ...d.data() }))
                        .filter(s => (!from || s.date >= from) && (!to || s.date <= to));
    const purchases = purchasesSnap.docs.map(d => ({ id: d.id, ...d.data() }))
                        .filter(p => (!from || p.date >= from) && (!to || p.date <= to));
    const expenses  = expensesSnap.docs.map(d => ({ id: d.id, ...d.data() }))
                        .filter(e => (!from || e.date >= from) && (!to || e.date <= to));
    const inventory = inventorySnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const allSales     = salesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const allPurchases = purchasesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const allExpenses  = expensesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const totalRevenue   = sales.reduce((a, s) => a + (s.totalAmount || 0), 0);
    const totalCOGS      = sales.reduce((a, s) => a + (s.totalCost    || 0), 0);
    const grossProfit    = totalRevenue - totalCOGS;
    const totalExpenses  = expenses.reduce((a, e) => a + (e.amount    || 0), 0);
    const netProfit      = grossProfit - totalExpenses;
    const grossMargin    = totalRevenue > 0 ? (grossProfit / totalRevenue * 100).toFixed(1) : 0;
    const netMargin      = totalRevenue > 0 ? (netProfit / totalRevenue * 100).toFixed(1) : 0;
    const totalPurchased = purchases.reduce((a, p) => a + (p.totalAmount || 0), 0);

    content.innerHTML = `
      <div id="report-print-area">
        <!-- KPI Summary -->
        <div class="stats-grid mb-3">
          <div class="stat-card">
            <div class="stat-icon orange">💰</div>
            <div class="stat-info">
              <div class="stat-label">إجمالي الإيرادات</div>
              <div class="stat-value">${formatCurrency(totalRevenue)}</div>
              <div class="stat-sub">${sales.length} فاتورة</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon blue">🛒</div>
            <div class="stat-info">
              <div class="stat-label">تكلفة البضاعة المباعة</div>
              <div class="stat-value">${formatCurrency(totalCOGS)}</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon green">📈</div>
            <div class="stat-info">
              <div class="stat-label">الربح الإجمالي</div>
              <div class="stat-value text-success">${formatCurrency(grossProfit)}</div>
              <div class="stat-sub up">هامش ${grossMargin}%</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon red">💸</div>
            <div class="stat-info">
              <div class="stat-label">إجمالي المصاريف</div>
              <div class="stat-value text-danger">${formatCurrency(totalExpenses)}</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon ${netProfit >= 0 ? 'green' : 'red'}">📊</div>
            <div class="stat-info">
              <div class="stat-label">صافي الربح</div>
              <div class="stat-value ${netProfit >= 0 ? 'text-success' : 'text-danger'}">${formatCurrency(netProfit)}</div>
              <div class="stat-sub ${netProfit >= 0 ? 'up' : 'down'}">هامش ${netMargin}%</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon purple">🏭</div>
            <div class="stat-info">
              <div class="stat-label">إجمالي المشتريات</div>
              <div class="stat-value">${formatCurrency(totalPurchased)}</div>
            </div>
          </div>
        </div>

        <!-- Charts Row -->
        <div class="grid-2 mb-3">
          <div class="card">
            <div class="card-header"><span class="card-title">📊 الأداء الشهري</span></div>
            <div class="card-body">
              <div class="chart-container" style="height:280px">
                <canvas id="rep-chart-monthly"></canvas>
              </div>
            </div>
          </div>
          <div class="card">
            <div class="card-header"><span class="card-title">📉 تحليل الأرباح والمصاريف</span></div>
            <div class="card-body">
              <div class="chart-container" style="height:280px">
                <canvas id="rep-chart-profit"></canvas>
              </div>
            </div>
          </div>
        </div>

        <!-- P&L Statement -->
        <div class="card mb-3">
          <div class="card-header">
            <span class="card-title">📋 قائمة الدخل (Profit & Loss)</span>
          </div>
          <div class="card-body">
            ${renderPLStatement(totalRevenue, totalCOGS, grossProfit, expenses, totalExpenses, netProfit)}
          </div>
        </div>

        <!-- Top Products -->
        <div class="grid-2 mb-3">
          <div class="card">
            <div class="card-header"><span class="card-title">🏆 أكثر المنتجات مبيعاً</span></div>
            <div class="card-body p-0">${renderTopProducts(sales)}</div>
          </div>
          <div class="card">
            <div class="card-header"><span class="card-title">💸 المصاريف حسب الفئة</span></div>
            <div class="card-body p-0">${renderExpensesByCategory(expenses)}</div>
          </div>
        </div>

        <!-- Monthly Details Table -->
        <div class="card mb-3">
          <div class="card-header"><span class="card-title">📅 ملخص شهري تفصيلي</span></div>
          <div class="card-body p-0">
            ${renderMonthlyTable(allSales, allPurchases, allExpenses)}
          </div>
        </div>
      </div>`;

    renderReportCharts(allSales, allPurchases, allExpenses, from, to);

  } catch (err) {
    content.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">⚠️</div>
      <h3>خطأ في تحميل البيانات</h3>
      <p>${err.message}</p>
    </div>`;
  }
}

function renderPLStatement(revenue, cogs, grossProfit, expenses, totalExpenses, netProfit) {
  const byCat = {};
  expenses.forEach(e => { byCat[e.category||'أخرى'] = (byCat[e.category||'أخرى']||0) + (e.amount||0); });

  return `
    <div style="max-width:600px;margin:0 auto">
      <table style="width:100%;font-size:15px">
        <tbody>
          <tr style="background:#EBF4FD">
            <td style="padding:10px 16px;font-weight:700">الإيرادات</td>
            <td style="padding:10px 16px;text-align:left;font-weight:700">${formatCurrency(revenue)}</td>
          </tr>
          <tr>
            <td style="padding:8px 16px;color:#64748B">إجمالي المبيعات</td>
            <td style="padding:8px 16px;text-align:left">${formatCurrency(revenue)}</td>
          </tr>
          <tr style="background:#FFF3E0">
            <td style="padding:10px 16px;font-weight:700;color:#E65100">تكلفة البضاعة المباعة</td>
            <td style="padding:10px 16px;text-align:left;font-weight:700;color:#E65100">- ${formatCurrency(cogs)}</td>
          </tr>
          <tr style="background:#E8F5E9;border-top:2px solid #2E7D32">
            <td style="padding:12px 16px;font-weight:800;font-size:16px;color:#2E7D32">إجمالي الربح</td>
            <td style="padding:12px 16px;text-align:left;font-weight:800;font-size:16px;color:#2E7D32">${formatCurrency(grossProfit)}</td>
          </tr>
          <tr style="background:#FFEBEE">
            <td style="padding:10px 16px;font-weight:700;color:#C62828">المصاريف التشغيلية</td>
            <td style="padding:10px 16px;text-align:left;font-weight:700;color:#C62828"></td>
          </tr>
          ${Object.entries(byCat).map(([cat, amt]) => `
          <tr>
            <td style="padding:7px 16px 7px 32px;color:#64748B">↳ ${esc(cat)}</td>
            <td style="padding:7px 16px;text-align:left;color:#C62828">- ${formatCurrency(amt)}</td>
          </tr>`).join('')}
          <tr style="border-top:1px solid #E2E8F0">
            <td style="padding:8px 16px;color:#64748B;font-weight:600">إجمالي المصاريف</td>
            <td style="padding:8px 16px;text-align:left;color:#C62828;font-weight:600">- ${formatCurrency(totalExpenses)}</td>
          </tr>
          <tr style="background:${netProfit>=0?'#E8F5E9':'#FFEBEE'};border-top:3px solid ${netProfit>=0?'#2E7D32':'#C62828'}">
            <td style="padding:14px 16px;font-weight:900;font-size:18px;color:${netProfit>=0?'#2E7D32':'#C62828'}">صافي الربح</td>
            <td style="padding:14px 16px;text-align:left;font-weight:900;font-size:18px;color:${netProfit>=0?'#2E7D32':'#C62828'}">${formatCurrency(netProfit)}</td>
          </tr>
        </tbody>
      </table>
    </div>`;
}

function renderTopProducts(sales) {
  const productSales = {};
  sales.forEach(s => {
    (s.items || []).forEach(item => {
      if (!productSales[item.productName]) {
        productSales[item.productName] = { qty: 0, revenue: 0, profit: 0 };
      }
      productSales[item.productName].qty     += item.qty || 0;
      productSales[item.productName].revenue += item.total || 0;
      productSales[item.productName].profit  += (item.total - item.qty * item.buyPrice) || 0;
    });
  });

  const sorted = Object.entries(productSales)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 10);

  if (sorted.length === 0)
    return `<div class="empty-state"><p>لا توجد بيانات</p></div>`;

  return `<div class="table-wrap"><table>
    <thead><tr><th>#</th><th>المنتج</th><th>الكمية</th><th>الإيراد</th><th>الربح</th></tr></thead>
    <tbody>${sorted.map(([name, d], i) => `
      <tr>
        <td class="text-muted text-sm">${i+1}</td>
        <td class="fw-600">${esc(name)}</td>
        <td>${d.qty.toLocaleString()}</td>
        <td class="text-primary">${formatCurrency(d.revenue)}</td>
        <td class="text-success">${formatCurrency(d.profit)}</td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}

function renderExpensesByCategory(expenses) {
  const byCat = {};
  expenses.forEach(e => { byCat[e.category||'أخرى'] = (byCat[e.category||'أخرى']||0) + (e.amount||0); });
  const total = Object.values(byCat).reduce((a, v) => a + v, 0);
  const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0)
    return `<div class="empty-state"><p>لا توجد مصاريف</p></div>`;

  return `<div class="table-wrap"><table>
    <thead><tr><th>الفئة</th><th>المبلغ</th><th>النسبة</th></tr></thead>
    <tbody>${sorted.map(([cat, amt]) => `
      <tr>
        <td><span class="badge badge-info">${esc(cat)}</span></td>
        <td class="text-danger fw-600">${formatCurrency(amt)}</td>
        <td class="text-muted">${total > 0 ? (amt/total*100).toFixed(1) : 0}%</td>
      </tr>`).join('')}
    </tbody>
    <tfoot><tr>
      <td class="fw-bold">الإجمالي</td>
      <td class="fw-bold text-danger">${formatCurrency(total)}</td>
      <td class="fw-bold">100%</td>
    </tr></tfoot>
  </table></div>`;
}

function renderMonthlyTable(allSales, allPurchases, allExpenses) {
  const months = lastNMonths(12);
  const rows = months.map(m => {
    const pfx = `${m.year}-${String(m.month+1).padStart(2,'0')}`;
    const sales    = allSales.filter(s => s.date?.startsWith(pfx));
    const purch    = allPurchases.filter(p => p.date?.startsWith(pfx));
    const exps     = allExpenses.filter(e => e.date?.startsWith(pfx));
    const revenue  = sales.reduce((a, s) => a + (s.totalAmount||0), 0);
    const cogs     = sales.reduce((a, s) => a + (s.totalCost||0), 0);
    const profit   = revenue - cogs;
    const expenses = exps.reduce((a, e) => a + (e.amount||0), 0);
    const net      = profit - expenses;
    const purchased = purch.reduce((a, p) => a + (p.totalAmount||0), 0);
    return { label: `${m.label} ${m.year}`, revenue, cogs, profit, expenses, net, purchased };
  });

  return `<div class="table-wrap"><table>
    <thead><tr>
      <th>الشهر</th><th>الإيرادات</th><th>التكلفة</th><th>الربح الإجمالي</th>
      <th>المصاريف</th><th>صافي الربح</th><th>المشتريات</th>
    </tr></thead>
    <tbody>${rows.map(r => `
      <tr>
        <td class="fw-600">${esc(r.label)}</td>
        <td class="text-primary">${formatCurrency(r.revenue)}</td>
        <td class="text-warning">${formatCurrency(r.cogs)}</td>
        <td class="text-success">${formatCurrency(r.profit)}</td>
        <td class="text-danger">${formatCurrency(r.expenses)}</td>
        <td class="fw-bold ${r.net>=0?'text-success':'text-danger'}">${formatCurrency(r.net)}</td>
        <td class="text-muted">${formatCurrency(r.purchased)}</td>
      </tr>`).join('')}
    </tbody>
    <tfoot><tr>
      <td class="fw-bold">الإجمالي</td>
      <td class="fw-bold text-primary">${formatCurrency(rows.reduce((a,r)=>a+r.revenue,0))}</td>
      <td class="fw-bold text-warning">${formatCurrency(rows.reduce((a,r)=>a+r.cogs,0))}</td>
      <td class="fw-bold text-success">${formatCurrency(rows.reduce((a,r)=>a+r.profit,0))}</td>
      <td class="fw-bold text-danger">${formatCurrency(rows.reduce((a,r)=>a+r.expenses,0))}</td>
      <td class="fw-bold">${formatCurrency(rows.reduce((a,r)=>a+r.net,0))}</td>
      <td class="fw-bold">${formatCurrency(rows.reduce((a,r)=>a+r.purchased,0))}</td>
    </tr></tfoot>
  </table></div>`;
}

function renderReportCharts(allSales, allPurchases, allExpenses, from, to) {
  const months = lastNMonths(6);
  const monthly = months.map(m => {
    const pfx = `${m.year}-${String(m.month+1).padStart(2,'0')}`;
    const revenue  = allSales.filter(s=>s.date?.startsWith(pfx)).reduce((a,s)=>a+(s.totalAmount||0),0);
    const cogs     = allSales.filter(s=>s.date?.startsWith(pfx)).reduce((a,s)=>a+(s.totalCost||0),0);
    const expenses = allExpenses.filter(e=>e.date?.startsWith(pfx)).reduce((a,e)=>a+(e.amount||0),0);
    const profit   = revenue - cogs;
    const net      = profit - expenses;
    return { label: m.label, revenue, profit, expenses, net };
  });

  const ctx1 = document.getElementById('rep-chart-monthly')?.getContext('2d');
  if (ctx1) {
    new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: monthly.map(m => m.label),
        datasets: [
          { label: 'الإيرادات', data: monthly.map(m=>m.revenue), backgroundColor: 'rgba(21,101,192,.75)', borderRadius: 5 },
          { label: 'المشتريات', data: monthly.map(m=>m.expenses), backgroundColor: 'rgba(198,40,40,.65)', borderRadius: 5 },
          { label: 'صافي الربح', data: monthly.map(m=>m.net), backgroundColor: 'rgba(46,125,50,.75)', borderRadius: 5 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true }, x: { grid: { display: false } } }
      }
    });
  }

  const ctx2 = document.getElementById('rep-chart-profit')?.getContext('2d');
  if (ctx2) {
    new Chart(ctx2, {
      type: 'line',
      data: {
        labels: monthly.map(m => m.label),
        datasets: [
          {
            label: 'الربح الإجمالي',
            data: monthly.map(m => m.profit),
            borderColor: '#2E7D32', backgroundColor: 'rgba(46,125,50,.1)',
            borderWidth: 2, fill: true, tension: 0.4
          },
          {
            label: 'صافي الربح',
            data: monthly.map(m => m.net),
            borderColor: '#1565C0', backgroundColor: 'rgba(21,101,192,.1)',
            borderWidth: 2, fill: true, tension: 0.4
          },
          {
            label: 'المصاريف',
            data: monthly.map(m => m.expenses),
            borderColor: '#C62828', borderDash: [5,5],
            borderWidth: 2, fill: false, tension: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true }, x: { grid: { display: false } } }
      }
    });
  }
}

function printReport() {
  const area = document.getElementById('report-print-area');
  if (!area) { alert('ولّد التقرير أولاً'); return; }

  const from = document.getElementById('rep-from')?.value || '';
  const to   = document.getElementById('rep-to')?.value   || '';

  const html = `<!DOCTYPE html><html dir="rtl"><head>
    <meta charset="UTF-8"><title>تقرير مؤسسة جون سعادة</title>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
    <style>
      body{font-family:Cairo,sans-serif;padding:24px;color:#1A202C;font-size:13px}
      h1{color:#0D47A1;font-size:22px}
      table{width:100%;border-collapse:collapse;margin:12px 0;font-size:12px}
      th{background:#0D47A1;color:white;padding:8px;text-align:right}
      td{padding:7px 8px;border-bottom:1px solid #E2E8F0}
      tfoot td{background:#F5F7FA;font-weight:700;border-top:2px solid #E2E8F0}
      .stats-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:16px 0}
      .stat-card{border:1px solid #E2E8F0;border-radius:8px;padding:12px}
      .stat-label{font-size:11px;color:#64748B}
      .stat-value{font-size:18px;font-weight:900}
      @media print{body{padding:0}}
    </style></head><body>
    <div style="display:flex;justify-content:space-between;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #0D47A1">
      <div><h1>مؤسسة جون سعادة</h1><p>تقرير الأداء المالي</p></div>
      <div style="text-align:left;color:#64748B;font-size:12px">
        <div>من: ${from || '-'}</div>
        <div>إلى: ${to || '-'}</div>
        <div>طُبع: ${new Date().toLocaleDateString('ar-SA')}</div>
      </div>
    </div>
    ${area.innerHTML}
    <p style="margin-top:40px;color:#94A3B8;font-size:11px;text-align:center">
      مؤسسة جون سعادة — نظام المحاسبة للجملة
    </p>
    <script>window.onload=()=>{window.print();}<\/script>
  </body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
}
