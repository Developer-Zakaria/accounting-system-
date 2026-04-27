/* ===== Utility Functions ===== */

/** Format number as currency (IQD) */
export function formatCurrency(n, symbol = 'د.ع') {
  if (n === null || n === undefined || isNaN(n)) return `0 ${symbol}`;
  const abs = Math.abs(+n);
  const formatted = abs.toLocaleString('ar-IQ');
  return n < 0 ? `(${formatted}) ${symbol}` : `${formatted} ${symbol}`;
}

/** Format number compact */
export function formatCompact(n) {
  if (!n) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'م';
  if (n >= 1_000)     return (n / 1_000).toFixed(1)     + 'ك';
  return n.toString();
}

/** Format date to Arabic-readable */
export function formatDate(date) {
  if (!date) return '-';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Format datetime */
export function formatDateTime(date) {
  if (!date) return '-';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('ar-SA', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

/** Today as YYYY-MM-DD */
export function today() {
  return new Date().toISOString().split('T')[0];
}

/** Get first day of current month */
export function monthStart() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Generate short ID */
export function shortId() {
  return Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2,5).toUpperCase();
}

/** Sanitize HTML to prevent XSS */
export function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/** Show toast notification */
export function toast(msg, type = 'info', duration = 3500) {
  const container = document.getElementById('toasts');
  if (!container) return;

  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <span class="toast-text">${esc(msg)}</span>
  `;
  container.appendChild(el);

  setTimeout(() => {
    el.classList.add('hide');
    setTimeout(() => el.remove(), 350);
  }, duration);
}

/** Open modal with title and body HTML */
export function openModal(title, bodyHtml, size = '') {
  const backdrop = document.getElementById('modal-backdrop');
  const box      = document.getElementById('modal-box');
  const titleEl  = document.getElementById('modal-title');
  const bodyEl   = document.getElementById('modal-body');

  titleEl.textContent = title;
  bodyEl.innerHTML    = bodyHtml;
  box.className       = `modal-box${size ? ' modal-' + size : ''}`;
  backdrop.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

/** Close modal */
export function closeModal() {
  document.getElementById('modal-backdrop')?.classList.add('hidden');
  document.body.style.overflow = '';
}

/** Confirm dialog */
export function confirm(msg, subMsg = '') {
  return new Promise(resolve => {
    openModal('تأكيد', `
      <div class="confirm-body">
        <span class="confirm-icon">⚠️</span>
        <div class="confirm-msg">${esc(msg)}</div>
        ${subMsg ? `<div class="confirm-sub">${esc(subMsg)}</div>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="confirm-no">إلغاء</button>
        <button class="btn btn-danger" id="confirm-yes">تأكيد الحذف</button>
      </div>
    `, 'sm');

    document.getElementById('confirm-yes').onclick = () => { closeModal(); resolve(true);  };
    document.getElementById('confirm-no').onclick  = () => { closeModal(); resolve(false); };
  });
}

/** Debounce */
export function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/** Number input guard */
export function parseNum(val, fallback = 0) {
  const n = parseFloat(val);
  return isNaN(n) ? fallback : n;
}

/** Calculate profit */
export function calcProfit(revenue, cost) {
  return revenue - cost;
}

/** Profit margin percentage */
export function profitMargin(revenue, cost) {
  if (!revenue) return 0;
  return ((revenue - cost) / revenue * 100).toFixed(1);
}

/** Arabic month names */
export const AR_MONTHS = [
  'يناير','فبراير','مارس','أبريل','مايو','يونيو',
  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'
];

/** Get last N months labels */
export function lastNMonths(n = 6) {
  const months = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ label: AR_MONTHS[d.getMonth()], year: d.getFullYear(), month: d.getMonth() });
  }
  return months;
}
