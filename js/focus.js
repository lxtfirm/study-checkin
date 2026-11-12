const timerKey = `${storageKey}:timer`;
const taskSelect = byId('focus-task');
const durationInput = byId('focus-duration');
const focusToggle = byId('focus-toggle');
const focusFinish = byId('focus-finish');
const focusCheck = byId('focus-check');
const focusStatus = byId('focus-status');
const miniTitle = byId('focus-mini-title');
const miniState = byId('focus-mini-state');
const miniTime = byId('focus-mini-time');
const miniToggle = byId('focus-mini-toggle');
const durationPresets = document.querySelectorAll('[data-focus-minutes]');
const notificationButton = byId('focus-notifications');
const notificationStatus = byId('focus-notification-status');
const clockSetting = byId('focus-clock-setting');
const clockAutoKey = `${storageKey}:clock-auto`;
const completionAlert = byId('focus-alert');
const supportsNotifications = 'Notification' in window && 'serviceWorker' in navigator;
const validDuration = minutes => validNumber(minutes) && minutes > 0 && Number.isSafeInteger(minutes * 60000 + Date.now());

function clockShortcutUrl(remaining) {
  const name = encodeURIComponent('考研专注提醒');
  return `shortcuts://run-shortcut?name=${name}&input=text&text=${Math.ceil(remaining / 1000)}`;
}

function launchClockReminder(timer) {
  const remaining = remainingTime(timer);
  if (remaining > 0) location.assign(clockShortcutUrl(remaining));
  else renderTimer(true);
}

let clockAuto = false;
try {
  clockAuto = localStorage.getItem(clockAutoKey) === 'true';
} catch { /* The setting can still be changed during this visit. */ }

function renderClockSetting() {
  byId('focus-clock-mode').hidden = !clockAuto;
  byId('focus-clock-setup').hidden = clockAuto;
  byId('focus-clock-controls').hidden = !clockAuto;
  clockSetting.textContent = clockAuto ? '关闭时钟提醒' : '我已设置快捷指令';
}

clockSetting.addEventListener('click', () => {
  clockAuto = !clockAuto;
  renderClockSetting();
  const status = byId('focus-clock-status');
  try {
    localStorage.setItem(clockAutoKey, String(clockAuto));
    status.textContent = '';
    const settings = byId('focus-reminder-settings');
    settings.open = false;
    settings.querySelector('summary').focus();
  } catch {
    status.textContent = '设置已应用到本次使用，浏览器未能保存。';
  }
});

function renderNotificationSettings() {
  const permission = supportsNotifications ? Notification.permission : 'unavailable';
  notificationButton.hidden = permission !== 'default';
  notificationStatus.textContent = {
    granted: '已开启系统通知。页面休眠时，返回后补发提醒。',
    denied: '系统通知已关闭。可在设备设置中调整，页面仍会提醒。',
    default: '专注到点会在页面提醒。锁屏或关闭页面时，系统可能暂停计时程序。',
    unavailable: '到点会在页面提醒。iPhone 可从主屏幕打开网页应用后开启系统通知。',
  }[permission];
}

notificationButton.addEventListener('click', async () => {
  if (!supportsNotifications) return;
  try {
    await Notification.requestPermission();
    renderNotificationSettings();
  } catch {
    notificationStatus.textContent = '此环境无法开启系统通知。到点仍会在页面提醒。';
  }
});

byId('focus-alert-dismiss').addEventListener('click', () => { completionAlert.hidden = true; });

async function remindCompletion(timer, taskName) {
  const message = `${taskName} · ${timer.minutes} 分钟专注结束`;
  completionAlert.hidden = false;
  byId('focus-alert-message').textContent = message;
  if (!supportsNotifications || Notification.permission !== 'granted') return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.showNotification('专注计时结束', {
      body: message,
      tag: `study-focus-${timer.id}`,
      icon: new URL('./icons/icon-192.png', location.href).href,
    });
  } catch { /* Keep the in-page reminder visible if delivery fails. */ }
}

