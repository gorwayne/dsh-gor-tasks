/**
 * dsh-gor-tasks host half.
 *
 * Owns the task store (a single JSON file under $DSH_HOME/integrations/gor-tasks)
 * and exposes it through two seams:
 *   - `ctx.connection.fetch`  -> the panel UI talks to the same store
 *   - `ctx.tools`             -> the model can manage tasks from chat
 *
 * The tool descriptors below carry **raw JSON Schema** for `parameters` and
 * `output.schema` on purpose: a plugin living outside the profile cannot
 * resolve `@deepseek-ai/dsh-tools`, so `defineTool` is unavailable and the
 * registry receives these descriptors verbatim. Shorthand parameter maps
 * (the `{ type, required: true }` form) are only valid *before* `defineTool`
 * compiles them, and leaking one into the request breaks every turn.
 */

import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const PLUGIN_NAME = 'dsh-gor-tasks';
const RPC_PATH = '/api/dsh-gor-tasks/tasks';
const RPC_METHOD = 'dsh-gor-tasks/tasks';
const STORE_VERSION = 1;

const STATUSES = ['todo', 'doing', 'blocked', 'done'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

const INBOX = 'p_inbox';
const INBOX_NAME = '收集箱';
const INBOX_LEGACY = new Set(['收件箱', '收集箱', 'Inbox', 'inbox']);

const SETTINGS_DEFAULTS = {
  useModelSplit: true,   // 用用户自己配置的模型拆分任务
  dueReminder: true,     // 在侧栏图标上显示到期提醒小红圈
  dueSoonDays: 3,        // 「快到期」= 未来 N 天内到期
};

function normalizeSettings(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const days = Number(raw.dueSoonDays);
  return {
    useModelSplit: raw.useModelSplit !== false,
    dueReminder: raw.dueReminder !== false,
    dueSoonDays: Number.isFinite(days) ? Math.max(0, Math.min(30, Math.round(days))) : SETTINGS_DEFAULTS.dueSoonDays,
  };
}

/* 日期一律按本地时区：toISOString 是 UTC，凌晨会算成「昨天」 */
const pad2 = (value) => String(value).padStart(2, '0');

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function shiftDate(days) {
  const base = new Date();
  base.setDate(base.getDate() + Number(days || 0));
  return localDate(base);
}

/* ------------------------------------------------------------------ store */

function storePath() {
  const home = process.env.DSH_HOME || join(homedir(), '.dsh');
  return join(home, 'integrations', 'gor-tasks', 'tasks.json');
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
}

function emptyStore() {
  const now = new Date().toISOString();
  return {
    version: STORE_VERSION,
    projects: [{ id: INBOX, name: INBOX_NAME, color: '#8b8fa3', order: 0, createdAt: now }],
    tasks: [],
    settings: { ...SETTINGS_DEFAULTS },
  };
}

function normalizeTask(task) {
  const now = new Date().toISOString();
  return {
    id: typeof task.id === 'string' && task.id ? task.id : newId('t'),
    projectId: typeof task.projectId === 'string' && task.projectId ? task.projectId : INBOX,
    title: String(task.title ?? '').trim().slice(0, 400),
    notes: String(task.notes ?? '').slice(0, 20000),
    status: STATUSES.includes(task.status) ? task.status : 'todo',
    priority: PRIORITIES.includes(task.priority) ? task.priority : 'normal',
    due: typeof task.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(task.due) ? task.due : null,
    // tags 暂未在界面和工具里暴露（v2 标签功能预留），保留是为了导入导出不丢字段
    tags: Array.isArray(task.tags) ? task.tags.map((tag) => String(tag).slice(0, 40)).slice(0, 12) : [],
    order: Number.isFinite(task.order) ? task.order : Date.now(),
    createdAt: typeof task.createdAt === 'string' ? task.createdAt : now,
    updatedAt: now,
    completedAt: typeof task.completedAt === 'string' ? task.completedAt : null,
  };
}

function normalizeProject(project, index) {
  const now = new Date().toISOString();
  return {
    id: typeof project.id === 'string' && project.id ? project.id : newId('p'),
    name: String(project.name ?? '').trim().slice(0, 80) || '未命名项目',
    color: typeof project.color === 'string' ? project.color.slice(0, 32) : '#5b8def',
    order: Number.isFinite(project.order) ? project.order : index + 1,
    createdAt: typeof project.createdAt === 'string' ? project.createdAt : now,
  };
}

/* ------------------------------------------------------------- write gate */

const LOCK_RETRY_MS = 50;
const LOCK_TIMEOUT_MS = 2000;
const LOCK_STALE_MS = 15000;
const BACKUP_KEEP = 5;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cloneStore(store) {
  return JSON.parse(JSON.stringify(store));
}

function fileStamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-`
    + `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/* done 状态维护 completedAt：首次完成记时间，离开 done 清空 */
function stampCompletion(before, task) {
  if (task.status === 'done' && !before?.completedAt) task.completedAt = new Date().toISOString();
  if (task.status !== 'done') task.completedAt = null;
  return task;
}

function createStore(warn = () => {}) {
  let cached = null;
  let stamp = null; // 上次读/写时磁盘文件的 mtime + size，用来发现别的进程改过库
  let writing = Promise.resolve();
  let lockUnavailable = false;

  const lockPath = () => `${storePath()}.lock`;

  async function readStamp() {
    try {
      const info = await stat(storePath());
      return { mtimeMs: info.mtimeMs, size: info.size };
    } catch {
      return null;
    }
  }

  async function load() {
    const disk = await readStamp();
    const unchanged = Boolean(cached && stamp && disk && disk.mtimeMs === stamp.mtimeMs && disk.size === stamp.size);
    // 内存里还是「空库」且磁盘也确实没有文件时，无需重读
    if (cached && (unchanged || (!stamp && !disk))) return cached;
    try {
      const raw = await readFile(storePath(), 'utf8');
      const parsed = JSON.parse(raw);
      const projects = Array.isArray(parsed.projects) ? parsed.projects.map(normalizeProject) : [];
      if (!projects.some((project) => project.id === INBOX)) {
        projects.unshift(normalizeProject({ id: INBOX, name: INBOX_NAME, order: 0 }));
      }
      // 默认收集箱：老数据里叫「收件箱」，统一迁移成「收集箱」
      for (const project of projects) {
        if (project.id === INBOX && INBOX_LEGACY.has(String(project.name ?? '').trim())) {
          project.name = INBOX_NAME;
        }
      }
      cached = {
        version: STORE_VERSION,
        projects,
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks.map(normalizeTask) : [],
        settings: normalizeSettings(parsed.settings),
      };
      stamp = disk;
    } catch {
      cached = emptyStore();
      stamp = null;
    }
    return cached;
  }

  async function flush() {
    const snapshot = JSON.stringify(cached ?? emptyStore(), null, 2);
    const target = storePath();
    const tmp = `${target}.${process.pid}.${randomBytes(3).toString('hex')}.tmp`;
    const job = writing.then(async () => {
      try {
        await mkdir(dirname(target), { recursive: true });
        await writeFile(tmp, snapshot, 'utf8');
        await rename(tmp, target);
        stamp = await readStamp();
      } catch (cause) {
        await rm(tmp, { force: true }).catch(() => undefined);
        throw Object.assign(new Error(`任务数据写入失败：${cause?.message ?? cause}`), { code: 'store-write-failed' });
      }
    });
    writing = job.catch(() => undefined); // 链条不能被一次失败打断，错误交给本次调用者
    await job;
  }

  /* 跨进程锁：多个 DSH 窗口同写一个 json 时，后写者会把先写者的改动整体覆盖 */
  async function acquireLock() {
    const target = lockPath();
    try {
      await mkdir(dirname(target), { recursive: true });
    } catch (error) {
      warn(`[dsh-gor-tasks] 数据目录不可写：${error?.message ?? error}`);
    }
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        const handle = await open(target, 'wx');
        await handle.writeFile(`${process.pid} ${new Date().toISOString()}`, 'utf8').catch(() => undefined);
        await handle.close().catch(() => undefined);
        return async () => { await rm(target, { force: true }).catch(() => undefined); };
      } catch (error) {
        if (error?.code !== 'EEXIST') {
          if (!lockUnavailable) {
            lockUnavailable = true;
            warn(`[dsh-gor-tasks] 数据锁不可用（${error?.code ?? error?.message}），降级为无锁写入`);
          }
          return async () => {};
        }
        try {
          const info = await stat(target);
          if (Date.now() - info.mtimeMs > LOCK_STALE_MS) {
            await rm(target, { force: true }).catch(() => undefined);
            continue;
          }
        } catch {
          continue; // 锁刚好被释放，立刻重试
        }
        await sleep(LOCK_RETRY_MS);
      }
    }
    throw Object.assign(new Error('任务数据正在被另一个窗口写入，请稍后重试'), { code: 'store-busy' });
  }

  /* 覆盖式导入前留一份快照，只保留最近 BACKUP_KEEP 份 */
  async function backupStore() {
    const target = storePath();
    let raw;
    try {
      raw = await readFile(target, 'utf8');
    } catch {
      return null; // 首次导入，本来就没有文件
    }
    const file = `${target}.bak-${fileStamp()}`;
    try {
      await writeFile(file, raw, 'utf8');
    } catch (error) {
      warn(`[dsh-gor-tasks] 导入前备份失败：${error?.message ?? error}`);
      return null;
    }
    try {
      const dir = dirname(target);
      const prefix = 'tasks.json.bak-';
      const names = (await readdir(dir)).filter((name) => name.startsWith(prefix)).sort();
      for (const name of names.slice(0, Math.max(0, names.length - BACKUP_KEEP))) {
        await rm(join(dir, name), { force: true }).catch(() => undefined);
      }
    } catch { /* 清理失败不影响导入 */ }
    return file;
  }

  /* 所有写操作走同一道闸门：取锁 → 重读最新库 → 改 → 落盘；失败回滚内存 */
  async function mutate(change) {
    const release = await acquireLock();
    const snapshot = cached ? cloneStore(cached) : null;
    try {
      const store = await load();
      const result = await change(store);
      await flush();
      return result;
    } catch (error) {
      if (snapshot) cached = snapshot;
      throw error;
    } finally {
      await release();
    }
  }

  return {
    async state() {
      const store = await load();
      return { projects: store.projects.slice(), tasks: store.tasks.slice(), settings: { ...store.settings } };
    },
    async saveSettings(patch) {
      return mutate((store) => {
        store.settings = normalizeSettings({ ...store.settings, ...(patch && typeof patch === 'object' ? patch : {}) });
        return { ...store.settings };
      });
    },
    async exportData() {
      const store = await load();
      return {
        format: 'dsh-gor-tasks/export',
        version: STORE_VERSION,
        exportedAt: new Date().toISOString(),
        projects: store.projects.map((project) => ({ ...project })),
        tasks: store.tasks.map((task) => ({ ...task })),
        settings: { ...store.settings },
      };
    },
    async importData(input) {
      const data = input && typeof input === 'object' && input.data ? input.data : input;
      if (!data || typeof data !== 'object') throw Object.assign(new Error('导入内容不是合法的 JSON 对象'), { code: 'bad-import' });
      if (!Array.isArray(data.projects) && !Array.isArray(data.tasks)) {
        throw Object.assign(new Error('导入内容里没有 projects/tasks'), { code: 'bad-import' });
      }
      const projects = Array.isArray(data.projects) ? data.projects.map(normalizeProject) : [];
      if (projects.length === 0 || !projects.some((project) => project.id === INBOX)) {
        projects.unshift(normalizeProject({ id: INBOX, name: INBOX_NAME, order: 0 }));
      }
      const known = new Set(projects.map((project) => project.id));
      const tasks = (Array.isArray(data.tasks) ? data.tasks : [])
        .map(normalizeTask)
        .map((task) => (known.has(task.projectId) ? task : { ...task, projectId: INBOX }));
      return mutate(async (store) => {
        await backupStore();
        store.projects = projects.sort((a, b) => a.order - b.order);
        store.tasks = tasks;
        store.settings = normalizeSettings(data.settings);
        return { projects: store.projects.length, tasks: store.tasks.length, settings: { ...store.settings } };
      });
    },
    async saveProject(input) {
      return mutate((store) => {
        const index = store.projects.findIndex((project) => project.id === input.id);
        if (index >= 0) {
          const name = String(input.name ?? store.projects[index].name ?? '').trim();
          if (!name) throw Object.assign(new Error('项目名称不能为空'), { code: 'bad-name' });
          store.projects[index] = normalizeProject({ ...store.projects[index], ...input, name }, index);
          return { ...store.projects[index] };
        }
        const name = String(input.name ?? '').trim();
        if (!name) throw Object.assign(new Error('项目名称不能为空'), { code: 'bad-name' });
        store.projects.push(normalizeProject({ ...input, name, id: input.id ?? newId('p') }, store.projects.length));
        return { ...store.projects.at(-1) };
      });
    },
    async reorderProjects(ids) {
      return mutate((store) => {
        const wanted = Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [];
        const known = new Set(store.projects.map((project) => project.id));
        const ordered = wanted.filter((id, index) => known.has(id) && wanted.indexOf(id) === index);
        for (const project of store.projects) {
          if (!ordered.includes(project.id)) ordered.push(project.id);
        }
        ordered.forEach((id, index) => {
          const project = store.projects.find((item) => item.id === id);
          if (project) project.order = index;
        });
        store.projects.sort((a, b) => a.order - b.order);
        return store.projects.map((project) => ({ id: project.id, name: project.name, order: project.order }));
      });
    },
    async deleteProject(id) {
      if (id === INBOX) throw Object.assign(new Error('收集箱不能删除'), { code: 'inbox-protected' });
      return mutate((store) => {
        const project = store.projects.find((item) => item.id === id);
        if (!project) throw Object.assign(new Error('项目不存在'), { code: 'project-not-found' });
        const removed = store.tasks.filter((task) => task.projectId === id).map((task) => ({ ...task }));
        store.projects = store.projects.filter((item) => item.id !== id);
        store.tasks = store.tasks.filter((task) => task.projectId !== id);
        // 快照带回去，客户端可以「撤销」整包恢复
        return { id, deletedTasks: removed.length, project: { ...project }, tasks: removed };
      });
    },
    async saveTask(input) {
      return mutate((store) => {
        const index = store.tasks.findIndex((task) => task.id === input.id);
        if (index >= 0) {
          const before = store.tasks[index];
          store.tasks[index] = stampCompletion(before, normalizeTask({ ...before, ...input }));
          return { ...store.tasks[index] };
        }
        const created = stampCompletion(null, normalizeTask({ ...input, id: input.id ?? newId('t') }));
        store.tasks.push(created);
        return { ...created };
      });
    },
    async bulkAdd({ projectId, tasks }) {
      const items = (Array.isArray(tasks) ? tasks : [])
        .slice(0, 200)
        .filter((item) => String(item?.title ?? '').trim());
      if (!items.length) return [];
      return mutate((store) => {
        const created = [];
        for (const item of items) {
          const task = stampCompletion(null, normalizeTask({ ...item, projectId: item.projectId ?? projectId ?? INBOX }));
          store.tasks.push(task);
          created.push({ ...task });
        }
        return created;
      });
    },
    async bulkUpdate({ ids, patch }) {
      const wanted = new Set((Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string'));
      const safe = patch && typeof patch === 'object' ? patch : {};
      if (!wanted.size) return [];
      return mutate((store) => {
        const updated = [];
        for (let index = 0; index < store.tasks.length; index += 1) {
          const before = store.tasks[index];
          if (!wanted.has(before.id)) continue;
          const next = { ...before };
          if (STATUSES.includes(safe.status)) next.status = safe.status;
          if (PRIORITIES.includes(safe.priority)) next.priority = safe.priority;
          if (typeof safe.projectId === 'string' && safe.projectId) next.projectId = safe.projectId;
          if (safe.due !== undefined) next.due = String(safe.due ?? '').trim() || null;
          store.tasks[index] = stampCompletion(before, normalizeTask(next));
          updated.push({ ...store.tasks[index] });
        }
        return updated;
      });
    },
    async bulkRemove(ids) {
      const wanted = new Set((Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string'));
      if (!wanted.size) return [];
      return mutate((store) => {
        const removed = store.tasks.filter((task) => wanted.has(task.id)).map((task) => ({ ...task }));
        if (!removed.length) return [];
        store.tasks = store.tasks.filter((task) => !wanted.has(task.id));
        return removed;
      });
    },
    /* 只重排传入的这一批（客户端传当前可见列表），其余任务 order 整体后移，保持相对次序 */
    async reorderTasks(ids) {
      const wanted = Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [];
      const moving = wanted.filter((id, index) => wanted.indexOf(id) === index);
      if (!moving.length) return [];
      return mutate((store) => {
        const set = new Set(moving);
        const known = new Set(store.tasks.map((task) => task.id));
        const ordered = moving.filter((id) => known.has(id));
        if (!ordered.length) return [];
        for (const task of store.tasks) {
          if (!set.has(task.id)) task.order = (Number.isFinite(task.order) ? task.order : 0) + ordered.length;
        }
        ordered.forEach((id, index) => {
          const task = store.tasks.find((item) => item.id === id);
          if (task) task.order = index;
        });
        return ordered.map((id) => ({ id, order: store.tasks.find((item) => item.id === id)?.order ?? 0 }));
      });
    },
    async deleteTask(id) {
      return mutate((store) => {
        const task = store.tasks.find((item) => item.id === id);
        if (!task) return { ok: false, task: null };
        store.tasks = store.tasks.filter((item) => item.id !== id);
        // 带快照回去，客户端可以「撤销」
        return { ok: true, task: { ...task } };
      });
    },
  };
}

/* -------------------------------------------------------------------- rpc */

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function reply(rpcId, result) {
  const value = result.ok === false
    ? { ...result, error: { ...result.error, details: result.error.details ?? {} } }
    : result;
  return Response.json({ type: 'server-response', rpcId, result: value });
}

function registerRpc(connection, handler) {
  const registry = connection?.fetch;
  if (typeof registry?.register !== 'function') return null;
  return registry.register({
    path: RPC_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });
      const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
      if (contentType !== 'application/json') {
        return new Response('content type must be application/json', { status: 415 });
      }
      let message;
      try { message = await request.json(); } catch { return new Response('body is not JSON', { status: 400 }); }
      const rpcId = typeof message?.rpcId === 'string' ? message.rpcId : 'invalid-request';
      const call = message?.payload;
      if (!isRecord(message) || message.type !== 'client-request' || typeof message.rpcId !== 'string'
        || message.method !== RPC_METHOD || !isRecord(call) || typeof call.method !== 'string') {
        return reply(rpcId, { ok: false, error: { code: 'bad-request', message: 'Invalid task request.' } });
      }
      try {
        return reply(rpcId, await handler(call.method, call.payload ?? {}));
      } catch (error) {
        return reply(rpcId, {
          ok: false,
          error: { code: error?.code ?? 'task-store-failed', message: error?.message ?? 'task store failed' },
        });
      }
    },
  });
}

