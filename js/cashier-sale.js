/* ===== Cashier Sale — Qty Modal / Complete Sale / Print Receipt ===== */
import { db } from './firebase-config.js';
import {
  collection, serverTimestamp, writeBatch, doc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  formatCurrency, esc, toast, openModal, closeModal,
  today, parseNum, shortId
} from './utils.js';

// ── Qty Modal ─────────────────────────────────────────────────
export function openQtyModal(product, addToCartFn) {
  const isWeight = ['كيلو','غرام','لتر'].includes(product.unit);
  const quickQtys = isWeight
    ? ['¼', '½', '¾', '1', '2', '3', '5', '10']
    : ['1', '2', '3', '5', '10', '20', '50', '100'];
  const quickVals = isWeight
    ? [0.25, 0.5, 0.75, 1, 2, 3, 5, 10]
    : [1, 2, 3, 5, 10, 20, 50, 100];

  openModal('إضافة للسلة', `
    <div class="qty-modal-body">
      ${product.imageBase64
        ? `<img src="${product.imageBase64}" style="width:90px;height:90px;object-fit:cover;border-radius:16px;border:2px solid var(--border);margin-bottom:10px" alt="">`
        : ''}
      <div class="qty-modal-product">${esc(product.name)}</div>
      <div class="qty-modal-unit">
        سعر البيع: <strong>${formatCurrency(product.sellPrice)} / ${esc(product.unit||'وحدة')}</strong>
        &nbsp;|&nbsp; متوفر: <strong>${product.quantity || 0} ${esc(product.unit||'')}</strong>
      </div>

      <div class="quick-qty-grid">
        ${quickQtys.map((label, i) => `
          <button class="quick-qty-btn${i===3?' selected':''}"
                  data-val="${quickVals[i]}"
                  onclick="posSetQty(${quickVals[i]},this)">${label}</button>`
        ).join('')}
      </div>

      <div class="custom-qty-wrap">
        <input type="number" id="modal-qty" class="custom-qty-input"
               value="1" min="0.01" step="${isWeight ? 0.25 : 1}"
               placeholder="كمية مخصصة">
        <span style="font-size:16px;font-weight:700;color:var(--text-muted)">${esc(product.unit||'')}</span>
      </div>

      <div class="qty-preview" id="qty-preview">
        الإجمالي: <strong>${formatCurrency(product.sellPrice)}</strong>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">إلغاء</button>
      <button class="btn btn-primary btn-lg" id="btn-add-to-cart">
        🛒 إضافة للسلة
      </button>
    </div>
  `, 'sm');

  window.closeModal = closeModal;

  const qtyInput = document.getElementById('modal-qty');
  const preview  = document.getElementById('qty-preview');
  qtyInput?.addEventListener('input', () => {
    const q = parseNum(qtyInput.value, 0);
    if (preview) preview.innerHTML = `الإجمالي: <strong>${formatCurrency(q * product.sellPrice)}</strong>`;
    document.querySelectorAll('.quick-qty-btn').forEach(b => b.classList.remove('selected'));
  });

  document.getElementById('btn-add-to-cart')?.addEventListener('click', () => {
    const qty = parseNum(document.getElementById('modal-qty')?.value, 0);
    if (qty <= 0) return toast('أدخل كمية صحيحة', 'error');
    if (qty > (product.quantity || 0)) return toast(`الكمية المتوفرة ${product.quantity} فقط`, 'warning');
    addToCartFn(product, qty);
    closeModal();
    toast(`✅ تمت إضافة ${qty} ${product.unit || ''} ${product.name}`, 'success', 1500);
  });
}

window.posSetQty = (val, btn) => {
  const input = document.getElementById('modal-qty');
  if (input) {
    input.value = val;
    input.dispatchEvent(new Event('input'));
  }
  document.querySelectorAll('.quick-qty-btn').forEach(b => b.classList.remove('selected'));
  btn?.classList.add('selected');
};

