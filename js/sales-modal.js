/* ===== Sales Modal — New Sale Form ===== */
import { db } from './firebase-config.js';
import {
  collection, serverTimestamp, writeBatch, doc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  formatCurrency, esc, toast, openModal, closeModal,
  today, parseNum, shortId
} from './utils.js';
import { allProducts, allCustomers, refreshSales } from './sales.js';

const saleItems = [];

export function openNewSaleModal() {
  saleItems.splice(0);
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

    <div id="sale-items-wrap" class="mb-2"></div>

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
  const prodSel  = document.getElementById('s-prod');
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
  const prodSel = document.getElementById('s-prod');
  const prodId  = prodSel?.value;
  const qty     = parseNum(document.getElementById('s-qty')?.value, 0);
  const price   = parseNum(document.getElementById('s-price')?.value, 0);

  if (!prodId)  return toast('اختر منتجاً', 'error');
  if (qty <= 0) return toast('أدخل كمية صحيحة', 'error');
  if (price < 0) return toast('أدخل سعراً صحيحاً', 'error');

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
      total:       qty * price,
      imageBase64: product.imageBase64 || null
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
  const subtotal  = saleItems.reduce((a, i) => a + i.total, 0);
  const totalCost = saleItems.reduce((a, i) => a + i.qty * i.buyPrice, 0);
  const discount  = parseNum(document.getElementById('s-discount')?.value);
  const total     = subtotal - discount;
  const profit    = total - totalCost;

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

  const date     = document.getElementById('s-date')?.value;
  const custId   = document.getElementById('s-customer')?.value;
  const discount = parseNum(document.getElementById('s-discount')?.value);
  const status   = document.getElementById('s-status')?.value;
  const notes    = document.getElementById('s-notes')?.value.trim();

  if (!date) return toast('أدخل التاريخ', 'error');

  const customer    = allCustomers.find(c => c.id === custId);
  const subtotal    = saleItems.reduce((a, i) => a + i.total, 0);
  const totalCost   = saleItems.reduce((a, i) => a + i.qty * i.buyPrice, 0);
  const totalAmount = subtotal - discount;
  const profit      = totalAmount - totalCost;
  const invoiceNo   = shortId();

  const saleData = {
    invoiceNo, date, customerId: custId, customerName: customer?.name || 'عميل نقدي',
    items: saleItems.slice(), subtotal, discount, totalAmount, totalCost, profit,
    status, paidAmount: status === 'paid' ? totalAmount : 0,
    notes, createdAt: serverTimestamp()
  };

  const btn = document.getElementById('btn-save-sale');
  btn.disabled = true;

  try {
    const batch   = writeBatch(db);
    const saleRef = doc(collection(db, 'sales'));
    batch.set(saleRef, saleData);

    saleItems.forEach(item => {
      const prod = allProducts.find(p => p.id === item.productId);
      if (prod) {
        batch.update(doc(db, 'inventory', item.productId), {
          quantity: Math.max(0, (prod.quantity || 0) - item.qty),
          updatedAt: serverTimestamp()
        });
      }
    });

    if (custId && status === 'credit') {
      const c = allCustomers.find(x => x.id === custId);
      batch.update(doc(db, 'customers', custId), {
        balance: ((c?.balance || 0) + totalAmount),
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