function readTimer() {
  try {
    const timer = JSON.parse(localStorage.getItem(timerKey));
    if (timer && /^[\da-f-]{36}$/.test(timer.id) && validDay(timer.date) && taskIds.has(timer.task) &&
      validDuration(timer.minutes) && validNumber(timer.remaining) && timer.remaining <= timer.minutes * 60000 &&
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
  if (timer) durationInput.value = timer.minutes;
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
  const minutes = durationInput.valueAsNumber;
  const remaining = timer ? remainingTime(timer) : validDuration(minutes) ? minutes * 60000 : 0;
  const state = timer ? `${timer.id}:${timer.ends}` : '';
  if (state !== observedTimer) {
    refreshFocusOptions(timer);
    observedTimer = state;
    failedTimer = null;
    if (timer) focusStatus.textContent = timer.ends === null ? '已暂停，随时可以继续。' : `正在专注：${taskSelect.selectedOptions[0].textContent}`;
  }
  if (timer && remaining === 0 && (retry || failedTimer !== timer.id)) {
    const taskName = taskSelect.selectedOptions[0].textContent;
    if (saveSession(timer, remaining)) {
      remindCompletion(timer, taskName);
      timer = null;
      observedTimer = '';
    } else {
      failedTimer = timer.id;
    }
  }
  const seconds = Math.ceil(remaining / 1000);
  const time = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const status = timer ? (remaining === 0 ? '待保存' : timer.ends === null ? '已暂停' : '专注中') : '今天';
  byId('focus-clock').textContent = time;
  byId('focus-badge').textContent = status;
  focusToggle.textContent = timer ? (timer.ends === null ? '继续专注' : '暂停') : '开始专注';
  focusToggle.disabled = !!timer && remaining === 0;
  taskSelect.disabled = durationInput.disabled = !!timer;
  for (const preset of durationPresets) preset.disabled = !!timer;
  focusFinish.hidden = !timer;
  focusCheck.hidden = !!timer || !pendingTask();

  miniTitle.textContent = timer ? taskSelect.selectedOptions[0].textContent : '专注计时';
  miniState.textContent = timer ? status : '选择任务与时长';
  miniTime.hidden = !timer;
  miniTime.textContent = time;
  miniToggle.hidden = !timer || remaining === 0;
  miniToggle.textContent = timer?.ends === null ? '继续' : '暂停';
  miniToggle.setAttribute('aria-label', `${miniToggle.textContent}专注`);
}

function toggleFocus(allowStart) {
  checkDate();
  const timer = readTimer();
  if (timer) {
    const remaining = remainingTime(timer);
    if (!remaining) return renderTimer(true);
    if (!writeTimer({ ...timer, remaining, ends: timer.ends === null ? Date.now() + remaining : null })) return;
  } else {
    if (!allowStart) return;
    const minutes = durationInput.valueAsNumber;
    if (!validDuration(minutes)) {
      focusStatus.textContent = '请输入有效的分钟数，至少 1 分钟，使用整数。';
      durationInput.focus();
      return;
    }
    completionAlert.hidden = true;
    const remaining = minutes * 60000;
    const started = { id: crypto.randomUUID(), date: today, task: taskSelect.value, minutes, remaining, ends: Date.now() + remaining };
    if (!writeTimer(started)) return;
    renderTimer();
    return started;
  }
  renderTimer();
}

focusToggle.addEventListener('click', () => {
  const started = toggleFocus(true);
  if (started && clockAuto) launchClockReminder(started);
});
miniToggle.addEventListener('click', () => toggleFocus(false));

focusFinish.addEventListener('click', () => {
  const timer = readTimer();
  if (!timer) return;
  const remaining = remainingTime(timer);
  if (remaining === 0) return renderTimer(true);
  if (saveSession(timer, remaining)) {
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

durationInput.addEventListener('input', () => renderTimer());
for (const preset of durationPresets) {
  preset.addEventListener('click', () => {
    durationInput.value = preset.dataset.focusMinutes;
    renderTimer();
  });
}
document.addEventListener('study-plan-change', refreshFocus);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  renderNotificationSettings();
  renderTimer(true);
});
window.addEventListener('storage', event => { if (event.key === timerKey || event.key === null) refreshFocus(); });
setInterval(() => renderTimer(), 250);
refreshFocus();
renderNotificationSettings();
renderClockSetting();
