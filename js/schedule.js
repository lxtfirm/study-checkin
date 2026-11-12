const lecture = [
  ['m1', '14:30–16:00', '张宇《基础30讲》网课', '听新课，理解概念与推导'],
  [null, '16:00–16:20', '休息'],
  ['m2', '16:20–17:20', '知识整理、复现例题', '关掉视频，尝试独立推导'],
  ['m3', '17:20–17:50', '配套基础练习', '只做学过的知识点'],
  [null, '17:50–19:00', '晚饭、休息'],
];

const practice = [
  ['p1', '14:30–15:00', '知识点回顾', '回顾公式、概念和典型方法'],
  ['p2', '15:00–16:20', '独立做题', '练习已学章节，写出解题思路'],
  [null, '16:20–16:40', '休息'],
  ['p3', '16:40–17:30', '继续练习', '核对答案，补全思路'],
  ['p4', '17:30–18:00', '错题整理', '区分概念、方法和计算错误'],
  [null, '18:00–19:00', '晚饭、休息'],
];

const english = [
  ['e1', '19:00–19:25', '英语长难句', '分析 2–3 句，定位句子主干'],
  ['e2', '19:25–20:05', '英语一阅读', '做一篇并标记疑问'],
  [null, '20:05–20:20', '休息'],
  ['e3', '20:20–20:50', '阅读错题分析', '逐题定位依据、分析选项'],
  ['e4', '20:50–21:30', '背单词', '学习新词，复习旧词'],
];

const review = [
  [null, '21:30–21:45', '休息'],
  ['r1', '21:45–22:15', '每日复盘', '记下收获与明天第一项任务'],
  [null, '22:15–22:30', '自由收尾'],
];

const taskIds = new Set([...lecture, ...practice, ...english, ...review].map(([id]) => id).filter(Boolean));
const modeOf = day => day?.mode === 'practice' ? 'practice' : 'lecture';
const mathTasks = day => modeOf(day) === 'practice' ? practice : lecture;
const studyTasks = day => [...mathTasks(day), ...english, ...review].filter(([id]) => id);

function completion(day) {
  const tasks = studyTasks(day);
  const done = tasks.filter(([id]) => day?.checked?.[id]).length;
  return { done, total: tasks.length, percent: Math.round(done / tasks.length * 100) };
}

function localDay(date = new Date()) {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const dateAtNoon = key => new Date(`${key}T12:00:00`);

function validDay(key) {
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && !key.startsWith('0000-') && localDay(dateAtNoon(key)) === key;
}

function moveDay(key, days) {
  const date = dateAtNoon(key);
  date.setDate(date.getDate() + days);
  return localDay(date);
}

function weekStats(days, today) {
  const weekday = dateAtNoon(today).getDay();
  const monday = moveDay(today, -((weekday + 6) % 7));
  let week = 0;
  let focused = 0;
  for (const [key, day] of Object.entries(days)) {
    if (key >= monday && key <= today) {
      week += completion(day).done;
      focused += focusSeconds(day);
    }
  }
  // An unfinished today can still extend yesterday's streak.
  let key = completion(days[today]).done ? today : moveDay(today, -1);
  let streak = 0;
  while (completion(days[key]).done) {
    streak++;
    key = moveDay(key, -1);
  }
  return { week, streak, focused };
}

const focusSeconds = day => Object.values(day?.focus || {}).reduce((total, session) => total + session.seconds, 0);
const focusMinutes = seconds => seconds > 0 && seconds < 60 ? '少于 1' : String(Math.floor(seconds / 60));

const poems = [
  ['行到水穷处，坐看云起时。', '王维《终南别业》'],
  ['会当凌绝顶，一览众山小。', '杜甫《望岳》'],
  ['山重水复疑无路，柳暗花明又一村。', '陆游《游山西村》'],
  ['长风破浪会有时，直挂云帆济沧海。', '李白《行路难·其一》'],
  ['不畏浮云遮望眼，自缘身在最高层。', '王安石《登飞来峰》'],
  ['欲穷千里目，更上一层楼。', '王之涣《登鹳雀楼》'],
  ['纸上得来终觉浅，绝知此事要躬行。', '陆游《冬夜读书示子聿》'],
  ['千淘万漉虽辛苦，吹尽狂沙始到金。', '刘禹锡《浪淘沙·其八》'],
];
