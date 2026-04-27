/* ===== Help System ===== */
import { openModal, closeModal } from './utils.js';

const HELP = {
  dashboard: {
    icon: '📊',
    title: 'لوحة التحكم',
    sections: [
      { icon: '📈', name: 'البطاقات الإحصائية', text: 'تعرض أهم الأرقام دفعةً واحدة: المبيعات والأرباح والمصاريف والذمم لهذا الشهر.' },
      { icon: '📊', name: 'رسم الأداء الشهري', text: 'مقارنة المبيعات والمشتريات والأرباح لآخر ستة أشهر. اللون الأزرق = مبيعات، البرتقالي = مشتريات، الأخضر = ربح.' },
      { icon: '🥧', name: 'رسم توزيع التكاليف', text: 'يُبيّن للشهر الحالي: كم ذهب لتكلفة البضاعة وكم للمصاريف وكم بقي ربحاً صافياً.' },
      { icon: '🧾', name: 'آخر المبيعات', text: 'أحدث خمس فواتير بيع مع اسم العميل والمبلغ والربح والحالة (مدفوع/آجل).' },
      { icon: '⚠️', name: 'تنبيه المخزون المنخفض', text: 'قائمة المنتجات التي وصل مخزونها إلى أقل من الحد الأدنى — لتُسارع لإعادة الطلب.' },
    ]
  },
  cashier: {
    icon: '🧮',
    title: 'الكاشير (نقطة البيع)',
    sections: [
      { icon: '📦', name: 'شبكة المنتجات', text: 'اضغط على أي منتج لإضافته إلى السلة. الرقم الصغير في الزاوية = الكمية المتوفرة. المنتجات الرمادية = منتهية.' },
      { icon: '🔍', name: 'البحث والفلترة', text: 'اكتب اسم المنتج أو اختر فئة من الأزرار العليا لتصفية المنتجات بسرعة.' },
      { icon: '⚖️', name: 'اختيار الكمية', text: 'عند الضغط على منتج تظهر نافذة الكمية. للكيلو: أزرار سريعة (¼، ½، ¾، 1...). للقطع: أزرار (1، 2، 3...). يمكنك إدخال كمية مخصصة.' },
      { icon: '🛒', name: 'السلة', text: 'تظهر على اليمين. استخدم أزرار + و − لتعديل الكمية، أو اضغط ✕ لحذف صنف.' },
      { icon: '💸', name: 'الخصم', text: 'أدخل مبلغ الخصم بالدينار العراقي وسيُطرح تلقائياً من الإجمالي.' },
      { icon: '💵', name: 'نقدي / آجل', text: 'نقدي = مدفوع الآن. آجل = يُضاف لذمة العميل المختار.' },
      { icon: '🖨️', name: 'إتمام البيع', text: 'يحفظ الفاتورة، يُنقص المخزون تلقائياً، ويفتح نافذة طباعة الفاتورة الحرارية.' },
    ]
  },
  sales: {
    icon: '🧾',
    title: 'المبيعات',
    sections: [
      { icon: '📋', name: 'قائمة الفواتير', text: 'كل صف هو فاتورة بيع. الأرقام تُجمّع بالأسفل لترى إجمالي الفترة المختارة.' },
      { icon: '➕', name: 'فاتورة جديدة', text: 'اضغط "فاتورة بيع جديدة" ← اختر منتجات ← أدخل الكميات ← اختر العميل والدفع.' },
      { icon: '💳', name: 'تحصيل الآجل', text: 'الفاتورة الصفراء (آجل): اضغط أيقونة 💳 لتحويلها إلى مدفوعة وتعديل رصيد العميل.' },
      { icon: '🖨️', name: 'الطباعة', text: 'كل فاتورة قابلة للطباعة. تحتوي على اسم المؤسسة والعميل والمنتجات والإجمالي.' },
      { icon: '🔍', name: 'الفلترة', text: 'فلتر بالتاريخ أو الحالة أو اسم العميل للوصول السريع لأي فاتورة.' },
    ]
  },
  purchases: {
    icon: '🛒',
    title: 'المشتريات',
    sections: [
      { icon: '➕', name: 'فاتورة شراء جديدة', text: 'أضف طلبية من مورد. عند الحفظ، تزيد كميات المنتجات في المخزون تلقائياً وتتحدث أسعار الشراء.' },
      { icon: '💳', name: 'تسديد للمورد', text: 'الفاتورة الصفراء (آجل): اضغط 💳 لتسجيل الدفع وتخفيض ذمة المورد.' },
      { icon: '📊', name: 'ذمم الموردين', text: 'البطاقة الحمراء تُظهر إجمالي ما تدين به للموردين — تابعه دائماً.' },
    ]
  },
  inventory: {
    icon: '📦',
    title: 'المخزون',
    sections: [
      { icon: '➕', name: 'إضافة منتج', text: 'أضف اسم المنتج، الفئة، الوحدة (كيلو/قطعة...)، سعر الشراء والبيع، الكمية، والحد الأدنى للتنبيه.' },
      { icon: '📊', name: 'تعديل الكمية', text: 'اضغط 📊 لإضافة كمية وارد، خصم كمية صادر، أو تعيين كمية مباشرة (للجرد).' },
      { icon: '⚠️', name: 'تنبيه المنخفض', text: 'أي منتج كميته ≤ الحد الأدنى يظهر بعلامة ⚠️ حمراء. عيّن الحد الأدنى بعناية لكل منتج.' },
      { icon: '💰', name: 'قيمة المخزون', text: 'البطاقات العليا تُبيّن قيمة كل المخزون بسعر الشراء (رأس المال) وسعر البيع (القيمة السوقية).' },
    ]
  },
  customers: {
    icon: '👥',
    title: 'العملاء',
    sections: [
      { icon: '💰', name: 'الذمة', text: 'الرقم الأحمر = مبلغ مستحق على العميل للمؤسسة. يزيد عند بيع بالآجل، وينقص عند الدفع.' },
      { icon: '💳', name: 'تسجيل دفعة', text: 'اضغط 💳 بجانب العميل لتسجيل مبلغ استلمته منه — ينقص ذمته تلقائياً.' },
      { icon: '👁', name: 'سجل العميل', text: 'اضغط 👁 لترى كل فواتير هذا العميل وإجمالي مشترياته.' },
    ]
  },
  suppliers: {
    icon: '🏭',
    title: 'الموردون',
    sections: [
      { icon: '💸', name: 'الذمة للمورد', text: 'الرقم الأحمر = مبلغ مستحق للمورد عليك. يزيد عند الشراء بالآجل، وينقص عند الدفع.' },
      { icon: '💳', name: 'تسجيل دفع', text: 'اضغط 💳 لتسجيل مبلغ دفعته للمورد — ينقص ذمته تلقائياً.' },
      { icon: '👁', name: 'سجل المورد', text: 'اضغط 👁 لترى كل طلبياتك من هذا المورد وإجمالي المشتريات منه.' },
    ]
  },
  expenses: {
    icon: '💸',
    title: 'المصاريف',
    sections: [
      { icon: '➕', name: 'إضافة مصروف', text: 'أدخل التاريخ، الفئة (إيجار، رواتب، كهرباء...)، المبلغ، والوصف.' },
      { icon: '🥧', name: 'رسم الفئات', text: 'دائرة توضح توزيع مصاريفك على الفئات المختلفة — اعرف أين تذهب أموالك.' },
      { icon: '📉', name: 'الاتجاه الشهري', text: 'رسم خطي يُظهر تطور المصاريف على مدى ستة أشهر — لاحظ أي شهر مصاريفه مرتفعة.' },
    ]
  },
  reports: {
    icon: '📈',
    title: 'التقارير المالية',
    sections: [
      { icon: '📋', name: 'قائمة الدخل', text: 'إيرادات − تكلفة البضاعة = ربح إجمالي − مصاريف = صافي الربح. هذا هو قلب المحاسبة.' },
      { icon: '📊', name: 'الأداء الشهري', text: 'مقارنة شهرية للإيرادات والتكاليف والأرباح الصافية.' },
      { icon: '🏆', name: 'أكثر المنتجات مبيعاً', text: 'أي منتج يجلب أكثر إيراداً وربحاً — لتركيز عروضك عليه.' },
      { icon: '📅', name: 'الملخص الشهري', text: 'جدول مفصّل لكل شهر: إيراد، تكلفة، ربح إجمالي، مصاريف، صافي الربح، مشتريات.' },
      { icon: '🖨️', name: 'الطباعة', text: 'اطبع التقرير كاملاً مع جميع الجداول والتحليلات.' },
    ]
  }
};

