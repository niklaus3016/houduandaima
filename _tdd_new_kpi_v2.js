// ================================================================
// ✅ 新版 KPI 接口 TDD 断言（用户字段选择：A1+A2, B1+B2+B3, C2+C3+C4, D1+D2+D3）
// 账号：cuiding (TL P3=10%) + fanjie (TL P2=8%, parentTlId=cuiding)
// range = yesterday（北京时间昨日整天）
// 断言：2 账号 × 18 字段 = 36 项全部等于通过 Mongo 直查的期望值
// ================================================================
const mongoose = require('mongoose');
require('./models/Admin'); require('./models/Employee'); require('./models/TeamGroup');
require('./models/GoldLog'); require('./models/LoginRecord');
const MONGO = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
const assert = require('assert');
const dashboard = require('./routes/dashboard');
const { getBeijingDate, getBeijingStartOfDay } = require('./utils/date');
const TOL = 0.02; // 财务字段容差¥0.02

// ---------- 工具：计算 range=yesterday + 对比期 前天 时间范围（UTC） ----------
function rangesYesterday() {
  const bjNow = getBeijingDate();
  // 昨天北京整天 00:00:00 ~ 今天北京 00:00:00 → 转UTC
  const yStartBeijing = new Date(Date.UTC(bjNow.getUTCFullYear(), bjNow.getUTCMonth(), bjNow.getUTCDate()-1, 0,0,0));
  const yEndBeijing   = new Date(Date.UTC(bjNow.getUTCFullYear(), bjNow.getUTCMonth(), bjNow.getUTCDate(), 0,0,0));
  const start = new Date(yStartBeijing.getTime() - 8*3600*1000);
  const end   = new Date(yEndBeijing.getTime()   - 8*3600*1000);
  // 对比期 = 前天北京整天
  const pStartBeijing = new Date(Date.UTC(bjNow.getUTCFullYear(), bjNow.getUTCMonth(), bjNow.getUTCDate()-2, 0,0,0));
  const prevStart = new Date(pStartBeijing.getTime() - 8*3600*1000);
  const prevEnd   = start;
  return { start, end, prevStart, prevEnd };
}

