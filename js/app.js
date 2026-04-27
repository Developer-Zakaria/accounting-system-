/* ===== مؤسسة جون سعادة — Main Application Router ===== */
import { toast, closeModal, today }      from './utils.js';
import { loadDashboard }                  from './dashboard.js';
import { loadInventory }                  from './inventory.js';
import { loadSales }                      from './sales.js';
import { loadPurchases }                  from './purchases.js';
import { loadCustomers }                  from './customers.js';
import { loadSuppliers }                  from './suppliers.js';
import { loadExpenses }                   from './expenses.js';
import { loadReports }                    from './reports.js';
import { loadCashier }                    from './cashier.js';
import { addHelp }                        from './help.js';

// Expose closeModal globally (used by inline onclick in modals)
window.closeModal = closeModal;

// ── Auth ──────────────────────────────────────────────────
const CREDENTIALS = { username: 'admin', password: 'admin92' };
const SESSION_KEY  = 'jss_auth';

function isLoggedIn() { return sessionStorage.getItem(SESSION_KEY) === '1'; }
function doLogin()    { sessionStorage.setItem(SESSION_KEY, '1'); }
function doLogout()   { sessionStorage.removeItem(SESSION_KEY); }

// ── Page Registry ─────────────────────────────────────────
const PAGES = {
  dashboard: { title: 'لوحة التحكم',        loader: loadDashboard },
  cashier:   { title: 'الكاشير',             loader: loadCashier   },
  sales:     { title: 'المبيعات',            loader: loadSales     },
  purchases: { title: 'المشتريات',          loader: loadPurchases  },
  inventory: { title: 'المخزون',             loader: loadInventory  },
  customers: { title: 'العملاء',             loader: loadCustomers  },
  suppliers: { title: 'الموردون',           loader: loadSuppliers  },
  expenses:  { title: 'المصاريف',           loader: loadExpenses   },
  reports:   { title: 'التقارير',            loader: loadReports    },
};

let currentPage = 'dashboard';

// ── Init ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (isLoggedIn()) showApp();
  else              showLogin();
  bindLoginForm();
  bindLogout();
  bindSidebar();
  bindModal();
  setDateDisplay();
});

// ── Login ─────────────────────────────────────────────────
function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  const params = new URLSearchParams(location.search);
  const startPage = params.get('page') || 'dashboard';
  navigateTo(startPage);
}

function bindLoginForm() {
  const form      = document.getElementById('login-form');
  const errEl     = document.getElementById('login-error');
  const pwInput   = document.getElementById('password');
  const toggleBtn = document.getElementById('toggle-pw');

  toggleBtn?.addEventListener('click', () => {
    pwInput.type = pwInput.type === 'password' ? 'text' : 'password';
    toggleBtn.textContent = pwInput.type === 'password' ? '👁' : '🙈';
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    const u   = document.getElementById('username').value.trim();
    const p   = document.getElementById('password').value;
    const btn = document.querySelector('.login-btn');

    if (u === CREDENTIALS.username && p === CREDENTIALS.password) {
      btn.disabled = true;
      btn.innerHTML = '<span>جاري الدخول...</span>';
      doLogin();
      setTimeout(() => {
        showApp();
        btn.disabled = false;
        btn.innerHTML = '<span>دخول</span>';
      }, 600);
    } else {
      errEl.textContent = 'اسم المستخدم أو كلمة المرور غير صحيحة';
      errEl.classList.remove('hidden');
      document.getElementById('password').value = '';
      setTimeout(() => errEl.classList.add('hidden'), 3000);
    }
  });
}

function bindLogout() {
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    doLogout();
    showLogin();
    toast('تم تسجيل الخروج بنجاح', 'info');
  });
}

// ── Routing ───────────────────────────────────────────────
export function navigateTo(page) {
  if (!PAGES[page]) page = 'dashboard';
  currentPage = page;

  // Update nav active state
  document.querySelectorAll('.nav-link').forEach(a => {
    a.classList.toggle('active', a.dataset.page === page);
  });

  // Update page title
  document.getElementById('page-title').textContent = PAGES[page].title;

  // Show loading spinner
  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="loading-page">
      <div class="spinner"></div>
      <p>جاري التحميل...</p>
    </div>`;

  // Close sidebar on mobile
  closeSidebarMobile();

  // Load page then add help button
  Promise.resolve(PAGES[page].loader(content)).then(() => {
    addHelp(content, page);
  });
}

// Bind nav links
document.addEventListener('click', e => {
  const link = e.target.closest('.nav-link');
  if (link && link.dataset.page) {
    e.preventDefault();
    navigateTo(link.dataset.page);
  }
});

// ── Sidebar ───────────────────────────────────────────────
function bindSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('sidebar-overlay');
  const menuBtn  = document.getElementById('menu-btn');
  const closeBtn = document.getElementById('sidebar-close');

  menuBtn?.addEventListener('click', () => {
    sidebar.classList.add('open');
    overlay.classList.add('show');
  });

  const closeFn = () => closeSidebarMobile();
  closeBtn?.addEventListener('click', closeFn);
  overlay?.addEventListener('click', closeFn);
}

function closeSidebarMobile() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.remove('show');
}

// ── Modal ─────────────────────────────────────────────────
function bindModal() {
  document.getElementById('modal-close')?.addEventListener('click', closeModal);
  document.getElementById('modal-backdrop')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-backdrop')) closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });
}

// ── Date Display ──────────────────────────────────────────
function setDateDisplay() {
  const el = document.getElementById('today-date');
  if (!el) return;
  const d = new Date();
  el.textContent = d.toLocaleDateString('ar-SA', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

export { currentPage };
