const byId = id => document.getElementById(id);
const dateField = byId('selectedDate');
const list = byId('list');
const historyDays = byId('history-days');
const modeButtons = [...document.querySelectorAll('[data-mode]')];
const fields = [...textFields, ...numberFields];
const dateFormat = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
const shortDate = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' });
let today = localDay();
let current = today;
let days = {};
let toastTimeout;

const defaultExamDate = '2027-12-18';
const examDateKey = `${storageKey}:exam-date`;
const examDateInput = byId('exam-date');
const validExamDate = date => validDay(date) && date >= examDateInput.min && date <= examDateInput.max;
let savedExamDate;
try {
  const date = localStorage.getItem(examDateKey);
  if (date && validExamDate(date)) savedExamDate = date;
} catch { /* The provisional date remains available without storage. */ }
examDateInput.value = savedExamDate || defaultExamDate;

function examDaysRemaining(target, now = new Date()) {
  const beijingDate = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return (Date.parse(target) - Date.parse(beijingDate)) / 86400000;
}

function renderExamCountdown() {
  const date = savedExamDate || defaultExamDate;
  const remaining = examDaysRemaining(date);
  byId('exam-date-label').textContent = `${savedExamDate ? '目标' : '暂定'} ${date.replaceAll('-', '.')}`;
  byId('exam-remaining').textContent = remaining > 0 ? `还有 ${remaining} 天` : remaining === 0 ? '就是今天' : '目标日期已过';
}

byId('exam-form').addEventListener('submit', event => {
  event.preventDefault();
  const date = examDateInput.value;
  if (!validExamDate(date)) return;
  try {
    localStorage.setItem(examDateKey, date);
    savedExamDate = date;
    renderExamCountdown();
    byId('exam-status').textContent = '目标日期已保存在此设备。';
  } catch {
    byId('exam-status').textContent = '暂时无法保存，请检查浏览器存储设置。';
  }
});

const routes = [...document.querySelectorAll('[data-route]')];
const views = [...document.querySelectorAll('[data-view]')];

function renderRoute() {
  const hash = location.hash.slice(1);
  const route = routes.some(link => link.dataset.route === hash) ? hash : 'tasks';
  for (const view of views) view.hidden = view.dataset.view !== route;
  for (const link of routes) {
    if (link.dataset.route === route) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  byId('daynav').hidden = route !== 'tasks' && route !== 'course';
  const dock = byId('study-dock');
  dock.dataset.section = route;
  dock.style.setProperty('--tab-index', routes.findIndex(link => link.dataset.route === route));
}

function openView(route) {
  if (location.hash !== `#${route}`) history.pushState(null, '', `#${route}`);
  renderRoute();
  window.scrollTo(0, 0);
}

for (const link of routes) {
  link.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openView(link.dataset.route);
  });
}
window.addEventListener('hashchange', renderRoute);
byId('focus-mini-link').addEventListener('click', event => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  openView('focus');
  byId('focus-title').focus({ preventScroll: true });
});

