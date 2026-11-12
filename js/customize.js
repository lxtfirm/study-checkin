const taskEditor = byId('task-editor');
const taskDialog = byId('task-dialog');
const courseDialog = byId('course-dialog');
const courseList = byId('custom-courses');
const customCourseForm = byId('custom-course-form');
let editedTask, taskEditorDate, editedCourse, courseEditorDate;

function editorError(id, message = '') {
  const output = byId(id);
  output.textContent = message;
  output.hidden = !message;
}

for (const dialog of [taskDialog, courseDialog]) {
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX >= bounds.right ||
        event.clientY < bounds.top || event.clientY >= bounds.bottom) dialog.close();
  });
}

function openTaskEditor(id) {
  const task = days[current]?.tasks?.[id];
  editedTask = id;
  taskEditorDate = current;
  taskEditor.reset();
  byId('task-dialog-title').textContent = byId('task-submit').textContent = task ? '编辑任务' : '添加任务';
  byId('task-dialog-date').textContent = `${current.replaceAll('-', '.')} · 自定义任务`;
  for (const [field, key] of Object.entries({ name: 'name', description: 'description', time: 'time', end: 'end', period: 'period', subject: 'subject' })) {
    byId(`task-${field}`).value = task?.[key] || '';
  }
  editorError('task-message');
  taskDialog.showModal();
}

byId('task-add').addEventListener('click', () => openTaskEditor());
byId('task-cancel').addEventListener('click', () => taskDialog.close());
document.addEventListener('study-plan-change', () => {
  if (taskDialog.open && (taskEditorDate !== current || modeOf(days[current]) !== 'custom')) taskDialog.close();
});

taskEditor.addEventListener('submit', event => {
  event.preventDefault();
  const task = {
    name: byId('task-name').value.trim(), description: byId('task-description').value.trim(),
    time: byId('task-time').value, end: byId('task-end').value,
    period: byId('task-period').value, subject: byId('task-subject').value.trim(),
  };
  if (!task.time || !task.end || !validTaskRange(task.time, task.end)) {
    editorError('task-message', '请填写开始和结束时间，结束时间应晚于开始时间。');
    byId('task-end').focus();
    return;
  }
  if (!validCustomTask(task)) return editorError('task-message', '请填写有效的任务标题和内容。');
  const id = editedTask || `t-${crypto.randomUUID()}`;
  if (!changeDay(day => ({ ...day, tasks: { ...day.tasks, [id]: task } }), taskEditorDate)) {
    return editorError('task-message', '任务未保存，请检查设备存储空间。');
  }
  taskDialog.close();
  render();
  (editedTask ? list.querySelector(`[data-edit-task="${id}"]`) : byId('task-add'))?.focus({ preventScroll: true });
  toast(editedTask ? '任务已更新' : '任务已添加');
});

list.addEventListener('click', event => {
  const button = event.target.closest('[data-edit-task], [data-delete-task]');
  if (!button) return;
  const id = button.dataset.editTask || button.dataset.deleteTask;
  const task = days[current]?.tasks?.[id];
  if (!task) return;
  if (button.dataset.editTask) return openTaskEditor(id);
  if (!confirm(`删除「${task.name}」？`)) return;
  if (!changeDay(day => {
    const tasks = { ...day.tasks }, checked = { ...day.checked };
    delete tasks[id];
    delete checked[id];
    return { ...day, tasks, checked };
  })) return;
  render();
  byId('task-add').focus({ preventScroll: true });
});

function coursesOn(date) {
  const result = {};
  for (const key of Object.keys(days).sort()) {
    if (key > date) break;
    Object.assign(result, days[key].courses);
  }
  return result;
}

const saveCustomCourse = (id, course, date = current) =>
  changeDay(day => ({ ...day, courses: { ...day.courses, [id]: course } }), date);

function renderCustomCourses() {
  if (courseDialog.open && courseEditorDate !== current) courseDialog.close();
  courseList.innerHTML = Object.entries(coursesOn(current)).filter(([, course]) => course).map(([id, course]) => `
    <article class="panel course-card custom-course">
      <div class="panel-title"><h3 class="course-name">${escapeHtml(course.name)}</h3><span class="badge">自定义</span></div>
      <p class="course-count"><strong>${course.done}</strong> / ${course.total} 讲</p>
      <progress aria-label="${escapeHtml(course.name)}进度" value="${course.done}" max="${course.total}"></progress>
      <p class="hint">${course.done === course.total ? '已完成全部课程。' : `下一讲 · 第 ${course.done + 1} 讲`}</p>
      <form class="course-edit" data-course-progress="${id}">
        <label for="progress-${id}">累计已学讲数</label>
        <input id="progress-${id}" type="number" inputmode="numeric" min="0" max="${course.total}" step="1" value="${course.done}" required>
        <button type="submit" class="btn secondary">保存</button>
      </form>
      <div class="task-actions"><button type="button" data-edit-course="${id}" aria-haspopup="dialog">编辑课程</button><button type="button" data-delete-course="${id}">归档</button></div>
    </article>`).join('');
  courseList.hidden = !courseList.firstElementChild;
}

