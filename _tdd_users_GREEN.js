// GREEN验证：users接口改造后，集合大小和打标与KPI口径100%一致
const mongoose = require('mongoose');
require('./models/Admin');
require('./models/Employee');
require('./models/TeamGroup');
require('./models/GoldLog');
require('./models/TeamLeaderLevelConfig');
require('./models/UserGold');
require('./models/UserActivity');
require('./models/Team');
const assert = require('assert');
const MONGO = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
const db = require('./routes/dashboard');

// 权威：KPI口径预期集合
async function expectedTLEmployeeIds(tlId) {
  const Admin = mongoose.model('Admin');
  const directD = new Set(await db._getTLDirectDIds(String(tlId)));
  const subG   = new Set(await db._getTLSubGroupGIds(String(tlId)));
  const subTls = await Admin.find({ parentTlId: String(tlId), role:{$in:['NORMAL_ADMIN','normal_admin']} }).select('_id').lean();
  const subTlD = new Set();
  for (const tl of subTls) (await db._getTLDirectDIds(String(tl._id))).forEach(id => subTlD.add(id));
  const all = new Set([...directD, ...subG, ...subTlD]);
  return { directD, subG, subTlD, all,
    counts: { directD:directD.size, subG:subG.size, subTlD:subTlD.size, total: all.size } };
}
async function expectedGLEmployeeIds(groupIdOrTG) {
  const TeamGroup = mongoose.model('TeamGroup');
  const Employee = mongoose.model('Employee');
  let groupName = null, _idStr = String(groupIdOrTG);
  const tg = await TeamGroup.findById(groupIdOrTG).select('_id groupName').lean();
  if (tg) { groupName = tg.groupName; _idStr = String(tg._id); }
  const cond = { $or:[
    { teamGroupId: _idStr },
    ...(groupName ? [{ groupName }] : [])
  ]};
  const ids = new Set((await Employee.find(cond).select('employeeId').lean()).map(e=>e.employeeId));
  return { all: ids, counts:{ total: ids.size } };
}