// ---------- 工具：TL直推D员工ID列表（和verification.js getTeamLeaderPerformance口径一致） ----------
async function tLDirectDIds(tlId) {
  const groups = await mongoose.model('TeamGroup').find({ teamLeaderId: String(tlId) }).select('_id').lean();
  const subGroupIds = new Set(groups.map(g=>String(g._id)));
  const allChildren = await mongoose.model('Employee').find({ parentId: String(tlId) }).select('employeeId teamGroupId').lean();
  return allChildren
    .filter(e => { const gid = e.teamGroupId ? String(e.teamGroupId) : ''; return !gid || !subGroupIds.has(gid); })
    .map(e => e.employeeId).filter(Boolean);
}
// ---------- 工具：下属各组G员工ID列表（老存储兼容3条件OR） ----------
async function subGroupGIds(tlId) {
  const groups = await mongoose.model('TeamGroup').find({ teamLeaderId: String(tlId) }).select('_id groupLeaderId groupName').lean();
  const outIds = [];
  for (const g of groups) {
    const conds = [];
    if (g.groupName) conds.push({ groupName: g.groupName });
    conds.push({ teamGroupId: String(g._id) });
    if (g.groupLeaderId) conds.push({ teamGroupId: String(g.groupLeaderId) }); // 老存储
    const emps = await mongoose.model('Employee').find({ $or: conds }).select('employeeId').lean();
    emps.forEach(e => outIds.push(e.employeeId));
  }
  return outIds;
}
// ---------- 工具：直属下级TL们的直推D员工ID列表 ----------
async function subTLDirectDIds(tlId) {
  const subTls = await mongoose.model('Admin').find({ parentTlId: String(tlId), role:/NORMAL_ADMIN|normal_admin/i }).select('_id').lean();
  if (!subTls.length) return [];
  const subTlIds = subTls.map(t=>String(t._id));
  const subGroups = await mongoose.model('TeamGroup').find({ teamLeaderId: { $in: subTlIds } }).select('_id').lean();
  const subGroupIds = new Set(subGroups.map(g=>String(g._id)));
  const emps = await mongoose.model('Employee').find({ parentId: { $in: subTlIds } }).select('employeeId teamGroupId').lean();
  return emps
    .filter(e=>{ const gid = e.teamGroupId ? String(e.teamGroupId) : ''; return !gid || !subGroupIds.has(gid); })
    .map(e=>e.employeeId).filter(Boolean);
}
// ---------- GoldLog聚合（count / totalGold / totalCommissionGold按率表达式） ----------
async function glAgg(ids, s, e, rateExprForComm, tgLossyTLCommission = null) {
  if (!ids.length) return { count:0, totalGold:0, totalCommissionGold:0 };
  const group = { _id:null, count: { $sum:1 }, totalGold:{ $sum:'$gold' } };
  if (rateExprForComm) {
    group.totalCommissionGold = { $sum: { $multiply: [ '$gold', rateExprForComm ] } };
  } else if (tgLossyTLCommission != null) {
    group.totalCommissionGold = { $sum: { $multiply: [ '$gold', tgLossyTLCommission ] } };
  } else {
    group.totalCommissionGold = { $sum: 0 };
  }
  const rows = await mongoose.model('GoldLog').aggregate([
    { $match: { employeeId: { $in: ids }, createTime: { $gte: s, $lt: e } } },
    { $group: group }
  ]).exec();
  return rows[0] || { count:0, totalGold:0, totalCommissionGold:0 };
}
// ---------- 直推rate：verification.js dRateExpr逻辑（老D单commissionRate；新D单tlCommissionRate；兜底TL.commission） ----------
function dRateExpr(tlCommFallback) {
  const t = tlCommFallback || 0;
  return {
    $let: {
      vars: {
        hasD: { $and: [{ $gt:[{$ifNull:['$tlCommissionRate',0]},0] }, { $lte:[{$ifNull:['$tlCommissionRate',0]},1] }] },
        hasGl: { $and: [{ $gt:[{$ifNull:['$commissionRate',0]},0] }, { $lte:[{$ifNull:['$commissionRate',0]},1] }] }
      },
      in: { $cond: ['$$hasD', '$tlCommissionRate', { $cond: ['$$hasGl', '$commissionRate', t] } ] }
    }
  };
}
// ---------- PTL（间推）rate：ptlRateExpr→有固化值用固化值；老数据只有commissionRate→推断"直接管理者率-下游本级率"；都无则fallback级差 ----------
function ptlRateExpr(subOwnRate, fallback) {
  const s = Math.max(0, +subOwnRate || 0);
  const fb = Math.max(0, +fallback || 0);
  return {
    $let: {
      vars: {
        hasPt: { $and: [{ $gt:[{$ifNull:['$parentTlCommissionRate',0]},0] }, { $lte:[{$ifNull:['$parentTlCommissionRate',0]},1] }] },
        hasTl: { $and: [{ $gt:[{$ifNull:['$tlCommissionRate',0]},0] }, { $lte:[{$ifNull:['$tlCommissionRate',0]},1] }] },
        hasGl: { $and: [{ $gt:[{$ifNull:['$commissionRate',0]},0] }, { $lte:[{$ifNull:['$commissionRate',0]},1] }] },
        glVal: {$ifNull:['$commissionRate', 0]}
      },
      in: { $cond: [
        '$$hasPt', '$parentTlCommissionRate',
        { $cond: [
          '$$hasTl', '$tlCommissionRate',
          { $cond: [
            '$$hasGl',
            { $cond: [ { $gt:['$$glVal', s] }, { $subtract:['$$glVal', s] }, fb ] },
            fb
          ] }
        ] }
      ] }
    }
  };
}
// ---------- 活跃用户数：LoginRecord loginDate ∈ [s,e) + userId∈userIds集合去重 ----------
async function activeCount(empIds, s, e) {
  if (!empIds.length) return 0;
  const rows = await mongoose.model('LoginRecord').aggregate([
    { $match: { employeeId: { $in: empIds }, loginDate: { $gte:s, $lt:e } } },
    { $group: { _id: '$employeeId' } },
    { $count: 'c' }
  ]).exec();
  return rows[0]?.c || 0;
}
// ---------- 环比% ----------
function growth(cur, prev) {
  if (prev == null || prev === 0) return 0;
  return +(((cur - prev) / prev) * 100).toFixed(1);
}

