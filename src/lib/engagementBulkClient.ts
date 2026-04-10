type UnknownRecord = Record<string, unknown>;

type CacheEntry = { data: UnknownRecord; ts: number };

const TTL_MS = 45_000; // 45s кэш
const DEBOUNCE_MS = 200; // коалесцирование
const CHUNK = 80; // размер чанка ids

type Batcher = {
  api: string;
  pending: Set<string>;
  timer: number | null;
  resolvers: Array<(m: Record<string, UnknownRecord>) => void>;
  cache: Map<string, CacheEntry>;
  inflight: boolean;
};

const batchers = new Map<string, Batcher>();

function getBatcher(apiBase: string): Batcher {
  const key = apiBase.replace(/\/+$/, '');
  let b = batchers.get(key);
  if (b) return b;
  b = { api: key, pending: new Set(), timer: null, resolvers: [], cache: new Map(), inflight: false };
  batchers.set(key, b);
  return b;
}

function now() { return Date.now(); }

async function fetchBulkOnce(api: string, ids: string[]): Promise<Record<string, UnknownRecord>> {
  if (!ids.length) return {};
  const withSlash = api.endsWith('/');
  const q = encodeURIComponent(ids.join(','));
  const url = withSlash ? `${api}/api/posts/engagement/bulk/?ids=${q}` : `${api}/api/posts/engagement/bulk?ids=${q}`;
  let r: Response;
  try { r = await fetch(url, { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' } }); }
  catch { r = await fetch(url, { credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json' } }); }
  if (!r.ok) {
    // фолбэк пробуем без/с include
    try { r = await fetch(url, { credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json' } }); }
    catch { /* ignore */ }
  }
  if (!r.ok) return {};
  const j: unknown = await r.json().catch(() => ({}));
  const root = (j ?? {}) as UnknownRecord;
  const arr: UnknownRecord[] = Array.isArray(j) ? (j as UnknownRecord[])
    : Array.isArray(root.items) ? (root.items as UnknownRecord[])
    : Array.isArray(root.results) ? (root.results as UnknownRecord[])
    : Array.isArray(root.data) ? (root.data as UnknownRecord[])
    : [];
  const map: Record<string, UnknownRecord> = {};
  for (const it of arr) {
    const pid = String((it['post_id'] ?? it['postId'] ?? it['id'] ?? '') || '');
    if (pid) map[pid] = it;
  }
  return map;
}

async function process(b: Batcher) {
  if (b.inflight) return;
  b.inflight = true;
  try {
    // снимем список id из pending
    const ids = Array.from(b.pending);
    b.pending.clear();
    const need: string[] = [];
    const result: Record<string, UnknownRecord> = {};
    const t = now();
    // возьмём из кэша
    for (const id of ids) {
      const ce = b.cache.get(id);
      if (ce && (t - ce.ts) < TTL_MS) {
        result[id] = ce.data;
      } else {
        need.push(id);
      }
    }
    // остаток чанками
    for (let i = 0; i < need.length; i += CHUNK) {
      const part = need.slice(i, i + CHUNK);
      const map = await fetchBulkOnce(b.api, part);
      const ts = now();
      for (const id of part) {
        const data = map[id];
        if (data) {
          result[id] = data;
          b.cache.set(id, { data, ts });
        }
      }
    }
    // отдадим всем ожидателям
    const resolvers = b.resolvers.splice(0, b.resolvers.length);
    for (const resolve of resolvers) resolve({ ...result });
  } finally {
    b.inflight = false;
  }
}

export function requestEngagementBulk(apiBase: string, ids: string[]): Promise<Record<string, UnknownRecord>> {
  const b = getBatcher(apiBase);
  // соберём id и повесим в очередь
  for (const id of ids) if (id) b.pending.add(String(id));
  return new Promise((resolve) => {
    b.resolvers.push(resolve);
    if (b.timer != null) window.clearTimeout(b.timer);
    b.timer = window.setTimeout(() => { b.timer = null; void process(b); }, DEBOUNCE_MS);
  });
}

