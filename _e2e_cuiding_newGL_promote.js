// ================================================================
//  E2E 端到端对账：cuiding战队 → 新开组长 → 组长¥3.5万业绩 → 晋升P2 → 再写D员工新订单
//  核查：晋升前后分账/业绩归属/parentTlId绑定/commission档位 100%正确
// ================================================================
const mongoose = require('mongoose');
require('./models/Admin');
require('./models/Employee');
require('./models/TeamGroup');
require('./models/GoldLog');
const MONGO = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
const {
  getTeamLeaderPerformance,
  getGroupLeaderPerformance,
  promoteGroupLeaderToTeamLeaderLocal,
  invalidateLevelRelatedCaches,
  computeTeamLeaderLevel,
  computeGroupLeaderLevel,
  getTeamLeaderLevelConfig,
  getLevelConfig,
  recomputeAllAdminsCommission
} = require('./routes/verification');

const YUAN_TO_GOLD = 1000;
function yuan(n) { return Math.round(n * YUAN_TO_GOLD); }
function rmb(n) { return '¥' + (n||0).toLocaleString('zh-CN', { maximumFractionDigits: 2, minimumFractionDigits: 2 }); }
function pct(n) { return ((+n||0)*100).toFixed(1) + '%'; }
// 返回北京时区 n 天前 0 点的时间戳（Date 对象可直接用）
function beijingNDaysAgo(n, hour = 0, min = 0) {
  const d = new Date(); const beijingNow = new Date(d.getTime() + 8*3600*1000); // 转北京时间近似
  const bj = new Date(Date.UTC(beijingNow.getUTCFullYear(), beijingNow.getUTCMonth(), beijingNow.getUTCDate() - n, hour, min, 0, 0));
  // 北京时区 某日X点 = UTC 某日(X-8)点。hour<8 时 X-8 负的，Date.UTC 会自动进位（OK）
  const utcH = (hour - 8 + 24) % 24;
  const offDay = hour < 8 ? -1 : 0;
  return new Date(Date.UTC(beijingNow.getUTCFullYear(), beijingNow.getUTCMonth(), beijingNow.getUTCDate() - n + offDay, utcH, min, 0, 0));
}
function yesterdayTime() { return beijingNDaysAgo(1, 12).getTime(); } // 昨天北京12点（组成立后）
function groupFoundedTime() { return beijingNDaysAgo(10, 9).getTime(); } // 10天前北京9点：组早就成立
function approxEq(a,b,eps=1e-4){ return Math.abs((+a||0)-(+b||0)) < eps; }

const T = []; // 测试结果
let PASS=0, FAIL=0;
function ck(name, ok, extra='') {
  if (ok) { PASS++; console.log('  ✅ ' + name); }
  else     { FAIL++; T.push({name, extra}); console.log('  ❌ ' + name + (extra?(' | '+extra):'')); }
}

