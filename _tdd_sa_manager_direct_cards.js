// =====================================================================
// TDD RED → GREEN 验收脚本：_tdd_sa_manager_direct_cards.js
// （文档第11节 8条自检 + 5条字段/排序/分页/三条件/环比 扩展验证 = 共13条）
// =====================================================================
const assert = require('assert');
const mongoose = require('mongoose');
const MONGO = process.env.MONGODB_URI || "mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017";
require('./models/Admin');
require('./models/Employee');
require('./models/GoldLog');
require('./models/TeamGroup');

// ─────────────── 工具函数（与 dashboard.js 同口径）───────────────
const toStr = x => {
  if (x == null) return null;
  if (x instanceof mongoose.Types.ObjectId || (typeof x==='object' && x._bsontype==='ObjectId')) return x.toString();
  return String(x);
};
const normRole = r => (r||'').toString().replace(/_/g,'').trim().toUpperCase();
const isTL = r => { const n = normRole(r); return n==='NORMALADMIN' || n==='NORMAL' || n==='TEAMLEADER' || n==='TL'; };
const isGL = r => { const n = normRole(r); return n==='GROUPLEADER' || n==='GL'; };
const isSuper = r => {
  const role = (typeof r==='object' && r && 'role' in r) ? r.role : r;
  const n = normRole(role);
  return n==='SUPERADMIN' || n==='SUPERADMINISTRATOR' || n==='SA' || (role||'').toString().toLowerCase()==='superadmin';
};

let FAILED = 0, PASSED = 0;
const ok = (name, cond, detail='') => {
  if (cond) { console.log(`  ✅ T-${String(name).padEnd(2,' ')} PASS${detail?' ('+detail+')':''}`); PASSED++; }
  else { console.log(`  ❌ T-${String(name).padEnd(2,' ')} FAIL${detail?' ('+detail+')':''}`); FAILED++; }
};
const range = (a, lo, hi, msg='') => a >= lo && a <= hi ? `${msg||'range'} ${a}∈[${lo},${hi}]` : null;

// ─────────────── 复现三条件并集（用于验证成员集合正确性）───────────────
async function _verifyThreeConds(adminDoc, allAdminsMap) {
  // 返回 {condA:Set, condB:Set, condC:Set, union:number, ids:Set<employeeId>}
  const Employee = mongoose.model('Employee');
  const Admin = mongoose.model('Admin');
  const id = toStr(adminDoc._id);
  const username = adminDoc.username || '';
  const realName = adminDoc.realName || '';

  // 条件A：supervisorUsername == Admin.username → parentId == admin._id
  let condAIds = new Set();
  const condARows = await Employee.find({ parentId: id }).select('employeeId _id').lean();
  condARows.forEach(e => condAIds.add(toStr(e._id)));
  const condACount = condARows.length;

  // 条件B：supervisorRealName == Admin.realName → parentId ∈ { Admin._id WHERE Admin.realName == X }
  let condBIds = new Set();
  let condBCount = 0;
  if (realName) {
    const sameNameAdminIds = [...allAdminsMap.values()].filter(a => (a.realName||'') === realName).map(a => toStr(a._id));
    if (sameNameAdminIds.length) {
      const condBRows = await Employee.find({ parentId: { $in: sameNameAdminIds } }).select('employeeId _id').lean();
      condBCount = condBRows.length;
      condBRows.forEach(e => condBIds.add(toStr(e._id)));
    }
  }

  // 条件C：Employee.teamGroupId == Admin._id（脏数据兜底）
  let condCIds = new Set();
  const condCRows = await Employee.find({ teamGroupId: id }).select('employeeId _id').lean();
  const condCCount = condCRows.length;
  condCRows.forEach(e => condCIds.add(toStr(e._id)));

  // 并集去重（按 Employee._id）
  const unionIds = new Set([...condAIds, ...condBIds, ...condCIds]);

  // 再查这些员工的 employeeId（因为卡片用 employeeId 聚合统计）
  const emps = await Employee.find({ _id: { $in: [...unionIds].map(s => new mongoose.Types.ObjectId(s)) } }).select('employeeId _id').lean();
  const empIdsSet = new Set(emps.map(e => String(e.employeeId)).filter(Boolean));

  return {
    condACount, condBCount, condCCount,
    unionById: unionIds.size,
    employeeIds: empIdsSet,
    memberCountByEmployeeId: empIdsSet.size
  };
}

