// TDD RED：验证 manager-direct-cards 每张卡的 level，必须和「该团队长/组长自己业绩页真实职级」一致
// 职级匹配规则：
//   TL：用 verification.getTeamLeaderPerformance(adminId) 返回 data.level （基于直推+间推总业绩算档，不是直属成员）
//   GL：用 verification.getGroupLeaderPerformance(adminId) 返回 data.level
//   业绩页是什么 level，新接口 card.level 就必须是什么，不能仅靠 commission 反推
const mongoose = require('mongoose');
const MONGO = process.env.MONGODB_URI || "mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017";
require('./models/Admin');
require('./models/Employee');
require('./models/GoldLog');
require('./models/TeamGroup');
let FAILED=0, PASSED=0;
const ok = (n, cond, d='') => {
  if (cond) { console.log(`✅ T${n} PASS ${d}`); PASSED++; }
  else { console.log(`❌ T${n} FAIL ${d}`); FAILED++; }
};

(async () => {
  await mongoose.connect(MONGO, {});
  const Admin = mongoose.model('Admin');
  const dash = require('./routes/dashboard');
  const verification = require('./routes/verification');

  // 先拿新接口所有卡（当前实现靠commission反推，应该错）
  const result = await dash._computeSuperManagerDirectCards({ range:'today', role:'', limit:1000, page:1 });
  const cardsByAdminId = new Map(result.data.map(c => [c._id, c]));

  // 找 cuiding=崔鼎 + huangzhenhui=黄振汇 + fanjie=范洁
  const targets = await Admin.find({ username: { $in: ['cuiding','huangzhenhui','fanjie','cuijie','cuiding'] } })
    .select('_id username realName role commission').lean();
  console.log("=== Target Admins ===");
  targets.forEach(t => console.log(`  ${t.username}(${t.realName}) _id=${t._id} role=${t.role} commission=${t.commission}`));

  // 对每个人调用业绩接口取真实 level
  const realLevels = {};
  for (const admin of targets) {
    const roleNorm = (admin.role || '').toString().replace(/_/g,'').toUpperCase();
    const isTL = roleNorm.includes('NORMALADMIN') || roleNorm.includes('NORMAL') || roleNorm.includes('TEAMLEADER') || roleNorm === 'TL';
    const isGL = roleNorm.includes('GROUPLEADER') || roleNorm === 'GL';
    let levelCode = null, totalRevenue = null, commission = null, manualFlag = false;
    try {
      if (isTL && typeof verification.getTeamLeaderPerformance === 'function') {
        const r = await verification.getTeamLeaderPerformance(String(admin._id), { monthCount: 1 });
        // data.level 字段由 computeTeamLeaderLevel 返回，key = currentLevel(P2~P8) / currentCommission / manualLevel
        levelCode = r?.data?.level?.currentLevel || r?.data?.level?.levelCode || null;
        totalRevenue = r?.data?.summary?.totalRevenue ?? null;
        commission = r?.data?.level?.currentCommission ?? null;
        manualFlag = r?.data?.level?.manualLevel != null;
      } else if (isGL && typeof verification.getGroupLeaderPerformance === 'function') {
        const r = await verification.getGroupLeaderPerformance(String(admin._id), { monthCount: 1 });
        levelCode = r?.data?.level?.currentLevel || r?.data?.level?.levelCode || null;
        totalRevenue = r?.data?.summary?.totalRevenue ?? null;
        commission = r?.data?.level?.currentCommission ?? null;
        manualFlag = r?.data?.level?.manualLevel != null;
      }
    } catch (e) {
      console.log(`  getPerformance error ${admin.username}:`, e.message?.slice(0,80));
    }
    realLevels[admin.username] = { admin, levelCode, totalRevenue, commission, manualFlag, roleNorm, isTL, isGL };
    const card = cardsByAdminId.get(String(admin._id));
    console.log(`\n--- ${admin.username}(${admin.realName}) ---`);
    console.log(`  业绩页: level=${levelCode}, totalRevenue=${totalRevenue!=null?totalRevenue.toFixed(2):null}, currentCommission=${commission}`);
    console.log(`  新接口: level=${card?.level}, commissionRate=${card?.commissionRate}, cardTodayRevenue=${card?.todayRevenue}`);
    console.log(`  DB commission raw: ${admin.commission}`);
  }

  // ============ T1 核心：崔鼎 cuiding 业绩页 level 必须 == 新接口 card.level ============
  const cd = realLevels['cuiding'];
  const cdCard = cd ? cardsByAdminId.get(String(cd.admin._id)) : null;
  ok('1', cd && cdCard && cd.levelCode && cdCard.level === cd.levelCode,
    `崔鼎 cuiding：业绩页level=${cd?.levelCode}(totalRevenue=${cd?.totalRevenue?.toFixed(2)})，新接口level=${cdCard?.level}(commission反推)，必须相等`);

  // ============ T2 黄振汇业绩页 level == 新接口 card.level ============
  const hzh = realLevels['huangzhenhui'];
  const hzhCard = hzh ? cardsByAdminId.get(String(hzh.admin._id)) : null;
  ok('2', hzh && hzhCard && hzh.levelCode && hzhCard.level === hzh.levelCode,
    `黄振汇：业绩页level=${hzh?.levelCode}(totalRevenue=${hzh?.totalRevenue?.toFixed(2)})，新接口level=${hzhCard?.level}，必须相等`);

  // ============ T3 范洁 cuijie 业绩页 level == 新接口 card.level ============
  const fj = realLevels['fanjie'];
  const fjCard = fj ? cardsByAdminId.get(String(fj.admin._id)) : null;
  ok('3', !fjCard || (fj && fj.levelCode && fjCard.level === fj.levelCode),
    `范洁 fanjie：业绩页level=${fj?.levelCode}(totalRevenue=${fj?.totalRevenue?.toFixed(2)})，新接口level=${fjCard?.level}，必须相等`);

  // ============ T4 全局：所有 enabled TL 的业绩页 level == 新接口 card.level ============
  const allAdmins = await Admin.find({ status: { $nin: ['disabled','deleted','DISABLED','DELETED','Deleted'] } })
    .select('_id username realName role').lean();
  let globalOK = true, wrongs = [];
  for (const admin of allAdmins) {
    const roleNorm = (admin.role || '').toString().replace(/_/g,'').toUpperCase();
    const isTL = roleNorm.includes('NORMALADMIN') || roleNorm.includes('NORMAL') || roleNorm.includes('TEAMLEADER');
    const isGL = roleNorm.includes('GROUPLEADER');
    if (!isTL && !isGL) continue;
    const card = cardsByAdminId.get(String(admin._id));
    if (!card) continue;
    let lv = null;
    try {
      if (isTL && typeof verification.getTeamLeaderPerformance === 'function') {
        const r = await verification.getTeamLeaderPerformance(String(admin._id), { monthCount: 1 });
        lv = r?.data?.level?.currentLevel || r?.data?.level?.levelCode || null;
      } else if (isGL && typeof verification.getGroupLeaderPerformance === 'function') {
        const r = await verification.getGroupLeaderPerformance(String(admin._id), { monthCount: 1 });
        lv = r?.data?.level?.currentLevel || r?.data?.level?.levelCode || null;
      }
    } catch (_) {}
    if (lv && card.level !== lv) {
      globalOK = false;
      wrongs.push(`${admin.realName||admin.username}: 业绩页=${lv}，新接口=${card.level}`);
    }
  }
  ok('4', globalOK, wrongs.length ? `全局错配(${wrongs.length}): ${wrongs.slice(0,6).join('；')}${wrongs.length>6?'...':''}` : `全局TL/GL职级全部与业绩页面对齐`);

  console.log(`\n总计：${PASSED} 通过 / ${FAILED} 失败`);
  process.exit(FAILED===0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
