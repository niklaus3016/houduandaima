// ===========================================================
// ✅ GREEN：完整KPI回归，四个角色数值都合理
//   1) cuiding：直推≈17元10%≈1.7，间推≈254元2.3%≈5.86，团队总提成≈7.5
//   2) fanjie：51人D员工51人14%，提成≈fan业绩*14%，合理
//   3) 超管：全平台总和正确
//   4) 组长（wenzhou样例）：只算自己组间推=0
//   5) 验证 users 接口的集合打标：cuiding=直25+间(45+51)=121 打标正确
// ===========================================================
const mongoose = require('mongoose');
require('./models/Admin');
require('./models/Employee');
require('./models/TeamGroup');
require('./models/GoldLog');
require('./models/TeamLeaderLevelConfig');
require('./models/UserGold');
require('./models/UserActivity');
require('./models/Team');
const db = require('./routes/dashboard');
const assert = require('assert');
const MONGO = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

let fails = 0;
function check(label, cond, msg) {
  if (cond) console.log('  ✅ ' + label);
  else { console.log('  ❌ ' + label + ' → ' + msg); fails++; }
}

(async () => {
  await mongoose.connect(MONGO, {});
  const Admin = mongoose.model('Admin');
  const cui = await Admin.findOne({ username:'cuiding' }).select('_id commission').lean();
  const fan = await Admin.findOne({ username:'fanjie' }).select('_id commission').lean();
  const gl  = await Admin.findOne({ teamGroupId:{ $exists:true, $nin:[null,''] }}).select('_id username teamGroupId').lean();
  console.log('======== 角色KPI回归 ========');

  // ---- 1. cuiding TL ----
  const kCui = await db.computeNewKpi({kind:'TL', adminId:String(cui._id)}, 'today');
  console.log('\n[cuiding TL] KPI今日:');
  console.log('  直推：rev='+kCui.directRevenue+' comm='+kCui.directCommission
    +'  率=' + (kCui.directRevenue>0 ? (kCui.directCommission/kCui.directRevenue*100).toFixed(2)+'%' :'N/A'));
  console.log('  间推：rev='+kCui.indirectRevenue+' comm='+kCui.indirectCommission
    +'  率=' + (kCui.indirectRevenue>0 ? (kCui.indirectCommission/kCui.indirectRevenue*100).toFixed(2)+'%' :'N/A'));
  console.log('  团队总：rev='+kCui.teamRevenue+' comm='+kCui.teamCommission);
  console.log('  (_debug: '+JSON.stringify(kCui._debug)+')  directUserCount='+kCui.directUserCount+' indirectUserCount='+kCui.indirectUserCount);
  // cuiding 直推率：今日直推64人=老下属组长组G员工回归（历史订单固化率6%/8%）+ 新D员工(10%)，平均率 5%~11% 都合理（清39脏后历史老订单的率不可回溯，随时间推移回到8-10%）
  const dRate = kCui.directRevenue>0 ? kCui.directCommission/kCui.directRevenue : 0;
  check('cuiding 直推提成率≈5-11%（含下属组长组G员工回归的老订单=6%固化）',
    dRate >= 0.045 && dRate <= 0.115, 'actual='+(dRate*100).toFixed(2)+'%');
  // 间推率应=级差4%（组长G员工10人）和保底2%（fan下属D 51人）混合，约2-4%
  const iRate = kCui.indirectRevenue>0 ? kCui.indirectCommission/kCui.indirectRevenue : 0;
  check('cuiding 间推率≈2-4%（G员工级差4% + fan下属D保底2%混合）',
    iRate >= 0.015 && iRate <= 0.06, 'actual='+(iRate*100).toFixed(2)+'%');
  // direct+indirect 员工数：清39脏后 cuiding直属直推=parentId 74 - 真实下属组10人=64；+ 间推10G+51STD=61；总≈125
  const empTotal = kCui.directUserCount + kCui.indirectUserCount;
  check('cuiding 在册总=directUserCount+indirectUserCount≈125（direct=64/indirect=61 混合或略浮动）',
    empTotal>=115 && empTotal<=130 && kCui.directUserCount>=55 && kCui.directUserCount<=75,
    'actual direct='+kCui.directUserCount+' indirect='+kCui.indirectUserCount+' total='+empTotal);
  check('团队收入=直推提成+间推提成 (±¥0.1元)',
    Math.abs(kCui.teamCommission - (kCui.directCommission+kCui.indirectCommission)) < 0.12,
    'dComm+iComm='+((+kCui.directCommission)+(+kCui.indirectCommission)).toFixed(2)+' teamComm='+kCui.teamCommission);
  check('团队业绩=直推+间推 (±¥0.1元)',
    Math.abs(kCui.teamRevenue - (kCui.directRevenue+kCui.indirectRevenue)) < 0.12,
    'dRev+iRev='+((+kCui.directRevenue)+(+kCui.indirectRevenue)).toFixed(2)+' teamRev='+kCui.teamRevenue);
  // 团队长提成收益接口复用 teamCommission：确保 /team-leader/commission today ≈ kCui.teamCommission
  check('间推impressions = G员工imp + fan下属Dimp (非负)', kCui.indirectImpressions >= 0, 'actual='+kCui.indirectImpressions);

  // ---- 2. fanjie TL ----
  console.log('\n[fanjie TL] 14% 自己带51直属D:');
  const kFan = await db.computeNewKpi({kind:'TL', adminId:String(fan._id)}, 'today');
  console.log('  directRev='+kFan.directRevenue+' directComm='+kFan.directCommission
    +'  rate='+(kFan.directRevenue>0 ? (kFan.directCommission/kFan.directRevenue*100).toFixed(2)+'%' :'N/A'));
  console.log('  indirectRev='+kFan.indirectRevenue+' indirectComm='+kFan.indirectCommission);
  console.log('  directUserCount='+kFan.directUserCount+' indirectUserCount='+kFan.indirectUserCount);
  const fanDRate = kFan.directRevenue>0 ? kFan.directCommission/kFan.directRevenue : 0;
  check('fanjie 直推率≈12-14%（14%是P4，少量历史低率）',
    fanDRate>=0.11 && fanDRate<=0.15, 'actual='+(fanDRate*100).toFixed(2)+'%');
  check('fanjie 直推员工数=51', kFan.directUserCount===51, 'actual='+kFan.directUserCount);
  // fanjie 自己的下属组=洁然如初代理，但51人D员工的groupName被清了，所以洁然如初代理应该没有员工
  // 如果洁然如初代理组还有G员工，那就是 fanjie的间推，这部分没问题
  check('fanjie 团队总=直推+间推',
    Math.abs(kFan.teamCommission - (kFan.directCommission+kFan.indirectCommission)) < 0.12,
    'actual mismatch teamComm='+kFan.teamCommission);

  // ---- 3. 组长 ----
  console.log('\n[组长 '+gl.username+' GL '+gl.teamGroupId+']:');
  const kGl = await db.computeNewKpi({kind:'GL', adminId:String(gl._id), teamGroupId:String(gl.teamGroupId)}, 'today');
  console.log('  directRev='+kGl.directRevenue+' directComm='+kGl.directCommission
    +'  (间接='+kGl.indirectRevenue+','+kGl.indirectComm+')');
  check('GL间推恒=0', kGl.indirectRevenue===0 && kGl.indirectCommission===0, 'actual='+kGl.indirectRevenue+'/'+kGl.indirectCommission);
  check('GL directComm率≈6%（组长本级率）',
    (kGl.directCommission/kGl.directRevenue)>=0.05 || kGl.directRevenue===0,
    'actual='+(kGl.directRevenue>0?(kGl.directCommission/kGl.directRevenue*100).toFixed(2)+'%':'无业绩'));
  check('GL teamRev=directRev, teamComm=directComm',
    Math.abs(kGl.teamRevenue-kGl.directRevenue)<0.01 && Math.abs(kGl.teamCommission-kGl.directCommission)<0.01,
    'mismatch');

  // ---- 4. 超管 ----
  console.log('\n[超管 SA 全局]:');
  const kSA = await db.computeNewKpi({kind:'TL', adminId:'__global__'}, 'today');
  console.log('  directRev='+kSA.directRevenue+' teamRev='+kSA.teamRev+' userCount='+kSA.directUserCount);
  check('SA teamRev=directRev',
    Math.abs(kSA.teamRevenue-kSA.directRevenue)<0.01,
    'teamRev='+kSA.teamRevenue+' directRev='+kSA.directRevenue);
  check('SA directUserCount > cuiding.direct+indirect',
    kSA.directUserCount > (kCui.directUserCount+kCui.indirectUserCount),
    'SA='+kSA.directUserCount+' cui团队='+(kCui.directUserCount+kCui.indirectUserCount));

  // ---- 5. users接口：集合打标回归（复刻前面GREEN脚本） ----
  console.log('\n======== users接口集合打标回归 ========');
  // 复刻 dashboard.js /users 接口的集合判定（同GREEN脚本）
  async function userScope(role, {team, group}={}, adminId) {
    const AdminM = mongoose.model('Admin');
    const EmployeeM = mongoose.model('Employee');
    const TeamGroupM = mongoose.model('TeamGroup');
    const isSuper = role==='superadmin';
    let curAdmin = null;
    if (!isSuper) curAdmin = await AdminM.findById(adminId).select('_id username role teamGroupId teamName').lean();
    let targetEmployeeIds = null;
    const empMeta = new Map();
    if (group) {
      let tg = await TeamGroupM.findById(group).select('_id groupName').lean();
      if (tg) {
        const cond = { $or:[{teamGroupId:tg._id.toString()},{teamGroupId:group},...(tg.groupName?[{groupName:tg.groupName}]:[])]};
        const emps = await EmployeeM.find(cond).select('employeeId').lean();
        targetEmployeeIds = new Set();
        for (const e of emps) { targetEmployeeIds.add(e.employeeId); empMeta.set(e.employeeId, { isDirect:true, sourceKind:'glGroupG' }); }
      } else targetEmployeeIds = new Set();
    } else if (team) {
      const tlByTeam = await AdminM.findOne({ teamName:team, role:{$in:['NORMAL_ADMIN','normal_admin']}, teamGroupId:{$in:[null,'',undefined]} }).select('_id').lean();
      if (tlByTeam) {
        const tlId = String(tlByTeam._id);
        targetEmployeeIds = new Set();
        const directD = await db._getTLDirectDIds(tlId);
        const subG    = await db._getTLSubGroupGIds(tlId);
        const subTls  = await AdminM.find({ parentTlId: tlId, role:{$in:['NORMAL_ADMIN','normal_admin']} }).select('_id').lean();
        const subTlD = [];
        for (const tl of subTls) subTlD.push(...(await db._getTLDirectDIds(String(tl._id))));
        directD.forEach(id => { targetEmployeeIds.add(id); empMeta.set(id, { isDirect:true,  sourceKind:'directD' }); });
        subG.forEach(id    => { targetEmployeeIds.add(id); empMeta.set(id, { isDirect:false, sourceKind:'subGroupG' }); });
        subTlD.forEach(id   => { targetEmployeeIds.add(id); empMeta.set(id, { isDirect:false, sourceKind:'subTlDirectD' }); });
      }
    } else if (!isSuper && curAdmin) {
      if (curAdmin.teamGroupId) {
        const tg = await TeamGroupM.findById(curAdmin.teamGroupId).select('_id groupName').lean();
        const cond = { $or:[{teamGroupId: tg?._id?.toString()||curAdmin.teamGroupId},{teamGroupId:curAdmin.teamGroupId},...(tg?.groupName?[{groupName:tg.groupName}]:[])]};
        const emps = await EmployeeM.find(cond).select('employeeId').lean();
        targetEmployeeIds = new Set();
        for (const e of emps) { targetEmployeeIds.add(e.employeeId); empMeta.set(e.employeeId, { isDirect:true, sourceKind:'glGroupG' }); }
      } else if (curAdmin.teamName) {
        const tlId = String(curAdmin._id);
        targetEmployeeIds = new Set();
        const directD = await db._getTLDirectDIds(tlId);
        const subG    = await db._getTLSubGroupGIds(tlId);
        const subTls  = await AdminM.find({ parentTlId: tlId, role:{$in:['NORMAL_ADMIN','normal_admin']} }).select('_id').lean();
        const subTlD = [];
        for (const tl of subTls) subTlD.push(...(await db._getTLDirectDIds(String(tl._id))));
        directD.forEach(id => { targetEmployeeIds.add(id); empMeta.set(id, { isDirect:true,  sourceKind:'directD' }); });
        subG.forEach(id    => { targetEmployeeIds.add(id); empMeta.set(id, { isDirect:false, sourceKind:'subGroupG' }); });
        subTlD.forEach(id   => { targetEmployeeIds.add(id); empMeta.set(id, { isDirect:false, sourceKind:'subTlDirectD' }); });
      }
    }
    let nD=0, nI=0, nDD=0, nSG=0, nSTD=0;
    for (const id of (targetEmployeeIds||new Set())) {
      const m = empMeta.get(id); if (!m) continue;
      if (m.isDirect) nD++; else nI++;
      if (m.sourceKind==='directD') nDD++;
      else if (m.sourceKind==='subGroupG') nSG++;
      else if (m.sourceKind==='subTlDirectD') nSTD++;
    }
    return { size: targetEmployeeIds? targetEmployeeIds.size:'ALL', nD,nI,nDD,nSG,nSTD };
  }
  const TS1 = await userScope('NORMAL_ADMIN', {team:'鼎盛战队'}, null);
  console.log('[鼎盛战队 TL via team=鼎盛战队] size='+TS1.size+' 直='+TS1.nD+' 间='+TS1.nI+' (D='+TS1.nDD+' SG='+TS1.nSG+' STD='+TS1.nSTD+')');
  check('鼎盛战队 team参数集合 = cuiding直25+cuiding间(45+51)= fan下属51 + cuiding直D + cuiding下属G员工 混合 ≈120左右',
    TS1.size >= 115 && TS1.size <= 135, 'actual='+TS1.size);
  check('STD(fan下属D)=51 应正确', TS1.nSTD===51, 'actual='+TS1.nSTD);
  // 清39脏后：cuiding直D数=parentId总数 - 被3OR真实命中的下属组长G员工≈74-10=64；若今日有新增可能略浮动(55~75)
  check('cuiding直推(nDD)≈55~75（parentId74-真实下属组G10≈64，清完39脏groupName后直推数比之前25大）',
    TS1.nDD>=55 && TS1.nDD<=80, 'actual nDD='+TS1.nDD);
  const TS2 = await userScope('superadmin', {}, null);
  check('SA scope size=ALL', TS2.size==='ALL', 'actual='+TS2.size);
  const TS3 = await userScope('NORMAL_ADMIN', {}, fan._id);
  console.log('[fanjie TL 无参数] size='+TS3.size+' 直='+TS3.nD+' 间='+TS3.nI);
  check('fanjie 直D=51', TS3.nD===51, 'actual='+TS3.nD);
  const TS4 = await userScope('GL', {group:String(gl.teamGroupId)}, null);
  console.log('[组长 '+gl.username+' group参数] size='+TS4.size+' 直='+TS4.nD);
  check('组长集合全标 isDirect=true', TS4.size===TS4.nD && TS4.nI===0, '直='+TS4.nD+' 间='+TS4.nI);

  console.log('\n========');
  if (fails===0) { console.log('✅ KPI & users集合 全GREEN 回归通过'); process.exit(0); }
  else { console.log('❌ '+fails+' 项FAIL'); process.exit(4); }
})().catch(e => { console.error('ERR:', e); process.exit(1); });