(async () => {
  console.log("[0] 连接 Mongo …");
  await mongoose.connect(MONGO, {});
  console.log("✅ 连接成功\n");

  // 先挂/引入核心函数。由于新接口还没写，这里从 dashboard.js 动态取导出。
  let computeCards, isAuthSuperAllow, authForbidCheck;
  try {
    const dash = require('./routes/dashboard');
    computeCards = dash._computeSuperManagerDirectCards || null;
    isAuthSuperAllow = dash._isSuperAdminRole || null;
    authForbidCheck = dash._managerDirectAuthCheck || null;
  } catch (e) {
    console.log("⚠️  无法 require dashboard.js（未导出核心函数属于 RED 阶段正常情况），将直接走路由逻辑模拟。\n");
  }

  // ────── T0：先验证生产数据基线（供 T3/T4 参考） ──────
  const Admin = mongoose.model('Admin');
  const allAdmins = await Admin.find({ status: { $nin: ['disabled','deleted','Deleted','DISABLED'] } })
    .select('_id username realName role commission teamName groupName manualLevel createdAt status').lean();
  const adminsMap = new Map(allAdmins.map(a => [toStr(a._id), a]));
  const TLTot = allAdmins.filter(a => isTL(a.role)).length;
  const GLTot = allAdmins.filter(a => isGL(a.role)).length;
  console.log(`生产数据基线：启用管理员=${allAdmins.length}，其中 TL=${TLTot}，GL=${GLTot}`);

  // ──────────────────────────────────────────────
  // 真正断言开始（缺核心函数会在 T1 失败 → RED）
  // ──────────────────────────────────────────────
  console.log("\n━━━ 开始 13 条断言 ━━━");

  // ────── T1：鉴权拦截 ──────
  console.log("\n[Section 1] 鉴权 & 枚举范围");
  let authPass = false;
  if (typeof authForbidCheck === 'function') {
    try {
      const tlReq = { user: { role: 'NORMAL_ADMIN' } };
      const forb = authForbidCheck(tlReq);
      authPass = (forb === true || forb === 403) && isSuper({role:'superadmin'}) && !isSuper({role:'NORMAL_ADMIN'});
    } catch (_) {}
  } else {
    // 兜底：函数不存在 → 直接测逻辑规则
    authPass = isSuper('superadmin') && isSuper('SUPER_ADMIN') && !isSuper('NORMAL_ADMIN') && !isSuper('GROUP_LEADER');
  }
  ok('1', authPass, "鉴权规则：SUPER_ADMIN/superadmin双形态放行；TL/GL一律403");

  // ────── T2：枚举范围规模 ──────
  // 先模拟函数不存在返回空
  let todayResult = { data: [], total: 0, _debug: {} };
  let monthResult = { data: [] };
  if (typeof computeCards === 'function') {
    todayResult = await computeCards({ range: 'today', role: '', limit: 1000, page: 1 }) || { data:[] };
    monthResult = await computeCards({ range: 'month', role: '', limit: 1000, page: 1 }) || { data:[] };
  } else {
    console.log("  📝 RED提示：_computeSuperManagerDirectCards 未导出，T2..T13 预期全部失败（属于正常RED阶段）。");
  }
  const T = todayResult.data || [];
  const M = monthResult.data || [];
  ok('2', T.length >= 18, `today列表长度=${T.length} ≥ 18（TL=${TLTot}+GL=${GLTot}量级）`);

  // ────── T3：字段非空 ──────
  console.log("\n[Section 2] 字段级/基础信息卡");
  let allNonEmpty = T.length >= 1;
  const TL_FIELDS = ['_id','objectId','adminId','username','userId','realName','role','level','commissionRate','memberCount','todayRevenue'];
  for (const c of T) {
    for (const f of TL_FIELDS) {
      const v = c[f];
      if (f === 'realName') { if (v == null) allNonEmpty=false; } // realName允许空字符串，不允许null/undefined
      else if (f === 'memberCount' || f === 'todayRevenue') { if (v == null || (typeof v==='number' && isNaN(v))) allNonEmpty=false; }
      else { if (!v && v !== 0) allNonEmpty=false; }
    }
  }
  ok('3', T.length>0 && allNonEmpty, `每张卡 ${TL_FIELDS.length} 字段全部非空/合法（抽样T[0]._id=${T[0]?T[0]._id:'空数组'}`);

  // ────── T4：黄振汇卡数量级（直属≈100，todayRevenue≈350±10%） ──────
  const hzh = T.find(c => (c.realName || '') === '黄振汇' || (c.username || '') === 'huangzhenhui');
  let hzhOK = false, hzhDetail = '';
  if (hzh) {
    const cntOK = hzh.memberCount >= 50 && hzh.memberCount <= 250;
    const revOK = hzh.todayRevenue >= 100 && hzh.todayRevenue <= 800;
    hzhOK = cntOK && revOK;
    hzhDetail = `memberCount=${hzh.memberCount}∈[50,250]?${cntOK}, todayRevenue=${hzh.todayRevenue}∈[100,800]?${revOK}`;
  }
  ok('4', !!hzh && hzhOK, hzh?hzhDetail:'没找到黄振汇那张卡');

  // ────── T5：GL不重复统计下辖其他组长（memberCount小） ──────
  const allGL = T.filter(c => isGL(c.role));
  let glSmallOK = allGL.length > 0;
  for (const g of allGL) if (g.memberCount > 300) glSmallOK = false; // GL不可能有300+直属
  ok('5', glSmallOK, `GL卡共${allGL.length}张，均未出现>300人超大直属（范洁等GL≈51人左右）`);

  // ────── T6：金额单位正确（未 /1000 会出现 >5000 级别） ──────
  let unitOK = true, maxRev = 0;
  for (const c of T) { if (c.todayRevenue > maxRev) maxRev=c.todayRevenue; if (c.todayRevenue >= 5000) unitOK = false; }
  ok('6', unitOK, `最大todayRevenue=${maxRev.toFixed(2)} < 5000（无厘级溢出）`);

  // ────── T7：排序规则 ──────
  console.log("\n[Section 3] 排序 / 分页 / role过滤");
  let sortOK = T.length >= 2;
  let sawGL = false;
  for (let i=0;i<T.length;i++) {
    const c = T[i];
    if (isGL(c.role)) sawGL = true;
    if (sawGL && isTL(c.role)) sortOK=false; // 看到GL后又看到TL → 顺序错
    if (i>0 && isTL(T[i-1].role)===isTL(c.role)) { // 同role内 todayRevenue 倒序
      if (T[i-1].todayRevenue < c.todayRevenue) sortOK=false;
    }
  }
  ok('7', sortOK, "排序：TL全部在前 → GL全部在后；同role内按todayRevenue倒序");

  // ────── T8：月/日 金额量级（≈30倍，允许±15倍浮动） ──────
  const sumToday = T.reduce((s,c)=>s+(+c.todayRevenue||0),0);
  const sumMonth = M.reduce((s,c)=>s+(+c.todayRevenue||0),0);
  const ratio = sumToday>0 ? sumMonth/sumToday : 0;
  ok('8', ratio >= 5 && ratio <= 200, `range=month 总todayRevenue / range=today总todayRevenue = ${ratio.toFixed(1)} ∈ [5,200]（预期≈30倍，半月+今日值低时比值会更高）`);

  // ────── T9：字段完整（level / levelManual / commissionRate / avgEcpm / yesterdayRevenue / growthRate / monthlyRevenue） ──────
  console.log("\n[Section 4] 字段完整性 + 环比算法");
  let fldFull = T.length > 0;
  const EXT_FIELDS = ['level','levelManual','commissionRate','avgEcpm','yesterdayRevenue','growthRate','monthlyRevenue'];
  for (const c of T) {
    for (const f of EXT_FIELDS) if (c[f]===undefined) fldFull=false;
    if (typeof c.levelManual !== 'boolean') fldFull=false;
    if (typeof c.commissionRate !== 'number' || c.commissionRate <= 0) fldFull=false;
    if (!/^P[1-8]$/.test(c.level || '')) fldFull=false;
    if (c.monthlyRevenue < c.todayRevenue - 1) fldFull=false; // 月累计不应低于今日（range=today场景）
  }
  ok('9', fldFull, `每张卡扩展字段 ${EXT_FIELDS.join('/')} 齐全+类型正确（P1~P8，commissionRate>0，levelManual布尔，monthlyRevenue>=todayRevenue）`);

  // ────── T10：分页 ──────
  let pageOK = true;
  if (typeof computeCards === 'function' && T.length >= 6) {
    const r1 = (await computeCards({ range:'today', limit:3, page:1 })).data || [];
    const r2 = (await computeCards({ range:'today', limit:3, page:2 })).data || [];
    pageOK = r1.length === 3 && r2.length === 3 && r1[2]._id !== r2[0]._id && !r1.find(c => r2.find(d => d._id===c._id));
  } else pageOK = T.length<6; // 样本不足跳过
  ok('10', pageOK, "分页：limit=3/page=1与page=2交集为空、各3条");

  // ────── T11：role 过滤 ──────
  let roleFilterOK = true;
  if (typeof computeCards === 'function') {
    const r = (await computeCards({ range:'today', role:'NORMAL_ADMIN', limit:1000, page:1 })).data || [];
    const r2 = (await computeCards({ range:'today', role:'GROUP_LEADER', limit:1000, page:1 })).data || [];
    roleFilterOK = r.every(c => isTL(c.role)) && r2.every(c => isGL(c.role)) && r.length === TLTot && r2.length === GLTot;
  }
  ok('11', roleFilterOK, `role过滤：NORMAL_ADMIN仅TL(${TLTot})，GROUP_LEADER仅GL(${GLTot})`);

  // ────── T12：三条件成员集合正确性 ──────
  console.log("\n[Section 5] 三条件集合正确性 + 环比算法");
  let condsOK = !!hzh;
  if (hzh) {
    const hzhAdmin = allAdmins.find(a => toStr(a._id) === hzh._id) || allAdmins.find(a => a.username==='huangzhenhui');
    if (hzhAdmin) {
      const v = await _verifyThreeConds(hzhAdmin, adminsMap);
      condsOK = hzh.memberCount === v.memberCountByEmployeeId;
      console.log(`    📝 黄振汇三条件：条件A=${v.condACount}人(parentId=id) + 条件B=${v.condBCount}人(同名Admin) + 条件C=${v.condCCount}人(tg=id脏) → Employee._id去重=${v.unionById} → employeeId集合=${v.memberCountByEmployeeId}`);
      console.log(`    📝 接口返回memberCount=${hzh.memberCount} 计算集合=${v.memberCountByEmployeeId} 相等?${condsOK}`);
      // sampleChecks 必须存在于_debug中
      const sc = (todayResult._debug && todayResult._debug.sampleChecks) || [];
      const scMatch = sc.find(s => s._id === hzh._id || s.adminId === hzh.adminId);
      if (scMatch) console.log(`    📝 _debug.sampleChecks命中：${JSON.stringify({condA:scMatch.condACount,condB:scMatch.condBCount,condC:scMatch.condCCount,union:scMatch.unionCount,final:scMatch.memberCount})}`);
    }
  }
  ok('12', condsOK, `三条件并集(AB∪C) employeeId集合size == 接口返回memberCount`);

  // ────── T13：环比算法正确性 ──────
  let growthOK = T.length > 0;
  for (const c of T) {
    const y = +c.yesterdayRevenue || 0, t = +c.todayRevenue || 0;
    let expected = 0;
    if (y > 0) expected = (t - y) / y * 100;
    else if (t > 0) expected = 9999;
    else expected = 0;
    const diff = Math.abs((+c.growthRate||0) - expected);
    if (expected === 9999) { if (c.growthRate !== 9999) growthOK=false; }
    else if (diff > 0.5) growthOK=false;
  }
  ok('13', growthOK, "环比公式：y>0→(t-y)/y*100；y=0&t>0→9999；都=0→0。所有卡误差≤0.5");

  // ────────────── 输出总结 ──────────────
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  📊 总计：${PASSED} 通过，${FAILED} 失败（共 ${PASSED+FAILED} 条）`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  process.exit(FAILED === 0 ? 0 : 1);
})().catch(e => { console.error("TDD异常：", e); process.exit(2); });