// ================================================================
// 复刻「改造后的 users 接口」的 STEP1 集合判定逻辑（一字不差）
// ================================================================
async function newUsersInterface_SCOPE(role, {team, group}={}, adminId) {
  const Admin = mongoose.model('Admin');
  const Employee = mongoose.model('Employee');
  const TeamGroup = mongoose.model('TeamGroup');
  const Team = mongoose.model('Team');
  const isSuperAdmin = (role === 'superadmin');
  let currentAdmin = null;
  if (!isSuperAdmin) currentAdmin = await Admin.findById(adminId).select('_id username role teamGroupId teamName').lean();
  let targetEmployeeIds = null;
  const empMeta = new Map();
  if (group) {
    let tg = await TeamGroup.findById(group).select('_id groupName').lean();
    if (tg) {
      const cond = { $or:[{teamGroupId:tg._id.toString()},{teamGroupId:group},...(tg.groupName?[{groupName:tg.groupName}]:[])]};
      const emps = await Employee.find(cond).select('employeeId').lean();
      targetEmployeeIds = new Set();
      for (const e of emps) { targetEmployeeIds.add(e.employeeId); empMeta.set(e.employeeId, { isDirect:true, sourceKind:'glGroupG' }); }
    } else targetEmployeeIds = new Set();
  } else if (team) {
    const tlByTeam = await Admin.findOne({
      teamName: team, role:{$in:['NORMAL_ADMIN','normal_admin']},
      teamGroupId: {$in:[null,'',undefined]}
    }).select('_id').lean();
    if (tlByTeam) {
      const tlId = String(tlByTeam._id);
      targetEmployeeIds = new Set();
      const directD = await db._getTLDirectDIds(tlId);
      const subG    = await db._getTLSubGroupGIds(tlId);
      const subTls  = await Admin.find({parentTlId:tlId, role:{$in:['NORMAL_ADMIN','normal_admin']}}).select('_id').lean();
      const subTlD = [];
      for (const tl of subTls) subTlD.push(...(await db._getTLDirectDIds(String(tl._id))));
      directD.forEach(id => { targetEmployeeIds.add(id); empMeta.set(id, { isDirect: true,  sourceKind: 'directD' }); });
      subG.forEach(id    => { targetEmployeeIds.add(id); empMeta.set(id, { isDirect: false, sourceKind: 'subGroupG' }); });
      subTlD.forEach(id   => { targetEmployeeIds.add(id); empMeta.set(id, { isDirect: false, sourceKind: 'subTlDirectD' }); });
    } else {
      const targetTeam = await Team.findOne({ name: team });
      targetEmployeeIds = new Set();
      if (targetTeam) {
        const uids = targetTeam.members.map(m => String(m.userId));
        const emps = await Employee.find({ $or:[{ userId: { $in: uids }}, { employeeId: { $in: uids }}] }).select('employeeId').lean();
        emps.forEach(e => targetEmployeeIds.add(e.employeeId));
      }
    }
  } else if (!isSuperAdmin && currentAdmin) {
    if (currentAdmin.teamGroupId) {
      const tg = await TeamGroup.findById(currentAdmin.teamGroupId).select('_id groupName').lean();
      const cond = { $or:[
        { teamGroupId: tg?._id?.toString() || currentAdmin.teamGroupId },
        { teamGroupId: currentAdmin.teamGroupId },
        ...(tg?.groupName ? [{ groupName: tg.groupName }] : [])
      ]};
      const emps = await Employee.find(cond).select('employeeId').lean();
      targetEmployeeIds = new Set();
      for (const e of emps) { targetEmployeeIds.add(e.employeeId); empMeta.set(e.employeeId, { isDirect:true, sourceKind:'glGroupG' }); }
    } else if (currentAdmin.teamName) {
      const tlId = String(currentAdmin._id);
      targetEmployeeIds = new Set();
      const directD = await db._getTLDirectDIds(tlId);
      const subG    = await db._getTLSubGroupGIds(tlId);
      const subTls  = await Admin.find({parentTlId:tlId, role:{$in:['NORMAL_ADMIN','normal_admin']}}).select('_id').lean();
      const subTlD = [];
      for (const tl of subTls) subTlD.push(...(await db._getTLDirectDIds(String(tl._id))));
      directD.forEach(id => { targetEmployeeIds.add(id); empMeta.set(id, { isDirect: true,  sourceKind: 'directD' }); });
      subG.forEach(id    => { targetEmployeeIds.add(id); empMeta.set(id, { isDirect: false, sourceKind: 'subGroupG' }); });
      subTlD.forEach(id   => { targetEmployeeIds.add(id); empMeta.set(id, { isDirect: false, sourceKind: 'subTlDirectD' }); });
    }
  }
  // 打标统计
  let nDirect=0, nIndirect=0, nDirectD=0, nSubG=0, nSubTlD=0, nGL=0;
  for (const id of (targetEmployeeIds||new Set())) {
    const m = empMeta.get(id); if (!m) continue;
    if (m.isDirect) nDirect++; else nIndirect++;
    if (m.sourceKind==='directD') nDirectD++;
    else if (m.sourceKind==='subGroupG') nSubG++;
    else if (m.sourceKind==='subTlDirectD') nSubTlD++;
    else if (m.sourceKind==='glGroupG') nGL++;
  }
  return {
    targetSize: targetEmployeeIds ? targetEmployeeIds.size : 'ALL(SUPER)',
    empMeta,
    counts: { nDirect, nIndirect, nDirectD, nSubG, nSubTlD, nGL }
  };
}

