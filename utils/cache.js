const cache = new Map();
const CACHE_TTL = {
  kpi: 60 * 1000,
  users: 60 * 1000,
  teams: 60 * 60 * 1000,
  groups: 60 * 60 * 1000,
  employee_list: 10 * 60 * 1000,
  team_leaders: 10 * 60 * 1000,
  group_leaders: 10 * 60 * 1000
};

function get(key) {
  const item = cache.get(key);
  if (item && Date.now() < item.expiry) {
    return item.data;
  }
  cache.delete(key);
  return null;
}

function set(key, data, ttl = 60 * 1000) {
  try {
    // 检查数据大小
    const dataSize = JSON.stringify(data).length;
    if (dataSize > 1000000) { // 1MB 限制
      console.log(`⚠️  缓存数据过大 (${dataSize} bytes)，跳过缓存`);
      return;
    }
    cache.set(key, {
      data,
      expiry: Date.now() + ttl
    });
    console.log(`✅ 缓存设置成功: ${key}, 大小: ${dataSize} bytes, 过期时间: ${new Date(Date.now() + ttl).toLocaleString()}`);
  } catch (error) {
    console.error('❌ 缓存设置失败:', error);
  }
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

module.exports = {
  cache,
  CACHE_TTL,
  get,
  set,
  clear,
  clearAll
};