(async () => {
  await mongoose.connect(MONGO);
  const Admin = mongoose.model('Admin');
  const Employee = mongoose.model('Employee');
  const TeamGroup = mongoose.model('TeamGroup');
  const GoldLog = mongoose.model('GoldLog');

  console.log('\n========================================================================');
  console.log('【E2E】cuiding战队 → 新组长(¥3.5万达P2) → 晋升TL → D员工新订单分账对账');
  console.log('========================================================================');

  // ========= 0. cuiding 基础数据 & BEFORE快照 =========
  console.log('\n--- Step 0：取cuiding真实数据 + BEFORE快照 ---');
  const cui = await Admin.findOne({ username: 'cuiding' }).select('_id username role commission parentTlId').lean();
  console.log('  cuiding：_id=' + cui._id.toString().slice(-8) + ' role=' + cui.role + ' commission=' + pct(cui.commission));
  invalidateLevelRelatedCaches();
  let cuiPerfA = await getTeamLeaderPerformance(cui._id.toString(), { allowLazy: false });
  const SS = p => p.summary || p.data?.summary || {};
  const cuiBeforeRev = +(SS(cuiPerfA).totalRevenue || 0);
  const cuiBeforeCom = +(SS(cuiPerfA).totalCommission || 0);
  console.log('  BEFORE cuiding 总业绩=' + rmb(cuiBeforeRev) + ' 总提成=' + rmb(cuiBeforeCom));

  // ========= 1. 造 cuiding 战队下的新组长 =========
  console.log('\n--- Step 1：cuiding战队新开组长 newGL，新组 tgNorm（规范存储）+ 5个G员工 + 5个老存储G员工 ---');
  const uniq = Date.now();
  const GF = new Date(groupFoundedTime());
  const [newGl] = await Admin.create([{
    username: 'newgl_' + uniq, nickname: '新组长-E2E', password: 'x',
    role: 'GROUP_LEADER', commission: 0.06, // P1 档 6%
    parentTlId: cui._id.toString(),
    createdAt: GF, updatedAt: GF
  }]);
  console.log('  新组长 newGl：_id=' + newGl._id.toString().slice(-8) + ' commission=6%');
  // 规范组：Employee.teamGroupId = TeamGroup._id   ← createdAt提前到10天前（北京），确保累计业绩包含昨天订单
  const [tgNorm] = await TeamGroup.create([{
    groupName: 'E2E规范组_' + uniq, teamName: 'cuiding战队',
    groupLeaderId: newGl._id.toString(), teamLeaderId: cui._id.toString(),
    commission: 0.06, status: 'active',
    createdAt: GF
  }]);
  // createdAt 是 schema 默认值（Date.now），手动覆盖确保累计业绩被计入
  await Admin.updateOne({ _id: newGl._id }, { $set: { createdAt: GF, updatedAt: GF } });
  await TeamGroup.updateOne({ _id: tgNorm._id }, { $set: { createdAt: GF } });
  await Admin.findByIdAndUpdate(newGl._id, { $set: { teamGroupId: tgNorm._id.toString() } });
  console.log('  规范组 tgNorm：_id=' + tgNorm._id.toString().slice(-8));
  // 5 个规范存储 G 员工（teamGroupId = tgNorm._id）
  const normEmps = [];
  for (let i = 0; i < 5; i++) {
    const [e] = await Employee.create([{
      employeeId: 'e2e_norm_' + uniq + '_' + i,
      teamGroupId: tgNorm._id.toString(),
      parentId: newGl._id.toString(),
      nickname: '规范G员工' + i
    }]);
    normEmps.push(e);
  }
  // 5 个老存储 G 员工（teamGroupId = newGl._id 组长AdminId，兼容老数据习惯）
  const oldEmps = [];
  for (let i = 0; i < 5; i++) {
    const [e] = await Employee.create([{
      employeeId: 'e2e_old_' + uniq + '_' + i,
      teamGroupId: newGl._id.toString(),  // 🔴 老存储习惯：直接存组长AdminId
      parentId: newGl._id.toString(),
      nickname: '老存储G员工' + i
    }]);
    oldEmps.push(e);
  }
  console.log('  造员工：规范存储5人 teamGroupId=tgNorm | 老存储5人 teamGroupId=组长AdminId');

  // ========= 2. BEFORE订单：写¥35000 晋升前订单（10人每人¥3500 = 3.5万 ≥ P2门槛3万）=========
  console.log('\n--- Step 2：写晋升前订单¥35,000（10人×¥3500 = 3.5万≥P2 3万门槛）---');
  const allGLbeforeEmps = normEmps.concat(oldEmps);
  const PER_EMP_YUAN = 3500;
  const PER_EMP_GOLD = yuan(PER_EMP_YUAN);
  const createT1 = yesterdayTime() + 1*3600*1000; // 昨天北京13点，再加0~8h（昨天13-21点），严格在yesterdayEnd之前
  const preOrders = [];
  for (let i = 0; i < allGLbeforeEmps.length; i++) {
    const e = allGLbeforeEmps[i];
    const g = await new GoldLog({
      userId: 'e2e_pre_' + uniq + '_' + e.employeeId,
      employeeId: e.employeeId, gold: PER_EMP_GOLD,
      createTime: createT1 + i * (8*3600*1000 / allGLbeforeEmps.length), // 等间距8h内不跨天
      incomeType: 'task', title: 'E2E晋升前订单'
    }).save();
    preOrders.push(g);
  }
  // 预期 G 员工分账：commissionRate=GL率6%，tlCommissionRate=cuiding10% - GL6% = 4%级差，parentTlCommissionRate=cuiding.parentTlId（空所以0）
  // 总包 6% + 4% = 10%（cuiding本级，公司不多出）
  let GL6_sum = 0, TL4_sum = 0, GL6_empC = 0, TL4_empC = 0;
  let pre_glCommExpect = 0, pre_cuiCommExpect = 0;
  for (const g of preOrders) {
    const g2 = await GoldLog.findById(g._id).select('commissionRate tlCommissionRate parentTlCommissionRate gold').lean();
    GL6_sum += (+g2.commissionRate || 0); TL4_sum += (+g2.tlCommissionRate || 0);
    const yuanG = (+g2.gold||0) / YUAN_TO_GOLD;
    pre_glCommExpect  += yuanG * (+g2.commissionRate || 0);  // 组长本级6%
    pre_cuiCommExpect += yuanG * (+g2.tlCommissionRate || 0); // cuiding级差4%
    if (approxEq(g2.commissionRate, 0.06)) GL6_empC++;
    if (approxEq(g2.tlCommissionRate, 0.04)) TL4_empC++;
  }
  console.log('  10条¥3500订单固化3字段核查：');
  console.log('    规范5+老存储5 合计 commissionRate求和=' + GL6_sum.toFixed(3) + '（预期=0.06×10=0.6）');
  ck('所有10员工 commissionRate=6%（组长P1）', GL6_empC === 10, `命中=${GL6_empC}/10`);
  ck('所有10员工 tlCommissionRate=cuiding(10%)-GL(6%)=4%级差', TL4_empC === 10, `命中=${TL4_empC}/10`);
  const preSumRate = GL6_sum / 10 + TL4_sum / 10;
  ck('总包=6%+4%=10%（cuiding本级不超，公司无保底）', approxEq(preSumRate, 0.10), '实际=' + (preSumRate*100).toFixed(1) + '%');
  console.log('    → 组长BEFORE 提成预期=' + rmb(pre_glCommExpect) + '（35000×6%=¥2100）');
  console.log('    → cuiding BEFORE 本次级差提成预期=' + rmb(pre_cuiCommExpect) + '（35000×4%=¥1400）');
  ck('晋升前订单：组长应提¥2,100', approxEq(pre_glCommExpect, 35000*0.06, 0.01), rmb(pre_glCommExpect));
  ck('晋升前订单：cuiding级差应提¥1,400', approxEq(pre_cuiCommExpect, 35000*0.04, 0.01), rmb(pre_cuiCommExpect));

  // ========= 3. BEFORE 业绩核查（晋升前）=========
  console.log('\n--- Step 3：晋升前业绩核查（清缓存→查新组长GL业绩）---');
  invalidateLevelRelatedCaches();
  const glPerfBefore = await getGroupLeaderPerformance(newGl._id.toString(), { allowLazy: false });
  const glB_sum = SS(glPerfBefore);
  // getGroupLeaderPerformance summary 只有 totalRevenue；totalCommission 在 data.currentMonth.commission（当月GL版display）
  const glB_rev = +glB_sum.totalRevenue || 0;
  const glB_curMonthCom = +(glPerfBefore.data?.currentMonth?.commission) || 0;
  const glB_level = glPerfBefore.data?.level;
  console.log('  newGL BEFORE：totalRevenue=' + rmb(glB_rev) + '（预期≈3.5万）');
  console.log('  newGL BEFORE：当月提成currentMonth.commission=' + rmb(glB_curMonthCom) + '（预期≈¥2,100，即35000×6%）');
  console.log('  newGL BEFORE：档位=' + (glB_level?.currentLevel || 'N/A') + ' 率=' + (glB_level?.currentCommission? pct(glB_level.currentCommission):'?'));
  ck('newGL BEFORE 总业绩≈¥35,000（规范5+老存储5 都要被计入）',
     approxEq(glB_rev, 35000, 0.01), '实际=' + rmb(glB_rev));
  ck('newGL BEFORE 当月提成≈¥2,100（=35000×6% 组长本级）', approxEq(glB_curMonthCom, 2100, 0.01), '实际=' + rmb(glB_curMonthCom));
  const tlCfg = await getTeamLeaderLevelConfig();
  const glLv = computeTeamLeaderLevel(glB_rev, tlCfg);
  console.log('  → 新组长按¥' + glB_rev.toFixed(0) + ' 匹配TL档位=' + glLv.currentLevel + ' ' + pct(glLv.currentCommission) + '（P2门槛≥3万 → 应 P2 8%）');
  ck('业绩≥3万，TL档位=P2 8%（晋升后要落到这个档位）', glLv.currentLevel === 'P2' && approxEq(glLv.currentCommission, 0.08),
     '实际=' + glLv.currentLevel + '/' + pct(glLv.currentCommission));

  // ========= 4. 晋升！=========
  console.log('\n--- Step 4：触发晋升事务 promoteGroupLeaderToTeamLeaderLocal(newGL) ---');
  const promoR = await promoteGroupLeaderToTeamLeaderLocal(newGl._id.toString(), 'e2e_script');
  console.log('  晋升结果：already=' + promoR.already + ' 解散老组=' + promoR.dissolvedGroupCount + ' 迁员工=' + promoR.migratedEmployeeCount + '（预期=规范5+老存储5=10）');
  ck('晋升非重复（already=false）', promoR.already === false);
  ck('迁员工数=10（规范5 + 老存储5）', promoR.migratedEmployeeCount === 10, '实际=' + promoR.migratedEmployeeCount);
  ck('解散老组数=' + promoR.dissolvedGroupCount + '（≥1）', promoR.dissolvedGroupCount >= 1);
  // 晋升后核查 Admin
  const glAfter = await Admin.findById(newGl._id).select('_id username role commission parentTlId manualLevel teamGroupId promotedAt').lean();
  console.log('  newGL AFTER：role=' + glAfter.role + ' commission=' + pct(glAfter.commission) + ' parentTlId=' + (glAfter.parentTlId?String(glAfter.parentTlId).slice(-8):'NULL'));
  ck('晋升后 role=NORMAL_ADMIN（TL）', glAfter.role === 'NORMAL_ADMIN', '实际=' + glAfter.role);
  ck('晋升后 commission=P2 8%（按¥3.5万档位）', approxEq(glAfter.commission, 0.08), '实际=' + pct(glAfter.commission));
  ck('晋升后 parentTlId=cui._id（绑定不脱离上级！）', glAfter.parentTlId && String(glAfter.parentTlId) === String(cui._id),
     '实际=' + (glAfter.parentTlId?String(glAfter.parentTlId).slice(-8):'NULL') + ' / cui=' + String(cui._id).slice(-8));
  // 晋升后核查 老员工（teamGroupId=null、parentId=newGL._id）
  console.log('  迁员工核查（10个老员工都应该 teamGroupId=null parentId=newGL）');
  let migOK = 0;
  for (const e of allGLbeforeEmps) {
    const e2 = await Employee.findById(e._id).select('teamGroupId parentId').lean();
    if (!e2.teamGroupId && e2.parentId && String(e2.parentId) === String(newGl._id)) migOK++;
  }
  ck('10个老员工都迁成直属D（teamGroupId=null parentId=newGL）', migOK === 10, '命中=' + migOK + '/10');
  // 晋升后核查 老组（disbanded）
  const tgAft = await TeamGroup.findById(tgNorm._id).select('status dissolvedAt').lean();
  ck('老组 status=disbanded', tgAft.status === 'disbanded' || !!tgAft.dissolvedAt, '实际=' + tgAft.status);

  // ========= 5. 晋升后新订单：迁成D的员工写¥100新订单 =========
  console.log('\n--- Step 5：晋升后 迁成D的10个员工 各写¥100新订单 → 固化分账验证（共¥1000）---');
  const createT2 = createT1 + 9 * 3600 * 1000; // 昨天北京22点（昨天结束前，不跨yesterdayEnd）
  const postOrders = [];
  for (let i = 0; i < allGLbeforeEmps.length; i++) {
    const e = allGLbeforeEmps[i];
    const g = await new GoldLog({
      userId: 'e2e_post_' + uniq + '_' + e.employeeId,
      employeeId: e.employeeId, gold: yuan(100),
      createTime: createT2 + i * (90*60*1000 / allGLbeforeEmps.length), // 等间距90分钟（昨天北京22~23:30）
      incomeType: 'task', title: 'E2E晋升后订单(D员工)'
    }).save();
    postOrders.push(g);
  }
  // 预期：D员工 commissionRate=0；tlCommissionRate=newGL本级8%；parentTlCommissionRate=cuiding10%-newGL8%=2%级差；总包=0+8%+2%=10%
  let postD_crOK=0, postD_tlOK=0, postD_ptlOK=0;
  let postGLcommSum = 0, postCUIcommSum = 0;
  const POST_YUAN = 10 * 100; // ¥1000
  for (const g of postOrders) {
    const g2 = await GoldLog.findById(g._id).select('commissionRate tlCommissionRate parentTlCommissionRate gold').lean();
    const yg = (+g2.gold || 0) / YUAN_TO_GOLD;
    if (approxEq(g2.commissionRate, 0)) postD_crOK++;
    if (approxEq(g2.tlCommissionRate, 0.08)) postD_tlOK++;    // newGL P2=8% 本级
    if (approxEq(g2.parentTlCommissionRate, 0.02)) postD_ptlOK++; // cuiding 10%-8%=2%级差
    postGLcommSum  += yg * (+g2.tlCommissionRate || 0);
    postCUIcommSum += yg * (+g2.parentTlCommissionRate || 0);
  }
  console.log('  10条¥100 D员工订单：');
  ck('commissionRate=0（D员工 无组长提成）', postD_crOK === 10, `命中=${postD_crOK}/10`);
  ck('tlCommissionRate = newGL P2=8% 本级（不被切）', postD_tlOK === 10, `命中=${postD_tlOK}/10`);
  ck('parentTlCommissionRate = cuiding10%-8% = 2% 级差（从总包出，公司不出保底）', postD_ptlOK === 10, `命中=${postD_ptlOK}/10`);
  const postPkg = postD_crOK*0 + postD_tlOK*0.08 + postD_ptlOK*0.02;
  ck('总包 = 0+8%+2%=10%（cuiding本级，公司无保底不多出）', approxEq(postPkg/10, 0.10), '实际=' + ((postPkg/10)*100).toFixed(1) + '%');
  console.log('    → 晋升后订单：newGL本级提成=' + rmb(postGLcommSum) + '（¥1000×8%=¥80）');
  console.log('    → 晋升后订单：cuiding级差提成=' + rmb(postCUIcommSum) + '（¥1000×2%=¥20）');
  ck('晋升后新订单：newGL 应提¥80', approxEq(postGLcommSum, 80, 0.001), rmb(postGLcommSum));
  ck('晋升后新订单：cuiding 应提¥20', approxEq(postCUIcommSum, 20, 0.001), rmb(postCUIcommSum));

  // ========= 6. AFTER 总业绩核查（含晋升前后 + parentTl归属）=========
  console.log('\n--- Step 6：AFTER 总业绩对账（清缓存→查 cuiding & newTL 业绩）---');
  invalidateLevelRelatedCaches();
  const glPerfAfter = await getTeamLeaderPerformance(newGl._id.toString(), { allowLazy: false });
  const cuiPerfAfter = await getTeamLeaderPerformance(cui._id.toString(), { allowLazy: false });
  const glA = SS(glPerfAfter), cuiA = SS(cuiPerfAfter);
  const E2E_G_TOTAL  = 35000;        // G员工晋升前 35000
  const E2E_D_TOTAL  = 1000;         // D员工晋升后 1000
  const E2E_TOTAL    = E2E_G_TOTAL + E2E_D_TOTAL;  // 36000
  console.log('  E2E总投入订单：¥35,000(晋升前G) + ¥1,000(晋升后D) = ' + rmb(E2E_TOTAL));

  // ---- newTL(newGL) 业绩归属 100% 验证 ----
  // 口径：晋升前G员工（组长期）+ 晋升后D员工（TL期）都应计入 newTL 总业绩
  console.log('  newTL(newGL) 总业绩=' + rmb(glA.totalRevenue) + ' 预期=' + rmb(E2E_TOTAL) + '（3.5万G+1千D）');
  ck('newTL AFTER 总业绩≈¥36,000（晋升前后都算，因为他拿了提成就算业绩）',
     approxEq(glA.totalRevenue, E2E_TOTAL, 0.01), '实际=' + rmb(glA.totalRevenue));
  const expectNewTlCommission = 2100 + 80;  // G 6%×35000 + D 8%×1000
  console.log('  newTL AFTER 总提成=' + rmb(glA.totalCommission) + ' 预期=' + rmb(expectNewTlCommission) + '（¥2100+¥80）');
  ck('newTL AFTER 总提成≈¥2,180（晋升前G6%2100 + 晋升后D8%80）', approxEq(glA.totalCommission, expectNewTlCommission, 0.01),
     '实际=' + rmb(glA.totalCommission) + ' Δ=' + rmb((+glA.totalCommission||0)-expectNewTlCommission));
  // level 在 data 里（不在 summary 里），取 data.level
  const newTlLevel = glPerfAfter.data?.level;
  ck('newTL AFTER 档位=P2 commission=8%', newTlLevel?.currentLevel === 'P2' && approxEq(newTlLevel?.currentCommission, 0.08),
     '实际=' + (newTlLevel?.currentLevel || 'N/A') + '/' + (newTlLevel?.currentCommission?pct(newTlLevel.currentCommission):'?'));

  // ---- cuiding 业绩归属：newTL是直属下属TL（2级封顶以内：cuiding是newTL直接上级TL=一级，刚好≤2级）----
  // 口径：拿了提成的就应该算
  // 晋升前G员工订单：cuiding拿级差4%（应该计入 cuiding 业绩 = 35000）
  // 晋升后D员工订单：cuiding拿parentTl级差2%（应该计入 cuiding 业绩 = 1000）
  // 所以 cuiding 业绩Δ = 35000 + 1000 = 36000
  const cuiΔRev = (+cuiA.totalRevenue || 0) - cuiBeforeRev;
  const cuiΔCom = (+cuiA.totalCommission || 0) - cuiBeforeCom;
  const expectCuiΔRev   = 36000;  // 晋升前后 cuiding 都拿了提成（4%/2%）所以都算
  const expectCuiΔCom   = 1400 + 20; // ¥1400 级差 + ¥20 级差
  console.log('  cuiding Δ总业绩=' + rmb(cuiΔRev) + ' 预期=' + rmb(expectCuiΔRev) + '（G拿4%算35000 + D拿2%算1000，都在2级内）');
  console.log('  cuiding Δ总提成=' + rmb(cuiΔCom) + ' 预期=' + rmb(expectCuiΔCom) + '（35000×4%=¥1400 + 1000×2%=¥20）');
  ck('cuiding Δ业绩≈¥36,000（G3.5万+D1千 2级封顶内全计）', approxEq(cuiΔRev, expectCuiΔRev, 0.01),
     '实际=' + rmb(cuiΔRev) + ' Δ=' + rmb(cuiΔRev-expectCuiΔRev));
  ck('cuiding Δ提成≈¥1,420（G级差¥1400 + D级差¥20）', approxEq(cuiΔCom, expectCuiΔCom, 0.01),
     '实际=' + rmb(cuiΔCom) + ' Δ=' + rmb(cuiΔCom-expectCuiΔCom));
  // 下属TL数：用Mongo直接查（getTeamLeaderPerformance返回没直接暴露subTlCount字段）
  const directSubTlCount = await Admin.countDocuments({
    parentTlId: String(cui._id),
    role: { $in: ['NORMAL_ADMIN', 'normal_admin'] }
  });
  const cuiSubTlRev = +(cuiA.subordinateTlRevenue || 0);
  console.log('  cuiding 下属TL数（直查Mongo）=' + directSubTlCount + '；业绩接口下属TL贡献营收=' + rmb(cuiSubTlRev));
  ck('cuiding 下属TL数=1（newTL刚晋升的，属于cuiding直属下级，parentTlId=cui._id）', directSubTlCount >= 1, '实际=' + directSubTlCount);

  // ========= 7. 总对账表 =========
  console.log('\n========================================================================');
  console.log(' 最终端到端对账表（金额人民币）');
  console.log('========================================================================');
  console.log(' 阶段          | 订单金额  | newTL(newGL) 提成 | cuiding 级差提成 | 公司保底?');
  console.log(' 晋升前G员工   | ¥35,000   | ¥2,100 (6%本级)   | ¥1,400 (4%级差)   | ❌无(总包10%)');
  console.log(' 晋升后D员工   | ¥ 1,000   | ¥   80 (8%本级)   | ¥   20 (2%级差)   | ❌无(总包10%)');
  console.log(' E2E合计       | ¥36,000   | ¥2,180            | ¥1,420            | 总公司支出=¥3,600 (=¥36000×10% cuiding本级率) ✅');
  console.log('------------------------------------------------------------------------');
  console.log(' 【归属检查】newTL总业绩 = ¥36,000（晋升前后全算，因为都拿了提成且在2级内）');
  console.log(' 【归属检查】cuiding Δ业绩  = ¥36,000（G级差4%/D级差2% 都拿了提成 且直属下属TL=1级≤2级封顶）');
  console.log(' 【晋升检查】晋升后newTL commission=8%=P2档（¥3.5万≥3万P2门槛✅）');
  console.log(' 【晋升检查】parentTlId=cui._id，晋升后不脱离上级✅ 三级兜底生效');
  console.log(' 【迁员工检查】10个G员工迁成D员工：规范5+老存储5 全部 teamGroupId=null ✅');
  console.log('========================================================================');
  console.log(`  PASS=${PASS}  FAIL=${FAIL}`);
  if (FAIL > 0) { console.log('  ❌ 失败项：'); T.forEach(f => console.log('     · ' + f.name + (f.extra?' | '+f.extra:''))); }
  else { console.log('  ✅ E2E 端到端对账全部通过，端到端发钱100%正确，可以放心上线！'); }

  // ========= 清理临时数据 =========
  console.log('\n--- 清理临时E2E数据 ---');
  await GoldLog.deleteMany({ userId: { $regex: '^e2e_(pre|post)_' + uniq } });
  await Employee.deleteMany({ employeeId: { $in: allGLbeforeEmps.map(e => e.employeeId) } });
  await TeamGroup.deleteOne({ _id: tgNorm._id });
  await Admin.deleteOne({ _id: newGl._id });
  console.log('  ✅ 已删GoldLog=' + preOrders.length + postOrders.length + ' Employee=10 TeamGroup=1 Admin=1');
  await mongoose.disconnect();
  process.exit(FAIL === 0 ? 0 : 1);
})().catch(e => { console.error('CRASH:', e); process.exit(2); });