/* ------------------------------------------------------------------ split */

const SPLIT_SYSTEM = '你是任务拆解助手。你只输出 JSON，不解释、不寒暄。';

function buildSplitPrompt(text, limit) {
  return [
    `把下面这段内容拆成可执行的待办任务，最多 ${limit} 条。`,
    '规则：',
    '1. 每条标题不超过 30 个字，以动词开头，一条只做一件事；',
    '2. 能合并的合并，不要拆出「确认」「了解」这类没有动作的空任务；',
    '3. 只输出一个 JSON 数组，元素形如 {"title":"...","notes":"","priority":"normal"}；',
    '4. priority 只能是 low / normal / high / urgent；',
    '5. 不要输出代码块标记，不要输出数组以外的任何字符。',
    '',
    '内容如下：',
    '"""',
    String(text ?? '').slice(0, 8000),
    '"""',
  ].join('\n');
}

function coerceTasks(raw, limit) {
  const cleaned = String(raw ?? '')
    .replace(/^\s*```(?:json)?/i, '')
    .replace(/```\s*$/, '')
    .trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start < 0 || end <= start) throw Object.assign(new Error('模型没有返回 JSON 数组'), { code: 'split-bad-response' });
  let parsed;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw Object.assign(new Error('模型返回的 JSON 无法解析'), { code: 'split-bad-response' });
  }
  if (!Array.isArray(parsed)) throw Object.assign(new Error('模型返回的不是数组'), { code: 'split-bad-response' });
  return parsed
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      title: String(item.title ?? '').trim().slice(0, 120),
      notes: String(item.notes ?? '').slice(0, 2000),
      priority: PRIORITIES.includes(item.priority) ? item.priority : 'normal',
    }))
    .filter((item) => item.title.length > 0)
    .slice(0, limit);
}

