const timerKey = `${storageKey}:timer`;
const taskSelect = byId('focus-task');
const durationSelect = byId('focus-duration');
const focusToggle = byId('focus-toggle');
const focusFinish = byId('focus-finish');
const focusCheck = byId('focus-check');
const focusStatus = byId('focus-status');
const durations = [15, 25, 45];

function readTimer() {
  try {
    const timer = JSON.parse(localStorage.getItem(timerKey));
    if (timer && /^[\da-f-]{36}$/.test(timer.id) && validDay(timer.date) && taskIds.has(timer.task) &&
      durations.includes(timer.minutes) && validNumber(timer.remaining) && timer.remaining <= timer.minutes * 60000 &&
      (timer.ends === null || validNumber(timer.ends))) return timer;
  } catch { /* The timer starts idle if its state cannot be read. */ }
  return null;
}

function writeTimer(timer) {
  try {
    if (timer) localStorage.setItem(timerKey, JSON.stringify(timer));
    else localStorage.removeItem(timerKey);
    return true;
  } catch {
    focusStatus.textContent = '计时状态未保存，请检查本地存储。';
    return false;
  }
}

const remainingTime = timer => timer.ends === null ? timer.remaining : Math.max(0, Math.min(timer.remaining, timer.ends - Date.now()));
const focusTasks = () => studyTasks(days[today]);

function refreshFocusOptions(timer) {
  const previous = taskSelect.value;
  const tasks = focusTasks();
  if (timer && !tasks.some(([id]) => id === timer.task)) {
    const task = [...lecture, ...practice, ...english, ...review].find(([id]) => id === timer.task);
    tasks.push(task);
  }
  taskSelect.replaceChildren(...tasks.map(([id, , name]) => new Option(name, id)));
  const selected = timer?.task || previous;
  if (tasks.some(([id]) => id === selected)) taskSelect.value = selected;
  if (timer) durationSelect.value = timer.minutes;
}

function saveSession(timer, remaining) {
  const seconds = Math.floor((timer.minutes * 60000 - remaining) / 1000);
  if (seconds > 0 && !changeDay(day => ({ ...day, focus: { ...day.focus, [timer.id]: day.focus?.[timer.id] || { task: timer.task, seconds } } }), timer.date)) {
    focusStatus.textContent = '专注记录未保存，请重试。';
    return false;
  }
  if (!writeTimer(null)) return false;
  focusStatus.textContent = seconds ? `已记录 ${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒。` : '本次专注不足一秒。';
  refreshFocusOptions(null);
  renderHistory();
  return true;
}

function pendingTask() {
  const sessions = Object.values(days[today]?.focus || {});
  const last = sessions[sessions.length - 1];
  return last && !days[today]?.checked?.[last.task] && focusTasks().some(([id]) => id === last.task) ? last.task : null;
}

let observedTimer;
let failedTimer;

function renderTimer(retry = false) {
  let timer = readTimer();
  const remaining = timer ? remainingTime(timer) : Number(durationSelect.value) * 60000;
  const state = timer ? `${timer.id}:${timer.ends}` : '';
  if (state !== observedTimer) {
    refreshFocusOptions(timer);
    observedTimer = state;
    failedTimer = null;
    if (timer) focusStatus.textContent = timer.ends === null ? '已暂停，随时可以继续。' : `正在专注：${taskSelect.selectedOptions[0].textContent}`;
  }
  if (timer && remaining === 0 && (retry || failedTimer !== timer.id)) {
    if (saveSession(timer, remaining)) {
      timer = null;
      observedTimer = '';
    } else {
      failedTimer = timer.id;
    }
  }
  const seconds = Math.ceil(remaining / 1000);
  byId('focus-clock').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  byId('focus-badge').textContent = timer ? (timer.ends === null ? '已暂停' : '专注中') : '今天';
  focusToggle.textContent = timer ? (timer.ends === null ? '继续专注' : '暂停') : '开始专注';
  focusToggle.disabled = !!timer && remaining === 0;
  taskSelect.disabled = durationSelect.disabled = !!timer;
  focusFinish.hidden = !timer;
  focusCheck.hidden = !!timer || !pendingTask();
}

focusToggle.addEventListener('click', () => {
  checkDate();
  const timer = readTimer();
  if (timer) {
    const remaining = remainingTime(timer);
    if (!remaining) return renderTimer(true);
    if (!writeTimer({ ...timer, remaining, ends: timer.ends === null ? Date.now() + remaining : null })) return;
  } else {
    const minutes = Number(durationSelect.value);
    const remaining = minutes * 60000;
    if (!writeTimer({ id: crypto.randomUUID(), date: today, task: taskSelect.value, minutes, remaining, ends: Date.now() + remaining })) return;
  }
  renderTimer();
});

focusFinish.addEventListener('click', () => {
  const timer = readTimer();
  if (timer && saveSession(timer, remainingTime(timer))) {
    renderTimer();
    (focusCheck.hidden ? focusToggle : focusCheck).focus();
  }
});

focusCheck.addEventListener('click', () => {
  const task = pendingTask();
  if (task && changeDay(day => ({ ...day, checked: { ...day.checked, [task]: true } }), today)) {
    render();
    focusStatus.textContent = task === 'm1' ? '已打卡。学完一讲后，记得保存课程进度。' : '关联任务已打卡。';
    focusToggle.focus();
  }
});

function refreshFocus() {
  refreshFocusOptions(readTimer());
  renderTimer();
}

durationSelect.addEventListener('change', () => renderTimer());
document.addEventListener('study-plan-change', refreshFocus);
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderTimer(true); });
window.addEventListener('storage', event => { if (event.key === timerKey || event.key === null) refreshFocus(); });
setInterval(() => renderTimer(), 250);
refreshFocus();
