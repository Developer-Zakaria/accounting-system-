/* ===== Dashboard Page ===== */
import { db } from './firebase-config.js';
import {
  collection, getDocs, query, where, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { formatCurrency, formatDate, formatCompact, lastNMonths, AR_MONTHS } from './utils.js';
import { navigateTo } from './app.js';

export async function loadDashboard(container) {
  try {
    const [stats, recentSales, recentPurchases, lowStock] = await Promise.all([
      fetchStats(),
      fetchRecentSales(5),
      fetchRecentPurchases(5),
      fetchLowStock()
    ]);

    container.innerHTML = renderDashboard(stats, recentSales, recentPurchases, lowStock);
    await renderCharts(stats.monthly);
    bindDashboardActions();
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div>
      <h3>خطأ في التحميل</h3><p>${err.message}</p></div>`;
  }
}

// ── Fetch Stats ───────────────────────────────────────────
async function fetchStats() {
  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const startISO = start.toISOString().split('T')[0];

  const [salesSnap, purchasesSnap, expensesSnap, customersSnap, inventorySnap] =
    await Promise.all([
      getDocs(query(collection(db, 'sales'),     orderBy('date', 'desc'))),
      getDocs(query(collection(db, 'purchases'), orderBy('date', 'desc'))),
      getDocs(query(collection(db, 'expenses'),  orderBy('date', 'desc'))),
      getDocs(collection(db, 'customers')),
      getDocs(collection(db, 'inventory'))
    ]);

  let totalSales = 0, totalProfit = 0, monthSales = 0, monthProfit = 0;
  salesSnap.forEach(d => {
    const s = d.data();
    totalSales  += (s.totalAmount || 0);
    totalProfit += (s.profit      || 0);
    if (s.date >= startISO) {
      monthSales  += (s.totalAmount || 0);
      monthProfit += (s.profit      || 0);
    }
  });

  let totalPurchases = 0, monthPurchases = 0;
  purchasesSnap.forEach(d => {
    const p = d.data();
    totalPurchases += (p.totalAmount || 0);
    if (p.date >= startISO) monthPurchases += (p.totalAmount || 0);
  });

  let totalExpenses = 0, monthExpenses = 0;
  expensesSnap.forEach(d => {
    const e = d.data();
    totalExpenses += (e.amount || 0);
    if (e.date >= startISO) monthExpenses += (e.amount || 0);
  });

  let receivables = 0;
  customersSnap.forEach(d => {
    const c = d.data();
    if (c.balance > 0) receivables += c.balance;
  });

  let payables = 0;
  const suppliersSnap = await getDocs(collection(db, 'suppliers'));
  suppliersSnap.forEach(d => {
    const s = d.data();
    if (s.balance > 0) payables += s.balance;
  });

  let lowStockCount = 0;
  inventorySnap.forEach(d => {
    const i = d.data();
    if ((i.quantity || 0) <= (i.minQuantity || 0)) lowStockCount++;
  });

  // Monthly data for chart (last 6 months)
  const months = lastNMonths(6);
  const monthly = months.map(m => {
    let sales = 0, purchases = 0, expenses = 0, profit = 0;
    const prefix = `${m.year}-${String(m.month + 1).padStart(2, '0')}`;

    salesSnap.forEach(d => {
      const s = d.data();
      if (s.date?.startsWith(prefix)) { sales += s.totalAmount || 0; profit += s.profit || 0; }
    });
    purchasesSnap.forEach(d => {
      const p = d.data();
      if (p.date?.startsWith(prefix)) purchases += p.totalAmount || 0;
    });
    expensesSnap.forEach(d => {
      const e = d.data();
      if (e.date?.startsWith(prefix)) expenses += e.amount || 0;
    });

    return { label: m.label, sales, purchases, expenses, profit };
  });

  return {
    totalSales, totalProfit, monthSales, monthProfit,
    totalPurchases, monthPurchases,
    totalExpenses, monthExpenses,
    receivables, payables, lowStockCount,
    monthly,
    netMonthProfit: monthProfit - monthExpenses
  };
}

async function fetchRecentSales(n) {
  const snap = await getDocs(query(collection(db, 'sales'), orderBy('createdAt', 'desc'), limit(n)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function fetchRecentPurchases(n) {
  const snap = await getDocs(query(collection(db, 'purchases'), orderBy('createdAt', 'desc'), limit(n)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function fetchLowStock() {
  const snap = await getDocs(collection(db, 'inventory'));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(p => (p.quantity || 0) <= (p.minQuantity || 0))
    .slice(0, 5);
}

// ── Render ────────────────────────────────────────────────
function renderDashboard(stats, recentSales, recentPurchases, lowStock) {
  const statusBadge = s => s === 'paid'
    ? `<span class="badge badge-success">مدفوع</span>`
    : `<span class="badge badge-warning">آجل</span>`;

  return `
  <div class="page-header">
    <div>
      <h2>لوحة التحكم 📊</h2>
      <p>نظرة عامة على أداء مؤسسة جون سعادة</p>
    </div>
  </div>

  <!-- Stats -->
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-icon orange">💰</div>
      <div class="stat-info">
        <div class="stat-label">مبيعات هذا الشهر</div>
        <div class="stat-value">${formatCompact(stats.monthSales)}</div>
        <div class="stat-sub">إجمالي: ${formatCurrency(stats.totalSales)}</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon green">📈</div>
      <div class="stat-info">
        <div class="stat-label">صافي الربح (الشهر)</div>
        <div class="stat-value ${stats.netMonthProfit >= 0 ? 'text-success' : 'text-danger'}">
          ${formatCompact(stats.netMonthProfit)}
        </div>
        <div class="stat-sub">ربح إجمالي: ${formatCurrency(stats.totalProfit)}</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon blue">🛒</div>
      <div class="stat-info">
        <div class="stat-label">مشتريات هذا الشهر</div>
        <div class="stat-value">${formatCompact(stats.monthPurchases)}</div>
        <div class="stat-sub">إجمالي: ${formatCurrency(stats.totalPurchases)}</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon red">💸</div>
      <div class="stat-info">
        <div class="stat-label">مصاريف هذا الشهر</div>
        <div class="stat-value">${formatCompact(stats.monthExpenses)}</div>
        <div class="stat-sub">إجمالي: ${formatCurrency(stats.totalExpenses)}</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon teal">👥</div>
      <div class="stat-info">
        <div class="stat-label">ذمم العملاء</div>
        <div class="stat-value text-primary">${formatCompact(stats.receivables)}</div>
        <div class="stat-sub">المبلغ المستحق للمؤسسة</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon purple">🏭</div>
      <div class="stat-info">
        <div class="stat-label">ذمم الموردين</div>
        <div class="stat-value text-warning">${formatCompact(stats.payables)}</div>
        <div class="stat-sub">المبلغ المستحق للموردين</div>
      </div>
    </div>
  </div>

  <!-- Charts Row -->
  <div class="grid-2 mb-3">
    <div class="card">
      <div class="card-header">
        <span class="card-title">📊 أداء الأشهر الستة الماضية</span>
      </div>
      <div class="card-body">
        <div class="chart-container" style="height:260px">
          <canvas id="chart-monthly"></canvas>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-header">
        <span class="card-title">📉 توزيع التكاليف (الشهر)</span>
      </div>
      <div class="card-body">
        <div class="chart-container" style="height:260px">
          <canvas id="chart-breakdown"></canvas>
        </div>
      </div>
    </div>
  </div>

  <!-- Recent Sales & Purchases -->
  <div class="grid-2 mb-3">
    <div class="card">
      <div class="card-header">
        <span class="card-title">🧾 آخر المبيعات</span>
        <button class="btn btn-sm btn-outline" data-goto="sales">عرض الكل</button>
      </div>
      <div class="card-body p-0">
        ${recentSales.length === 0
          ? `<div class="empty-state"><div class="empty-state-icon">🧾</div><p>لا توجد مبيعات بعد</p></div>`
          : `<div class="table-wrap"><table>
              <thead><tr><th>#</th><th>العميل</th><th>المبلغ</th><th>الربح</th><th>الحالة</th></tr></thead>
              <tbody>${recentSales.map((s, i) => `
                <tr>
                  <td class="text-muted text-sm">${i + 1}</td>
                  <td class="fw-600">${s.customerName || 'عميل نقدي'}</td>
                  <td class="text-primary fw-600">${formatCurrency(s.totalAmount)}</td>
                  <td class="text-success">${formatCurrency(s.profit)}</td>
                  <td>${statusBadge(s.status)}</td>
                </tr>`).join('')}
              </tbody>
            </table></div>`}
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">🛒 آخر المشتريات</span>
        <button class="btn btn-sm btn-outline" data-goto="purchases">عرض الكل</button>
      </div>
      <div class="card-body p-0">
        ${recentPurchases.length === 0
          ? `<div class="empty-state"><div class="empty-state-icon">🛒</div><p>لا توجد مشتريات بعد</p></div>`
          : `<div class="table-wrap"><table>
              <thead><tr><th>#</th><th>المورد</th><th>المبلغ</th><th>التاريخ</th><th>الحالة</th></tr></thead>
              <tbody>${recentPurchases.map((p, i) => `
                <tr>
                  <td class="text-muted text-sm">${i + 1}</td>
                  <td class="fw-600">${p.supplierName || '-'}</td>
                  <td class="text-primary fw-600">${formatCurrency(p.totalAmount)}</td>
                  <td class="text-muted text-sm">${formatDate(p.date)}</td>
                  <td>${statusBadge(p.status)}</td>
                </tr>`).join('')}
              </tbody>
            </table></div>`}
      </div>
    </div>
  </div>

  <!-- Low Stock Alert -->
  ${lowStock.length > 0 ? `
  <div class="card">
    <div class="card-header">
      <span class="card-title">⚠️ تنبيه المخزون المنخفض</span>
      <button class="btn btn-sm btn-warning" data-goto="inventory">إدارة المخزون</button>
    </div>
    <div class="card-body p-0">
      <div class="table-wrap"><table>
        <thead><tr><th>المنتج</th><th>الوحدة</th><th>الكمية الحالية</th><th>الحد الأدنى</th><th>الحالة</th></tr></thead>
        <tbody>${lowStock.map(p => `
          <tr>
            <td class="fw-600">${p.name}</td>
            <td class="text-muted">${p.unit || '-'}</td>
            <td class="text-danger fw-bold">${p.quantity || 0}</td>
            <td class="text-warning">${p.minQuantity || 0}</td>
            <td><span class="badge badge-danger">مخزون منخفض</span></td>
          </tr>`).join('')}
        </tbody>
      </table></div>
    </div>
  </div>` : ''}
  `;
}

// ── Charts ────────────────────────────────────────────────
async function renderCharts(monthly) {
  const labels = monthly.map(m => m.label);

  // Monthly performance chart
  const ctx1 = document.getElementById('chart-monthly')?.getContext('2d');
  if (ctx1) {
    new Chart(ctx1, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'المبيعات',
            data: monthly.map(m => m.sales),
            backgroundColor: 'rgba(21,101,192,.75)',
            borderRadius: 6
          },
          {
            label: 'المشتريات',
            data: monthly.map(m => m.purchases),
            backgroundColor: 'rgba(255,143,0,.75)',
            borderRadius: 6
          },
          {
            label: 'الربح',
            data: monthly.map(m => m.profit),
            backgroundColor: 'rgba(46,125,50,.75)',
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: v => formatCompact(v) } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  // Breakdown pie chart (current month)
  const last = monthly[monthly.length - 1] || {};
  const ctx2 = document.getElementById('chart-breakdown')?.getContext('2d');
  if (ctx2) {
    new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: ['تكلفة البضاعة', 'المصاريف', 'الربح الصافي'],
        datasets: [{
          data: [
            Math.max(0, (last.sales || 0) - (last.profit || 0)),
            last.expenses || 0,
            Math.max(0, (last.profit || 0) - (last.expenses || 0))
          ],
          backgroundColor: ['#FF8F00', '#C62828', '#2E7D32'],
          borderWidth: 2,
          borderColor: '#fff',
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: { label: ctx => ` ${ctx.label}: ${formatCompact(ctx.raw)} د.ع` }
          }
        },
        cutout: '60%'
      }
    });
  }
}

function bindDashboardActions() {
  document.querySelectorAll('[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.goto));
  });
}