async function splitWithModel(ctx, { text, limit }) {
  const llm = ctx.get?.('llm');
  if (typeof llm?.stream !== 'function') {
    throw Object.assign(new Error('当前 Host 没有可用的模型服务（llm）'), { code: 'llm-unavailable' });
  }
  const selection = ctx.get?.('agentDefaultModel')?.currentSelection?.();
  if (!selection?.provider || !selection?.model) {
    throw Object.assign(new Error('没有配置默认模型，请先在设置里选一个'), { code: 'model-unset' });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  let output = '';
  try {
    const stream = llm.stream({
      provider: selection.provider,
      model: selection.model,
      ...(selection.reasoningEffort === undefined ? {} : { reasoningEffort: selection.reasoningEffort }),
      system: SPLIT_SYSTEM,
      messages: [{
        id: newId('msg'),
        role: 'user',
        source: { kind: 'user' },
        content: [{ type: 'text', text: buildSplitPrompt(text, limit) }],
      }],
      maxTokens: 1600,
      temperature: 0.2,
      signal: controller.signal,
      purpose: 'gor-tasks.split',
    });
    for await (const chunk of stream) {
      if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') output += chunk.text;
    }
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? '拆分超时（90 秒），可以重试或改用按行粗拆'
      : (error?.message ?? '调用模型失败');
    throw Object.assign(new Error(message), { code: 'split-failed' });
  } finally {
    clearTimeout(timer);
  }
  return { tasks: coerceTasks(output, limit), model: `${selection.provider}/${selection.model}` };
}

/* 不用模型时的按行粗拆：剥掉列表符号/编号，长句再按标点切一刀 */
function ruleSplit(text, limit = 12) {
  const items = [];
  const push = (value) => {
    const title = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (title) items.push({ title: title.slice(0, 60), notes: '', priority: 'normal' });
  };
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.replace(/^\s*(?:[-*•·+]|\d+[.)、]|[（(]\d+[)）])\s*/, '').trim();
    if (!line) continue;
    if (line.length > 80) {
      for (const part of line.split(/(?<=[。！？；!?;])\s*/)) push(part);
    } else {
      push(line);
    }
    if (items.length >= limit) break;
  }
  if (items.length === 0) push(String(text ?? '').slice(0, 60));
  return items.slice(0, limit);
}

