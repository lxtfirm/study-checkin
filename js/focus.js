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

const usesClockReminder = timer => timer.clockRequested ?? clockAuto;

function renderClockSetting() {
  byId('focus-clock-mode').hidden = !clockAuto;
  byId('focus-clock-setup').hidden = clockAuto;
  byId('focus-clock-controls').hidden = !clockAuto;
  clockSetting.textContent = clockAuto ? '关闭时钟提醒' : '我已设置快捷指令';
  renderNotificationSettings();
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
  if (canUsePush()) {
    notificationButton.hidden = true;
    notificationStatus.textContent = '锁屏推送已连接。每次开始专注时会自动安排提醒。';
    return;
  }
  const permission = supportsNotifications ? Notification.permission : 'unavailable';
  notificationButton.hidden = permission !== 'default';
  notificationStatus.textContent = {
    granted: clockAuto ? '已开启网页通知。使用 iPhone 时钟的专注由时钟提醒。' : '已开启网页通知。页面休眠时，返回后补发提醒。',
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
  if (usesClockReminder(timer)) return;
  const message = `${taskName} · ${timer.minutes} 分钟专注结束`;
  completionAlert.hidden = false;
  byId('focus-alert-message').textContent = message;
  if (timer.pushRevision && timer.pushScheduled) return;
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
    if (timer && /^[\da-f-]{36}$/.test(timer.id) && validDay(timer.date) && validTaskId(timer.task) &&
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
    tasks.push(task || [timer.task, '', timer.taskName || '自定义任务']);
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
let pushBusy = false;

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
  if (timer && remaining === 0 && !pushBusy && (retry || failedTimer !== timer.id)) {
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
  focusToggle.disabled = miniToggle.disabled = pushBusy || (!!timer && remaining === 0);
  focusFinish.disabled = pushBusy;
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

async function changePushTimer(timer, action) {
  const remaining = remainingTime(timer);
  const dueAt = action === 'start' ? timer.ends : action === 'resume' ? Date.now() + remaining : null;
  const revision = timer.pushRevision + (action === 'start' ? 0 : 1);
  pushBusy = true;
  renderTimer();
  pushMessage(dueAt === null ? '正在撤销锁屏提醒…' : '正在安排锁屏提醒…');
  try {
    const result = await updatePushTimer(timer, revision, dueAt);
    const currentTimer = readTimer();
    if (currentTimer?.id !== timer.id || currentTimer.pushRevision !== timer.pushRevision) return;
    if (action === 'finish') saveSession(timer, remaining);
    else writeTimer({ ...timer, remaining, ends: result.dueAt, pushRevision: revision, pushScheduled: dueAt !== null });
    pushMessage(result.alreadySent ? '提醒已交给系统，无法收回。' :
      dueAt === null ? '' : '锁屏提醒已安排。');
  } catch {
    pushMessage(dueAt === null ? '未确认撤销，原提醒可能仍会送达。请联网重试。' :
      '未确认锁屏提醒，请检查网络。网页内计时仍可使用。');
  } finally {
    pushBusy = false;
    renderTimer();
  }
}

function toggleFocus(allowStart) {
  if (pushBusy) return;
  checkDate();
  const timer = readTimer();
  if (timer) {
    const remaining = remainingTime(timer);
    if (!remaining) return renderTimer(true);
    const resuming = timer.ends === null;
    if (timer.pushRevision) {
      changePushTimer(timer, resuming ? 'resume' : 'pause');
      return;
    }
    if (!writeTimer({ ...timer, remaining, ends: resuming ? Date.now() + remaining : null })) return;
    renderTimer();
    if (usesClockReminder(timer)) {
      toast(resuming ? '网页已继续，请在 iPhone 时钟继续对应计时器。' : '网页已暂停，请在 iPhone 时钟暂停对应计时器。');
    }
  } else {
    if (!allowStart) return;
    if (!taskSelect.value) {
      focusStatus.textContent = '请先在每日任务中添加一项任务。';
      return;
    }
    const minutes = durationInput.valueAsNumber;
    if (!validDuration(minutes)) {
      focusStatus.textContent = '请输入有效的分钟数，至少 1 分钟，使用整数。';
      durationInput.focus();
      return;
    }
    completionAlert.hidden = true;
    const remaining = minutes * 60000;
    const usePush = canUsePush();
    const started = {
      id: crypto.randomUUID(), date: today, task: taskSelect.value, minutes, remaining,
      taskName: taskSelect.selectedOptions[0].textContent,
      ends: Date.now() + remaining, clockRequested: !usePush && clockAuto,
      ...(usePush ? { pushRevision: 1 } : {}),
    };
    if (!writeTimer(started)) return;
    renderTimer();
    if (usePush) changePushTimer(started, 'start');
    else pushMessage('');
    return started;
  }
}

focusToggle.addEventListener('click', () => {
  const started = toggleFocus(true);
  if (started?.clockRequested) launchClockReminder(started);
});
miniToggle.addEventListener('click', () => toggleFocus(false));

focusFinish.addEventListener('click', () => {
  if (pushBusy) return;
  const timer = readTimer();
  if (!timer) return;
  const remaining = remainingTime(timer);
  if (remaining === 0) return renderTimer(true);
  if (timer.pushRevision) return changePushTimer(timer, 'finish');
  if (saveSession(timer, remaining)) {
    renderTimer();
    if (usesClockReminder(timer)) toast('专注已记录，请在 iPhone 时钟停止对应计时器。');
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
renderClockSetting();
