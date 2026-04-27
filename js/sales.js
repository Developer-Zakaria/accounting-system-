/* ===== Sales Page ===== */
import { db } from './firebase-config.js';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy, where, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  formatCurrency, formatDate, esc, toast, openModal, closeModal,
  confirm, today, parseNum, debounce, shortId
} from './utils.js';

const COL = 'sales';
let allSales = [];
let saleItems = [];
let allProducts = [];
let allCustomers = [];

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

async function refreshSales() {
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

// ── New Sale Modal ─────────────────────────────────────────
function openNewSaleModal() {
  saleItems = [];
  openModal('فاتورة بيع جديدة', buildSaleForm(), 'lg');
  window.closeModal = closeModal;
  bindSaleFormEvents();
}

function buildSaleForm() {
  const productOptions = allProducts
    .map(p => `<option value="${p.id}" data-sell="${p.sellPrice}" data-buy="${p.buyPrice}" data-qty="${p.quantity}" data-unit="${esc(p.unit||'')}">
      ${esc(p.name)} (متوفر: ${p.quantity || 0} ${p.unit || ''})
    </option>`).join('');
  const customerOptions = `<option value="">عميل نقدي</option>` +
    allCustomers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');

  return `
    <div class="form-grid mb-2">
      <div class="form-group">
        <label class="form-label">التاريخ</label>
        <input type="date" id="s-date" class="form-control" value="${today()}">
      </div>
      <div class="form-group">
        <label class="form-label">العميل</label>
        <select id="s-customer" class="form-control">${customerOptions}</select>
      </div>
    </div>

    <!-- Add Item Row -->
    <div class="card mb-2" style="background:#F8FAFF">
      <div class="card-body">
        <div class="form-grid-3">
          <div class="form-group mb-0">
            <label class="form-label">المنتج</label>
            <select id="s-prod" class="form-control">
              <option value="">-- اختر المنتج --</option>
              ${productOptions}
            </select>
          </div>
          <div class="form-group mb-0">
            <label class="form-label">الكمية</label>
            <input type="number" id="s-qty" class="form-control" min="1" value="1" placeholder="0">
          </div>
          <div class="form-group mb-0">
            <label class="form-label">سعر البيع</label>
            <input type="number" id="s-price" class="form-control" min="0" step="0.01" placeholder="0">
          </div>
        </div>
        <button class="btn btn-outline mt-2" id="btn-add-item">+ إضافة للفاتورة</button>
      </div>
    </div>

    <!-- Items Table -->
    <div id="sale-items-wrap" class="mb-2"></div>

    <!-- Totals & Options -->
    <div class="form-grid">
      <div>
        <div class="form-group">
          <label class="form-label">الخصم</label>
          <input type="number" id="s-discount" class="form-control" min="0" value="0">
        </div>
        <div class="form-group">
          <label class="form-label">طريقة الدفع</label>
          <select id="s-status" class="form-control">
            <option value="paid">نقدي (مدفوع)</option>
            <option value="credit">آجل</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">ملاحظات</label>
          <textarea id="s-notes" class="form-control" rows="2" placeholder="ملاحظات اختيارية..."></textarea>
        </div>
      </div>
      <div id="sale-totals" class="totals-box" style="height:fit-content"></div>
    </div>

    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>
      <button class="btn btn-primary" id="btn-save-sale">💾 حفظ الفاتورة</button>
    </div>`;
}

function bindSaleFormEvents() {
  const prodSel = document.getElementById('s-prod');
  const qtyInp  = document.getElementById('s-qty');
  const priceInp = document.getElementById('s-price');

  prodSel?.addEventListener('change', () => {
    const opt = prodSel.options[prodSel.selectedIndex];
    priceInp.value = opt.dataset.sell || '';
  });

  document.getElementById('btn-add-item')?.addEventListener('click', addSaleItem);
  document.getElementById('s-discount')?.addEventListener('input', renderSaleTotals);
  document.getElementById('btn-save-sale')?.addEventListener('click', saveSale);
}

function addSaleItem() {
  const prodSel  = document.getElementById('s-prod');
  const prodId   = prodSel?.value;
  const qty      = parseNum(document.getElementById('s-qty')?.value, 0);
  const price    = parseNum(document.getElementById('s-price')?.value, 0);

  if (!prodId)  return toast('اختر منتجاً', 'error');
  if (qty <= 0) return toast('أدخل كمية صحيحة', 'error');
  if (price < 0) return toast('أدخل سعراً صحيحاً', 'error');

  const opt     = prodSel.options[prodSel.selectedIndex];
  const product = allProducts.find(p => p.id === prodId);
  if (!product) return;

  const available = product.quantity || 0;
  if (qty > available) return toast(`الكمية المتوفرة ${available} فقط`, 'warning');

  const existing = saleItems.find(i => i.productId === prodId);
  if (existing) {
    const newQty = existing.qty + qty;
    if (newQty > available) return toast(`الكمية المتوفرة ${available} فقط`, 'warning');
    existing.qty   = newQty;
    existing.total = newQty * price;
  } else {
    saleItems.push({
      productId:   prodId,
      productName: product.name,
      unit:        product.unit || '',
      qty,
      buyPrice:    product.buyPrice || 0,
      sellPrice:   price,
      total:       qty * price
    });
  }

  renderSaleItems();
  renderSaleTotals();
  document.getElementById('s-qty').value = 1;
  document.getElementById('s-prod').value = '';
  document.getElementById('s-price').value = '';
}

function renderSaleItems() {
  const wrap = document.getElementById('sale-items-wrap');
  if (!wrap) return;
  if (saleItems.length === 0) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = `<div class="items-table">
    <table>
      <thead><tr><th>#</th><th>المنتج</th><th>الوحدة</th><th>الكمية</th><th>السعر</th><th>المجموع</th><th></th></tr></thead>
      <tbody>${saleItems.map((item, i) => `
        <tr>
          <td>${i+1}</td>
          <td class="fw-600">${esc(item.productName)}</td>
          <td class="text-muted">${esc(item.unit)}</td>
          <td><input type="number" class="qty-input" value="${item.qty}" min="1"
               onchange="updateSaleItem(${i},'qty',this.value)"></td>
          <td><input type="number" class="price-input" value="${item.sellPrice}" min="0" step="0.01"
               onchange="updateSaleItem(${i},'price',this.value)"></td>
          <td class="fw-600 text-primary">${formatCurrency(item.total)}</td>
          <td><button class="btn-icon-only" onclick="removeSaleItem(${i})">✕</button></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

function renderSaleTotals() {
  const wrap     = document.getElementById('sale-totals');
  if (!wrap) return;
  const subtotal = saleItems.reduce((a, i) => a + i.total, 0);
  const totalCost = saleItems.reduce((a, i) => a + i.qty * i.buyPrice, 0);
  const discount = parseNum(document.getElementById('s-discount')?.value);
  const total    = subtotal - discount;
  const profit   = total - totalCost;

  wrap.innerHTML = `
    <div class="totals-row"><span>المجموع الفرعي</span><span>${formatCurrency(subtotal)}</span></div>
    <div class="totals-row"><span>الخصم</span><span class="text-danger">- ${formatCurrency(discount)}</span></div>
    <div class="totals-row grand"><span>الإجمالي</span><span>${formatCurrency(total)}</span></div>
    <div class="totals-row profit"><span>الربح المتوقع</span><span>${formatCurrency(profit)}</span></div>`;
}

window.updateSaleItem = (i, field, val) => {
  if (field === 'qty')   { saleItems[i].qty = parseNum(val); saleItems[i].total = saleItems[i].qty * saleItems[i].sellPrice; }
  if (field === 'price') { saleItems[i].sellPrice = parseNum(val); saleItems[i].total = saleItems[i].qty * saleItems[i].sellPrice; }
  renderSaleItems(); renderSaleTotals();
};
window.removeSaleItem = i => { saleItems.splice(i, 1); renderSaleItems(); renderSaleTotals(); };

async function saveSale() {
  if (saleItems.length === 0) return toast('أضف منتجاً واحداً على الأقل', 'error');

  const date      = document.getElementById('s-date')?.value;
  const custId    = document.getElementById('s-customer')?.value;
  const discount  = parseNum(document.getElementById('s-discount')?.value);
  const status    = document.getElementById('s-status')?.value;
  const notes     = document.getElementById('s-notes')?.value.trim();

  if (!date) return toast('أدخل التاريخ', 'error');

  const customer    = allCustomers.find(c => c.id === custId);
  const subtotal    = saleItems.reduce((a, i) => a + i.total, 0);
  const totalCost   = saleItems.reduce((a, i) => a + i.qty * i.buyPrice, 0);
  const totalAmount = subtotal - discount;
  const profit      = totalAmount - totalCost;
  const invoiceNo   = shortId();

  const saleData = {
    invoiceNo, date, customerId: custId, customerName: customer?.name || 'عميل نقدي',
    items: saleItems, subtotal, discount, totalAmount, totalCost, profit,
    status, paidAmount: status === 'paid' ? totalAmount : 0,
    notes, createdAt: serverTimestamp()
  };

  const btn = document.getElementById('btn-save-sale');
  btn.disabled = true;

  try {
    const batch = writeBatch(db);
    const saleRef = doc(collection(db, COL));
    batch.set(saleRef, saleData);

    // Decrease inventory
    saleItems.forEach(item => {
      const prod = allProducts.find(p => p.id === item.productId);
      if (prod) {
        batch.update(doc(db, 'inventory', item.productId), {
          quantity: Math.max(0, (prod.quantity || 0) - item.qty),
          updatedAt: serverTimestamp()
        });
      }
    });

    // Update customer balance if credit
    if (custId && status === 'credit') {
      const c = allCustomers.find(x => x.id === custId);
      batch.update(doc(db, 'customers', custId), {
        balance: ((c?.balance || 0) + totalAmount - 0),
        updatedAt: serverTimestamp()
      });
    }

    await batch.commit();
    toast('تم حفظ الفاتورة بنجاح ✅', 'success');
    closeModal();
    await refreshSales();
  } catch (err) {
    toast('خطأ: ' + err.message, 'error');
    btn.disabled = false;
  }
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
  frame.onload = () => {
    frame.contentDocument.write(html);
    frame.contentDocument.close();
  };
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