function toast(message) {
  const node = byId('toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => node.classList.remove('show'), 2700);
}

function storageError(message = '') {
  const node = byId('storage-error');
  node.textContent = message;
  node.hidden = !message;
}

function refreshStorage() {
  try {
    days = loadDays();
    storageError();
  } catch {
    storageError('无法读取本地记录。请检查 Safari 的网站数据权限。');
  }
}

function commit(next) {
  saveDays(next);
  days = next;
  storageError();
}

function changeDay(change, key = current) {
  try {
    const next = loadDays();
    next[key] = change(next[key] || {});
    commit(next);
    return true;
  } catch {
    storageError('这次修改未保存。请检查本地存储权限或可用空间。');
    toast('这次修改未保存');
    return false;
  }
}

function renderProgress(day) {
  const { done, total, percent } = completion(day);
  byId('progress').textContent = `${percent}%`;
  byId('bar').style.width = `${percent}%`;
  byId('progress-track').setAttribute('aria-valuenow', percent);
  byId('progress-track').setAttribute('aria-valuetext', `已完成 ${done} / ${total} 项，${percent}%`);
  byId('count').textContent = `已完成 ${done} / ${total} 项`;
  byId('status').textContent = percent === 100 ? '全部完成' : done ? '学习进行中' : '准备开始';
}

const escapeHtml = value => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

function taskSection(title, number, tasks, day, editable = false) {
  const items = tasks.map(([id, time, name, description]) => {
    if (!id) return `<li class="rest"><span class="time">${time}</span><span>${name}</span></li>`;
    const checked = day.checked?.[id] ? 'checked' : '';
    return `<li><label class="task">
      <input type="checkbox" data-task="${id}" aria-labelledby="task-${id}" ${checked}>
      <span class="check" aria-hidden="true">✓</span>
      <span class="taskbody"><span class="taskname" id="task-${id}">${escapeHtml(name)}</span>${description ? `<span class="taskdesc">${escapeHtml(description)}</span>` : ''}</span>
      <span class="time">${time}</span>
    </label>${editable ? `<div class="task-actions"><button type="button" data-edit-task="${id}" aria-haspopup="dialog" aria-label="编辑 ${escapeHtml(name)}">编辑</button><button type="button" data-delete-task="${id}" aria-label="删除 ${escapeHtml(name)}">删除</button></div>` : ''}</li>`;
  });
  return `<section class="task-group"><h3><span>${number}</span>${escapeHtml(title)}</h3><ol>${items.join('')}</ol></section>`;
}

function renderPlan(day) {
  const mode = modeOf(day);
  for (const button of modeButtons) button.setAttribute('aria-pressed', button.dataset.mode === mode);
  byId('mode-hint').textContent = { lecture: '理解新知识，复现例题，少量练习。', practice: '回顾已学知识，独立做题，整理错题。', custom: '为所选日期安排任务。' }[mode];
  byId('task-add').hidden = mode !== 'custom';
  byId('progress-mode').textContent = mode === 'custom' ? '自定义计划' : '数学 · 英语一';
  byId('plan-window').textContent = mode === 'custom' ? '按你的节奏' : '14:30–22:30';
  list.innerHTML = mode === 'custom' ? (customGroups(day).map(([title, tasks], index) =>
    taskSection(title, String(index + 1).padStart(2, '0'), tasks, day, true)).join('') ||
    '<p class="custom-empty">这一天还没有自定义任务。</p>') : taskSection('下午 · 高数', '01', mathTasks(day), day) +
    taskSection('晚上 · 英语一', '02', english, day) + taskSection('晚间 · 复盘与收尾', '03', review, day);
  document.dispatchEvent(new Event('study-plan-change'));
}

function renderAccuracy(day) {
  for (const subject of ['math', 'english']) {
    const correct = day[`${subject}Correct`];
    const total = day[`${subject}Total`];
    const tooMany = validNumber(correct) && validNumber(total) && correct > total;
    byId(`${subject}-accuracy`).textContent = validNumber(correct) && total > 0 && !tooMany
      ? `${Math.round(1000 * (correct / total)) / 10}%` : '—';
    byId(`${subject}-warning`).hidden = !tooMany;
    byId(`${subject}Correct`).setAttribute('aria-invalid', String(tooMany));
  }
}

function renderHistory() {
  const { week, streak, focused } = weekStats(days, today);
  byId('week').textContent = week;
  byId('streak').textContent = streak;
  byId('focus-week').textContent = focusMinutes(focused);
  const rows = [];
  for (let offset = -6; offset <= 0; offset++) {
    const key = moveDay(today, offset);
    const { done, total, percent } = completion(days[key]);
    const date = offset === 0 ? '今天' : shortDate.format(dateAtNoon(key));
    const minutes = focusMinutes(focusSeconds(days[key]));
    rows.push(`<li><button class="history-day" type="button" data-date="${key}" aria-current="${key === current ? 'date' : 'false'}" aria-label="${key}，完成 ${done} / ${total} 项，${percent}%，专注 ${minutes} 分钟">
      <span class="history-label">${date}</span><span class="mini-track" aria-hidden="true"><span style="width:${percent}%"></span></span><strong>${percent}%</strong><span class="history-focus">${minutes} 分</span>
    </button></li>`);
  }
  historyDays.innerHTML = rows.join('');
}

function renderCourse() {
  const latest = Object.keys(days).filter(key => key <= current && days[key].course !== undefined).sort().pop();
  const count = days[latest]?.course ?? 0;
  byId('course-count').textContent = count;
  byId('course-progress').value = count;
  byId('course-input').value = count;
  byId('course-next').textContent = count === 30 ? '已完成全部课程，可以开始系统复习。' : `下一讲 · 第 ${count + 1} 讲`;
  document.dispatchEvent(new Event('study-course-change'));
}

byId('course-form').addEventListener('submit', event => {
  event.preventDefault();
  const count = byId('course-input').valueAsNumber;
  if (validNumber(count) && count <= 30 && changeDay(day => ({ ...day, course: count }))) {
    renderCourse();
    toast('课程进度已保存');
  }
});

function render() {
  const day = days[current] || {};
  const isToday = current === today;
  const hour = new Date().getHours();
  const greeting = hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 19 ? '下午好' : '晚上好';
  byId('greeting').textContent = isToday ? greeting : current < today ? '历史记录' : '学习计划';
  byId('dateLabel').textContent = dateFormat.format(dateAtNoon(current));
  const index = Math.floor(Date.parse(today) / 86400000);
  const [line, source] = poems[((index % poems.length) + poems.length) % poems.length];
  byId('poem-line').textContent = line;
  byId('poem-source').textContent = source;
  byId('progress-title').textContent = isToday ? '今日学习进度' : '当日学习进度';
  dateField.max = '9999-12-31';
  dateField.value = current;
  const dateDisplay = byId('date-display');
  dateDisplay.dateTime = current;
  dateDisplay.textContent = current.replaceAll('-', '.');
  byId('prev').disabled = current === dateField.min;
  byId('next').disabled = current === dateField.max;
  renderProgress(day);
  renderPlan(day);
  for (const field of fields) byId(field).value = day[field] ?? '';
  byId('field-error').hidden = true;
  renderAccuracy(day);
  renderCourse();
  renderHistory();
}

function selectDay(key) {
  if (validDay(key)) current = key;
  dateField.value = current;
  refreshStorage();
  render();
}

function scrollToDate() {
  dateField.focus({ preventScroll: true });
  dateField.scrollIntoView({ block: 'center' });
}

byId('prev').addEventListener('click', () => selectDay(moveDay(current, -1)));
byId('next').addEventListener('click', () => selectDay(moveDay(current, 1)));
byId('today').addEventListener('click', () => selectDay(today));
dateField.addEventListener('change', () => selectDay(dateField.value));
byId('pick-date').addEventListener('click', () => {
  openView('tasks');
  scrollToDate();
  try { dateField.showPicker?.(); } catch { /* The focused date input remains usable. */ }
});
historyDays.addEventListener('click', event => {
  const row = event.target.closest('[data-date]');
  if (!row) return;
  selectDay(row.dataset.date);
  openView('tasks');
  scrollToDate();
});

for (const button of modeButtons) {
  button.addEventListener('click', () => {
    const mode = button.dataset.mode;
    if (mode === modeOf(days[current])) return;
    if (changeDay(day => ({ ...day, mode }))) {
      renderPlan(days[current]);
      renderProgress(days[current]);
      renderHistory();
    }
  });
}

list.addEventListener('change', event => {
  const input = event.target;
  const id = input.dataset.task;
  if (!id) return;
  if (changeDay(day => ({ ...day, checked: { ...day.checked, [id]: input.checked } }))) {
    renderProgress(days[current]);
    renderHistory();
  } else {
    input.checked = !input.checked;
  }
});

for (const field of fields) {
  byId(field).addEventListener('input', event => {
    const input = event.target;
    const isNumber = input.type === 'number';
    const value = isNumber ? (input.value === '' ? null : input.valueAsNumber) : input.value;
    const error = byId('field-error');
    const invalid = isNumber && (input.validity.badInput || (value !== null && !validNumber(value)));
    if (invalid) {
      input.setAttribute('aria-invalid', 'true');
      error.textContent = '题数和单词数请输入非负整数。无效输入未保存。';
      error.hidden = false;
      return;
    }
    input.removeAttribute('aria-invalid');
    error.hidden = true;
    if (changeDay(day => ({ ...day, [field]: value }))) renderAccuracy(days[current]);
  });
  if (numberFields.includes(field)) {
    byId(field).addEventListener('blur', event => {
      const input = event.target;
      if (input.validity.badInput || (input.value !== '' && !validNumber(input.valueAsNumber))) {
        input.value = days[current]?.[field] ?? '';
        input.removeAttribute('aria-invalid');
        renderAccuracy(days[current] || {});
        byId('field-error').hidden = true;
      }
    });
  }
}

byId('reset').addEventListener('click', () => {
  if (!confirm(`清空 ${current} 的学习记录和打卡状态？`)) return;
  try {
    const next = loadDays();
    delete next[current];
    commit(next);
    render();
    toast('已清空所选日期');
  } catch {
    toast('清空失败，请检查本地存储');
  }
});

byId('share').addEventListener('click', async () => {
  const day = days[current] || {};
  const tasks = studyTasks(day).map(([id, time, name]) => `${day.checked?.[id] ? '☑' : '☐'} ${time} ${name}`);
  const notes = [day.mathnote, day.engnote, day.summary, day.tomorrow];
  const labels = ['高数记录', '英语记录', '当日总结', '次日计划'];
  const title = `考研打卡 · ${current}`;
  const text = [title, { lecture: '网课日', practice: '巩固日', custom: '自定义' }[modeOf(day)], ...tasks, '',
    ...notes.map((note, i) => `${labels[i]}：${note || '—'}`)].join('\n');
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      toast('已复制总结');
      return;
    }
  } catch (error) {
    if (error.name === 'AbortError') return;
  }
  prompt('复制当日学习总结', text);
});