function createHandler(store, ctx) {
  return async (method, payload) => {
    switch (method) {
      case 'state.get': {
        const selection = ctx.get?.('agentDefaultModel')?.currentSelection?.();
        const model = selection?.provider && selection?.model ? `${selection.provider}/${selection.model}` : '';
        return { ok: true, value: { ...(await store.state()), model } };
      }
      case 'task.split': {
        const limit = Math.max(1, Math.min(20, Number(payload.limit) || 12));
        const text = String(payload.text ?? '').trim();
        if (!text) return { ok: false, error: { code: 'empty-text', message: '没有可拆分的内容' } };
        const { settings } = await store.state();
        if (!settings.useModelSplit) return { ok: true, value: { tasks: ruleSplit(text, limit), model: '', mode: 'rule' } };
        return { ok: true, value: await splitWithModel(ctx, { text, limit }) };
      }
      case 'settings.save':
        return { ok: true, value: await store.saveSettings(payload.settings ?? payload) };
      case 'data.export':
        return { ok: true, value: await store.exportData() };
      case 'data.import':
        return { ok: true, value: await store.importData(payload) };
      case 'project.save':
        return { ok: true, value: await store.saveProject(isRecord(payload.project) ? payload.project : payload) };
      case 'project.reorder':
        return { ok: true, value: await store.reorderProjects(payload.ids) };
      case 'project.delete':
        return { ok: true, value: await store.deleteProject(String(payload.id)) };
      case 'task.save':
        return { ok: true, value: await store.saveTask(isRecord(payload.task) ? payload.task : payload) };
      case 'task.delete':
        return { ok: true, value: await store.deleteTask(String(payload.id)) };
      case 'task.bulkAdd':
        return {
          ok: true,
          value: await store.bulkAdd({
            projectId: payload.projectId,
            tasks: Array.isArray(payload.tasks) ? payload.tasks : [],
          }),
        };
      case 'task.bulkUpdate':
        return {
          ok: true,
          value: await store.bulkUpdate({
            ids: Array.isArray(payload.ids) ? payload.ids : [],
            patch: isRecord(payload.patch) ? payload.patch : payload,
          }),
        };
      case 'task.bulkDelete':
        return { ok: true, value: await store.bulkRemove(payload.ids) };
      case 'task.reorder':
        return { ok: true, value: await store.reorderTasks(payload.ids) };
      default:
        return { ok: false, error: { code: 'unknown-endpoint', message: `Unknown endpoint: ${method}` } };
    }
  };
}

