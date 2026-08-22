(() => {
  'use strict';
  const FIX_VERSION = '2.0.0';
  const MONTH_NAMES = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
  const WEEK_DAYS = ['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنج‌شنبه','جمعه'];
  let monthlyOffset = 0;

  const safe = (fn) => { try { return fn(); } catch (e) { console.error('AVM fix:', e); return undefined; } };
  const persistAndRefresh = () => safe(() => {
    if (typeof saveState === 'function') saveState();
    if (typeof renderTable === 'function') renderTable();
    if (typeof renderPendingTasks === 'function') renderPendingTasks();
    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof updateMetricsAndCharts === 'function') updateMetricsAndCharts();
    renderMonthlyCalendar();
  });

  function jalaliToGregorian(jy, jm, jd) {
    jy = Number(jy) - 979; jm = Number(jm); jd = Number(jd);
    let days = 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + 78 + jd;
    days += jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186;
    let gy = 1600 + 400 * Math.floor(days / 146097);
    days %= 146097;
    if (days > 36524) { gy += 100 * Math.floor(--days / 36524); days %= 36524; if (days >= 365) days++; }
    gy += 4 * Math.floor(days / 1461);
    days %= 1461;
    if (days > 365) { gy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
    let gd = days + 1;
    const mdays = [0,31,28,31,30,31,30,31,31,30,31,30,31];
    const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
    mdays[2] = leap ? 29 : 28;
    let gm = 1;
    while (gm <= 12 && gd > mdays[gm]) { gd -= mdays[gm]; gm++; }
    return `${gy}-${String(gm).padStart(2,'0')}-${String(gd).padStart(2,'0')}`;
  }

  function getCurrentJalaliMonth() {
    const now = new Date();
    const [jy, jm] = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
    let serial = jy * 12 + (jm - 1) + monthlyOffset;
    const year = Math.floor(serial / 12);
    const month = serial - year * 12 + 1;
    return { year, month };
  }

  function modalHtml() {
    return `
      <div id="avm-edit-overlay" class="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden" dir="rtl">
          <div class="flex justify-between items-center px-5 py-4 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
            <div><h3 id="avm-edit-title" class="font-black text-sm text-slate-800 dark:text-white"></h3><p class="text-[10px] text-slate-400 mt-1">همه فیلدها قابل ویرایش هستند.</p></div>
            <button type="button" id="avm-edit-close" class="text-slate-400 hover:text-slate-700 dark:hover:text-white text-lg">×</button>
          </div>
          <form id="avm-edit-form" class="p-5 space-y-3">
            <input type="hidden" id="avm-edit-id">
            <div><label class="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">درس / فعالیت</label><select id="avm-edit-subject" class="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs"></select></div>
            <div class="grid grid-cols-3 gap-2">
              <div><label class="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">تاریخ</label><input id="avm-edit-date" type="date" class="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs"></div>
              <div><label class="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">از</label><input id="avm-edit-start" type="time" class="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs"></div>
              <div><label class="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">تا</label><input id="avm-edit-end" type="time" class="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs"></div>
            </div>
            <div><label class="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">وضعیت</label><select id="avm-edit-status" class="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs"><option>برنامه‌ریزی شده</option><option>خوانده شده</option><option>در حال مطالعه</option><option>خوانده نشده</option></select></div>
            <div><label class="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">مبحث / فصل / توضیحات</label><textarea id="avm-edit-topic" rows="3" class="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs" placeholder="مثلاً فصل ۳، متابولیسم کربوهیدرات، تست‌ها..."></textarea></div>
            <div class="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-700">
              <button type="button" id="avm-edit-delete" class="text-rose-600 dark:text-rose-400 text-xs font-bold">حذف</button>
              <div class="flex gap-2"><button type="button" id="avm-edit-cancel" class="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs">انصراف</button><button type="submit" class="px-5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold">ذخیره تغییرات</button></div>
            </div>
          </form>
        </div>
      </div>`;
  }

  function closeEditor() {
    document.getElementById('avm-edit-overlay')?.remove();
  }

  function openEditor(id = null, date = null) {
    safe(() => {
      closeEditor();
      document.body.insertAdjacentHTML('beforeend', modalHtml());
      const overlay = document.getElementById('avm-edit-overlay');
      const subject = document.getElementById('avm-edit-subject');
      subjects.forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s; subject.appendChild(o); });
      const existing = id ? sessions.find(s => s.id === id) : null;
      document.getElementById('avm-edit-title').textContent = existing ? 'ویرایش برنامه مطالعه' : 'افزودن برنامه مطالعه جدید';
      document.getElementById('avm-edit-id').value = existing?.id || '';
      subject.value = existing?.subject || subjects[0] || '';
      document.getElementById('avm-edit-date').value = existing?.date || date || new Date().toISOString().split('T')[0];
      document.getElementById('avm-edit-start').value = existing?.startTime || '09:00';
      document.getElementById('avm-edit-end').value = existing?.endTime || '11:00';
      document.getElementById('avm-edit-status').value = existing?.status || 'برنامه‌ریزی شده';
      document.getElementById('avm-edit-topic').value = existing?.topic || '';
      document.getElementById('avm-edit-delete').style.visibility = existing ? 'visible' : 'hidden';
      document.getElementById('avm-edit-close').onclick = closeEditor;
      document.getElementById('avm-edit-cancel').onclick = closeEditor;
      document.getElementById('avm-edit-delete').onclick = () => { if (existing && confirm('آیا از حذف این برنامه مطمئن هستید؟')) { sessions = sessions.filter(s => s.id !== existing.id); persistAndRefresh(); closeEditor(); } };
      document.getElementById('avm-edit-form').onsubmit = (e) => {
        e.preventDefault();
        const data = {
          id: existing?.id || Date.now().toString(),
          subject: subject.value,
          date: document.getElementById('avm-edit-date').value,
          startTime: document.getElementById('avm-edit-start').value,
          endTime: document.getElementById('avm-edit-end').value,
          status: document.getElementById('avm-edit-status').value,
          completed: document.getElementById('avm-edit-status').value === 'خوانده شده',
          topic: document.getElementById('avm-edit-topic').value.trim()
        };
        if (existing) Object.assign(existing, data); else sessions.unshift(data);
        persistAndRefresh();
        closeEditor();
      };
      overlay.addEventListener('click', e => { if (e.target === overlay) closeEditor(); });
    });
  }

  window.quickAddSession = (customDate = null) => openEditor(null, customDate);
  window.openCalendarEditModal = (id) => openEditor(id);
  window.closeCalendarEditModal = closeEditor;
  window.saveModalEdit = closeEditor;

  function renderMonthlyCalendar() {
    const old = document.getElementById('avm-monthly-planner');
    if (old) old.remove();
    const main = document.querySelector('main');
    if (!main) return;
    const weekly = document.getElementById('weekly-calendar-grid');
    const weeklyWrap = weekly?.closest('.bg-white');
    const wrap = document.createElement('section');
    wrap.id = 'avm-monthly-planner';
    wrap.className = 'bg-white dark:bg-darkcard p-4 rounded-2xl border border-slate-200 dark:border-darkborder shadow-sm space-y-3';
    const {year, month} = getCurrentJalaliMonth();
    wrap.innerHTML = `
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 dark:border-slate-700 pb-3">
        <div><h2 class="font-bold text-slate-800 dark:text-white text-sm flex items-center gap-2"><i class="fa-solid fa-calendar-check text-indigo-600"></i> برنامه ماهانه</h2><p class="text-[10px] text-slate-400 mt-1">برنامه هر روز از همان داده‌های برنامه روزانه نمایش داده می‌شود و با کلیک قابل ویرایش است.</p></div>
        <div class="flex items-center gap-2"><button id="avm-month-prev" class="px-3 py-1.5 rounded-xl border text-xs">ماه قبل</button><span class="px-4 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-black min-w-[145px] text-center">${MONTH_NAMES[month-1]} ${toFaDigits(year)}</span><button id="avm-month-next" class="px-3 py-1.5 rounded-xl border text-xs">ماه بعد</button></div>
      </div>
      <div class="grid grid-cols-7 gap-1.5 text-[10px] sm:text-xs font-bold text-center text-slate-500 dark:text-slate-400">${WEEK_DAYS.map(d=>`<div class="p-2 rounded-lg bg-slate-100 dark:bg-slate-800">${d}</div>`).join('')}</div>
      <div id="avm-month-grid" class="grid grid-cols-7 gap-1.5"></div>`;
    if (weeklyWrap) weeklyWrap.insertAdjacentElement('afterend', wrap); else main.appendChild(wrap);
    document.getElementById('avm-month-prev').onclick = () => { monthlyOffset--; renderMonthlyCalendar(); };
    document.getElementById('avm-month-next').onclick = () => { monthlyOffset++; renderMonthlyCalendar(); };
    const grid = document.getElementById('avm-month-grid');
    const start = jalaliToGregorian(year, month, 1);
    const first = new Date(`${start}T12:00:00`);
    const offset = (first.getDay() + 1) % 7;
    const daysInMonth = month <= 6 ? 31 : month <= 11 ? 30 : (() => { try { const g30 = jalaliToGregorian(year, 12, 30); const back = gregorianToJalali(g30[0], g30[1], g30[2]); return (back[0] === year && back[1] === 12 && back[2] === 30) ? 30 : 29; } catch (e) { return 29; } })();
    for (let i = 0; i < offset; i++) grid.appendChild(Object.assign(document.createElement('div'), {className:'min-h-[120px] rounded-xl bg-slate-50/30 dark:bg-slate-900/10'}));
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = jalaliToGregorian(year, month, day);
      const list = sessions.filter(s=>s.date===dateStr).sort((a,b)=>(a.startTime||'').localeCompare(b.startTime||''));
      const cell = document.createElement('div');
      cell.className = 'min-h-[120px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-2 flex flex-col gap-1';
      const header = document.createElement('div');
      header.className = 'flex items-center justify-between';
      header.innerHTML = `<span class="font-black text-xs text-slate-700 dark:text-slate-200">${toFaDigits(day)}</span><button class="px-1.5 py-0.5 rounded-md bg-indigo-600 text-white text-[9px]">+</button>`;
      header.querySelector('button').onclick = () => openEditor(null, dateStr);
      cell.appendChild(header);
      const sc = document.createElement('div'); sc.className='space-y-1 overflow-y-auto max-h-[95px]';
      if (!list.length) sc.innerHTML='<div class="text-[9px] text-slate-400 text-center pt-5">بدون برنامه</div>';
      list.forEach(s=>{
        const c=document.createElement('button'); c.type='button'; c.className='w-full text-right bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 hover:border-indigo-400';
        c.innerHTML=`<div class="flex justify-between gap-1"><span class="text-[9px] font-black truncate">${s.subject}</span><span class="text-[9px] font-mono text-indigo-600">${toFaDigits(s.startTime||'')}</span></div><div class="text-[9px] text-slate-500 truncate">${s.topic||'بدون مبحث'}</div>`;
        c.onclick=()=>openEditor(s.id); sc.appendChild(c);
      });
      cell.appendChild(sc); grid.appendChild(cell);
    }
  }

  const wrapFns = ['updateField','toggleCheck','cycleStatus','deleteSession','addNewSubject','deleteSubject'];
  wrapFns.forEach(name => {
    const original = window[name];
    if (typeof original !== 'function') return;
    window[name] = function(...args) {
      const result = original.apply(this,args);
      setTimeout(renderMonthlyCalendar, 0);
      return result;
    };
  });

  setTimeout(renderMonthlyCalendar, 0);
  window.addEventListener('resize', () => setTimeout(renderMonthlyCalendar, 50), {passive:true});
  window.AVM_PLANNER_FIX_VERSION = FIX_VERSION;
})();