document.addEventListener('study-course-change', renderCustomCourses);
renderCustomCourses();

function openCourseEditor(id) {
  const course = coursesOn(current)[id];
  editedCourse = id;
  courseEditorDate = current;
  customCourseForm.reset();
  byId('course-dialog-title').textContent = course ? '编辑课程' : '添加课程';
  byId('custom-course-submit').textContent = course ? '保存课程' : '添加课程';
  byId('custom-course-name').value = course?.name || '';
  byId('custom-course-total').value = course?.total ?? '';
  byId('custom-course-done').value = course?.done ?? 0;
  editorError('custom-course-message');
  courseDialog.showModal();
}

byId('course-add').addEventListener('click', () => openCourseEditor());
byId('custom-course-cancel').addEventListener('click', () => courseDialog.close());

customCourseForm.addEventListener('submit', event => {
  event.preventDefault();
  const name = byId('custom-course-name').value.trim();
  const total = byId('custom-course-total').valueAsNumber;
  const done = byId('custom-course-done').valueAsNumber;
  if (!validTitle(name) || !validNumber(total) || total < 1 || total > 9999 || !validNumber(done) || done > total) {
    return editorError('custom-course-message', '请填写课程名称，已完成课时须在 0 和总课时之间。');
  }
  const id = editedCourse || crypto.randomUUID();
  if (!saveCustomCourse(id, { name, total, done }, courseEditorDate)) {
    return editorError('custom-course-message', '课程未保存，请检查设备存储空间。');
  }
  courseDialog.close();
  renderCustomCourses();
  (editedCourse ? courseList.querySelector(`[data-edit-course="${id}"]`) : byId('course-add'))?.focus({ preventScroll: true });
  toast('课程已保存');
});

courseList.addEventListener('submit', event => {
  event.preventDefault();
  const id = event.target.dataset.courseProgress;
  const course = coursesOn(current)[id];
  const done = event.target.querySelector('input').valueAsNumber;
  if (!course || !validNumber(done) || done > course.total || !saveCustomCourse(id, { ...course, done })) return;
  renderCustomCourses();
  courseList.querySelector(`[data-course-progress="${id}"] button`)?.focus({ preventScroll: true });
  toast('课程进度已保存');
});

courseList.addEventListener('click', event => {
  const button = event.target.closest('[data-edit-course], [data-delete-course]');
  if (!button) return;
  const id = button.dataset.editCourse || button.dataset.deleteCourse;
  const course = coursesOn(current)[id];
  if (!course) return;
  if (button.dataset.editCourse) return openCourseEditor(id);
  if (confirm(`从所选日期起归档「${course.name}」？之后已经保存的进度仍可查看。`) && saveCustomCourse(id, null)) {
    renderCustomCourses();
    byId('course-add').focus({ preventScroll: true });
  }
});

for (const eventName of ['popstate', 'hashchange']) {
  window.addEventListener(eventName, () => {
    if (taskDialog.open && location.hash && location.hash !== '#tasks') taskDialog.close();
    if (courseDialog.open && location.hash !== '#course') courseDialog.close();
  });
}

const cover = document.querySelector('.cover');
const coverKey = `${storageKey}:cover`;
const coverInput = byId('cover-image');
const coverStatus = byId('cover-status');
const coverReset = byId('cover-reset');

function showCover(value) {
  const validImage = /^data:image\/jpeg;base64,[a-z0-9+/=]+$/i.test(value || '');
  cover.style.setProperty('--cover-image', validImage ? `url("${value}")` : 'none');
  cover.classList.toggle('has-cover-image', validImage);
  coverReset.hidden = !validImage;
}

try { showCover(localStorage.getItem(coverKey)); } catch { /* Default cover remains usable. */ }

coverInput.addEventListener('change', async () => {
  const file = coverInput.files[0];
  if (!file) return;
  coverInput.disabled = true;
  const url = URL.createObjectURL(file);
  try {
    if (file.size > 20 * 1024 * 1024) throw new Error('请选择 20 MB 以内的图片。');
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = '#eaf0f8';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    const value = canvas.toDataURL('image/jpeg', 0.82);
    localStorage.setItem(coverKey, value);
    showCover(value);
    coverStatus.textContent = '已更换封面，图片保存在此设备。';
  } catch (error) {
    coverStatus.textContent = error.message.startsWith('请选择') ? error.message : '无法保存图片，请换一张较小的 JPG 或 PNG 再试。';
  } finally {
    URL.revokeObjectURL(url);
    coverInput.value = '';
    coverInput.disabled = false;
  }
});

coverReset.addEventListener('click', () => {
  try {
    localStorage.removeItem(coverKey);
    showCover(null);
    coverStatus.textContent = '已恢复默认封面。';
  } catch { coverStatus.textContent = '无法更新本地设置，请重试。'; }
});