/* ------------------------------------------------------------------ schema */

const TEXT = (description) => ({ type: 'string', description });
const ENUM = (values, description) => ({ type: 'string', enum: values, description });

function objectSchema(properties, required = []) {
  return { type: 'object', properties, ...(required.length ? { required } : {}) };
}

const OUTPUT_OK = {
  schema: objectSchema({ ok: { type: 'boolean' }, text: { type: 'string' } }, ['text']),
  render: (_args, value) => [{ type: 'text', text: value.text }],
};

/* ------------------------------------------------------------------ tools */

function textResult(text) {
  return [{ type: 'text', text }];
}

function describeTask(task, projects) {
  const project = projects.find((item) => item.id === task.projectId);
  const due = task.due ? ` · 截止 ${task.due}` : '';
  return `- [${task.status}] ${task.title}（${project?.name ?? '收件箱'} · ${task.priority}${due}）id=${task.id}`;
}

function resolveProject(projects, nameOrId) {
  if (!nameOrId) return projects.find((project) => project.id === INBOX) ?? projects[0];
  const value = String(nameOrId).trim();
  return projects.find((project) => project.id === value)
    ?? projects.find((project) => project.name === value)
    ?? projects.find((project) => project.name.toLowerCase() === value.toLowerCase())
    ?? null;
}