function backupMessage(message) {
  const node = byId('backup-message');
  node.textContent = message;
  node.hidden = !message;
}

byId('export').addEventListener('click', () => {
  backupMessage('');
  let snapshot;
  try {
    snapshot = loadDays();
  } catch {
    backupMessage('无法导出，请检查本地存储。');
    return;
  }
  const blob = new Blob([serializeDays(snapshot, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `考研打卡-${localDay()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  backupMessage('已生成备份，请在下载列表或「文件」App 中查看。');
});

const backupFile = byId('backup-file');
byId('import').addEventListener('click', () => backupFile.click());
backupFile.addEventListener('change', async () => {
  const file = backupFile.files[0];
  backupFile.value = '';
  if (!file) return;
  backupMessage('');
  let incoming;
  try {
    incoming = parseBackup(await file.text());
  } catch (error) {
    backupMessage(`导入失败。${error.message}`);
    return;
  }
  const keys = Object.keys(incoming);
  if (!keys.length) {
    backupMessage('备份中没有日期记录。');
    return;
  }
  try {
    const existing = loadDays();
    const overlaps = keys.filter(key => Object.prototype.hasOwnProperty.call(existing, key)).length;
    if (!confirm(`导入 ${keys.length} 天的记录？这将覆盖 ${overlaps} 天的同日期记录，其余日期会保留。`)) {
      backupMessage('已取消导入。');
      return;
    }
    commit({ ...existing, ...incoming });
    render();
    backupMessage(`已恢复 ${keys.length} 天的记录，覆盖 ${overlaps} 天。`);
  } catch {
    backupMessage('导入失败，原有记录未被覆盖。请检查本地存储权限或可用空间。');
  }
});

function checkDate() {
  renderExamCountdown();
  const nextToday = localDay();
  if (nextToday === today) return;
  if (current === today) current = nextToday;
  today = nextToday;
  render();
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) checkDate();
});
setInterval(checkDate, 60000);
window.addEventListener('storage', event => {
  if (event.key === examDateKey || event.key === null) {
    savedExamDate = event.newValue && validExamDate(event.newValue) ? event.newValue : undefined;
    examDateInput.value = savedExamDate || defaultExamDate;
    renderExamCountdown();
  }
  if (event.key !== storageKey && event.key !== null) return;
  refreshStorage();
  render();
});

refreshStorage();
render();
renderRoute();
renderExamCountdown();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(registration => {
    const update = byId('update');
    function showUpdate() {
      update.hidden = !registration.waiting || !navigator.serviceWorker.controller;
    }
    showUpdate();
    registration.addEventListener('updatefound', () => {
      registration.installing?.addEventListener('statechange', showUpdate);
    });
    let applying = false;
    update.addEventListener('click', () => {
      applying = true;
      registration.waiting?.postMessage('activate-update');
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (applying) location.reload();
      showUpdate();
    });
  }).catch(() => {
    // Check-ins still work online if the browser blocks the offline cache.
  });
}
