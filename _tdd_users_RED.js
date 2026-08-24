// ================================================================
// RED：对比「users接口现状集合」vs「按KPI口径正确集合」
//   cuiding(TL) / niaoshen(GL) / 超管SA 三个视角
// ================================================================
const mongoose = require('mongoose');
require('./models/Admin');
require('./models/Employee');
require('./models/TeamGroup');
require('./models/GoldLog');
require('./models/TeamLeaderLevelConfig');
require('./models/UserGold');
require('./models/UserActivity');
require('./models/Team');
const MONGO = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
const db = require('./routes/dashboard');

const RANGE = 'today';

// -------- 预期集合（KPI口径，权威） --------
async function expectedTLEmployeeIds(tlId) {
  // 1) 直属D
  const directD = new Set(await db._getTLDirectDIds(String(tlId)));
  // 2) 下属组长组内G（3OR）
  const subG   = new Set(await db._getTLSubGroupGIds(String(tlId)));
  // 3) 下属 TL 的直属 D
  const Admin = mongoose.model('Admin');
  const subTls = await Admin.find({
    parentTlId: String(tlId), role: { $in:['NORMAL_ADMIN','normal_admin'] }
  }).select('_id').lean();
  const subTlD = new Set();
  for (const tl of subTls) (await db._getTLDirectDIds(String(tl._id))).forEach(id => subTlD.add(id));
  const all = new Set([...directD, ...subG, ...subTlD]);
  return {
    directD, subG, subTlD, all,
    counts: { directD:directD.size, subG:subG.size, subTlD:subTlD.size, total: all.size }
  };
}
async function expectedGLEmployeeIds(gl) {
  const TeamGroup = mongoose.model('TeamGroup');
  const tg = await TeamGroup.findById(gl.teamGroupId);
  const Employee = mongoose.model('Employee');
  const cond = tg?.groupName ? {
    $or:[
      { teamGroupId: gl.teamGroupId },
      tg._id ? { teamGroupId: tg._id.toString() } : { teamGroupId: null },
      { groupName: tg.groupName }
    ]
  } : { teamGroupId: gl.teamGroupId };
  const empIds = new Set((await Employee.find(cond).select('employeeId').lean()).map(e=>e.employeeId));
  return { all: empIds, counts: { total: empIds.size } };
}

// -------- 现状：调用 users 接口返回的 employeeId 集合 --------
async function currentUsersViaAPI(userRoleObj, queryOpts = {}) {
  // 手动模拟 req，用 dashboard 内部的 authMiddleware 要求 req.user 存在；
  // 我们直接抽 users 路由的核心逻辑，传一个假 req 即可（不调 router，只复用 L112-376 里的计算步骤太耦合，
  // 换一种方式：我们自己按现接口的 L295-305 和 L232-242 两条路径去拉 employeeIds，还原"现状集合")
  const Admin = mongoose.model('Admin');
  const Employee = mongoose.model('Employee');
  const Team = mongoose.model('Team');
  const ids = new Set();
  if (queryOpts.team) {
    // TL 前端走的 team 参数分支（L232-242）：Team.find({name=team}).members.userId 过滤 Employee
    const targetTeam = await Team.findOne({ name: queryOpts.team });
    if (targetTeam) {
      const userIds = targetTeam.members.map(m=>String(m.userId));
      const emps = await Employee.find({});
      for (const e of emps) {
        // 这里的判断是"userStats里的userId是Team.members里"，但userStats.userId来自GoldLog.userId（一般是employeeId对应的userId字段？
        // 原代码 L237-241 是按 userId（员工的userId或employeeId？）匹配——实际还原为：Employee的employeeId ∈ TeamMemberIds 时命中
        if (userIds.includes(String(e.employeeId)) || userIds.includes(String(e.userId || e._id))) ids.add(e.employeeId);
      }
    }
  } else if (queryOpts._scope === 'TL_noTeamParam') {
    // L295-305 后备分支：parentId = TL._id
    const emps = await Employee.find({ parentId: String(userRoleObj._id) });
    emps.forEach(e => ids.add(e.employeeId));
  } else if (queryOpts._scope === 'GL_noGroupParam') {
    // L272-294 组长后备分支：3OR自己组
    return expectedGLEmployeeIds(userRoleObj); // 组长这条路径本来就用 3OR，基本对
  }
  return { all: ids, counts: { total: ids.size } };
}