export function addHelp(container, pageKey) {
  const help = HELP[pageKey];
  if (!help) return;

  // Add ? button to page header
  const header = container.querySelector('.page-header');
  if (!header) return;

  const btn = document.createElement('button');
  btn.className   = 'help-trigger-btn';
  btn.title       = 'مساعدة ودليل الصفحة';
  btn.innerHTML   = `<span class="help-badge">?</span> مساعدة`;
  btn.style.cssText = `
    display:inline-flex;align-items:center;gap:6px;
    padding:7px 14px;border-radius:20px;border:2px solid #E2E8F0;
    background:white;font-family:var(--font);font-size:13px;font-weight:700;
    cursor:pointer;color:var(--text-muted);transition:all .2s;
    margin-right:auto;
  `;

  btn.onmouseenter = () => { btn.style.borderColor='var(--primary)'; btn.style.color='var(--primary)'; };
  btn.onmouseleave = () => { btn.style.borderColor='#E2E8F0'; btn.style.color='var(--text-muted)'; };
  btn.onclick = () => showHelp(pageKey);

  // Inject into page-header-actions or append
  const actions = header.querySelector('.page-header-actions');
  if (actions) {
    actions.prepend(btn);
  } else {
    header.appendChild(btn);
  }
}

export function showHelp(pageKey) {
  const help = HELP[pageKey];
  if (!help) return;

  const html = `
    <div style="max-height:75vh;overflow-y:auto;padding-right:4px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;
                  padding:16px;background:#EBF4FD;border-radius:12px">
        <span style="font-size:36px">${help.icon}</span>
        <div>
          <div style="font-size:16px;font-weight:900;color:var(--primary-dark)">${help.title}</div>
          <div style="font-size:13px;color:var(--text-muted)">دليل استخدام هذه الصفحة</div>
        </div>
      </div>

      ${help.sections.map(s => `
        <div style="display:flex;gap:14px;padding:14px;border-radius:10px;
                    border:1px solid var(--border);margin-bottom:10px;
                    background:white;align-items:flex-start">
          <div style="width:40px;height:40px;border-radius:10px;background:#F0F4FF;
                      display:flex;align-items:center;justify-content:center;
                      font-size:20px;flex-shrink:0">${s.icon}</div>
          <div>
            <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:4px">${s.name}</div>
            <div style="font-size:13px;color:var(--text-muted);line-height:1.6">${s.text}</div>
          </div>
        </div>`).join('')}

      <div style="margin-top:16px;padding:12px;background:#F0FFF4;border-radius:10px;
                  border:1px solid #86EFAC;font-size:13px;color:#14532D;text-align:center">
        💡 <strong>نصيحة:</strong> اضغط <kbd style="background:white;padding:2px 8px;border-radius:4px;border:1px solid #86EFAC">?</kbd>
        في أي صفحة لترى دليلها
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="closeModal()">✅ فهمت، شكراً!</button>
    </div>`;

  openModal(`${help.icon} دليل ${help.title}`, html, 'sm');
  window.closeModal = closeModal;
}

// Inject help badge styles once
const helpStyle = document.createElement('style');
helpStyle.textContent = `
  .help-badge {
    width:22px;height:22px;
    background:var(--primary);color:white;
    border-radius:50%;font-size:13px;font-weight:900;
    display:inline-flex;align-items:center;justify-content:center;
    flex-shrink:0;
  }
`;
document.head.appendChild(helpStyle);
