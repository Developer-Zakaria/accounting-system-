/* ===== Reports Page ===== */
import { db } from './firebase-config.js';
import {
  collection, getDocs, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { formatCurrency } from './utils.js';
import {
  renderPLStatement, renderTopProducts, renderExpensesByCategory,
  renderMonthlyTable, renderReportCharts, printReport
} from './reports-render.js';

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
  document.getElementById('btn-print-report').addEventListener('click', () => {
    printReport(
      document.getElementById('rep-from')?.value || '',
      document.getElementById('rep-to')?.value   || ''
    );
  });

  await generateReport();
}

async function generateReport() {
  const from    = document.getElementById('rep-from')?.value || '';
  const to      = document.getElementById('rep-to')?.value   || '';
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

    const allSales     = salesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const allPurchases = purchasesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const allExpenses  = expensesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const sales     = allSales.filter(s => (!from || s.date >= from) && (!to || s.date <= to));
    const purchases = allPurchases.filter(p => (!from || p.date >= from) && (!to || p.date <= to));
    const expenses  = allExpenses.filter(e => (!from || e.date >= from) && (!to || e.date <= to));

    const totalRevenue  = sales.reduce((a, s) => a + (s.totalAmount || 0), 0);
    const totalCOGS     = sales.reduce((a, s) => a + (s.totalCost    || 0), 0);
    const grossProfit   = totalRevenue - totalCOGS;
    const totalExpenses = expenses.reduce((a, e) => a + (e.amount    || 0), 0);
    const netProfit     = grossProfit - totalExpenses;
    const grossMargin   = totalRevenue > 0 ? (grossProfit / totalRevenue * 100).toFixed(1) : 0;
    const netMargin     = totalRevenue > 0 ? (netProfit / totalRevenue * 100).toFixed(1) : 0;
    const totalPurchased = purchases.reduce((a, p) => a + (p.totalAmount || 0), 0);

    content.innerHTML = `
      <div id="report-print-area">
        <div class="stats-grid mb-3">
          <div class="stat-card"><div class="stat-icon orange">💰</div><div class="stat-info">
            <div class="stat-label">إجمالي الإيرادات</div>
            <div class="stat-value">${formatCurrency(totalRevenue)}</div>
            <div class="stat-sub">${sales.length} فاتورة</div>
          </div></div>
          <div class="stat-card"><div class="stat-icon blue">🛒</div><div class="stat-info">
            <div class="stat-label">تكلفة البضاعة المباعة</div>
            <div class="stat-value">${formatCurrency(totalCOGS)}</div>
          </div></div>
          <div class="stat-card"><div class="stat-icon green">📈</div><div class="stat-info">
            <div class="stat-label">الربح الإجمالي</div>
            <div class="stat-value text-success">${formatCurrency(grossProfit)}</div>
            <div class="stat-sub up">هامش ${grossMargin}%</div>
          </div></div>
          <div class="stat-card"><div class="stat-icon red">💸</div><div class="stat-info">
            <div class="stat-label">إجمالي المصاريف</div>
            <div class="stat-value text-danger">${formatCurrency(totalExpenses)}</div>
          </div></div>
          <div class="stat-card"><div class="stat-icon ${netProfit >= 0 ? 'green' : 'red'}">📊</div><div class="stat-info">
            <div class="stat-label">صافي الربح</div>
            <div class="stat-value ${netProfit >= 0 ? 'text-success' : 'text-danger'}">${formatCurrency(netProfit)}</div>
            <div class="stat-sub ${netProfit >= 0 ? 'up' : 'down'}">هامش ${netMargin}%</div>
          </div></div>
          <div class="stat-card"><div class="stat-icon purple">🏭</div><div class="stat-info">
            <div class="stat-label">إجمالي المشتريات</div>
            <div class="stat-value">${formatCurrency(totalPurchased)}</div>
          </div></div>
        </div>

        <div class="grid-2 mb-3">
          <div class="card">
            <div class="card-header"><span class="card-title">📊 الأداء الشهري</span></div>
            <div class="card-body">
              <div class="chart-container" style="height:280px"><canvas id="rep-chart-monthly"></canvas></div>
            </div>
          </div>
          <div class="card">
            <div class="card-header"><span class="card-title">📉 تحليل الأرباح والمصاريف</span></div>
            <div class="card-body">
              <div class="chart-container" style="height:280px"><canvas id="rep-chart-profit"></canvas></div>
            </div>
          </div>
        </div>

        <div class="card mb-3">
          <div class="card-header"><span class="card-title">📋 قائمة الدخل (Profit & Loss)</span></div>
          <div class="card-body">
            ${renderPLStatement(totalRevenue, totalCOGS, grossProfit, expenses, totalExpenses, netProfit)}
          </div>
        </div>

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

        <div class="card mb-3">
          <div class="card-header"><span class="card-title">📅 ملخص شهري تفصيلي</span></div>
          <div class="card-body p-0">${renderMonthlyTable(allSales, allPurchases, allExpenses)}</div>
        </div>
      </div>`;

    renderReportCharts(allSales, allPurchases, allExpenses);

  } catch (err) {
    content.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">⚠️</div>
      <h3>خطأ في تحميل البيانات</h3>
      <p>${err.message}</p>
    </div>`;
  }
}