// ── Complete Sale ─────────────────────────────────────────────
export async function completeSale({ cart, allProducts, allCustomers, paymentType, getDiscount, getCustomerId, onSuccess }) {
  if (cart.length === 0) return toast('السلة فارغة!', 'error');

  const custId    = getCustomerId();
  const discount  = getDiscount();
  const subtotal  = cart.reduce((a, i) => a + i.total, 0);
  const totalCost = cart.reduce((a, i) => a + i.qty * i.buyPrice, 0);
  const total     = subtotal - discount;
  const profit    = total - totalCost;
  const customer  = allCustomers.find(c => c.id === custId);
  const invoiceNo = shortId();

  const saleData = {
    invoiceNo,
    date:         today(),
    customerId:   custId,
    customerName: customer?.name || 'عميل نقدي',
    items:        [...cart],
    subtotal,
    discount,
    totalAmount:  total,
    totalCost,
    profit,
    status:       paymentType,
    paidAmount:   paymentType === 'paid' ? total : 0,
    notes:        'كاشير',
    createdAt:    serverTimestamp()
  };

  const btn = document.getElementById('pos-complete-btn');
  if (btn) btn.disabled = true;

  try {
    const batch   = writeBatch(db);
    const saleRef = doc(collection(db, 'sales'));
    batch.set(saleRef, saleData);

    cart.forEach(item => {
      const prod = allProducts.find(p => p.id === item.productId);
      if (prod) {
        batch.update(doc(db, 'inventory', item.productId), {
          quantity:  Math.max(0, (prod.quantity || 0) - item.qty),
          updatedAt: serverTimestamp()
        });
        prod.quantity = Math.max(0, (prod.quantity || 0) - item.qty);
      }
    });

    if (custId && paymentType === 'credit') {
      const c = allCustomers.find(x => x.id === custId);
      if (c) batch.update(doc(db, 'customers', custId), { balance: (c.balance || 0) + total });
    }

    await batch.commit();
    printReceipt(saleData);
    toast('✅ تم البيع وجاري طباعة الفاتورة!', 'success');
    onSuccess();
  } catch (err) {
    toast('خطأ: ' + err.message, 'error');
    if (btn) btn.disabled = false;
  }
}

// ── Print Receipt ─────────────────────────────────────────────
export function printReceipt(sale) {
  const now = new Date().toLocaleString('ar-SA');
  const html = `<!DOCTYPE html><html dir="rtl"><head>
    <meta charset="UTF-8"><title>فاتورة ${sale.invoiceNo}</title>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" rel="stylesheet">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:Cairo,sans-serif; max-width:320px; margin:0 auto; padding:16px; font-size:13px; }
      .center { text-align:center; }
      .logo { font-size:20px; font-weight:900; color:#0D47A1; }
      .sub  { font-size:12px; color:#64748B; margin-bottom:8px; }
      .divider { border-top:1px dashed #CBD5E1; margin:8px 0; }
      .info  { display:flex; justify-content:space-between; font-size:12px; margin:3px 0; color:#374151; }
      table  { width:100%; border-collapse:collapse; margin:6px 0; }
      th     { font-size:11px; padding:5px 3px; border-bottom:1px solid #E2E8F0; text-align:right; }
      td     { font-size:12px; padding:5px 3px; border-bottom:1px solid #F1F5F9; }
      .total-row { display:flex; justify-content:space-between; padding:4px 0; font-size:13px; }
      .grand     { font-size:17px; font-weight:900; color:#0D47A1; border-top:2px solid #0D47A1; padding-top:6px; margin-top:4px; }
      .footer    { text-align:center; margin-top:14px; font-size:11px; color:#94A3B8; }
      @media print { @page { margin:0; size:80mm auto; } }
    </style></head><body>
    <div class="center">
      <div class="logo">مؤسسة جون سعادة</div>
      <div class="sub">نظام المحاسبة للجملة</div>
    </div>
    <div class="divider"></div>
    <div class="info"><span>رقم الفاتورة:</span><strong>${sale.invoiceNo}</strong></div>
    <div class="info"><span>التاريخ:</span><span>${now}</span></div>
    <div class="info"><span>العميل:</span><span>${esc(sale.customerName)}</span></div>
    <div class="info"><span>الدفع:</span><span>${sale.status === 'paid' ? 'نقدي' : 'آجل'}</span></div>
    <div class="divider"></div>
    <table>
      <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>المجموع</th></tr></thead>
      <tbody>
        ${(sale.items||[]).map(item => `
          <tr>
            <td>${esc(item.productName)}</td>
            <td>${item.qty} ${esc(item.unit||'')}</td>
            <td>${item.sellPrice.toLocaleString()}</td>
            <td><strong>${item.total.toLocaleString()}</strong></td>
          </tr>`).join('')}
      </tbody>
    </table>
    <div class="divider"></div>
    <div class="total-row"><span>المجموع الفرعي</span><span>${sale.subtotal.toLocaleString()}</span></div>
    ${sale.discount > 0
      ? `<div class="total-row"><span>الخصم</span><span>- ${sale.discount.toLocaleString()}</span></div>`
      : ''}
    <div class="total-row grand"><span>الإجمالي</span><span>${sale.totalAmount.toLocaleString()} د.ع</span></div>
    <div class="footer">شكراً لتعاملكم مع مؤسسة جون سعادة 🙏</div>
    <script>window.onload=()=>{window.print();}<\/script>
  </body></html>`;

  const win = window.open('', '_blank', 'width=400,height=600');
  if (win) { win.document.write(html); win.document.close(); }
}
