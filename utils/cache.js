const cache = new Map();
const MAX_CACHE_ENTRIES = 5000;
const CACHE_TTL = {
  kpi: 5 * 60 * 1000,
  users: 5 * 60 * 1000,
  teams: 60 * 60 * 1000,
  groups: 60 * 60 * 1000,
  employee_list: 10 * 60 * 1000,
  team_leaders: 10 * 60 * 1000,
  group_leaders: 10 * 60 * 1000,
  today: 5 * 60 * 1000,
  yesterday: 60 * 60 * 1000,
  week: 60 * 60 * 1000,
  month: 60 * 60 * 1000,
  ranking: 5 * 60 * 1000
};

function _cleanExpired() {
  const now = Date.now();
  for (const [key, item] of cache.entries()) {
    if (now >= item.expiry) {
      cache.delete(key);
    }
  }
}

function _evictLRU(count = 1) {
  const sorted = Array.from(cache.entries()).sort((a, b) => a[1].accessTime - b[1].accessTime);
  for (let i = 0; i < count && i < sorted.length; i++) {
    cache.delete(sorted[i][0]);
  }
}

function get(key) {
  const item = cache.get(key);
  if (item) {
    if (Date.now() < item.expiry) {
      item.accessTime = Date.now();
      return item.data;
    }
    cache.delete(key);
  }
  return null;
}

function set(key, data, ttl = 60 * 1000) {
  try {
    const dataSize = JSON.stringify(data).length;
    if (dataSize > 1000000) {
      return;
    }

    if (cache.size >= MAX_CACHE_ENTRIES) {
      _evictLRU(Math.floor(MAX_CACHE_ENTRIES * 0.1));
    }

    cache.set(key, {
      data,
      expiry: Date.now() + ttl,
      accessTime: Date.now()
    });
  } catch (error) {}
}

function clear(pattern) {
  if (!pattern) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (typeof key === 'string' && key.includes(pattern)) {
      cache.delete(key);
    }
  }
}

function clearAll() {
  cache.clear();
}

function stats() {
  return {
    size: cache.size,
    maxSize: MAX_CACHE_ENTRIES
  };
}

module.exports = {
  cache,
  CACHE_TTL,
  MAX_CACHE_ENTRIES,
  get,
  set,
  clear,
  clearAll,
  stats
};