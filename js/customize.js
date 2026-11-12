const taskEditor = byId('task-editor');
let editedTask;
let taskEditorDate = current;

function resetTaskEditor() {
  editedTask = undefined;
  taskEditor.reset();
  byId('task-submit').textContent = '添加任务';
  byId('task-cancel').hidden = true;
}

document.addEventListener('study-plan-change', () => {
  if (taskEditorDate !== current || taskEditor.hidden) resetTaskEditor();
  taskEditorDate = current;
});

taskEditor.addEventListener('submit', event => {
  event.preventDefault();
  const name = byId('task-name').value.trim();
  const time = byId('task-time').value;
  if (!validTitle(name) || !validTime(time)) return toast('请填写有效的任务名称和时间。');
  const id = editedTask || `t-${crypto.randomUUID()}`;
  if (!changeDay(day => ({ ...day, tasks: { ...day.tasks, [id]: { name, time } } }))) return;
  resetTaskEditor();
  render();
  byId('task-name').focus();
});

byId('task-cancel').addEventListener('click', () => {
  resetTaskEditor();
  byId('task-name').focus();
});

list.addEventListener('click', event => {
  const button = event.target.closest('[data-edit-task], [data-delete-task]');
  if (!button) return;
  const id = button.dataset.editTask || button.dataset.deleteTask;
  const task = days[current]?.tasks?.[id];
  if (!task) return;
  if (button.dataset.editTask) {
    editedTask = id;
    byId('task-name').value = task.name;
    byId('task-time').value = task.time;
    byId('task-submit').textContent = '保存任务';
    byId('task-cancel').hidden = false;
  } else if (confirm(`删除「${task.name}」？`)) {
    if (!changeDay(day => {
      const tasks = { ...day.tasks };
      const checked = { ...day.checked };
      delete tasks[id];
      delete checked[id];
      return { ...day, tasks, checked };
    })) return;
    if (editedTask === id) resetTaskEditor();
    render();
  } else return;
  byId('task-name').focus();
});

const courseList = byId('custom-courses');
const customCourseForm = byId('custom-course-form');
const courseMessage = byId('custom-course-message');
let editedCourse;
let courseEditorDate = current;

function coursesOn(date) {
  const result = {};
  for (const key of Object.keys(days).sort()) {
    if (key > date) break;
    Object.assign(result, days[key].courses);
  }
  return result;
}

function resetCourseEditor() {
  editedCourse = undefined;
  customCourseForm.reset();
  byId('custom-course-submit').textContent = '添加课程';
  byId('custom-course-cancel').hidden = true;
  courseMessage.textContent = '';
}

function renderCustomCourses() {
  if (courseEditorDate !== current) resetCourseEditor();
  courseEditorDate = current;
  courseList.innerHTML = Object.entries(coursesOn(current)).filter(([, course]) => course).map(([id, course]) => `
    <article class="custom-course">
      <div class="custom-course-heading"><strong>${escapeHtml(course.name)}</strong><span>${course.done} / ${course.total}</span></div>
      <progress aria-label="${escapeHtml(course.name)}进度" value="${course.done}" max="${course.total}"></progress>
      <div class="task-actions"><button type="button" data-edit-course="${id}">编辑进度</button><button type="button" data-delete-course="${id}">归档</button></div>
    </article>`).join('') || '<p class="hint">还没有自定义课程。</p>';
}

document.addEventListener('study-course-change', renderCustomCourses);
renderCustomCourses();

customCourseForm.addEventListener('submit', event => {
  event.preventDefault();
  const name = byId('custom-course-name').value.trim();
  const total = byId('custom-course-total').valueAsNumber;
  const done = byId('custom-course-done').valueAsNumber;
  if (!validTitle(name) || !validNumber(total) || total < 1 || total > 9999 || !validNumber(done) || done > total) {
    courseMessage.textContent = '请填写课程名称，已完成课时须在 0 和总课时之间。';
    return;
  }
  const id = editedCourse || crypto.randomUUID();
  if (!changeDay(day => ({ ...day, courses: { ...day.courses, [id]: { name, total, done } } }))) return;
  resetCourseEditor();
  renderCustomCourses();
  byId('course-editor-details').open = false;
  byId('course-editor-details').querySelector('summary').focus();
  toast('课程进度已保存');
});

byId('custom-course-cancel').addEventListener('click', () => {
  resetCourseEditor();
  byId('custom-course-name').focus();
});

courseList.addEventListener('click', event => {
  const button = event.target.closest('[data-edit-course], [data-delete-course]');
  if (!button) return;
  const id = button.dataset.editCourse || button.dataset.deleteCourse;
  const course = coursesOn(current)[id];
  if (!course) return;
  if (button.dataset.editCourse) {
    editedCourse = id;
    byId('course-editor-details').open = true;
    byId('custom-course-name').value = course.name;
    byId('custom-course-total').value = course.total;
    byId('custom-course-done').value = course.done;
    byId('custom-course-submit').textContent = '保存课程';
    byId('custom-course-cancel').hidden = false;
    byId('custom-course-name').focus();
  } else if (confirm(`从所选日期起归档「${course.name}」？之后已经保存的进度仍可查看。`) &&
    changeDay(day => ({ ...day, courses: { ...day.courses, [id]: null } }))) {
    if (editedCourse === id) resetCourseEditor();
    renderCustomCourses();
    byId('course-editor-details').querySelector('summary').focus();
  }
});

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
