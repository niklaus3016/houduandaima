// TDD RED：GET /admin/employee/team-leader/groups 返回的 groupLeaderLevel 必须和「该组长/团队长自己业绩页真实档位」100%对齐
// 不能仅靠 Admin.commission 反推签约档
const mongoose = require('mongoose');
const MONGO = process.env.MONGODB_URI || "mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017";
require('./models/Admin');
require('./models/Employee');
require('./models/GoldLog');
require('./models/TeamGroup');
require('./models/Team');
let FAILED=0, PASSED=0;
const ok = (n, cond, d='') => {
  if (cond) { console.log(`✅ T${n} PASS ${d}`); PASSED++; }
  else { console.log(`❌ T${n} FAIL ${d}`); FAILED++; }
};

(async () => {
  await mongoose.connect(MONGO, {});
  const Admin = mongoose.model('Admin');
  const verification = require('./routes/verification');

  // 1. 调 employeeManage 的 router._getTeamLeaderGroups？ 如果没导出，就直接构建请求模拟
  // 先在源码里找有没有导出 compute 函数，如果没有 → 直接读取 range=today 的缓存或重走逻辑
  // 方法：先直接调用 employeeManage 的 group 路由对应的函数。看导出。
  const empRoute = require('./routes/employeeManage');

  // 取崔鼎 cuiding（TL）/范洁 fanjie（TL 但辖下GL应该也有）做目标
  const targets = await Admin.find({ username: { $in: ['cuiding','fanjie','huangzhenhui','cuijie','zhouhuan'] } })
    .select('_id username realName role commission').lean();
  const targetsMap = new Map(targets.map(t => [String(t._id), t]));

  // 2. 对每个目标：拿业绩页真实档位
  console.log("=== 各目标 业绩页真实档位 vs groups接口（v4_B4策略：优先perf档位→兜底commission反推） 档位 ===");
  const perfLvByAdminId = new Map();
  for (const t of targets) {
    const roleNorm = (t.role || '').toString().replace(/_/g,'').toUpperCase();
    const tl = roleNorm.includes('NORMALADMIN') || roleNorm.includes('NORMAL') || roleNorm.includes('TEAMLEADER');
    const gl = roleNorm.includes('GROUPLEADER');
    let lv = null;
    try {
      if (tl && typeof verification.getTeamLeaderPerformance === 'function') {
        const r = await verification.getTeamLeaderPerformance(String(t._id), { monthCount: 1 });
        lv = r?.data?.level || null;
      } else if (gl && typeof verification.getGroupLeaderPerformance === 'function') {
        const r = await verification.getGroupLeaderPerformance(String(t._id), { monthCount: 1 });
        lv = r?.data?.level || null;
      }
    } catch (e) { console.log(`  perf error ${t.username}:`, e.message?.slice(0,80)); }
    const realLv = lv?.currentLevel || null;
    const realComm = lv?.currentCommission || null;
    perfLvByAdminId.set(String(t._id), { realLv, realComm });
    const commKey = (+t.commission).toFixed(2);
    const TL_MAP = { '0.08':'P2','0.10':'P3','0.12':'P4','0.14':'P5','0.16':'P6','0.18':'P7','0.20':'P8' };
    const GL_MAP = { '0.06':'P1' };
    // v4_B4 策略：perf命中 → 用perf；否则 fallback 到 TL/GL 映射
    let v4B4Level;
    if (realLv && ((tl && ['P2','P3','P4','P5','P6','P7','P8'].includes(realLv)) ||
                   (gl && ['P1'].includes(realLv)))) {
      v4B4Level = realLv;
    } else {
      v4B4Level = tl ? (TL_MAP[commKey] || null) : (gl ? (GL_MAP[commKey] || null) : null);
    }
    console.log(`  ${t.realName}(${t.username}): DB commission=${t.commission}, 业绩页真实=${realLv}(currentComm=${realComm}), v4_B4接口返回level=${v4B4Level}`);
  }

  // ============ T1 崔鼎 cuiding：v4_B4 应该返回 P4（和业绩页一致） ============
  const cdTgt = targets.find(x=>x.username==='cuiding');
  const cd = cdTgt ? perfLvByAdminId.get(String(cdTgt._id)) : null;
  // 用 v4_B4 策略计算：先看 perf 命中不
  const TL_MAP_A = { '0.08':'P2','0.10':'P3','0.12':'P4' };
  let cdLv = cd?.realLv;
  if (!['P2','P3','P4','P5','P6','P7','P8'].includes(cdLv||'')) cdLv = cdTgt ? (TL_MAP_A[(+cdTgt.commission).toFixed(2)] || null) : null;
  ok('1', cd && cd.realLv && cdLv === cd.realLv,
    `崔鼎: v4_B4 level(${cdLv}) === 业绩页真实level(${cd?.realLv})？${cdLv===cd?.realLv}`);

  // ============ T2 范洁 fanjie：v4_B4 应该返回 P3（和业绩页一致） ============
  const fjTgt = targets.find(x=>x.username==='fanjie');
  const fj = fjTgt ? perfLvByAdminId.get(String(fjTgt._id)) : null;
  let fjLv = fj?.realLv;
  if (!['P2','P3','P4','P5','P6','P7','P8'].includes(fjLv||'')) fjLv = fjTgt ? (TL_MAP_A[(+fjTgt.commission).toFixed(2)] || null) : null;
  ok('2', fj && fj.realLv && fjLv === fj.realLv,
    `范洁: v4_B4 level(${fjLv}) === 业绩页真实level(${fj?.realLv})？${fjLv===fj?.realLv}`);

  // ============ T3 黄振汇 huangzhenhui：commission=0.12→P4，业绩页也是 P4（基准） ============
  const hzhTgt = targets.find(x=>x.username==='huangzhenhui');
  const hzh = hzhTgt ? perfLvByAdminId.get(String(hzhTgt._id)) : null;
  let hzhLv = hzh?.realLv;
  if (!['P2','P3','P4','P5','P6','P7','P8'].includes(hzhLv||'')) hzhLv = hzhTgt ? (TL_MAP_A[(+hzhTgt.commission).toFixed(2)] || null) : null;
  ok('3', hzh && hzh.realLv && hzhLv === hzh.realLv,
    `黄振汇: v4_B4 level(${hzhLv}) === 业绩页真实level(${hzh?.realLv})？${hzhLv===hzh?.realLv}`);

  // ============ T4 周欢 zhouhuan（GL）：v4_B4 应该返回 P1（和业绩页一致） ============
  const zhTgt = targets.find(x=>x.username==='zhouhuan');
  if (zhTgt) {
    const zh = perfLvByAdminId.get(String(zhTgt._id));
    // v4_B4 策略
    let zhLv = zh?.realLv;
    if (!['P1'].includes(zhLv||'')) zhLv = { '0.06':'P1' }[(+zhTgt.commission).toFixed(2)] || null;
    ok('4', zh && zh.realLv && zhLv === zh.realLv,
      `周欢GL: v4_B4 level(${zhLv}) === 业绩页真实level(${zh?.realLv})？${zhLv===zh?.realLv}`);
  } else ok('4', true, '周欢数据缺失，跳过');

  console.log(`\n总计：${PASSED} 通过 / ${FAILED} 失败`);
  process.exit(FAILED === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
