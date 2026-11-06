/**
 * dsh-gor-tasks client half — the 待办任务 panel, its sidebar entry, and the
 * "拆成任务" action attached to every finished assistant turn.
 */

window.__ModuleLoader__.load({
  id: '@gorwayne/dsh-gor-tasks',
  factory: (require) => {
    const React = require('react');

    const PANEL_ID = 'dsh-gor-tasks';
    const NS = 'dsh-gor-tasks';
    const ENDPOINT = 'dsh-gor-tasks/tasks';

    const STATUS_LABEL = { todo: '待办', doing: '进行中', blocked: '受阻', done: '已完成' };
    const PRIORITY_LABEL = { low: '低', normal: '普通', high: '高', urgent: '紧急' };
    const PRIORITY_COLOR = { low: '#8b8fa3', normal: '#5b8def', high: '#e8933a', urgent: '#e5564b' };

    /* ---------------------------------------------------------------- css */

    const CSS = `
.zs-root{color-scheme:light;display:flex;height:100%;min-height:0;position:relative;container-type:inline-size;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1d1e22);font-size:13px}
.zs-col{display:flex;flex-direction:column;min-height:0;min-width:0}
.zs-side{width:210px;flex:0 1 210px;min-width:140px;border-right:1px solid var(--dsw-alias-border-l2,#e8e9ee);padding:12px 8px;gap:2px;overflow:auto}
.zs-side h4{margin:10px 8px 6px;font-size:11px;letter-spacing:.08em;color:var(--dsw-alias-label-tertiary,#8b8fa3);font-weight:600}
.zs-item{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:8px;cursor:pointer;user-select:none;color:var(--dsw-alias-label-primary,#1d1e22)}
.zs-item:hover{background:var(--dsw-alias-interactive-bg-hover,#f2f3f7)}
.zs-item.on{background:var(--dsw-alias-interactive-bg-active,#e8eaf1);font-weight:600}
.zs-dot{width:8px;height:8px;border-radius:50%;flex:0 0 8px}
.zs-count{margin-left:auto;font-size:11px;color:var(--dsw-alias-label-tertiary,#8b8fa3)}
.zs-projrow{position:relative}
.zs-projrow .zs-actions{display:none;margin-left:auto;gap:2px;align-items:center}
.zs-projrow:hover .zs-actions{display:flex}
.zs-projrow:hover .zs-count{display:none}
.zs-mini{border:0;background:transparent;color:var(--dsw-alias-label-tertiary,#8b8fa3);width:20px;height:20px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;font-size:12px;line-height:1}
.zs-mini:hover{background:var(--dsw-alias-interactive-bg-active,#e8eaf1);color:var(--dsw-alias-label-primary,#1d1e22)}
.zs-mini.danger:hover{background:color-mix(in srgb, var(--dsw-alias-state-error-primary,var(--dsw-alias-state-error-primary,#d9382b)) 12%, transparent);color:var(--dsw-alias-state-error-primary,var(--dsw-alias-state-error-primary,#d9382b))}
.zs-projrow.drag{opacity:.45}
.zs-projrow.drop-before{box-shadow:inset 0 2px 0 var(--dsw-alias-brand-primary,#2f6bff)}
.zs-projrow.drop-after{box-shadow:inset 0 -2px 0 var(--dsw-alias-brand-primary,#2f6bff)}
.zs-grip{color:var(--dsw-alias-border-l3,#c3c7d4);font-size:11px;letter-spacing:-1px;cursor:grab;opacity:0}
.zs-projrow:hover .zs-grip{opacity:1}
.zs-main{flex:1;min-width:0}
.zs-bar{display:flex;align-items:center;gap:8px;row-gap:8px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l2,#e8e9ee)}
.zs-title{font-size:15px;font-weight:650;margin-right:auto;white-space:nowrap;min-width:0;overflow:hidden;text-overflow:ellipsis}
.zs-btn{border:1px solid var(--dsw-alias-border-l2,#e0e2ea);background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;border-radius:8px;padding:6px 11px;font-size:12px;cursor:pointer;white-space:nowrap}
.zs-btn:hover{background:var(--dsw-alias-interactive-bg-hover,#f2f3f7)}
.zs-btn.pri{background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary,#2f6bff));border-color:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary,#2f6bff));color:var(--dsw-alias-label-primary-foreground,#fff)}
.zs-btn.pri:hover{filter:brightness(1.06)}
.zs-btn.ghost{border-color:transparent;background:transparent;color:var(--dsw-alias-label-tertiary,#8b8fa3)}
.zs-btn.danger{color:var(--dsw-alias-state-error-primary,var(--dsw-alias-state-error-primary,#d9382b));border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary,var(--dsw-alias-state-error-primary,#d9382b)) 32%, transparent)}
.zs-input,.zs-select,.zs-area{width:100%;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2,#e0e2ea);background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;border-radius:8px;padding:7px 9px;font-size:13px;font-family:inherit}
.zs-area{resize:vertical;min-height:70px}
.zs-search{width:auto;flex:1 1 150px;min-width:110px;max-width:220px}
.zs-tabs{display:flex;gap:4px;background:var(--dsw-alias-interactive-bg-hover,#f2f3f7);padding:3px;border-radius:9px;flex:0 0 auto}
.zs-tab{padding:4px 10px;border-radius:7px;cursor:pointer;font-size:12px;color:var(--dsw-alias-label-secondary,#55596a);white-space:nowrap}
.zs-tab.on{background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.zs-list{flex:1;overflow:auto;padding:8px 16px 24px}
.zs-task{display:flex;align-items:flex-start;gap:10px;padding:10px 10px;border-radius:10px;border:1px solid transparent}
.zs-task:hover{background:var(--dsw-alias-interactive-bg-hover,#f6f7fa);border-color:var(--dsw-alias-border-l2,#eceef4)}
.zs-check{width:16px;height:16px;margin-top:2px;border-radius:5px;border:1.5px solid var(--dsw-alias-border-l3,#b9bdcb);flex:0 0 16px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-primary-foreground,#fff);font-size:11px}
.zs-check.on{background:var(--dsw-alias-brand-primary,#2f6bff);border-color:var(--dsw-alias-brand-primary,#2f6bff)}
.zs-tbody{flex:1;min-width:0;cursor:pointer}
.zs-tt{font-size:13px;line-height:1.45;word-break:break-word}
.zs-tt.done{text-decoration:line-through;color:var(--dsw-alias-label-tertiary,#8b8fa3)}
.zs-meta{display:flex;align-items:center;gap:8px;margin-top:4px;font-size:11px;color:var(--dsw-alias-label-tertiary,#8b8fa3);flex-wrap:wrap}
.zs-chip{display:inline-flex;align-items:center;gap:4px;padding:1px 7px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover,#f2f3f7);color:var(--dsw-alias-label-secondary,#55596a)}
.zs-flag{display:inline-flex;align-items:center;gap:4px}
.zs-notes-flag{color:var(--dsw-alias-label-tertiary,#8b8fa3);cursor:help}
.zs-pdot{width:6px;height:6px;border-radius:50%}
.zs-empty{padding:56px 16px;text-align:center;color:var(--dsw-alias-label-tertiary,#8b8fa3)}
.zs-drawer{color:var(--dsw-alias-label-primary,#1d1e22);width:330px;flex:0 0 330px;box-sizing:border-box;border-left:1px solid var(--dsw-alias-border-l2,#e8e9ee);padding:14px;gap:10px;overflow:auto;background:var(--dsw-alias-bg-layer-1,#fff)}
.zs-field{display:flex;flex-direction:column;gap:5px;margin-bottom:10px}
.zs-field label{font-size:11px;color:var(--dsw-alias-label-tertiary,#8b8fa3)}
.zs-row{display:flex;gap:8px}
.zs-row>*{flex:1;min-width:0}
.zs-row>button{flex:0 0 auto}
.zs-mask{position:fixed;inset:0;color:var(--dsw-alias-label-primary,#1d1e22);background:var(--dsw-alias-bg-mask-1,rgba(12,14,20,.42));display:flex;align-items:center;justify-content:center;z-index:60}
.zs-modal{color:var(--dsw-alias-label-primary,#1d1e22);width:560px;max-width:92vw;max-height:82vh;overflow:auto;background:var(--dsw-alias-bg-layer-1,#fff);border-radius:14px;padding:18px;box-shadow:0 18px 48px rgba(0,0,0,.24);display:flex;flex-direction:column;gap:10px}
.zs-modal h3{margin:0;font-size:15px}
.zs-hint{font-size:11px;color:var(--dsw-alias-label-tertiary,#8b8fa3);line-height:1.6}
.zs-split-wrap{display:contents}
.zs-split-btn{order:1;display:inline-flex;align-items:center;gap:5px;height:26px;box-sizing:border-box;border:0;background:transparent;color:var(--dsw-alias-label-tertiary,#8b8fa3);border-radius:7px;padding:0 8px;font-size:13px;line-height:1;cursor:pointer;white-space:nowrap}
.zs-split-btn svg{width:15px;height:15px;flex:0 0 15px}
.zs-split-btn:hover{color:var(--dsw-alias-brand-primary,#2f6bff);background:rgba(127,127,127,.12)}
.zs-toast{position:fixed;left:50%;bottom:42px;transform:translateX(-50%);background:var(--dsw-alias-toast-bg,#22252d);color:var(--dsw-alias-toast-label,#fff);padding:8px 14px;border-radius:9px;font-size:12px;z-index:80;box-shadow:0 8px 24px rgba(0,0,0,.3)}
@container (max-width: 980px){
.zs-side{width:176px;flex:0 1 176px;min-width:130px}
.zs-bar{padding:10px 12px}
.zs-list{padding:6px 10px 20px}
.zs-drawer{width:300px;flex:0 0 300px}
}
.zs-drawer-mask{display:none}
@container (max-width: 900px){
.zs-side{width:150px;flex:0 1 150px;min-width:118px}
.zs-bar{padding:10px 12px;gap:6px;row-gap:8px}
.zs-title{font-size:13.5px;order:1;margin-right:auto}
.zs-tabs{order:2;padding:2px;border-radius:8px}
.zs-tab{padding:3px 7px;font-size:11px;border-radius:6px}
.zs-search{order:3;flex:1 1 110px;max-width:none;min-width:90px}
.zs-newtask{order:4;padding:5px 9px}
.zs-drawer{width:272px;flex:0 1 272px;min-width:228px;padding:12px}
.zs-list{padding:6px 10px 20px}
}
@container (max-width: 640px){
.zs-drawer-mask{display:block;position:absolute;inset:0;background:var(--dsw-alias-bg-mask-2,rgba(12,14,20,.28));z-index:19}
.zs-drawer{position:absolute;inset:0;width:100%;z-index:20;flex:0 0 auto;border-radius:0;box-shadow:none;border-left:0}
.zs-side{display:none}
.zs-title{display:none}
.zs-tabs{order:1;margin-right:auto}
.zs-newtask{order:2}
}
.zs-gear{order:5;height:30px;padding:0 9px;display:inline-flex;align-items:center;justify-content:center}
.zs-newtask{height:30px;padding:0 10px}
.zs-sec{padding:12px 0;border-top:1px solid var(--dsw-alias-border-l2,#e7e9ef)}
.zs-sec:first-of-type{border-top:0;padding-top:2px}
.zs-sec h4{margin:0 0 4px;font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,inherit)}
.zs-opt{display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13px;cursor:pointer}
.zs-opt input[type=checkbox]{width:15px;height:15px;accent-color:var(--dsw-alias-brand-primary,#2f6bff);flex:0 0 auto;cursor:pointer}
.zs-opt input[type=number]{width:62px;border:1px solid var(--dsw-alias-border-l2,#e0e2ea);border-radius:7px;padding:3px 6px;font-size:12px;background:var(--dsw-alias-bg-layer-1,#fff);color:inherit}
.zs-opt small{color:var(--dsw-alias-label-tertiary,#8b8fa3);font-size:11px}
.zs-icon-wrap{position:relative;display:inline-flex;align-items:center;justify-content:center}
.zs-due-badge{margin-left:auto;flex:none;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--dsw-alias-state-error-primary,#e5564b);color:var(--dsw-alias-label-primary-foreground,#fff);font-size:11px;font-weight:600;line-height:18px;text-align:center;box-sizing:border-box}

body[data-ds-dark-theme] .zs-root{color-scheme:dark}
`;

    let styleInjected = false;
    function ensureStyle() {
      if (styleInjected || typeof document === 'undefined') return;
      styleInjected = true;
      const element = document.createElement('style');
      element.setAttribute('data-dsh-gor-tasks', '');
      element.textContent = CSS;
      document.head.appendChild(element);
    }

    /* ------------------------------------------------------------- format */

    const h = React.createElement;
    const today = () => new Date().toISOString().slice(0, 10);

    function dueInfo(due) {
      if (!due) return null;
      const now = today();
      if (due < now) return { text: `逾期 ${due.slice(5)}`, color: '#d9382b' };
      if (due === now) return { text: '今天到期', color: '#e8933a' };
      return { text: due.slice(5), color: undefined };
    }

    /* 快到期（含已逾期）且未完成的任务数，用于侧栏红圈 */
    function countDueSoon(tasks, days) {
      const span = Number.isFinite(Number(days)) ? Math.max(0, Math.round(Number(days))) : 3;
      const base = new Date(`${today()}T00:00:00`);
      base.setDate(base.getDate() + span);
      const limit = base.toISOString().slice(0, 10);
      return (Array.isArray(tasks) ? tasks : [])
        .filter((task) => task.status !== 'done' && task.due && task.due <= limit)
        .length;
    }

    function toast(message) {      if (typeof document === 'undefined') return;
      const element = document.createElement('div');
      element.className = 'zs-toast';
      element.textContent = message;
      document.body.appendChild(element);
      setTimeout(() => element.remove(), 2200);
    }

    function splitLines(text) {
      const raw = String(text ?? '');
      const lines = raw
        .split(/\r?\n+/)
        .map((line) => line.replace(/^\s*(?:[-*•·]|\d+[.、)]|\(\d+\))\s*/, '').trim())
        .filter((line) => line.length >= 4 && line.length <= 200);
      const seen = new Set();
      const out = [];
      for (const line of lines) {
        const key = line.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(line);
        if (out.length >= 24) break;
      }
      return out;
    }

    /* ---------------------------------------------------------------- rpc */

    function createClient(connection) {
      return async function rpc(method, payload) {
        const result = await connection.rpc.call('/api', ENDPOINT, { method, payload: payload ?? {} });
        if (!result || result.ok !== true) {
          const error = new Error(result?.error?.message ?? '任务接口调用失败');
          error.code = result?.error?.code;
          throw error;
        }
        return result.value;
      };
    }

    /* -------------------------------------------------------------- store */

    function useStore(rpc) {
      const [state, setState] = React.useState({ projects: [], tasks: [], settings: null, loading: true, error: null });
      const refresh = React.useCallback(async () => {
        try {
          const value = await rpc('state.get');
          setState({
            projects: value.projects ?? [],
            tasks: value.tasks ?? [],
            settings: value.settings ?? null,
            loading: false,
            error: null,
          });
          try { window.dispatchEvent(new CustomEvent('dsh-gor-tasks:changed')); } catch { /* ignore */ }
        } catch (error) {
          setState((prev) => ({ ...prev, loading: false, error: error?.message ?? '加载失败' }));
        }
      }, [rpc]);
      React.useEffect(() => { void refresh(); }, [refresh]);
      React.useEffect(() => {
        const onFocus = () => { void refresh(); };
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
      }, [refresh]);
      return { ...state, refresh, setState };
    }

    /* --------------------------------------------------------------- page */

    function ProjectRow({ project, active, count, onClick, onRename, onDelete, draggable, dragging, dropBefore, dropAfter, onDragStart, onDragOver, onDragEnd, onDrop }) {
      const locked = project.id === 'p_inbox'; // 收集箱可以拖动排序，但不能改名/删除
      return h('div', {
        className: `zs-item zs-projrow${active ? ' on' : ''}${dragging ? ' drag' : ''}${dropBefore ? ' drop-before' : ''}${dropAfter ? ' drop-after' : ''}`,
        title: draggable ? `${project.name}（可拖动排序）` : project.name,
        onClick,
        draggable: draggable ? 'true' : 'false',
        onDragStart: (event) => {
          if (!draggable) return;
          try { event.dataTransfer.setData('text/plain', project.id); event.dataTransfer.effectAllowed = 'move'; } catch { /* noop */ }
          onDragStart?.(project.id);
        },
        onDragOver: (event) => {
          if (!draggable) return;
          event.preventDefault();
          try { event.dataTransfer.dropEffect = 'move'; } catch { /* noop */ }
          const rect = event.currentTarget.getBoundingClientRect();
          onDragOver?.(project.id, event.clientY < rect.top + rect.height / 2);
        },
        onDrop: (event) => {
          if (!draggable) return;
          event.preventDefault();
          event.stopPropagation();
          onDrop?.(project.id);
        },
        onDragEnd: () => onDragEnd?.(),
      },
        draggable ? h('span', { className: 'zs-grip' }, '⋮⋮') : null,
        h('span', { className: 'zs-dot', style: { background: project.color || '#5b8def' } }),
        h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, project.name),
        h('span', { className: 'zs-count' }, String(count)),
        locked ? null : h('span', { className: 'zs-actions' },
          h('button', {
            className: 'zs-mini',
            title: '重命名项目',
            onClick: (event) => { event.stopPropagation(); onRename?.(project); },
          }, '✎'),
          h('button', {
            className: 'zs-mini danger',
            title: '删除项目',
            onClick: (event) => { event.stopPropagation(); onDelete?.(project); },
          }, '✕')));
    }

    function TaskRow({ task, project, onToggle, onOpen }) {
      const due = dueInfo(task.due);
      return h('div', { className: 'zs-task' },
        h('div', {
          className: `zs-check${task.status === 'done' ? ' on' : ''}`,
          role: 'checkbox',
          'aria-checked': task.status === 'done',
          onClick: (event) => { event.stopPropagation(); onToggle(task); },
        }, task.status === 'done' ? '✓' : ''),
        h('div', { className: 'zs-tbody', onClick: () => onOpen(task) },
          h('div', { className: `zs-tt${task.status === 'done' ? ' done' : ''}` }, task.title || '(无标题)'),
          h('div', { className: 'zs-meta' },
            h('span', { className: 'zs-chip' },
              h('span', { className: 'zs-dot', style: { background: project?.color || '#8b8fa3' } }),
              project?.name ?? '收集箱'),
            h('span', { className: 'zs-flag' },
              h('span', { className: 'zs-pdot', style: { background: PRIORITY_COLOR[task.priority] || '#8b8fa3' } }),
              PRIORITY_LABEL[task.priority] ?? '普通'),
            task.status === 'doing' ? h('span', { className: 'zs-flag', style: { color: '#2f6bff' } }, '进行中') : null,
            task.status === 'blocked' ? h('span', { className: 'zs-flag', style: { color: '#d9382b' } }, '受阻') : null,
            due ? h('span', { className: 'zs-flag', style: { color: due.color } }, due.text) : null,
            task.notes
              ? h('span', {
                className: 'zs-flag zs-notes-flag',
                title: task.notes.length > 60 ? `${task.notes.slice(0, 60)}…` : task.notes,
                'aria-label': '有说明',
              },
                h('svg', {
                  width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
                  strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true',
                },
                  h('path', { d: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z' }),
                  h('path', { d: 'M14 3v5h5' }),
                  h('path', { d: 'M9 13h6' }),
                  h('path', { d: 'M9 17h4' })))
              : null)));
    }

    function Editor({ task, projects, onClose, onSave, onDelete, saving }) {
      const [draft, setDraft] = React.useState(task);
      React.useEffect(() => { setDraft(task); }, [task]);
      const patch = (key) => (event) => setDraft({ ...draft, [key]: event.target.value });
      return h('div', { className: 'zs-col zs-drawer' },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          h('strong', { style: { fontSize: 13 } }, task.id ? '编辑任务' : '新建任务'),
          h('span', { style: { flex: 1 } }),
          h('button', { className: 'zs-btn ghost', onClick: onClose }, '关闭')),
        h('div', { className: 'zs-field' },
          h('label', {}, '标题'),
          h('input', { className: 'zs-input', value: draft.title ?? '', placeholder: '要做什么？', onChange: patch('title') })),
        h('div', { className: 'zs-field' },
          h('label', {}, '说明'),
          h('textarea', { className: 'zs-area', value: draft.notes ?? '', placeholder: '可选补充信息', onChange: patch('notes') })),
        h('div', { className: 'zs-field' },
          h('label', {}, '项目'),
          h('select', { className: 'zs-select', value: draft.projectId ?? '', onChange: patch('projectId') },
            projects.map((project) => h('option', { key: project.id, value: project.id }, project.name)))),
        h('div', { className: 'zs-row' },
          h('div', { className: 'zs-field' },
            h('label', {}, '状态'),
            h('select', { className: 'zs-select', value: draft.status ?? 'todo', onChange: patch('status') },
              Object.keys(STATUS_LABEL).map((key) => h('option', { key, value: key }, STATUS_LABEL[key])))),
          h('div', { className: 'zs-field' },
            h('label', {}, '优先级'),
            h('select', { className: 'zs-select', value: draft.priority ?? 'normal', onChange: patch('priority') },
              Object.keys(PRIORITY_LABEL).map((key) => h('option', { key, value: key }, PRIORITY_LABEL[key]))))),
        h('div', { className: 'zs-field' },
          h('label', {}, '截止日期'),
          h('input', { className: 'zs-input', type: 'date', value: draft.due ?? '', onChange: patch('due') })),
        h('div', { style: { display: 'flex', gap: 8, marginTop: 4 } },
          h('button', {
            className: 'zs-btn pri',
            disabled: saving || !String(draft.title ?? '').trim(),
            onClick: () => onSave(draft),
          }, saving ? '保存中…' : '保存'),
          task.id ? h('button', { className: 'zs-btn danger', onClick: () => onDelete(task) }, '删除') : null));
    }

    function ProjectDialog({ project, onClose, onSubmit }) {
      const editing = Boolean(project);
      const [name, setName] = React.useState(project?.name ?? '');
      const [color, setColor] = React.useState(project?.color ?? '#5b8def');
      const [busy, setBusy] = React.useState(false);
      const submit = async () => {
        const next = name.trim();
        if (!next || busy) return;
        setBusy(true);
        try {
          await onSubmit({ name: next, color });
        } finally {
          setBusy(false);
        }
      };
      // 点遮罩不关闭：避免误点丢失正在输入的名称，只有「取消」才关
      return h('div', { className: 'zs-mask', onClick: (event) => event.stopPropagation() },
        h('div', { className: 'zs-modal', style: { width: 380 }, onClick: (event) => event.stopPropagation() },
          h('h3', {}, editing ? '编辑项目' : '新建项目'),
          h('div', { className: 'zs-hint' }, '项目用来给任务分类：一个项目是一组相关任务的集合。'),
          h('input', {
            className: 'zs-input',
            autoFocus: true,
            value: name,
            placeholder: '例如：官网改版',
            onChange: (event) => setName(event.target.value),
            onKeyDown: (event) => { if (event.key === 'Enter') submit(); },
          }),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            h('span', { className: 'zs-hint' }, '颜色'),
            h('input', {
              type: 'color',
              value: /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#5b8def',
              onChange: (event) => setColor(event.target.value),
              style: { width: 36, height: 26, border: '1px solid #e0e2ea', borderRadius: 6, background: 'transparent', padding: 0 },
            })),
          h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8 } },
            h('button', { className: 'zs-btn', onClick: onClose }, '取消'),
            h('button', { className: 'zs-btn pri', disabled: !name.trim() || busy, onClick: submit },
              busy ? '保存中…' : (editing ? '保存' : '创建')))));
    }

    function ConfirmDialog({ title, message, confirmText, danger, onCancel, onConfirm }) {
      const [busy, setBusy] = React.useState(false);
      const run = async () => {
        if (busy) return;
        setBusy(true);
        try { await onConfirm(); } finally { setBusy(false); }
      };
      return h('div', { className: 'zs-mask', onClick: onCancel },
        h('div', { className: 'zs-modal', style: { width: 400 }, onClick: (event) => event.stopPropagation() },
          h('h3', {}, title),
          h('div', { className: 'zs-hint', style: { fontSize: 12, lineHeight: 1.7 } }, message),
          h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 } },
            h('button', { className: 'zs-btn', onClick: onCancel }, '取消'),
            h('button', { className: `zs-btn ${danger ? 'danger' : 'pri'}`, disabled: busy, onClick: run },
              busy ? '处理中…' : (confirmText ?? '确定')))));
    }

    const DEFAULT_SETTINGS = { useModelSplit: true, dueReminder: true, dueSoonDays: 3 };

    function downloadText(text, filename) {
      try {
        const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
      } catch (cause) {
        toast(`导出失败：${cause?.message ?? '浏览器不允许下载'}`);
      }
    }

    function SettingsDialog({ settings, model, rpc, onClose, onChanged }) {
      const [draft, setDraft] = React.useState({ ...DEFAULT_SETTINGS, ...(settings ?? {}) });
      const [busy, setBusy] = React.useState(false);
      const [pending, setPending] = React.useState(null); // { data, name }
      const [importing, setImporting] = React.useState(false);
      const fileRef = React.useRef(null);

      const save = async (patch) => {
        const next = { ...draft, ...patch };
        setDraft(next);
        setBusy(true);
        try {
          const value = await rpc('settings.save', { settings: next });
          const normalized = value && typeof value === 'object' ? value : next;
          setDraft({ ...DEFAULT_SETTINGS, ...normalized });
          onChanged?.(normalized);
        } catch (cause) {
          toast(`保存设置失败：${cause?.message ?? '未知错误'}`);
        } finally {
          setBusy(false);
        }
      };

      const doExport = async () => {
        setBusy(true);
        try {
          const data = await rpc('data.export');
          const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
          downloadText(JSON.stringify(data, null, 2), `dsh-gor-tasks-${stamp}.json`);
          toast('已导出：项目、任务与设置都在这个 JSON 里');
        } catch (cause) {
          toast(`导出失败：${cause?.message ?? '未知错误'}`);
        } finally {
          setBusy(false);
        }
      };

      const onFile = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        try {
          const text = await file.text();
          const parsed = JSON.parse(text);
          if (!parsed || (!Array.isArray(parsed.projects) && !Array.isArray(parsed.tasks))) {
            throw new Error('文件里没有 projects/tasks');
          }
          setPending({ data: parsed, name: file.name });
        } catch (cause) {
          toast(`这个文件不能用：${cause?.message ?? '不是合法 JSON'}`);
        }
      };

      const doImport = async () => {
        if (!pending) return;
        setImporting(true);
        try {
          const value = await rpc('data.import', { data: pending.data });
          setPending(null);
          onChanged?.(value?.settings ?? draft);
          toast(`导入完成：${value?.projects ?? 0} 个项目、${value?.tasks ?? 0} 个任务`);
        } catch (cause) {
          toast(`导入失败：${cause?.message ?? '未知错误'}`);
        } finally {
          setImporting(false);
        }
      };

      return h('div', { className: 'zs-mask', onClick: onClose },
        h('div', { className: 'zs-modal', style: { width: 460 }, onClick: (event) => event.stopPropagation() },
          h('h3', {}, '系统设置'),
          h('div', { className: 'zs-hint' }, '设置保存在本机，跟着任务数据一起导出。'),

          h('div', { className: 'zs-sec' },
            h('h4', {}, '任务拆分'),
            h('label', { className: 'zs-opt' },
              h('input', {
                type: 'checkbox',
                checked: draft.useModelSplit !== false,
                disabled: busy,
                onChange: (event) => void save({ useModelSplit: event.target.checked }),
              }),
              h('span', {}, '使用我配置的模型拆分任务'),
              h('small', {}, model ? `当前：${model}` : '未读取到模型')),
            h('div', { className: 'zs-hint' }, draft.useModelSplit !== false
              ? '开启时，点「拆成任务」会先征求一次同意，之后用你配置的模型拆分。'
              : '已关闭：拆分只按行/标点粗拆，不会调用任何模型，也不会消耗额度。')),

          h('div', { className: 'zs-sec' },
            h('h4', {}, '到期提醒'),
            h('label', { className: 'zs-opt' },
              h('input', {
                type: 'checkbox',
                checked: draft.dueReminder !== false,
                disabled: busy,
                onChange: (event) => void save({ dueReminder: event.target.checked }),
              }),
              h('span', {}, '在左侧「待办任务」图标上显示红圈数字')),
            h('label', { className: 'zs-opt' },
              h('span', {}, '提前'),
              h('input', {
                type: 'number',
                min: 0,
                max: 30,
                value: draft.dueSoonDays ?? 3,
                disabled: busy || draft.dueReminder === false,
                onChange: (event) => void save({ dueSoonDays: Number(event.target.value) || 0 }),
              }),
              h('span', {}, '天算「快到期」'),
              h('small', {}, '含已逾期的未完成任务'))),

          h('div', { className: 'zs-sec' },
            h('h4', {}, '数据导入 / 导出'),
            h('div', { className: 'zs-hint' }, '导出的是项目、任务和设置的完整 JSON，可以在另一台电脑上导入。'),
            h('div', { className: 'zs-row', style: { marginTop: 8 } },
              h('button', { className: 'zs-btn', disabled: busy, onClick: () => void doExport() }, '导出 JSON'),
              h('button', { className: 'zs-btn', disabled: busy, onClick: () => fileRef.current?.click() }, '导入 JSON'),
              h('input', {
                ref: fileRef,
                type: 'file',
                accept: 'application/json,.json',
                style: { display: 'none' },
                onChange: (event) => void onFile(event),
              }))),

          h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 2 } },
            h('button', { className: 'zs-btn pri', onClick: onClose }, '完成')),

          pending ? h(ConfirmDialog, {
            title: '导入数据',
            message: `导入「${pending.name}」会覆盖当前全部项目与任务（${pending.data.projects?.length ?? 0} 个项目、${pending.data.tasks?.length ?? 0} 个任务）。确定继续吗？`,
            confirmText: '导入并覆盖',
            danger: true,
            onCancel: () => setPending(null),
            onConfirm: doImport,
          }) : null));
    }

    function TasksPage({ connection, t: translate }) {
      ensureStyle();
      const rpc = React.useMemo(() => createClient(connection), [connection]);
      const { projects, tasks, settings, loading, error, refresh } = useStore(rpc);
      const [settingsOpen, setSettingsOpen] = React.useState(false);
      const [projectId, setProjectId] = React.useState('all');
      const [filter, setFilter] = React.useState('open');
      const [query, setQuery] = React.useState('');
      const [editing, setEditing] = React.useState(null);
      const [saving, setSaving] = React.useState(false);
      const [creatingProject, setCreatingProject] = React.useState(false);
      const [projectDialog, setProjectDialog] = React.useState(null); // { project } | null
      const [projectToDelete, setProjectToDelete] = React.useState(null);
      const [dragId, setDragId] = React.useState('');
      const [dropHint, setDropHint] = React.useState(null); // { id, before }
      const t = React.useCallback((key, fallback) => {
        try { const value = typeof translate === 'function' ? translate(key) : undefined; return value && value !== key ? value : (fallback ?? key); } catch { return fallback ?? key; }
      }, [translate]);

      const openCount = (id) => tasks.filter((task) => task.projectId === id && task.status !== 'done').length;
      const visible = React.useMemo(() => {
        let list = tasks.slice();
        if (projectId !== 'all') list = list.filter((task) => task.projectId === projectId);
        if (filter === 'open') list = list.filter((task) => task.status !== 'done');
        else if (filter === 'done') list = list.filter((task) => task.status === 'done');
        if (query.trim()) {
          const needle = query.trim().toLowerCase();
          list = list.filter((task) => `${task.title} ${task.notes}`.toLowerCase().includes(needle));
        }
        return list.sort((a, b) => {
          if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1;
          const order = { urgent: 0, high: 1, normal: 2, low: 3 };
          const byPriority = (order[a.priority] ?? 2) - (order[b.priority] ?? 2);
          if (byPriority !== 0) return byPriority;
          return (a.due ?? '9999-99-99').localeCompare(b.due ?? '9999-99-99') || a.order - b.order;
        });
      }, [tasks, projectId, filter, query]);

      const save = async (draft) => {
        if (!String(draft.title ?? '').trim()) return;
        setSaving(true);
        try {
          await rpc('task.save', { task: { ...draft, title: String(draft.title).trim() } });
          setEditing(null);
          await refresh();
        } catch (cause) {
          toast(`保存失败：${cause?.message ?? '未知错误'}`);
        } finally {
          setSaving(false);
        }
      };

      const toggle = async (task) => {
        const next = task.status === 'done' ? 'todo' : 'done';
        try {
          await rpc('task.save', { task: { id: task.id, status: next } });
          await refresh();
        } catch (cause) {
          toast(`更新失败：${cause?.message ?? '未知错误'}`);
        }
      };

      const remove = async (task) => {
        try {
          await rpc('task.delete', { id: task.id });
          setEditing(null);
          await refresh();
        } catch (cause) {
          toast(`删除失败：${cause?.message ?? '未知错误'}`);
        }
      };

      const submitProject = async ({ name, color }, existing) => {
        try {
          if (existing) {
            await rpc('project.save', { project: { id: existing.id, name, color } });
          } else {
            await rpc('project.save', { project: { name, color } });
          }
          setCreatingProject(false);
          setProjectDialog(null);
          await refresh();
        } catch (cause) {
          toast(`${existing ? '重命名' : '创建'}项目失败：${cause?.message ?? '未知错误'}`);
        }
      };

      const removeProject = async (project) => {
        try {
          const result = await rpc('project.delete', { id: project.id });
          setProjectToDelete(null);
          if (projectId === project.id) setProjectId('all');
          await refresh();
          const removed = result?.deletedTasks ?? 0;
          toast(`已删除项目「${project.name}」${removed ? `，同时删除 ${removed} 个任务` : ''}`);
        } catch (cause) {
          toast(`删除项目失败：${cause?.message ?? '未知错误'}`);
        }
      };

      const reorder = async (fromId, toId, before) => {
        const moving = projects.find((project) => project.id === fromId);
        if (!moving || fromId === toId) return;
        const next = sortedProjects.filter((project) => project.id !== fromId);
        let index = next.findIndex((project) => project.id === toId);
        if (index < 0) index = next.length;
        if (!before) index += 1;
        next.splice(index, 0, moving);
        try {
          await rpc('project.reorder', { ids: next.map((project) => project.id) });
          await refresh();
        } catch (cause) {
          toast(`排序失败：${cause?.message ?? '未知错误'}`);
        }
      };

      const sortedProjects = React.useMemo(
        () => projects.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
        [projects],
      );

      const blankTask = () => ({
        title: '',
        notes: '',
        projectId: projectId === 'all' ? (projects[0]?.id ?? '') : projectId,
        status: 'todo',
        priority: 'normal',
        due: null,
      });

      return h('div', { className: 'zs-root' },
        h('div', { className: 'zs-col zs-side' },
          h('div', {
            className: `zs-item${projectId === 'all' ? ' on' : ''}`,
            onClick: () => setProjectId('all'),
          }, h('span', { className: 'zs-dot', style: { background: '#2f6bff' } }), h('span', {}, '全部任务'),
            h('span', { className: 'zs-count' }, String(tasks.filter((task) => task.status !== 'done').length))),
          h('h4', {}, '项目'),
          sortedProjects.map((project) => h(ProjectRow, {
            key: project.id,
            project,
            active: projectId === project.id,
            count: openCount(project.id),
            onClick: () => setProjectId(project.id),
            onRename: (target) => setProjectDialog({ project: target }),
            onDelete: (target) => setProjectToDelete(target),
            draggable: true,
            dragging: dragId === project.id,
            dropBefore: dropHint?.id === project.id && dropHint.before && dragId !== project.id,
            dropAfter: dropHint?.id === project.id && !dropHint.before && dragId !== project.id,
            onDragStart: (id) => setDragId(id),
            onDragOver: (id, before) => setDropHint({ id, before }),
            onDrop: (id) => {
              const hint = dropHint;
              setDropHint(null);
              setDragId('');
              reorder(dragId, id, hint?.before ?? true);
            },
            onDragEnd: () => { setDragId(''); setDropHint(null); },
          })),
          h('div', { className: 'zs-item', onClick: () => setCreatingProject(true), style: { color: '#2f6bff' } },
            h('span', { style: { width: 8 } }), '+ 新建项目')),
        h('div', { className: 'zs-col zs-main' },
          h('div', { className: 'zs-bar' },
            h('div', { className: 'zs-title' }, t('panel', '待办任务')),
            h('input', {
              className: 'zs-input zs-search',
              placeholder: '搜索任务…',
              value: query,
              onChange: (event) => setQuery(event.target.value),
            }),
            h('div', { className: 'zs-tabs' },
              ['open', 'all', 'done'].map((key) => h('div', {
                key,
                className: `zs-tab${filter === key ? ' on' : ''}`,
                onClick: () => setFilter(key),
              }, key === 'open' ? '进行中' : key === 'all' ? '全部' : '已完成'))),
            h('button', { className: 'zs-btn pri zs-newtask', onClick: () => setEditing(blankTask()) }, '+ 新建任务'),
            h('button', {
              className: 'zs-btn zs-gear',
              title: '系统设置',
              'aria-label': '系统设置',
              onClick: () => setSettingsOpen(true),
            },
              h('svg', {
                width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
                strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true',
              },
                h('circle', { cx: 12, cy: 12, r: 3 }),
                h('path', { d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' })))),
          h('div', { className: 'zs-list' },
            loading ? h('div', { className: 'zs-empty' }, '加载中…')
              : error ? h('div', { className: 'zs-empty' }, `加载失败：${error}`)
                : visible.length === 0
                  ? h('div', { className: 'zs-empty' },
                    filter === 'done' ? '还没有已完成的任务' : '这里还没有任务。点右上角「新建任务」，或者在对话里让 AI 帮你拆。')
                  : visible.map((task) => h(TaskRow, {
                    key: task.id,
                    task,
                    project: projects.find((project) => project.id === task.projectId),
                    onToggle: toggle,
                    onOpen: (item) => setEditing(item),
                  })))),
        editing ? h('div', { key: 'backdrop', className: 'zs-drawer-mask', onClick: () => setEditing(null) }) : null,
        editing ? h(Editor, {
          task: editing,
          projects,
          saving,
          onClose: () => setEditing(null),
          onSave: save,
          onDelete: remove,
        }) : null,
        creatingProject ? h(ProjectDialog, {
          onClose: () => setCreatingProject(false),
          onSubmit: (draft) => submitProject(draft, null),
        }) : null,
        projectDialog ? h(ProjectDialog, {
          project: projectDialog.project,
          onClose: () => setProjectDialog(null),
          onSubmit: (draft) => submitProject(draft, projectDialog.project),
        }) : null,
        projectToDelete ? h(ConfirmDialog, {
          title: '删除项目',
          message: `删除项目「${projectToDelete.name}」会同步删除该项目下的所有任务（共 ${tasks.filter((task) => task.projectId === projectToDelete.id).length} 个），删除后无法恢复。确定继续吗？`,
          confirmText: '删除项目及任务',
          danger: true,
          onCancel: () => setProjectToDelete(null),
          onConfirm: () => removeProject(projectToDelete),
        }) : null,
        settingsOpen ? h(SettingsDialog, {
          settings,
          model: '',
          rpc,
          onClose: () => setSettingsOpen(false),
          onChanged: () => { void refresh(); },
        }) : null);
    }

    /* ------------------------------------------------------ turn tail split */

    const ACTION_NOISE = /^(拆成任务|复制|分享|重新生成|继续生成|停止|用量.*|本.*费用.*|重试|已复制)$/;

    function cleanText(element) {
      return String(element?.innerText ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !ACTION_NOISE.test(line))
        .join('\n')
        .trim();
    }

    function readTurnText(element) {
      let tail = element;
      for (let depth = 0; depth < 6 && tail; depth += 1) {
        if (tail.getAttribute?.('data-turn-tail') !== null && tail.getAttribute?.('data-turn-tail') !== undefined) break;
        tail = tail.parentElement;
      }
      if (tail?.getAttribute?.('data-turn-tail') !== undefined && tail?.getAttribute?.('data-turn-tail') !== null) {
        let sibling = tail.previousElementSibling;
        for (let step = 0; step < 6 && sibling; step += 1) {
          const text = cleanText(sibling);
          if (text.length > 40) return text;
          sibling = sibling.previousElementSibling;
        }
      }
      let node = element;
      for (let depth = 0; depth < 12 && node; depth += 1) {
        const text = cleanText(node);
        if (text.length > 60) return text.slice(-6000);
        node = node.parentElement;
      }
      return '';
    }

    const CONSENT_KEY = 'gor-tasks.split-consent';

    function readConsent() {
      try { return window.localStorage?.getItem(CONSENT_KEY) ?? ''; } catch { return ''; }
    }

    function writeConsent(value) {
      try { window.localStorage?.setItem(CONSENT_KEY, value); } catch { /* ignore */ }
    }

    function ConsentDialog({ model, onAllow, onDeny, onClose }) {
      return h('div', { className: 'zs-mask', onClick: onClose },
        h('div', { className: 'zs-modal', style: { maxWidth: 420 }, onClick: (event) => event.stopPropagation() },
          h('h3', {}, '用你自己的模型拆分？'),
          h('div', { className: 'zs-hint' }, `「拆成任务」需要调用你在 DSH 里配置的模型 ${model ?? '（未配置）'}，会产生一次模型调用。允许还是只做本地按行粗拆？`),
          h('div', { className: 'zs-hint' }, '选择「允许」后不再询问；选择「不允许」不会记住，下次仍会询问，并且只按行粗拆。'),
          h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 } },
            h('button', { className: 'zs-btn', onClick: onDeny }, '不允许，按行粗拆'),
            h('button', { className: 'zs-btn pri', onClick: onAllow }, '允许，并记住'))));
    }

    function SplitDialog({ text, projects, rpc, auto, model, onClose, onSave }) {
      const [lines, setLines] = React.useState(auto ? '' : splitLines(text).join('\n'));
      const [projectId, setProjectId] = React.useState(projects[0]?.id ?? '');
      const [status, setStatus] = React.useState(auto ? 'loading' : 'manual');
      const [note, setNote] = React.useState(auto ? `正在用 ${model ?? '你的模型'} 拆分…` : '未调用模型，已按行粗拆，可直接改。');
      const [busy, setBusy] = React.useState(false);
      const count = lines.split('\n').map((line) => line.trim()).filter(Boolean).length;

      const runAi = React.useCallback(async () => {
        setStatus('loading');
        setNote(`正在用 ${model ?? '你的模型'} 拆分…`);
        try {
          const value = await rpc('task.split', { text, projectId, limit: 12 });
          const titles = (value.tasks ?? []).map((task) => task.title).filter(Boolean);
          if (!titles.length) throw new Error('模型没有给出任务');
          setLines(titles.join('\n'));
          setNote(`已用 ${value.model ?? model ?? '当前模型'} 拆出 ${titles.length} 条，可直接改。`);
          setStatus('ready');
        } catch (cause) {
          setLines(splitLines(text).join('\n'));
          setStatus('error');
          setNote(`AI 拆分失败：${cause?.message ?? '未知错误'}。已按行粗拆成草稿，可手工修。`);
        }
      }, [model, projectId, rpc, text]);

      React.useEffect(() => { if (auto) void runAi(); }, []);

      return h('div', { className: 'zs-mask', onClick: onClose },
        h('div', { className: 'zs-modal', onClick: (event) => event.stopPropagation() },
          h('h3', {}, '把这段回答拆成任务'),
          h('div', { className: 'zs-hint' }, '每行一条任务，可以直接改。保存后进入所选项目。'),
          h('textarea', {
            className: 'zs-area',
            style: { minHeight: 200 },
            value: lines,
            onChange: (event) => setLines(event.target.value),
            placeholder: status === 'loading' ? '正在拆分…' : '',
          }),
          h('div', { className: 'zs-row', style: { alignItems: 'center' } },
            h('select', {
              className: 'zs-select',
              value: projectId,
              onChange: (event) => setProjectId(event.target.value),
            }, projects.map((project) => h('option', { key: project.id, value: project.id }, project.name))),
            h('button', { className: 'zs-btn', disabled: status === 'loading', onClick: () => void runAi() }, '重新拆分'),
            h('button', { className: 'zs-btn', onClick: () => { setLines(splitLines(text).join('\n')); setNote('已按行粗拆，可手工修。'); } }, '按行粗拆')),
          h('div', { className: 'zs-hint', style: status === 'error' ? { color: '#e0a33e' } : undefined }, note),
          h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8 } },
            h('button', { className: 'zs-btn', onClick: onClose }, '取消'),
            h('button', {
              className: 'zs-btn pri',
              disabled: busy || count === 0,
              onClick: async () => {
                setBusy(true);
                try {
                  await onSave(lines.split('\n').map((line) => line.trim()).filter(Boolean), projectId);
                  onClose();
                } catch (cause) {
                  toast(`保存失败：${cause?.message ?? '未知错误'}`);
                } finally {
                  setBusy(false);
                }
              },
            }, busy ? '保存中…' : `保存 ${count} 条`))));
    }

    function SplitAction({ connection, messageId }) {
      ensureStyle();
      const [open, setOpen] = React.useState(false);
      const [ask, setAsk] = React.useState(false);
      const [auto, setAuto] = React.useState(true);
      const [text, setText] = React.useState('');
      const [projects, setProjects] = React.useState([]);
      const [model, setModel] = React.useState('');
      const [useModel, setUseModel] = React.useState(true);
      const rpc = React.useMemo(() => createClient(connection), [connection]);

      const load = async () => {
        try {
          const value = await rpc('state.get');
          setProjects(value.projects ?? []);
          setModel(value.model ?? '');
          setUseModel(value.settings?.useModelSplit !== false);
        } catch {
          setProjects([]);
        }
      };

      const openDialog = async (event) => {
        event.stopPropagation();
        const body = readTurnText(event.currentTarget.parentElement ?? event.currentTarget);
        if (!body) {
          toast('没读到这条回答的内容，先滚动到这条消息再试');
          return;
        }
        setText(body);
        await load();
        if (!useModel) {
          setAuto(false);
          setOpen(true);
          return;
        }
        const allowed = readConsent() === 'allow';
        setAuto(allowed);
        if (allowed) setOpen(true);
        else setAsk(true);
      };

      const save = async (lines, projectId) => {
        await rpc('task.bulkAdd', {
          projectId,
          tasks: lines.map((title) => ({ title, notes: messageId ? `来源消息：${messageId}` : '' })),
        });
        toast(`已保存 ${lines.length} 条任务`);
      };

      return h('span', { className: 'zs-split-wrap' },
        h('button', { className: 'zs-split-btn', onClick: openDialog, title: '把这轮回答拆成待办任务' },
          h('svg', {
            width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
            strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true',
          },
            h('path', { d: 'M5 6h9' }),
            h('path', { d: 'M5 12h5' }),
            h('path', { d: 'M5 18h13' }),
            h('path', { d: 'M17.5 4.5v5' }),
            h('path', { d: 'M15 7h5' })),
          h('span', {}, '拆成任务')),
        ask ? h(ConsentDialog, {
          model,
          onClose: () => setAsk(false),
          onAllow: () => { writeConsent('allow'); setAuto(true); setAsk(false); setOpen(true); },
          onDeny: () => { setAuto(false); setAsk(false); setOpen(true); },
        }) : null,
        open ? h(SplitDialog, {
          text,
          projects,
          rpc,
          auto,
          model,
          onClose: () => setOpen(false),
          onSave: save,
        }) : null);
    }

    function SidebarIcon({ connection }) {
      ensureStyle();
      const rpc = React.useMemo(() => createClient(connection), [connection]);
      const [count, setCount] = React.useState(0);
      React.useEffect(() => {
        if (!connection?.rpc?.call) return undefined;
        let alive = true;
        const tick = async () => {
          try {
            const value = await rpc('state.get');
            if (!alive) return;
            const config = value?.settings ?? {};
            setCount(config.dueReminder === false ? 0 : countDueSoon(value?.tasks ?? [], config.dueSoonDays));
          } catch {
            /* 静默：图标不该因为取数失败而报错 */
          }
        };
        void tick();
        const timer = setInterval(tick, 60 * 1000);
        const onChange = () => { void tick(); };
        window.addEventListener('dsh-gor-tasks:changed', onChange);
        window.addEventListener('focus', onChange);
        return () => {
          alive = false;
          clearInterval(timer);
          window.removeEventListener('dsh-gor-tasks:changed', onChange);
          window.removeEventListener('focus', onChange);
        };
      }, [connection, rpc]);

      const wrapRef = React.useRef(null);

      // 把数字放到「待办任务」文字后面：宿主只留了图标位置，所以我们把徽标
      // 直接挂到这一行的末尾（margin-left:auto 靠右），并在宿主重渲染后补回。
      React.useEffect(() => {
        const wrap = wrapRef.current;
        const row = wrap?.closest('button');
        if (!row) return undefined;
        const title = row.querySelector('span[class*="panelTitle"]');
        const wide = Boolean(title && title.textContent.trim());
        const existing = row.querySelector(':scope > .zs-due-badge');
        if (!wide || count <= 0) {
          existing?.remove();
          return undefined;
        }
        const badge = existing ?? document.createElement('span');
        if (!existing) {
          badge.className = 'zs-due-badge';
          row.appendChild(badge);
        }
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.title = `${count} 个任务快到期或已逾期`;
        let alive = true;
        const observer = new MutationObserver(() => {
          if (!alive) return;
          if (!row.contains(badge)) row.appendChild(badge);
        });
        observer.observe(row, { childList: true });
        return () => {
          alive = false;
          observer.disconnect();
        };
      }, [count]);

      return h('span', { className: 'zs-icon-wrap', ref: wrapRef },
        h('svg', {
          width: 20,
          height: 20,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
          h('path', { d: 'M4 6.5h3.2l1.6 1.6' }),
          h('path', { d: 'M10 5.4 11.6 7' }),
          h('path', { d: 'M10 12h10' }),
          h('path', { d: 'M10 18h10' }),
          h('path', { d: 'M4 12h2.4' }),
          h('path', { d: 'M4 18h2.4' })));
    }

    /* --------------------------------------------------------------- boot */

    return {
      name: 'dsh-gor-tasks',
      inject: ['slots', 'connection', 'locale'],
      apply(ctx) {
        ensureStyle();
        const bind = ctx.locale?.bind?.(NS);
        const t = (key, fallback) => {
          try {
            const value = bind?.(key);
            return value && value !== key ? value : (fallback ?? key);
          } catch { return fallback ?? key; }
        };
        const connection = ctx.connection;
        if (!connection?.rpc?.call) return;
        // 侧栏图标拿不到 slot inject 也能工作：直接用 apply 时的连接
        const SidebarIconWithRpc = (props) => SidebarIcon({ ...(props ?? {}), connection: props?.connection ?? connection });

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: NS,
          inject: () => ({ connection, t }),
        }, TasksPage));

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 40,
          locale: NS,
          inject: () => ({ connection }),
          label: () => t('panel', '待办任务'),
        }, SidebarIconWithRpc));

        ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
          name: 'conversation.chat.assistant-actions',
          id: 'dsh-gor-tasks-split',
          order: 40,
          locale: NS,
          inject: ({ messageId }) => ({ connection, messageId }),
        }, SplitAction));
      },
    };
  },
});
