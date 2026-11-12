const pushKey = `${storageKey}:push-device`;
const pushSetup = byId('push-setup');
const pushSetupStatus = byId('push-setup-status');
const pushState = byId('push-state');
let pushDevice;
let pushConfig;
let pushRegistration;
let pushReady = false;
try { pushDevice = localStorage.getItem(pushKey); } catch { /* Browser storage is unavailable. */ }

function pushMessage(message) {
  pushState.textContent = message;
  pushState.hidden = !message;
}

async function pushRequest(path, options = {}) {
  const response = await fetch(new URL(`./api/focus/${path}`, location.href), {
    ...options, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(7000),
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!response.ok) throw Object.assign(new Error('推送服务请求失败'), { status: response.status });
  return response.json();
}

async function initializePush() {
  if (location.hostname.endsWith('.github.io')) {
    pushSetupStatus.textContent = '此预览站点仅支持网页内计时。自有服务器接入后可开启锁屏推送。';
    return;
  }
  if (!('serviceWorker' in navigator && 'PushManager' in window)) {
    pushSetupStatus.textContent = 'iPhone 请先将网站添加到主屏幕，再从图标打开。';
    return;
  }
  if (!navigator.onLine) {
    pushSetupStatus.textContent = '联网后可连接锁屏推送。';
    return;
  }
  try {
    pushConfig = await pushRequest('config');
    if (typeof pushConfig.publicKey !== 'string') throw new Error();
    pushRegistration = await navigator.serviceWorker.ready;
    pushSetup.hidden = false;
    if (pushDevice && Notification.permission === 'granted' && await pushRegistration.pushManager.getSubscription()) {
      pushReady = true;
      pushSetupStatus.textContent = '此设备已连接。只有更换订阅时才需要重新连接。';
      renderNotificationSettings();
    } else {
      pushDevice = null;
      pushSetupStatus.textContent = '首次连接并允许通知后，开始专注即可自动安排锁屏提醒。';
    }
  } catch { pushSetupStatus.textContent = '此站点尚未接通后台推送。'; }
}

function canUsePush() {
  return pushReady && Notification.permission === 'granted';
}

pushSetup.addEventListener('submit', async event => {
  event.preventDefault();
  if (!pushRegistration || readTimer()) {
    pushSetupStatus.textContent = '请先结束当前专注，再连接设备。';
    return;
  }
  const button = pushSetup.querySelector('button');
  button.disabled = true;
  const codeInput = byId('push-code');
  try {
    const key = pushConfig.publicKey.replace(/-/g, '+').replace(/_/g, '/');
    const applicationServerKey = Uint8Array.from(atob(key), char => char.charCodeAt(0));
    const subscription = await pushRegistration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
    const { token } = await pushRequest('devices', {
      method: 'POST', body: JSON.stringify({ code: codeInput.value, subscription }),
    });
    localStorage.setItem(pushKey, token);
    pushDevice = token;
    pushReady = true;
    codeInput.value = '';
    pushSetupStatus.textContent = '此设备已连接。以后开始专注会自动安排提醒。';
    pushMessage('');
    renderClockSetting();
  } catch (error) {
    pushSetupStatus.textContent = error.status === 403 ? '连接码不正确。' :
      Notification.permission === 'denied' ? '通知权限已关闭，请在系统设置中开启。' : '连接失败，请检查网络后重试。';
  } finally { button.disabled = false; }
});

async function updatePushTimer(timer, revision, dueAt) {
  return pushRequest(`timers/${timer.id}`, {
    method: 'PUT', headers: { Authorization: `Bearer ${pushDevice || ''}` },
    body: JSON.stringify({ revision, dueAt }),
  });
}

initializePush();
window.addEventListener('online', () => { if (!pushReady) initializePush(); });