function resolveTask(tasks, { id, title }) {
  if (id) return tasks.find((task) => task.id === id) ?? null;
  if (!title) return null;
  const value = String(title).trim().toLowerCase();
  return tasks.find((task) => task.title.toLowerCase() === value)
    ?? tasks.find((task) => task.title.toLowerCase().includes(value))
    ?? null;
}

function buildTools(store) {
  const list = [];

  list.push({
    name: 'task_list',
    description: '列出待办任务。可按项目、状态、优先级、到期时间过滤并统计，用于回答「今天/这周要做什么」。',
    parameters: objectSchema({
      project: TEXT('项目名称或 ID，省略表示全部项目'),
      status: ENUM([...STATUSES, 'open', 'all'], '状态过滤，默认 open（未完成）'),
      priority: ENUM(PRIORITIES, '优先级过滤'),
      due: TEXT('到期过滤：today / week（未来 7 天）/ overdue（已逾期）/ YYYY-MM-DD / YYYY-MM-DD..YYYY-MM-DD'),
      sort: ENUM(['due', 'priority', 'created', 'manual'], '排序方式，默认 due（到期升序）'),
      limit: { type: 'number', description: '最多返回条数，默认 50' },
    }),
    output: {
      schema: objectSchema({
        count: { type: 'number' },
        overdue: { type: 'number' },
        dueToday: { type: 'number' },
        doneThisWeek: { type: 'number' },
        text: { type: 'string' },
      }, ['count', 'text']),
      render: (_args, value) => textResult(value.text),
    },
    isConcurrencySafe: true,
    async execute(args) {
      const { projects, tasks } = await store.state();
      const now = localDate();
      const wanted = String(args.status ?? 'open');
      let items = tasks.slice();
      if (args.project) {
        const project = resolveProject(projects, args.project);
        items = items.filter((task) => task.projectId === (project?.id ?? args.project));
      }
      if (wanted !== 'all') {
        items = wanted === 'open'
          ? items.filter((task) => task.status !== 'done')
          : items.filter((task) => task.status === wanted);
      }
      if (args.priority && PRIORITIES.includes(args.priority)) {
        items = items.filter((task) => task.priority === args.priority);
      }
      const due = String(args.due ?? '').trim();
      if (due) {
        if (due === 'today') items = items.filter((task) => task.due === now);
        else if (due === 'overdue') items = items.filter((task) => task.due && task.due < now);
        else if (due === 'week') {
          const until = shiftDate(7);
          items = items.filter((task) => task.due && task.due >= now && task.due <= until);
        } else if (due.includes('..')) {
          const [from, to] = due.split('..').map((value) => value.trim());
          items = items.filter((task) => task.due && (!from || task.due >= from) && (!to || task.due <= to));
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(due)) {
          items = items.filter((task) => task.due === due);
        }
      }
      const rank = { urgent: 0, high: 1, normal: 2, low: 3 };
      const sortKey = String(args.sort ?? 'due');
      items.sort((a, b) => {
        if (sortKey === 'priority') {
          const delta = (rank[a.priority] ?? 2) - (rank[b.priority] ?? 2);
          if (delta !== 0) return delta;
        } else if (sortKey === 'created') {
          const delta = String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''));
          if (delta !== 0) return delta;
        } else if (sortKey === 'manual') {
          return a.order - b.order;
        }
        return (a.due ?? '9999-99-99').localeCompare(b.due ?? '9999-99-99') || a.order - b.order;
      });
      const limit = Math.max(1, Math.min(200, Number(args.limit) || 50));
      const shown = items.slice(0, limit);
      const open = items.filter((task) => task.status !== 'done');
      const overdue = open.filter((task) => task.due && task.due < now).length;
      const dueToday = open.filter((task) => task.due === now).length;
      const doneThisWeek = tasks
        .filter((task) => task.status === 'done' && String(task.completedAt ?? '').slice(0, 10) >= shiftDate(-6))
        .length;
      const summary = `逾期 ${overdue}、今天到期 ${dueToday}、近 7 天完成 ${doneThisWeek}`;
      const header = `共 ${items.length} 条任务（${summary}）${shown.length < items.length ? `，显示前 ${shown.length} 条` : ''}：`;
      const text = [header, ...shown.map((task) => describeTask(task, projects))].join('\n');
      return { count: items.length, overdue, dueToday, doneThisWeek, text };
    },
  });

  list.push({
    name: 'task_create',
    description: '新建一条待办任务，可指定所属项目、优先级与截止日期。',
    parameters: objectSchema({
      title: TEXT('任务标题'),
      project: TEXT('项目名称或 ID，省略则进入收件箱'),
      notes: TEXT('任务说明'),
      priority: ENUM(PRIORITIES, '优先级，默认 normal'),
      due: TEXT('截止日期，格式 YYYY-MM-DD'),
      status: ENUM(STATUSES, '初始状态，默认 todo'),
    }, ['title']),
    output: {
      schema: objectSchema({
        task: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' } } },
        text: { type: 'string' },
      }, ['text']),
      render: (_args, value) => textResult(value.text),
    },
    async execute(args) {
      const { projects } = await store.state();
      const project = resolveProject(projects, args.project);
      if (!project) throw new Error(`找不到项目「${args.project}」，请先用 project_create 创建。`);
      const task = await store.saveTask({
        title: args.title,
        notes: args.notes,
        priority: args.priority,
        due: args.due,
        status: args.status,
        projectId: project.id,
      });
      return { task: { id: task.id, title: task.title }, text: `已创建任务：${task.title}（${project.name}）id=${task.id}` };
    },
  });

  list.push({
    name: 'task_update',
    description: '更新任务：改标题、状态、优先级、截止日期、说明或移动项目。用 id 或标题定位。',
    parameters: objectSchema({
      id: TEXT('任务 ID'),
      title: TEXT('用标题匹配任务（id 省略时使用）'),
      new_title: TEXT('新的标题'),
      status: ENUM(STATUSES, '新状态'),
      priority: ENUM(PRIORITIES, '新优先级'),
      due: TEXT('YYYY-MM-DD，空字符串表示清除'),
      notes: TEXT('新的说明'),
      project: TEXT('移动到该项目（名称或 ID）'),
    }),
    output: {
      schema: objectSchema({ ok: { type: 'boolean' }, text: { type: 'string' } }, ['text']),
      render: (_args, value) => textResult(value.text),
    },
    async execute(args) {
      const { projects, tasks } = await store.state();
      const task = resolveTask(tasks, args);
      if (!task) throw new Error('找不到匹配的任务，请先用 task_list 查看。');
      const patch = { id: task.id };
      if (args.new_title) patch.title = args.new_title;
      if (args.status) patch.status = args.status;
      if (args.priority) patch.priority = args.priority;
      if (args.notes !== undefined) patch.notes = args.notes;
      if (args.due !== undefined) patch.due = String(args.due).trim() || null;
      if (args.project) {
        const project = resolveProject(projects, args.project);
        if (!project) throw new Error(`找不到项目「${args.project}」。`);
        patch.projectId = project.id;
      }
      const saved = await store.saveTask(patch);
      return {
        ok: true,
        text: `已更新：${saved.title} → 状态 ${saved.status}，优先级 ${saved.priority}${saved.due ? `，截止 ${saved.due}` : ''}`,
      };
    },
  });

  list.push({
    name: 'task_delete',
    description: '删除一条任务（按 id 或标题定位）。',
    parameters: objectSchema({ id: TEXT('任务 ID'), title: TEXT('任务标题') }),
    output: {
      schema: objectSchema({ ok: { type: 'boolean' }, text: { type: 'string' } }, ['text']),
      render: (_args, value) => textResult(value.text),
    },
    async execute(args) {
      const { tasks } = await store.state();
      const task = resolveTask(tasks, args);
      if (!task) throw new Error('找不到匹配的任务。');
      await store.deleteTask(task.id);
      return { ok: true, text: `已删除任务：${task.title}` };
    },
  });

  list.push({
    name: 'task_bulk_update',
    description: '批量修改多条任务的状态/优先级/项目/截止日期。先用 task_list 拿到 id，比逐条 task_update 更稳。',
    parameters: objectSchema({
      ids: { type: 'array', items: { type: 'string' }, description: '任务 ID 数组（先用 task_list 获取）' },
      status: ENUM(STATUSES, '新状态'),
      priority: ENUM(PRIORITIES, '新优先级'),
      project: TEXT('移动到该项目（名称或 ID）'),
      due: TEXT('YYYY-MM-DD，空字符串表示清除'),
    }, ['ids']),
    output: {
      schema: objectSchema({ count: { type: 'number' }, text: { type: 'string' } }, ['count', 'text']),
      render: (_args, value) => textResult(value.text),
    },
    async execute(args) {
      const ids = Array.isArray(args.ids) ? args.ids.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim()) : [];
      if (!ids.length) throw new Error('ids 为空，请先用 task_list 取任务 id。');
      const patch = {};
      if (args.status) patch.status = args.status;
      if (args.priority) patch.priority = args.priority;
      if (args.due !== undefined) patch.due = args.due;
      if (args.project) {
        const { projects } = await store.state();
        const project = resolveProject(projects, args.project);
        if (!project) throw new Error(`找不到项目「${args.project}」。`);
        patch.projectId = project.id;
      }
      if (!Object.keys(patch).length) throw new Error('没有要修改的字段（status / priority / project / due 至少给一个）。');
      const updated = await store.bulkUpdate({ ids, patch });
      if (!updated.length) return { count: 0, text: '没有匹配到任务，请检查 id。' };
      return {
        count: updated.length,
        text: `已更新 ${updated.length} 条任务：\n${updated.map((task) => `- [${task.status}] ${task.title} id=${task.id}`).join('\n')}`,
      };
    },
  });

  list.push({
    name: 'project_list',
    description: '列出所有任务项目及各自的未完成任务数。',
    parameters: objectSchema({}),
    output: {
      schema: objectSchema({ text: { type: 'string' } }, ['text']),
      render: (_args, value) => textResult(value.text),
    },
    isConcurrencySafe: true,
    async execute() {
      const { projects, tasks } = await store.state();
      const lines = projects.map((project) => {
        const open = tasks.filter((task) => task.projectId === project.id && task.status !== 'done').length;
        const total = tasks.filter((task) => task.projectId === project.id).length;
        return `- ${project.name}（${open}/${total} 未完成）id=${project.id}`;
      });
      return { text: lines.length ? lines.join('\n') : '暂无项目。' };
    },
  });

  list.push({
    name: 'project_create',
    description: '新建一个任务项目（任务分类）。',
    parameters: objectSchema({
      name: TEXT('项目名称'),
      color: TEXT('十六进制颜色，如 #5b8def'),
    }, ['name']),
    output: {
      schema: objectSchema({
        project: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
        text: { type: 'string' },
      }, ['text']),
      render: (_args, value) => textResult(value.text),
    },
    async execute(args) {
      const name = String(args.name ?? '').trim();
      if (!name) throw new Error('项目名称不能为空。');
      const { projects } = await store.state();
      const existing = projects.find((project) => project.name === name);
      if (existing) return { project: { id: existing.id, name: existing.name }, text: `项目已存在：${existing.name} id=${existing.id}` };
      const project = await store.saveProject({ name, color: args.color });
      return { project: { id: project.id, name: project.name }, text: `已创建项目：${project.name} id=${project.id}` };
    },
  });

  list.push({
    name: 'project_update',
    description: '修改项目名称（也支持改颜色）。',
    parameters: objectSchema({
      id: TEXT('项目 ID 或当前名称'),
      name: TEXT('新的项目名称'),
      color: TEXT('可选的十六进制颜色'),
    }, ['id', 'name']),
    output: {
      schema: objectSchema({ text: { type: 'string' } }, ['text']),
      render: (_args, value) => textResult(value.text),
    },
    async execute(args) {
      const { projects } = await store.state();
      const project = resolveProject(projects, args.id);
      if (!project) throw new Error(`找不到项目：${args.id}`);
      const name = String(args.name ?? '').trim();
      if (!name) throw new Error('项目名称不能为空。');
      if (project.name === name && !args.color) return { text: `项目名称未变化：${name}` };
      const updated = await store.saveProject({ id: project.id, name, color: args.color });
      return { text: `已重命名项目：${project.name} → ${updated.name} id=${updated.id}` };
    },
  });

  list.push({
    name: 'project_delete',
    description: '删除一个项目，同时删除该项目下的所有任务（不可恢复）。',
    parameters: objectSchema({ id: TEXT('项目 ID 或项目名称') }, ['id']),
    output: {
      schema: objectSchema({ text: { type: 'string' } }, ['text']),
      render: (_args, value) => textResult(value.text),
    },
    async execute(args) {
      const { projects } = await store.state();
      const project = resolveProject(projects, args.id);
      if (!project) throw new Error(`找不到项目：${args.id}`);
      if (project.id === 'p_inbox') throw new Error('收集箱是默认项目，不能删除。');
      const result = await store.deleteProject(project.id);
      return { text: `已删除项目：${project.name}（同时删除了 ${result.deletedTasks} 个任务）` };
    },
  });

  list.push({
    name: 'task_bulk_add',
    description: '把一组任务（例如从对话内容拆分出来的待办）一次性保存到指定项目。',
    parameters: {
      type: 'object',
      properties: {
        project: TEXT('项目名称或 ID，省略进入收件箱'),
        tasks: {
          type: 'array',
          description: '任务数组',
          items: {
            type: 'object',
            properties: {
              title: TEXT('任务标题'),
              notes: TEXT('任务说明'),
              priority: ENUM(PRIORITIES, '优先级'),
              due: TEXT('截止日期 YYYY-MM-DD'),
            },
            required: ['title'],
          },
        },
      },
      required: ['tasks'],
    },
    output: {
      schema: objectSchema({ count: { type: 'number' }, text: { type: 'string' } }, ['count', 'text']),
      render: (_args, value) => textResult(value.text),
    },
    async execute(args) {
      const { projects } = await store.state();
      const project = resolveProject(projects, args.project);
      if (!project) throw new Error(`找不到项目「${args.project}」。`);
      const items = Array.isArray(args.tasks) ? args.tasks.filter((item) => String(item?.title ?? '').trim()) : [];
      if (!items.length) throw new Error('tasks 为空。');
      const created = await store.bulkAdd({ projectId: project.id, tasks: items });
      return {
        count: created.length,
        text: `已把 ${created.length} 条任务保存到「${project.name}」：\n${created.map((task) => `- ${task.title}`).join('\n')}`,
      };
    },
  });

  return list;
}

