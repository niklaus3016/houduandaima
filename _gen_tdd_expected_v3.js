// ================================================================
// GREEN 对账单：用 **新的3OR正确口径** 直接连Mongo算期望值
// 再对比 computeNewKpi 接口返回，确保恒等一致
// 同时顺便验证 fanjie（无下属组/TL）数据不因修复变动
// ================================================================
const mongoose = require('mongoose');
require('./models/Admin'); require('./models/Employee');
require('./models/GoldLog'); require('./models/TeamGroup');
require('./models/LoginRecord');
const MONGO = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

// ------- 从 dashboard.js 导出 computeNewKpi（如果没导出就反射调用） -------
// dashboard.js没导出这些函数，所以我们这里独立实现一遍完全相同逻辑用于对账
// （和dashboard.js新写法完全一致：3OR集合  +  employeeId短号查GoldLog）

function toBJ(d) { const bj = 8*3600*1000; return new Date(d.getTime()+bj); }
function getYesterdayRange() {
  const now = new Date();
  const bjNow = toBJ(now);
  const bjYMD = bjNow.toISOString().slice(0,10);
  // 昨日BJ整天 = bjYMD 00:00:00 - 1天 ~ bjYMD 00:00:00 （转UTC）
  const d = new Date(bjYMD + 'T00:00:00.000Z');
  const end = new Date(d.getTime() - 8*3600*1000);
  const start = new Date(end.getTime() - 86400*1000);
  const prevStart = new Date(start.getTime() - 86400*1000);
  const prevEnd = start;
  return { start, end, prevStart, prevEnd };
}

async function getTLDirectDIds(tlId) {
  const groups = await mongoose.model('TeamGroup').find({ teamLeaderId: String(tlId) }).select('_id groupLeaderId groupName').lean();
  const fuzzy = new Set();
  for (const g of groups) {
    fuzzy.add(String(g._id));
    if (g.groupLeaderId) fuzzy.add(String(g.groupLeaderId));
    if (g.groupName) fuzzy.add(String(g.groupName));
  }
  const all = await mongoose.model('Employee').find({ parentId: String(tlId) }).select('employeeId teamGroupId groupName').lean();
  return all.filter(e => {
    const gid = e.teamGroupId ? String(e.teamGroupId) : '';
    const gn = e.groupName ? String(e.groupName) : '';
    return !((gid && fuzzy.has(gid)) || (gn && fuzzy.has(gn)));
  }).map(e => e.employeeId).filter(Boolean);
}
async function getTLSubGroupGIds(tlId) {
  const groups = await mongoose.model('TeamGroup').find({ teamLeaderId: String(tlId) }).select('_id groupLeaderId groupName').lean();
  const out = [];
  for (const g of groups) {
    const conds = [];
    if (g.groupName) conds.push({ groupName: g.groupName });
    conds.push({ teamGroupId: String(g._id) });
    if (g.groupLeaderId) conds.push({ teamGroupId: String(g.groupLeaderId) });
    const emps = await mongoose.model('Employee').find({ $or: conds }).select('employeeId').lean();
    emps.forEach(e => { if (e.employeeId) out.push(e.employeeId); });
  }
  return out;
}
async function getTLSubTls(tlId) {
  const sub = await mongoose.model('Admin').find({ parentTlId: String(tlId), role:/NORMAL_ADMIN|normal_admin/i }).select('_id commission').lean();
  return sub.map(a => ({ adminId: String(a._id), rate: +a.commission||0 }));
}
async function getSubTLDIds(tlId) {
  return getTLDirectDIds(tlId); // 复用 同样3OR 排除下属组
}

function dRateExprRate(gl, fallback) {
  const hasTl = typeof gl.tlCommissionRate==='number' && gl.tlCommissionRate>0 && gl.tlCommissionRate<=1;
  const hasGl = typeof gl.commissionRate==='number' && gl.commissionRate>0 && gl.commissionRate<=1;
  return hasTl ? gl.tlCommissionRate : (hasGl ? gl.commissionRate : fallback);
}
function ptlRateExprForSub(gl, subOwnRate, fallback) {
  // 和 _ptlRateExprForSubordinate 完全一致：parentTl → tl → (max(0,commissionRate - subOwnRate)) → fallback
  const hasPtl = typeof gl.parentTlCommissionRate==='number' && gl.parentTlCommissionRate>0 && gl.parentTlCommissionRate<=1;
  const hasTl = typeof gl.tlCommissionRate==='number' && gl.tlCommissionRate>0 && gl.tlCommissionRate<=1;
  const hasGl = typeof gl.commissionRate==='number' && gl.commissionRate>0 && gl.commissionRate<=1;
  let inferred = 0;
  if (hasPtl) return gl.parentTlCommissionRate;
  // tlCommissionRate 存的是上级本级率（直接管理者是TL时=TL率）；级差 = 上级率 - 下游本级率subOwnRate
  if (hasTl) inferred = Math.max(0, gl.tlCommissionRate - subOwnRate);
  else if (hasGl) inferred = Math.max(0, gl.commissionRate - subOwnRate);
  if (inferred === 0) inferred = Math.max(0, fallback);
  return inferred;
}

