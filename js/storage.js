const textFields = ['mathnote', 'engnote', 'summary', 'tomorrow'];
const numberFields = ['mathCorrect', 'mathTotal', 'englishCorrect', 'englishTotal', 'words'];
const storageKey = `study-checkin:v1:${new URL('./', location.href).pathname}`;
const backupFormat = 'study-checkin';
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validNumber = value => Number.isSafeInteger(value) && value >= 0;
const validTitle = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 80;
const validTime = value => typeof value === 'string' && (value === '' || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value));
const optionalText = (value, max) => value === undefined || (typeof value === 'string' && value.length <= max);
const validTaskRange = (time, end) => validTime(time) && (end === undefined || end === '' || (validTime(end) && !!time && end > time));

function validCustomTask(task) {
  return isObject(task) && validTitle(task.name) && validTaskRange(task.time, task.end) &&
    optionalText(task.description, 160) && optionalText(task.subject, 24) &&
    (task.period === undefined || ['', 'morning', 'afternoon', 'evening'].includes(task.period));
}

function validateDay(day) {
  if (!isObject(day)) throw new Error('日期记录必须是对象。');
  const result = {};
  for (const [field, value] of Object.entries(day)) {
    if (field === 'mode' && ['lecture', 'practice', 'custom'].includes(value)) {
      result.mode = value;
    } else if (field === 'checked' && isObject(value) &&
      Object.entries(value).every(([id, checked]) => validTaskId(id) && typeof checked === 'boolean')) {
      result.checked = { ...value };
    } else if (textFields.includes(field) && typeof value === 'string') {
      result[field] = value;
    } else if (numberFields.includes(field) && (value === null || validNumber(value))) {
      result[field] = value;
    } else if (field === 'course' && validNumber(value) && value <= 30) {
      result.course = value;
    } else if (field === 'tasks' && isObject(value) && Object.entries(value).every(([id, task]) =>
      id.startsWith('t-') && validTaskId(id) && validCustomTask(task))) {
      result.tasks = Object.fromEntries(Object.entries(value).map(([id, { name, time, end, description, period, subject }]) =>
        [id, { name, time, ...(end && { end }), ...(description && { description }), ...(period && { period }), ...(subject && { subject }) }]));
    } else if (field === 'courses' && isObject(value) && Object.entries(value).every(([id, course]) =>
      customId(id) && (course === null || (isObject(course) && validTitle(course.name) &&
        validNumber(course.total) && course.total > 0 && course.total <= 9999 && validNumber(course.done) && course.done <= course.total)))) {
      result.courses = Object.fromEntries(Object.entries(value).map(([id, course]) => [id, course && { name: course.name, total: course.total, done: course.done }]));
    } else if (field === 'focus' && isObject(value) && Object.entries(value).every(([id, session]) =>
      /^[\da-f-]{36}$/.test(id) && isObject(session) && validTaskId(session.task) &&
      validNumber(session.seconds) && session.seconds > 0)) {
      result.focus = Object.fromEntries(Object.entries(value).map(([id, { task, seconds }]) => [id, { task, seconds }]));
    } else {
      throw new Error(`字段 ${field} 的格式有误。`);
    }
  }
  return result;
}

function validateDays(days) {
  if (!isObject(days)) throw new Error('缺少日期记录。');
  return Object.fromEntries(Object.entries(days).map(([key, day]) => {
    if (!validDay(key)) throw new Error('备份包含无效日期。');
    return [key, validateDay(day)];
  }));
}

function parseBackup(text) {
  let backup;
  try {
    backup = JSON.parse(text);
  } catch {
    throw new Error('文件不是有效的 JSON。');
  }
  if (!isObject(backup) || backup.format !== backupFormat || ![1, 2].includes(backup.version)) {
    throw new Error('请选择本应用导出的 JSON 备份。');
  }
  return validateDays(backup.days);
}

function loadDays() {
  const saved = localStorage.getItem(storageKey);
  if (saved !== null) return parseBackup(saved);

  // The original page used one unversioned study:YYYY-MM-DD key per day.
  const days = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith('study:') || !validDay(key.slice(6))) continue;
    try {
      days[key.slice(6)] = validateDay(JSON.parse(localStorage.getItem(key)));
    } catch {
      // Leave malformed legacy entries untouched and migrate the readable days.
    }
  }
  return days;
}

function serializeDays(days, indent) {
  return JSON.stringify({ format: backupFormat, version: 2, days }, null, indent);
}

function saveDays(days) {
  // A single write keeps restores atomic if storage is unavailable or full.
  localStorage.setItem(storageKey, serializeDays(days));
}