/* ------------------------------------------------------------------- boot */

export const name = PLUGIN_NAME;

export function apply(ctx) {
  const logger = typeof ctx?.logger === 'function' ? ctx.logger(PLUGIN_NAME) : (ctx?.logger ?? console);
  const warn = (message) => logger?.warn?.(message);
  const store = createStore(warn);

  const install = (scope) => {
    try {
      if (scope.connection) {
        const handle = registerRpc(scope.connection, createHandler(store, scope));
        if (!handle) logger?.warn?.('[dsh-gor-tasks] connection.fetch registry unavailable; panel RPC disabled');
      } else {
        logger?.warn?.('[dsh-gor-tasks] no connection service; panel RPC disabled');
      }
    } catch (error) {
      logger?.warn?.('[dsh-gor-tasks] failed to register the task RPC channel', error);
    }
    try {
      const tools = scope.tools;
      if (typeof tools?.register !== 'function') {
        logger?.warn?.('[dsh-gor-tasks] no tool registry; chat tools disabled');
        return;
      }
      for (const tool of buildTools(store)) tools.register(tool);
    } catch (error) {
      logger?.warn?.('[dsh-gor-tasks] failed to register task tools', error);
    }
  };

  if (typeof ctx?.inject === 'function') {
    ctx.inject(['connection', 'tools'], install);
  } else {
    install(ctx);
  }
}