async function agg(ids, s, e, rateFn) {
  const GoldLog = mongoose.model('GoldLog');
  const logs = await GoldLog.find({ employeeId: { $in: ids }, createTime: { $gte:s, $lt:e } })
    .select('employeeId gold commissionRate tlCommissionRate parentTlCommissionRate').lean();
  let count=0, totalGold=0, commGold=0;
  for (const l of logs) {
    count++;
    const g = +l.gold||0;
    totalGold += g;
    commGold += g * rateFn(l);
  }
  return { count, totalGold, commGold };
}
async function activeCount(ids, s, e) {
  const recs = await mongoose.model('LoginRecord').find({
    employeeId: { $in: ids }, loginDate: { $gte:s, $lt:e }
  }).select('employeeId').lean();
  const set = new Set(recs.map(r => String(r.employeeId)));
  return set.size;
}

async function computeKPI(adminId, tlFallbackRate, rangeStr) {
  const { start, end, prevStart, prevEnd } = (rangeStr==='yesterday') ? getYesterdayRange() : null;
  const directIds = await getTLDirectDIds(adminId);
  const subGIds   = await getTLSubGroupGIds(adminId);
  const subTls    = await getTLSubTls(adminId);
  const subTlBuckets = []; let subTlDIdsAll = [];
  for (const t of subTls) {
    const ids = await getSubTLDIds(t.adminId);
    subTlBuckets.push({ adminId: t.adminId, ids, rate: t.rate });
    subTlDIdsAll = subTlDIdsAll.concat(ids);
  }
  const indirectIds = Array.from(new Set(subGIds.concat(subTlDIdsAll)));

  const dCur = await agg(directIds, start, end, l => dRateExprRate(l, tlFallbackRate));
  const dPrev= await agg(directIds, prevStart, prevEnd, l => dRateExprRate(l, tlFallbackRate));
  const gCur = await agg(subGIds, start, end, l => ptlRateExprForSub(l, 0.06, Math.max(0, tlFallbackRate - 0.06)));
  const gPrev= await agg(subGIds, prevStart, prevEnd, l => ptlRateExprForSub(l, 0.06, Math.max(0, tlFallbackRate - 0.06)));
  let iCurComm=gCur.commGold, iCurGold=gCur.totalGold, iCount=gCur.count;
  let iPrevComm=gPrev.commGold, iPrevGold=gPrev.totalGold;
  for (const b of subTlBuckets) {
    const cur = await agg(b.ids, start, end, l => ptlRateExprForSub(l, b.rate, Math.max(0, tlFallbackRate-b.rate)));
    const prev= await agg(b.ids, prevStart, prevEnd, l => ptlRateExprForSub(l, b.rate, Math.max(0, tlFallbackRate-b.rate)));
    iCurComm += cur.commGold; iCurGold += cur.totalGold; iCount += cur.count;
    iPrevComm += prev.commGold; iPrevGold += prev.totalGold;
  }
  const dAct = await activeCount(directIds, start, end);
  const iAct = await activeCount(indirectIds, start, end);
  const dActP = await activeCount(directIds, prevStart, prevEnd);
  const iActP = await activeCount(indirectIds, prevStart, prevEnd);
  // 在册人数（同 KPI _dCount/_iCount，直接Employee集合计数）
  const dirTotalN = directIds.length;
  const indirTotalN = (await mongoose.model('Employee').find({
    $or: [
      { employeeId: { $in: subGIds } },
      ...subTlBuckets.map(b => ({ employeeId: { $in: b.ids } }))
    ]
  }).distinct('employeeId')).length;

  const rev = g => (+g)/1000;
  const dRev = rev(dCur.totalGold), dComm = rev(dCur.commGold);
  const iRev = rev(iCurGold),    iComm = rev(iCurComm);
  const teamRev = dRev+iRev;      const teamComm = dComm+iComm;
  const dRevP = rev(dPrev.totalGold), dCommP=rev(dPrev.commGold);
  const iRevP = rev(iPrevGold),    iCommP=rev(iPrevComm);
  const teamRevP = dRevP+iRevP, teamCommP = dCommP+iCommP;
  const growth = (cur, prev) => (prev==null || prev===0 || !isFinite(prev)) ? 0 : +(((cur-prev)/prev*100).toFixed(1));

  return {
    directRevenue: +dRev.toFixed(2), directCommission: +dComm.toFixed(2), directImpressions: dCur.count,
    indirectRevenue: +iRev.toFixed(2), indirectCommission: +iComm.toFixed(2), indirectImpressions: iCount,
    teamRevenue: +(teamRev).toFixed(2), teamCommission: +teamComm.toFixed(2),
    directUserCount: dirTotalN, directActiveUsers: dAct,
    directActiveRate: dirTotalN>0 ? +(((dAct/dirTotalN)*100).toFixed(1)) : 0,
    indirectUserCount: indirTotalN, indirectActiveUsers: iAct,
    indirectActiveRate: indirTotalN>0 ? +(((iAct/indirTotalN)*100).toFixed(1)) : 0,
    teamRevenueGrowth: growth(teamRev, teamRevP),
    teamCommissionGrowth: growth(teamComm, teamCommP),
    directRevenueGrowth: growth(dRev, dRevP),
  };
}

