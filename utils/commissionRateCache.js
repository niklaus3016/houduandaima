const { get, set } = require('./cache');

const TL_COMMISSION_CACHE_TTL = 30 * 60 * 1000;
const GL_COMMISSION_CACHE_TTL = 30 * 60 * 1000;

async function getTeamLeaderRealCommission(tlId) {
  if (!tlId) return 0;
  
  const cacheKey = `tl_real_commission_${String(tlId)}`;
  let cached = get(cacheKey);
  if (cached) return cached;
  
  let verification = null;
  try { verification = require('../routes/verification'); } catch (_) {}
  
  if (verification && typeof verification.getTeamLeaderPerformance === 'function') {
    try {
      const perf = await verification.getTeamLeaderPerformance(String(tlId), { monthCount: 1 });
      if (perf && perf.data && perf.data.level && typeof perf.data.level.currentCommission === 'number') {
        const rate = perf.data.level.currentCommission;
        set(cacheKey, rate, TL_COMMISSION_CACHE_TTL);
        return rate;
      }
    } catch (_) {}
  }
  
  return 0;
}

async function getGroupLeaderRealCommission(glId) {
  if (!glId) return 0;
  
  const cacheKey = `gl_real_commission_${String(glId)}`;
  let cached = get(cacheKey);
  if (cached) return cached;
  
  let verification = null;
  try { verification = require('../routes/verification'); } catch (_) {}
  
  if (verification && typeof verification.getGroupLeaderPerformance === 'function') {
    try {
      const perf = await verification.getGroupLeaderPerformance(String(glId));
      if (perf && perf.data && perf.data.level && typeof perf.data.level.currentCommission === 'number') {
        const rate = perf.data.level.currentCommission;
        set(cacheKey, rate, GL_COMMISSION_CACHE_TTL);
        return rate;
      }
    } catch (_) {}
  }
  
  return 0;
}

function clearCommissionCache(adminId) {
  const tlKey = `tl_real_commission_${String(adminId)}`;
  const glKey = `gl_real_commission_${String(adminId)}`;
  const { clear } = require('./cache');
  clear(tlKey);
  clear(glKey);
}

module.exports = {
  getTeamLeaderRealCommission,
  getGroupLeaderRealCommission,
  clearCommissionCache
};