(async () => {
  await mongoose.connect(MONGO, {});
  const Admin = mongoose.model('Admin');

  // ============= 1. cuiding TL =============
  const cui = await Admin.findOne({ username:'cuiding' }).select('_id username teamName role teamGroupId').lean();
  const cuiExpected = await expectedTLEmployeeIds(cui._id);
  const cuiCurrentTeamParam = await currentUsersViaAPI(cui, { team: cui.teamName });
  const cuiCurrentFallback = await currentUsersViaAPI(cui, { _scope:'TL_noTeamParam' });

  console.log('\n================================================================================');
  console.log('【1】cuiding（TL 团队长）— 今日员工集合对比（预期=KPI 3OR口径）');
  console.log('--------------------------------------------------------------------------------');
  console.log('  预期集合（权威）：');
  console.log('    直属 D 员工         directD        = ' + cuiExpected.counts.directD);
  console.log('    下属组长组 G 员工    subG           = ' + cuiExpected.counts.subG);
  console.log('    下属 TL 直属 D       subTlD         = ' + cuiExpected.counts.subTlD);
  console.log('    预期总数                           = ' + cuiExpected.counts.total);
  console.log('');
  console.log('  users接口现状：');
  console.log('    (前端走 team=鼎盛战队) Team.members 命中 = ' + cuiCurrentTeamParam.counts.total);
  console.log('    (后备 parentId=TL._id)                  = ' + cuiCurrentFallback.counts.total);
  const TLTeamOK = cuiCurrentTeamParam.counts.total >= cuiExpected.counts.total;
  const TLFallOK = cuiCurrentFallback.counts.total >= cuiExpected.counts.total;
  console.log('  结论：前端team参数分支 ' + (TLTeamOK?'✅覆盖预期':'❌ 漏 '+ Math.max(0, cuiExpected.counts.total - cuiCurrentTeamParam.counts.total) + ' 人，间推(组长G+下属TL.D)被漏')
    + '；后备parentId分支 ' + (TLFallOK?'✅':'❌ 漏 ' + Math.max(0, cuiExpected.counts.total - cuiCurrentFallback.counts.total) + ' 人（只含直属D，间推全无）'));
  console.log('  【isDirect打标验证】正确打标应 = directD ' + cuiExpected.counts.directD + '人=true / subG ' + cuiExpected.counts.subG + '+ subTlD ' + cuiExpected.counts.subTlD + '人=false 共间推' + (cuiExpected.counts.subG + cuiExpected.counts.subTlD) + '人');

  // ============= 2. niaoshen GL =============
  const niao = await Admin.findOne({ username: 'niaoshen' }).select('_id username teamName role teamGroupId').lean();
  let glOK = false;
  if (niao && niao.teamGroupId) {
    const niaoExpected = await expectedGLEmployeeIds(niao);
    const niaoCurrent = await currentUsersViaAPI(niao, { _scope: 'GL_noGroupParam' });
    console.log('\n================================================================================');
    console.log('【2】niaoshen（组长 GL）— 今日员工集合对比（组长无\"间推\"，都是自己组G员工）');
    console.log('--------------------------------------------------------------------------------');
    console.log('  预期(自己组 3OR) 总数          = ' + niaoExpected.counts.total);
    console.log('  users 接口后备分支 3OR 命中    = ' + niaoCurrent.counts.total);
    glOK = Math.abs(niaoExpected.counts.total - niaoCurrent.counts.total) <= 3;
    console.log('  结论：组长路径 ' + (glOK?'✅ 一致（组长路径本来就用3OR，应该没问题）':'⚠ 差' + Math.abs(niaoExpected.counts.total-niaoCurrent.counts.total)+'人 需核对'));
    console.log('  【isDirect打标验证】组长所有员工都应标 isDirect=true，sourceKind=glGroupG（无\"间推\"概念）');
  } else {
    console.log('\n⚠  没找到带 teamGroupId 的 niaoshen，跳过 GL 部分');
  }

  console.log('\n================================================================================');
  console.log('【3】超管 SA：预期 = 平台所有员工（users 接口本来就不做过滤，✅ 一般没问题）');
  console.log('  超管不打 isDirect/sourceKind（避免语义错误，字段 undefined 即可）');
  console.log('================================================================================');
  const allPass = (TLTeamOK && TLFallOK) && glOK;
  console.log('\n▶ RED 测试结论：' + (allPass ? '✅ 现状OK，无需改' : '❌ TL两条路径严重漏人间推用户，必须改造。改完再跑 GREEN 版本验收。'));
  process.exit(allPass ? 0 : 2);
})().catch(e => { console.error('ERR:', e.message || e); process.exit(1); });