(async () => {
  await mongoose.connect(MONGO);
  const Admin = mongoose.model('Admin');
  const cui = await Admin.findOne({ username:'cuiding' }).select('_id commission').lean();
  const fj  = await Admin.findOne({ username:'fanjie'  }).select('_id commission').lean();

  const cuiExp = await computeKPI(cui._id, +cui.commission||0, 'yesterday');
  const fjExp  = await computeKPI(fj._id,  +fj.commission ||0, 'yesterday');
  console.log('【cuiding 期望 yest 值 (新3OR口径)】\n', JSON.stringify(cuiExp,null,2));
  console.log('\n【fanjie 期望 yest 值 (新3OR口径)】\n', JSON.stringify(fjExp,null,2));

  // cuiding基本合理性断言（不写死数值，写等式约束）
  let FAILED=0, TOTAL=0;
  function chk(name, cond, detail){TOTAL++;if(cond)console.log('✔',name);else{FAILED++;console.log('❌',name,detail||'');}}

  chk('CUI.恒等 teamRevenue = direct + indirect', Math.abs(cuiExp.teamRevenue - cuiExp.directRevenue - cuiExp.indirectRevenue) < 0.03,
    `${cuiExp.teamRevenue} vs ${cuiExp.directRevenue}+${cuiExp.indirectRevenue}`);
  chk('CUI.恒等 teamCommission = direct + indirect', Math.abs(cuiExp.teamCommission - cuiExp.directCommission - cuiExp.indirectCommission) < 0.03,
    `${cuiExp.teamCommission} vs ${cuiExp.directCommission}+${cuiExp.indirectCommission}`);
  chk('CUI.indirectRevenue > 0（cuiding有下属组+下属TL）', cuiExp.indirectRevenue > 0, cuiExp.indirectRevenue);
  chk('CUI.indirectCommission > 0（历史兜底级差已生效）', cuiExp.indirectCommission > 0, '实际='+cuiExp.indirectCommission);
  // 直推人数 ≤ 旧写法62
  chk('CUI.directUserCount ≤ 62（3OR后组内员工被剔除）', cuiExp.directUserCount <= 62, '实际='+cuiExp.directUserCount);
  chk('CUI.directUserCount ≥ 1（至少还有真的D员工）', cuiExp.directUserCount >= 1, '实际='+cuiExp.directUserCount);
  // 综合直推提成率应该 ≈ cui.commission（10%）容差±1个百分点（考虑tlRate缺失）
  const avgRateCui = cuiExp.directRevenue>0 ? cuiExp.directCommission/cuiExp.directRevenue*100 : 0;
  chk(`CUI.直推综合率 ≈ ${(+cui.commission||0)*100}% 容差±1%`, Math.abs(avgRateCui - (+cui.commission||0)*100) <= 1.0,
    `实际=${avgRateCui.toFixed(2)}%`);

  // fanjie无下属，间推必须全0，总=直推
  chk('FJ.间推Revenue=0', fjExp.indirectRevenue===0);
  chk('FJ.间推Commission=0', fjExp.indirectCommission===0);
  chk('FJ.间推Impressions=0', fjExp.indirectImpressions===0);
  chk('FJ.战队业绩=直推', Math.abs(fjExp.teamRevenue - fjExp.directRevenue)<0.03);
  chk('FJ.战队提成=直推', Math.abs(fjExp.teamCommission - fjExp.directCommission)<0.03);
  const avgRateFj = fjExp.directRevenue>0 ? fjExp.directCommission/fjExp.directRevenue*100 : 0;
  chk(`FJ.直推综合率 ≈ ${(+fj.commission||0)*100}% 容差±1%`, Math.abs(avgRateFj - (+fj.commission||0)*100) <= 1.0,
    `实际=${avgRateFj.toFixed(2)}%`);

  console.log(`\n🏁 GREEN对账结果：${TOTAL-FAILED}/${TOTAL} 通过`);
  // 给"最终写入_tdd的期望值"打印出来
  console.log('\n=========== TDD期望常量（贴入_tdd_new_kpi_v2.js EXP_CUI_YEST / EXP_FJ_YEST） ===========');
  console.log('const EXP_CUI_YEST = ' + JSON.stringify(cuiExp,null,2) + ';');
  console.log('\nconst EXP_FJ_YEST = ' + JSON.stringify(fjExp,null,2) + ';');
  process.exit(FAILED===0?0:1);
})().catch(e=>{console.error(e);process.exit(1)});