(async () => {
  await mongoose.connect(MONGO, {});
  const Admin = mongoose.model('Admin');
  let allOK = true;

  // ================== 1) cuiding TL：team 参数分支 ==================
  console.log('\n─── 1. TL cuiding：前端传 team=鼎盛战队（团队长首页路径） ───');
  const cui = await Admin.findOne({ username:'cuiding' }).select('_id').lean();
  const cuiExpected = await expectedTLEmployeeIds(cui._id);
  const cuiNEWviaTeam = await newUsersInterface_SCOPE('TL', { team:'鼎盛战队' }, null);
  const viaTeamOK = cuiNEWviaTeam.targetSize === cuiExpected.counts.total;
  const viaTeamMetaOK = cuiNEWviaTeam.counts.nDirectD===cuiExpected.counts.directD
    && cuiNEWviaTeam.counts.nSubG===cuiExpected.counts.subG
    && cuiNEWviaTeam.counts.nSubTlD===cuiExpected.counts.subTlD;
  console.log('  权威集合 directD='+cuiExpected.counts.directD+' subG='+cuiExpected.counts.subG
    +' subTlD='+cuiExpected.counts.subTlD+' total='+cuiExpected.counts.total);
  console.log('  新接口集合 total='+cuiNEWviaTeam.targetSize
    +' directD='+cuiNEWviaTeam.counts.nDirectD+' subG='+cuiNEWviaTeam.counts.nSubG
    +' subTlD='+cuiNEWviaTeam.counts.nSubTlD
    +' isDirect true='+cuiNEWviaTeam.counts.nDirect+' false='+cuiNEWviaTeam.counts.nIndirect);
  console.log('  集合=' + (viaTeamOK?'✅':'❌ 大小错')
    +'，打标=' + (viaTeamMetaOK?'✅':'❌ 分类错'));
  if (!viaTeamOK) { allOK=false; console.log('    ❌ 预期size='+cuiExpected.counts.total+'，新接口='+cuiNEWviaTeam.targetSize); }
  assert.ok(viaTeamOK); assert.ok(viaTeamMetaOK);

  // ================== 2) cuiding TL：无参数后备分支 ==================
  console.log('\n─── 2. TL cuiding：无 team/group 参数（后备路径，自己账号点进） ───');
  const cuiNEWnoParam = await newUsersInterface_SCOPE('NORMAL_ADMIN', {}, cui._id);
  const noParamOK = cuiNEWnoParam.targetSize === cuiExpected.counts.total;
  const noMetaOK = cuiNEWnoParam.counts.nDirectD===cuiExpected.counts.directD
    && cuiNEWnoParam.counts.nSubG===cuiExpected.counts.subG
    && cuiNEWnoParam.counts.nSubTlD===cuiExpected.counts.subTlD;
  console.log('  新接口 total='+cuiNEWnoParam.targetSize
    +' directD='+cuiNEWnoParam.counts.nDirectD+' subG='+cuiNEWnoParam.counts.nSubG
    +' subTlD='+cuiNEWnoParam.counts.nSubTlD);
  console.log('  集合='+(noParamOK?'✅':'❌')+'，打标='+(noMetaOK?'✅':'❌'));
  if (!noParamOK) { allOK=false; console.log('    ❌ 预期size='+cuiExpected.counts.total+'，新接口='+cuiNEWnoParam.targetSize); }
  assert.ok(noParamOK); assert.ok(noMetaOK);

  // ================== 3) fanjie TL：无参数 ==================
  console.log('\n─── 3. TL fanjie（回归测试另一个团队长，P4 14%）无参数路径 ───');
  const fan = await Admin.findOne({ username:'fanjie', role:{$in:['NORMAL_ADMIN','normal_admin']} }).select('_id').lean();
  if (fan) {
    const fanExpected = await expectedTLEmployeeIds(fan._id);
    const fanNEW = await newUsersInterface_SCOPE('NORMAL_ADMIN', {}, fan._id);
    const fOK = fanNEW.targetSize === fanExpected.counts.total;
    const fMeta = fanNEW.counts.nDirectD===fanExpected.counts.directD
      && fanNEW.counts.nSubG===fanExpected.counts.subG
      && fanNEW.counts.nSubTlD===fanExpected.counts.subTlD;
    console.log('  权威 total='+fanExpected.counts.total
      +' directD='+fanExpected.counts.directD+' subG='+fanExpected.counts.subG+' subTlD='+fanExpected.counts.subTlD);
    console.log('  新接口 total='+fanNEW.targetSize
      +' directD='+fanNEW.counts.nDirectD+' subG='+fanNEW.counts.nSubG+' subTlD='+fanNEW.counts.nSubTlD);
    console.log('  集合='+(fOK?'✅':'❌')+'，打标='+(fMeta?'✅':'❌'));
    if (!fOK || !fMeta) allOK=false;
  } else console.log('  skip（fanjie无）');

  // ================== 4) GL 组长：找一个有 teamGroupId 的组长 ==================
  console.log('\n─── 4. GL 组长：找一个 teamGroupId 非空的组长（无参数路径） ───');
  const glAdmin = await Admin.findOne({ teamGroupId: { $exists:true, $nin:[null, ''] }})
    .select('_id username teamGroupId role').lean();
  if (glAdmin) {
    console.log('  抽样组长：'+glAdmin.username+' teamGroupId='+String(glAdmin.teamGroupId).slice(-8));
    const glExpected = await expectedGLEmployeeIds(glAdmin.teamGroupId);
    const glNEWnoParam = await newUsersInterface_SCOPE('groupLeader', {}, glAdmin._id);
    const sizeOK = glNEWnoParam.targetSize === glExpected.counts.total;
    const metaOK = glNEWnoParam.counts.nGL === glExpected.counts.total; // 全部都应为 glGroupG
    console.log('  权威自己组内G员工 = '+glExpected.counts.total);
    console.log('  新接口 total='+glNEWnoParam.targetSize
      +' 其中标 glGroupG = '+glNEWnoParam.counts.nGL
      +' isDirect true='+glNEWnoParam.counts.nDirect+' false='+glNEWnoParam.counts.nIndirect);
    console.log('  集合='+(sizeOK?'✅':'❌ 大小差 '+(glExpected.counts.total - glNEWnoParam.targetSize))
      +'，打标全是glGroupG且isDirect=true = '+(metaOK?'✅':'❌'));
    if (!sizeOK || !metaOK) allOK=false;
    // 额外验证 group 参数：传 group=teamGroupId 应该得到同一份名单
    const glNEWviaGroup = await newUsersInterface_SCOPE('groupLeader', { group: String(glAdmin.teamGroupId) }, null);
    const viaGroupOK = glNEWviaGroup.targetSize === glExpected.counts.total
      && glNEWviaGroup.counts.nGL === glExpected.counts.total;
    console.log('  通过 group 参数查询：集合'+(viaGroupOK?'✅':'❌')
      +'（total='+glNEWviaGroup.targetSize+' nGL='+glNEWviaGroup.counts.nGL+'）');
    if (!viaGroupOK) allOK=false;
  } else console.log('  skip（无符合的组长）');

  // ================== 5) 超管 SA：无参数应该是 ALL ==================
  console.log('\n─── 5. SA 超管：无参数应该返回 ALL（target=null 不限制） ───');
  const saNEW = await newUsersInterface_SCOPE('superadmin', {}, null);
  const saOK = saNEW.targetSize === 'ALL(SUPER)';
  console.log('  新接口 targetEmployeeIds = '+saNEW.targetSize+'，打标注入条数 (应0) = '+saNEW.empMeta.size);
  console.log('  SA不打标：empMeta.size 应为0 → ' + (saNEW.empMeta.size===0?'✅':'❌'));
  if (!saOK || saNEW.empMeta.size!==0) allOK=false;

  console.log('\n────────────────────────────────────────────');
  console.log(allOK? '✅ GREEN：TL（team参数+无参数+回归fanjie）/ GL（无参数+group参数）/ SA 全通过' : '❌ FAIL');
  process.exit(allOK?0:4);
})().catch(e => { console.error('ERR:', e.message || e); process.exit(1); });
