/* ===== Purchases Modal — New Purchase Form ===== */
import { db } from './firebase-config.js';
import {
  collection, serverTimestamp, writeBatch, doc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  formatCurrency, esc, toast, openModal, closeModal,
  today, parseNum, shortId
} from './utils.js';
import { allProducts, allSuppliers, refreshPurchases } from './purchases.js';

const purchaseItems = [];

export function openNewPurchaseModal() {
  purchaseItems.splice(0);
  const supplierOpts = `<option value="">-- اختر المورد --</option>` +
    allSuppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  const productOpts = allProducts
    .map(p => `<option value="${p.id}" data-buy="${p.buyPrice}" data-unit="${esc(p.unit||'')}">
      ${esc(p.name)} (${esc(p.unit||'')})</option>`).join('');

  openModal('فاتورة شراء جديدة', `
    <div class="form-grid mb-2">
      <div class="form-group">
        <label class="form-label">التاريخ</label>
        <input type="date" id="p-date" class="form-control" value="${today()}">
      </div>
      <div class="form-group">
        <label class="form-label">المورد</label>
        <select id="p-supplier" class="form-control">${supplierOpts}</select>
      </div>
    </div>

    <div class="card mb-2" style="background:#F8FAFF">
      <div class="card-body">
        <div class="form-grid-3">
          <div class="form-group mb-0">
            <label class="form-label">المنتج</label>
            <select id="p-prod" class="form-control">
              <option value="">-- اختر المنتج --</option>${productOpts}
            </select>
          </div>
          <div class="form-group mb-0">
            <label class="form-label">الكمية</label>
            <input type="number" id="p-qty" class="form-control" min="1" value="1">
          </div>
          <div class="form-group mb-0">
            <label class="form-label">سعر الشراء</label>
            <input type="number" id="p-price" class="form-control" min="0" step="0.01">
          </div>
        </div>
        <button class="btn btn-outline mt-2" id="btn-add-pur-item">+ إضافة للفاتورة</button>
      </div>
    </div>

    <div id="pur-items-wrap" class="mb-2"></div>

    <div class="form-grid">
      <div>
        <div class="form-group">
          <label class="form-label">طريقة الدفع</label>
          <select id="p-status" class="form-control">
            <option value="paid">نقدي (مدفوع)</option>
            <option value="credit">آجل</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">ملاحظات</label>
          <textarea id="p-notes" class="form-control" rows="2"></textarea>
        </div>
      </div>
      <div id="pur-totals" class="totals-box" style="height:fit-content"></div>
    </div>

    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>
      <button class="btn btn-primary" id="btn-save-purchase">💾 حفظ فاتورة الشراء</button>
    </div>
  `, 'lg');

  window.closeModal = closeModal;

  document.getElementById('p-prod')?.addEventListener('change', () => {
    const opt = document.getElementById('p-prod').options[document.getElementById('p-prod').selectedIndex];
    document.getElementById('p-price').value = opt.dataset.buy || '';
  });

  document.getElementById('btn-add-pur-item')?.addEventListener('click', addPurchaseItem);
  document.getElementById('btn-save-purchase')?.addEventListener('click', savePurchase);
}

function addPurchaseItem() {
  const prodSel = document.getElementById('p-prod');
  const prodId  = prodSel?.value;
  const qty     = parseNum(document.getElementById('p-qty')?.value, 0);
  const price   = parseNum(document.getElementById('p-price')?.value, 0);

  if (!prodId)  return toast('اختر منتجاً', 'error');
  if (qty <= 0) return toast('أدخل كمية صحيحة', 'error');

  const product = allProducts.find(p => p.id === prodId);
  if (!product) return;

  const existing = purchaseItems.find(i => i.productId === prodId);
  if (existing) {
    existing.qty  += qty;
    existing.total = existing.qty * price;
    existing.buyPrice = price;
  } else {
    purchaseItems.push({
      productId: prodId, productName: product.name,
      unit: product.unit || '', qty, buyPrice: price, total: qty * price
    });
  }
  renderPurchaseItems();
  renderPurchaseTotals();
  document.getElementById('p-qty').value = 1;
  document.getElementById('p-prod').value = '';
  document.getElementById('p-price').value = '';
}

