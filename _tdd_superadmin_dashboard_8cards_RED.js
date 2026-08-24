// TDD RED：超管数据总览 GET /admin/dashboard/kpi?range=today 的 8 张卡数值实锤
// 目的：定位是后端算错，还是前端公式假设错
const mongoose = require('mongoose');
require('./models/Admin');
require('./models/Employee');
require('./models/TeamGroup');
require('./models/GoldLog');
require('./models/UserGold');
require('./models/TeamLeaderLevelConfig');
const dashboard = require('./routes/dashboard');

const MONGO = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjb-mongodb.ns-tlwyfho9.svc:27017';

(async () => {
  await mongoose.connect(MONGO,{});
  const Employee = mongoose.model('Employee');
  const GoldLog  = mongoose.model('GoldLog');

  // 1. 调后端核心函数 computeNewKpi：scope.__global__ 超管全局视角（Dashboard 超管页面就是这个）
  const SCOPE_GLOBAL = { kind: 'TL', adminId: '__global__' };
  const today     = await dashboard.computeNewKpi(SCOPE_GLOBAL, 'today');
  const yesterday = await dashboard.computeNewKpi(SCOPE_GLOBAL, 'yesterday');
  const month     = await dashboard.computeNewKpi(SCOPE_GLOBAL, 'month');
  const lastMonth = await dashboard.computeNewKpi(SCOPE_GLOBAL, 'lastMonth');

  const n2 = v => +(+v||0).toFixed(2);

  // 2. 前端 buildSuperAdminKpis 的 8 张卡原封不动算一遍（和 Dashboard.tsx L258-L282 完全一致）
  function buildCards(r) {
    const teamRevenue = n2(r.teamRevenue);
    const teamCommission = n2(r.teamCommission);
    const profit = n2(Math.max(0, teamRevenue - teamCommission));
    const grossMargin = teamRevenue > 0 ? n2(profit / teamRevenue * 100) : 0;
    const totalImpressions = (+r.directImpressions||0) + (+r.indirectImpressions||0);
    const eCPM = totalImpressions > 0 ? n2((teamRevenue * 1000) / totalImpressions) : 0;
    const totalActive = (+r.directActiveUsers||0) + (+r.indirectActiveUsers||0);
    const totalUsers  = (+r.directUserCount||0) + (+r.indirectUserCount||0);
    const activeRate = totalUsers > 0 ? n2(totalActive / totalUsers * 100) : 0;
    return {
      // 8 张卡
      '1.今日毛利(¥)': profit,
      '2.今日毛利率(%)': grossMargin,
      '3.业务总收入(¥)': teamRevenue,
      '4.用户分成金额(¥)': teamRevenue,  // 前端写死和业务总收入同一值
      '5.广告总曝光(次)': totalImpressions,
      '6.管理分成总计(¥)': teamCommission,
      '7.今日平均eCPM': eCPM,
      '8.今日活跃用户': totalActive,
      '  活跃率(%)': activeRate,
      // 增长率
      '9.收入同比(%)': r.teamRevenueGrowth||0,
      '10.分成同比(%)': r.teamCommissionGrowth||0,
      // 明细（对账用）
      '_dbg': {
        directRevenue: n2(r.directRevenue),
        indirectRevenue: n2(r.indirectRevenue),
        directComm: n2(r.directCommission),
        indirectComm: n2(r.indirectCommission),
        directImp: +r.directImpressions||0,
        indirectImp: +r.indirectImpressions||0,
        dirActive: +r.directActiveUsers||0,
        indActive: +r.indirectActiveUsers||0,
        dirUsers:  +r.directUserCount||0,
        indUsers:  +r.indirectUserCount||0,
      }
    };
  }

  const cToday = buildCards(today);
  const cYest  = buildCards(yesterday);
  const cMonth = buildCards(month);

  console.log('\n============== 🔴 超管数据总览 今日 vs 昨日 ==============');
  console.log('(对比参考：用户截图今日≈毛利¥2,034.11 收入¥2,231.79 曝光32,913 分成¥197.68 eCPM67.81 活跃79)');
  for (const k of Object.keys(cToday).filter(x=>!x.startsWith('_dbg')&&!x.startsWith('  '))) {
    const t = cToday[k], y = cYest[k];
    const diff = typeof t === 'number' && typeof y === 'number' ? (y>0 ? ((t-y)/y*100).toFixed(1)+'%' : '-') : '-';
    console.log(`  ${k.padEnd(20)} 今日=${JSON.stringify(t).padEnd(12)} 昨日=${JSON.stringify(y).padEnd(12)} 环比=${diff}`);
  }
  console.log('\n  — 明细（今日） —');
  for (const [k,v] of Object.entries(cToday._dbg)) console.log(`    ${k.padEnd(16)}=${v}`);

  console.log('\n============== 📌 3 个实锤 sanity check（只要这里不绿，就是后端口径错）==============');
  const fails = [];
  const a = (lbl,cond,act,exp) => {
    if (!cond) { fails.push(`❌ ${lbl}: 实际=${act} 期望=${exp||'成立'}`); console.log(fails[fails.length-1]); }
    else console.log(`✅ ${lbl}`);
  };
  // ① 业务总收入 = 直推业绩 + 间推业绩（恒成立）
  a('总收入 = direct+indirect（恒等式）',
    n2(today.teamRevenue) === n2(today.directRevenue + today.indirectRevenue),
    [n2(today.teamRevenue), n2(today.directRevenue+today.indirectRevenue)]);
  // ② 管理分成 = 直推提成 + 间推提成（恒成立）
  a('管理分成 = 直推提成 + 间推提成',
    n2(today.teamCommission) === n2(today.directCommission + today.indirectCommission),
    [n2(today.teamCommission), n2(today.directCommission + today.indirectCommission)]);
  // ③ 毛利 = 收入 - 提成（恒成立，且毛利≥0）
  a('毛利 = 收入 - 管理分成 ≥0',
    cToday['1.今日毛利(¥)'] >= 0 && Math.abs(cToday['1.今日毛利(¥)'] - (cToday['3.业务总收入(¥)']-cToday['6.管理分成总计(¥)'])) < 0.03,
    cToday['1.今日毛利(¥)']);
  // ④ 曝光 = dir+indir（恒成立）
  a('曝光 = directImpressions+indirectImpressions',
    cToday['5.广告总曝光(次)'] === (cToday._dbg.directImp+cToday._dbg.indirectImp),
    [cToday['5.广告总曝光(次)'], cToday._dbg.directImp+cToday._dbg.indirectImp]);
  // ⑤ eCPM = 收入*1000/曝光（恒成立）
  const exp_eCPM = cToday['5.广告总曝光(次)']>0 ? n2(cToday['3.业务总收入(¥)']*1000/cToday['5.广告总曝光(次)']): 0;
  a('eCPM = 收入*1000/曝光',
    cToday['7.今日平均eCPM'] === exp_eCPM,
    [cToday['7.今日平均eCPM'], exp_eCPM]);
  // ⑥ 活跃 = dir+indir活跃，活跃率 = 活跃/全员
  const expRate = (cToday._dbg.dirUsers+cToday._dbg.indUsers)>0 ?
    n2((cToday._dbg.dirActive+cToday._dbg.indActive)/(cToday._dbg.dirUsers+cToday._dbg.indUsers)*100) : 0;
  a('活跃率 = 活跃/(directUser+indirectUser)*100',
    Math.abs(cToday['  活跃率(%)'] - expRate) < 0.05,
    [cToday['  活跃率(%)'], expRate]);
  // ⑦ 真实员工数 DB 验证：全体员工数 vs computeNewKpi 返回的 directUserCount（超管 global 场景，全员 = directUserCount）
  const allEmps = await Employee.countDocuments({});
  console.log(`\n📊 DB真实：全体 Employee 文档数 = ${allEmps}`);
  console.log(`📊 computeNewKpi 返回：directUserCount=${cToday._dbg.dirUsers}（超管global时，理论上=全体员工）`);
  const activeEmps = await GoldLog.aggregate([
    { $match: { createTime: { $gte: today._window.startISO ? new Date(today._window.startISO) : new Date(Date.now()-86400000) } } },
    { $group: { _id: '$employeeId' } }
  ]).exec();
  console.log(`📊 DB真实：今日有 GoldLog 记录的 employeeId 去重 = ${activeEmps.length}`);
  console.log(`📊 computeNewKpi 返回：今日活跃活跃数 = ${cToday._dbg.dirActive+cToday._dbg.indActive}`);

  console.log(`\n===== Sanity Check FAILURES: ${fails.length} =====`);
  if (fails.length > 0) console.log('❌ RED：后端 computeNewKpi 有基本口径错误 → 开始修');
  else console.log('✅ GREEN：后端核心口径恒等式都对，问题在前端字段/公式假设或非全局scope');

  console.log('\n============== 📅 本月累计（防止只看今日单点）==============');
  for (const k of Object.keys(cMonth).filter(x=>!x.startsWith('_dbg')&&!x.startsWith('  '))) {
    console.log(`  ${k.padEnd(20)} 本月累计=${JSON.stringify(cMonth[k])}`);
  }
  process.exit(fails.length === 0 ? 0 : 1);
})().catch(e=>{console.error('ERR:',e.message||e);process.exit(2);});