// ---------- 工具：直属下级TL们（含commission率，支持每个subTL独立级差率） ----------
async function subTlList(tlId) {
  const rows = await mongoose.model('Admin').find({
    parentTlId: String(tlId), role:/NORMAL_ADMIN|normal_admin/i
  }).select('_id commission').lean();
  return rows.map(r => ({ adminId: String(r._id), rate: +r.commission || 0 }));
}
// ---------- 主流程：算期望值 + 断言computeNewKpi返回值 ----------
async function expectedForTL(adminIdStr, { start, end, prevStart, prevEnd }) {
  const Admin = mongoose.model('Admin');
  const a = await Admin.findById(adminIdStr).select('_id username commission').lean();
  if (!a) throw new Error('admin not found: '+adminIdStr);
  const tlComm = +(a.commission || 0);

  // 员工ID集合
  const directD = await tLDirectDIds(a._id);                    // 直推D
  const groupG  = await subGroupGIds(a._id);                    // 下属组长G
  const subTls  = await subTlList(a._id);                       // 下属TL（含率）
  const subTlDEmpMap = {}; // subTlId -> D员工Ids
  let subTlDAll = [];
  for (const t of subTls) {
    const dids = await tLDirectDIds(t.adminId);
    subTlDEmpMap[t.adminId] = dids;
    subTlDAll = subTlDAll.concat(dids);
  }
  const indirectEmpIds = Array.from(new Set([...groupG, ...subTlDAll]));

  // 总数 / 活跃数
  const directTotal = directD.length;
  const indirectTotal = indirectEmpIds.length;
  const directActiveCur   = await activeCount(directD, start, end);
  const indirectActiveCur = await activeCount(indirectEmpIds, start, end);
  const directActiveRatePct = directTotal>0 ? +(((directActiveCur/directTotal)*100).toFixed(1)) : 0;
  const indirectActiveRatePct = indirectTotal>0 ? +(((indirectActiveCur/indirectTotal)*100).toFixed(1)) : 0;

  // 下属组长G员工 级差率 expr：subOwnRate=0.06 fallback=tlComm-0.06
  const gRateCur = ptlRateExpr(0.06, Math.max(0, tlComm - 0.06));
  // 聚合（本期 + 对比期）
  const rDirect    = await glAgg(directD, start, end, dRateExpr(tlComm));
  const rGroupCur  = await glAgg(groupG,  start, end, gRateCur);
  const rGroupPrev = await glAgg(groupG,  prevStart, prevEnd, ptlRateExpr(0.06, Math.max(0, tlComm - 0.06)));
  const rDirectPrev = await glAgg(directD, prevStart, prevEnd, dRateExpr(tlComm));
  // 下属TL D员工：逐个subTL聚合
  let rSubTlCur  = { count:0, totalGold:0, totalCommissionGold:0 };
  let rSubTlPrev = { count:0, totalGold:0, totalCommissionGold:0 };
  for (const t of subTls) {
    const ids = subTlDEmpMap[t.adminId];
    const fb = Math.max(0, tlComm - t.rate); // 级差兜底
    const c  = await glAgg(ids, start, end, ptlRateExpr(t.rate, fb));
    const p  = await glAgg(ids, prevStart, prevEnd, ptlRateExpr(t.rate, fb));
    rSubTlCur.count += (+c.count||0);            rSubTlCur.totalGold += (+c.totalGold||0);            rSubTlCur.totalCommissionGold += (+c.totalCommissionGold||0);
    rSubTlPrev.count += (+p.count||0);           rSubTlPrev.totalGold += (+p.totalGold||0);           rSubTlPrev.totalCommissionGold += (+p.totalCommissionGold||0);
  }
  const rIndirect = {
    count: rGroupCur.count + rSubTlCur.count,
    totalGold: (+rGroupCur.totalGold ||0) + (+rSubTlCur.totalGold ||0),
    totalCommissionGold: (+rGroupCur.totalCommissionGold||0) + (+rSubTlCur.totalCommissionGold||0)
  };
  const rIndirectPrev = {
    totalGold: (+rGroupPrev.totalGold||0) + (+rSubTlPrev.totalGold||0),
    totalCommissionGold: (+rGroupPrev.totalCommissionGold||0) + (+rSubTlPrev.totalCommissionGold||0)
  };

  const curRev    = (+rDirect.totalGold+rIndirect.totalGold)/1000;
  const prevRev   = (+rDirectPrev.totalGold+rIndirectPrev.totalGold)/1000;
  const curComm   = (+rDirect.totalCommissionGold + rIndirect.totalCommissionGold)/1000;
  const prevComm  = (+rDirectPrev.totalCommissionGold + rIndirectPrev.totalCommissionGold)/1000;

  return {
    // ========= A1：直推4字段 + 间推3字段（A3不要=去掉direct/indirect AvgGoldPerImp平均金币） =========
    directRevenue:       +(rDirect.totalGold / 1000).toFixed(2),
    directCommission:    +(rDirect.totalCommissionGold / 1000).toFixed(2),
    directImpressions:   +rDirect.count || 0,
    // A3 不要 → 删 directAvgGoldPerImp
    indirectRevenue:     +(rIndirect.totalGold / 1000).toFixed(2),
    indirectCommission:  +(rIndirect.totalCommissionGold / 1000).toFixed(2),
    indirectImpressions: +rIndirect.count || 0,
    // A3 不要 → 删 indirectAvgGoldPerImp
    // ========= A2：汇总2字段 =========
    teamRevenue:         +curRev.toFixed(2),
    teamCommission:      +curComm.toFixed(2),
    // ========= B1-B3：直推管理3字段（B4~B6不要） =========
    directUserCount:     directTotal,
    directActiveUsers:   directActiveCur,
    directActiveRate:    directActiveRatePct,
    // ========= C2-C4：间推管理3字段（C1不要，C5~C8不要） =========
    indirectUserCount:   indirectTotal,
    indirectActiveUsers: indirectActiveCur,
    indirectActiveRate:  indirectActiveRatePct,
    // ========= D1-D3：环比3字段（D4=indirectRevenueGrowth 不要） =========
    teamRevenueGrowth:   growth(curRev, prevRev),
    teamCommissionGrowth:growth(curComm, prevComm),
    directRevenueGrowth: growth(+(rDirect.totalGold/1000), +(rDirectPrev.totalGold/1000)),
  };
}