function renderPurchaseItems() {
  const wrap = document.getElementById('pur-items-wrap');
  if (!wrap) return;
  if (purchaseItems.length === 0) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = `<div class="items-table"><table>
    <thead><tr><th>#</th><th>المنتج</th><th>الوحدة</th><th>الكمية</th><th>السعر</th><th>المجموع</th><th></th></tr></thead>
    <tbody>${purchaseItems.map((item, i) => `
      <tr>
        <td>${i+1}</td>
        <td class="fw-600">${esc(item.productName)}</td>
        <td class="text-muted">${esc(item.unit)}</td>
        <td><input type="number" class="qty-input" value="${item.qty}" min="1"
             onchange="updatePurItem(${i},'qty',this.value)"></td>
        <td><input type="number" class="price-input" value="${item.buyPrice}" min="0" step="0.01"
             onchange="updatePurItem(${i},'price',this.value)"></td>
        <td class="fw-600 text-primary">${formatCurrency(item.total)}</td>
        <td><button class="btn-icon-only" onclick="removePurItem(${i})">✕</button></td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}

function renderPurchaseTotals() {
  const wrap = document.getElementById('pur-totals');
  if (!wrap) return;
  const total = purchaseItems.reduce((a, i) => a + i.total, 0);
  wrap.innerHTML = `
    <div class="totals-row grand"><span>الإجمالي</span><span>${formatCurrency(total)}</span></div>
    <div class="totals-row"><span>عدد الأصناف</span><span>${purchaseItems.length}</span></div>`;
}

window.updatePurItem = (i, field, val) => {
  if (field === 'qty')   { purchaseItems[i].qty = parseNum(val); }
  if (field === 'price') { purchaseItems[i].buyPrice = parseNum(val); }
  purchaseItems[i].total = purchaseItems[i].qty * purchaseItems[i].buyPrice;
  renderPurchaseItems(); renderPurchaseTotals();
};
window.removePurItem = i => { purchaseItems.splice(i, 1); renderPurchaseItems(); renderPurchaseTotals(); };

async function savePurchase() {
  if (purchaseItems.length === 0) return toast('أضف منتجاً واحداً على الأقل', 'error');

  const date   = document.getElementById('p-date')?.value;
  const suppId = document.getElementById('p-supplier')?.value;
  const status = document.getElementById('p-status')?.value;
  const notes  = document.getElementById('p-notes')?.value.trim();

  if (!date)   return toast('أدخل التاريخ', 'error');
  if (!suppId) return toast('اختر المورد', 'error');

  const supplier    = allSuppliers.find(s => s.id === suppId);
  const totalAmount = purchaseItems.reduce((a, i) => a + i.total, 0);
  const refNo       = shortId();

  const data = {
    refNo, date, supplierId: suppId, supplierName: supplier?.name || '-',
    items: purchaseItems.slice(), totalAmount,
    status, paidAmount: status === 'paid' ? totalAmount : 0,
    notes, createdAt: serverTimestamp()
  };

  const btn = document.getElementById('btn-save-purchase');
  btn.disabled = true;

  try {
    const batch  = writeBatch(db);
    const purRef = doc(collection(db, 'purchases'));
    batch.set(purRef, data);

    purchaseItems.forEach(item => {
      const prod = allProducts.find(p => p.id === item.productId);
      if (prod) {
        batch.update(doc(db, 'inventory', item.productId), {
          quantity: (prod.quantity || 0) + item.qty,
          buyPrice: item.buyPrice,
          updatedAt: serverTimestamp()
        });
      }
    });

    if (suppId && status === 'credit') {
      const s = allSuppliers.find(x => x.id === suppId);
      batch.update(doc(db, 'suppliers', suppId), {
        balance: ((s?.balance || 0) + totalAmount),
        updatedAt: serverTimestamp()
      });
    }

    await batch.commit();
    toast('تم حفظ فاتورة الشراء بنجاح ✅', 'success');
    closeModal();
    await refreshPurchases();
  } catch (err) {
    toast('خطأ: ' + err.message, 'error');
    btn.disabled = false;
  }
}