(async () => {
  await mongoose.connect(MONGO);
  const cui = await mongoose.model('Admin').findOne({ username:'cuiding' }).select('_id').lean();
  const fj  = await mongoose.model('Admin').findOne({ username:'fanjie'  }).select('_id').lean();
  const R = rangesYesterday();
  const expect = {
    cuiding: await expectedForTL(cui._id.toString(), R),
    fanjie:  await expectedForTL(fj._id.toString(), R)
  };
  console.log('================ EXPECTED VALUES (直查Mongo) ================');
  console.log('cuiding:', JSON.stringify(expect.cuiding, null, 2));
  console.log('fanjie :', JSON.stringify(expect.fanjie,  null, 2));
  console.log('\n================ 🔴 断言 computeNewKpi（空壳，必失败） ================');

  let actual_cui = null, actual_fj = null;
  try {
    actual_cui = await dashboard.computeNewKpi({ kind: 'TL', adminId: cui._id.toString() }, 'yesterday');
    actual_fj  = await dashboard.computeNewKpi({ kind: 'TL', adminId: fj._id.toString()  }, 'yesterday');
  } catch (e) { console.error('调用抛出异常', e); process.exit(1); }

  console.log('actual cuiding:', JSON.stringify(actual_cui, null, 2));
  console.log('actual fanjie :', JSON.stringify(actual_fj,  null, 2));

  // 断言：财务字段用接近比较；其余字段 strict equal
  let passN = 0, totalN = 0;
  const FAILS = [];
  const TOTAL_EXPECTED = 34; // 2 账号 × 17 业务字段
  for (const [name, exp] of Object.entries(expect)) {
    const act = name === 'cuiding' ? actual_cui : actual_fj;
    for (const k of Object.keys(exp)) {
      totalN++;
      try {
        if (/(Revenue|Commission|AvgGold|Rate|Growth)$/i.test(k)) {
          const e = +exp[k] || 0; const a = +act?.[k] ?? undefined;
          if (Math.abs(e - a) > TOL) throw new Error(`💰 ${name}.${k} 期望¥${e} 实际¥${a} 差¥${(e-a).toFixed(3)} > 容差¥${TOL}`);
        } else if (/Count|Users|Impressions$/.test(k)) {
          assert.strictEqual(+act?.[k] ?? undefined, exp[k], `📊 ${name}.${k} 类型错误，期望int=${exp[k]} 实际${act?.[k]}`);
        } else {
          assert.deepStrictEqual(act?.[k], exp[k], `🔑 ${name}.${k} 不一致：期望${JSON.stringify(exp[k])} 实际${JSON.stringify(act?.[k])}`);
        }
        passN++;
      } catch (err) { FAILS.push(err.message); }
    }
  }
  console.log(`\n🏁 KPI 接口 GREEN 结果: ${passN}/${totalN} 通过（期望 ${TOTAL_EXPECTED}/${TOTAL_EXPECTED}）`);
  FAILS.forEach((f,i)=>console.log(`  ❌ #${i+1}: ${f}`));
  if (FAILS.length === 0 && totalN === TOTAL_EXPECTED) {
    console.log('\n✅ KPI 接口 TDD 全绿 → 可交付');
    process.exit(0);
  } else {
    console.log(`\n❌ 仍有 ${FAILS.length} 项失败或字段总数 ${totalN}≠${TOTAL_EXPECTED}`);
    process.exit(1);
  }
})().catch(e=>{console.error(e);process.exit(1)});
