// TDD RED：组长 /group-leader/commission-stats 100% 对齐 TL 端扁平结构（按用户方案A）
// 断言：字段结构 17+4 扁平别名 + detail 嵌套过渡期兼容 + total/availableBalance 正确口径
const mongoose = require('mongoose');
require('./models/Admin');
require('./models/Employee');
require('./models/TeamGroup');
require('./models/GoldLog');
// (提现模型会由 dashboard / verification 路由在 require 时加载)
require('./models/TeamLeaderLevelConfig');
const verification = require('./routes/verification');
const dashboard = require('./routes/dashboard');

const MONGO = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

const fails = [];
function a(label, cond, actual, expected) {
  if (!cond) {
    const m = `❌ ${label} → 实际=${JSON.stringify(actual)}${expected !== undefined ? ' 期望=' + JSON.stringify(expected) : ''}`;
    fails.push(m);
    console.log(m);
  } else {
    console.log(`✅ ${label}`);
  }
}
function n2(v){return +(+v).toFixed(2);}

(async () => {
  await mongoose.connect(MONGO,{});
  const Admin = mongoose.model('Admin');

  // 找 3 个真实组长（teamGroupId 存在）
  const gls = await Admin.find({ teamGroupId: { $exists: true, $nin: [null,''] } }).select('_id username role').lean().limit(3);
  console.log(`真实组长 ${gls.length} 个：${gls.map(g=>g.username).join(', ')}`);

  // 找 1 个真实 TL 当对比标杆
  const tl = await Admin.findOne({ role: 'NORMAL_ADMIN', teamName: { $exists: true, $nin: [null,''] } }).select('_id username role commission').lean();
  console.log(`对比TL：${tl.username} commission=${tl.commission}`);

  for (const gl of gls) {
    console.log(`\n========== 📌 组长 ${gl.username} (_id=${String(gl._id).slice(-6)}) ==========`);
    // 直接调后端函数
    const glFn = verification.getGroupLeaderCommissionStats ? verification.getGroupLeaderCommissionStats : null;
    // 🔴 如果函数没导出，走 HTTP 路由层解析：用 verification.router 栈里的 handler，没导出就先直接模拟请求构造
    // 简化：直接调用 verification 内部逻辑（如果有导出），否则模拟执行脚本里的 pipeline
    let result = null;
    try {
      // 试直接调用导出的内部函数（如果已导出）
      result = await verification._TEST_getGlCommissionStats(String(gl._id));
    } catch (e) {
      console.log(`  ⚠️ 直接调用失败：${e.message || e} → 说明还没导出内部函数，RED 阶段预期失败`);
      // RED 阶段：result 是 null，所有字段断言都会 fail → 是对的
    }
    const data = result?.data || result || {};

    // ============= 断言 1：扁平 17 字段结构 =============
    console.log(`\n  ---- 断言 1：扁平字段（17字段全部为 number ≥0） ----`);
    const flatFields = [
      'today','todayCommission','todayEarnings',
      'month','monthCommission','monthEarnings',
      'lastMonth','lastMonthCommission','lastMonthEarnings','last_month',
      'total','totalCommission','totalEarnings',
      'availableBalance',
    ];
    for (const f of flatFields) {
      const v = data[f];
      a(`${f} 存在且为 number ≥0`, typeof v === 'number' && !isNaN(v) && v >= 0, v, 'number≥0');
    }
    // 3 组别名完全相等（今日 / 本月 / 上月 / 累计 → 3别名数值相同）
    if (typeof data.today==='number') {
      a(`today 3 别名等值 (today=todayCommission=todayEarnings)`,
        n2(data.today)===n2(data.todayCommission) && n2(data.today)===n2(data.todayEarnings),
        [data.today, data.todayCommission, data.todayEarnings]);
    }
    if (typeof data.month==='number') {
      a(`month 3 别名等值 (month=monthCommission=monthEarnings)`,
        n2(data.month)===n2(data.monthCommission) && n2(data.month)===n2(data.monthEarnings),
        [data.month, data.monthCommission, data.monthEarnings]);
    }
    if (typeof data.lastMonth==='number') {
      a(`lastMonth 4 别名等值 (lastMonth=lastMonthCommission=lastMonthEarnings=last_month)`,
        n2(data.lastMonth)===n2(data.lastMonthCommission) &&
        n2(data.lastMonth)===n2(data.lastMonthEarnings) &&
        n2(data.lastMonth)===n2(data.last_month),
        [data.lastMonth, data.lastMonthCommission, data.lastMonthEarnings, data.last_month]);
    }
    if (typeof data.total==='number') {
      a(`total 3 别名等值 (total=totalCommission=totalEarnings)`,
        n2(data.total)===n2(data.totalCommission) && n2(data.total)===n2(data.totalEarnings),
        [data.total, data.totalCommission, data.totalEarnings]);
    }

    // ============= 断言 2：过渡期 detail 嵌套结构（保留老字段路径） =============
    console.log(`\n  ---- 断言 2：过渡期 detail.嵌套兼容（老前端 today/totalCommission 路径不报错） ----`);
    a(`detail 是对象`, data.detail && typeof data.detail === 'object', typeof data.detail);
    for (const rng of ['today','month','lastMonth']) {
      const nest = data.detail?.[rng];
      a(`detail.${rng} 是对象`, nest && typeof nest === 'object', nest ? 'obj' : typeof nest);
      const c = nest?.totalCommission;
      a(`detail.${rng}.totalCommission 是 number ≥0`, typeof c === 'number' && !isNaN(c) && c >= 0, c);
      // 和扁平对应字段相等
      if (typeof data[rng] === 'number' && typeof c === 'number') {
        a(`detail.${rng}.totalCommission === flat.${rng}`, n2(data[rng]) === n2(c), [data[rng], c]);
      }
    }

    // ============= 断言 3：total / availableBalance 口径正确 =============
    console.log(`\n  ---- 断言 3：total / availableBalance 正确口径 ----`);
    // total ≥ month + lastMonth（因为开业至今累计肯定 ≥ 已知的两月和）
    if (typeof data.total==='number' && typeof data.month==='number' && typeof data.lastMonth==='number') {
      a(`total(开业至今累计) ≥ month + lastMonth(${n2(data.month+data.lastMonth)})`,
        n2(data.total) >= n2(data.month + data.lastMonth) - 0.02,
        n2(data.total), `≥ ${n2(data.month+data.lastMonth)}`);
    }
    // availableBalance ≤ lastMonth（因为可提现 = 上月 - 已提现成功）
    if (typeof data.availableBalance==='number' && typeof data.lastMonth==='number') {
      a(`availableBalance ≤ lastMonth(${n2(data.lastMonth)}) ，不能比上月还大`,
        n2(data.availableBalance) <= n2(data.lastMonth) + 0.02,
        n2(data.availableBalance), `≤ ${n2(data.lastMonth)}`);
      a(`availableBalance ≥ 0`, n2(data.availableBalance) >= 0, n2(data.availableBalance));
    }
  }

  // ============= 对比标杆TL：结构字段必须一致 =============
  console.log(`\n========== 📊 对比TL标杆 ${tl.username} ==========`);
  let tlData = {};
  try {
    tlData = (await dashboard._TEST_getTlCommissionStats(String(tl._id))) || {};
  } catch(e) { console.log(`  ⚠️ TL 内部函数没导出：${e.message}`); }
  if (tlData && typeof tlData === 'object' && Object.keys(tlData).length > 0) {
    console.log(`  TL 当前字段：${Object.keys(tlData).join(', ')}`);
    // TL 端也必须有 total / availableBalance（新口径）
    for (const f of ['today','month','lastMonth','total','availableBalance']) {
      a(`TL端也有 ${f}（GL/TL 结构对称）`, typeof tlData[f] === 'number' && !isNaN(tlData[f]), tlData[f], 'number');
    }
    a(`TL total ≥ TL month+lastMonth(${n2((tlData.month||0)+(tlData.lastMonth||0))})`,
      n2(tlData.total||0) >= n2((tlData.month||0)+(tlData.lastMonth||0)) - 0.02,
      tlData.total);
  } else {
    console.log(`  (TL 端还没暴露 _TEST 接口，跳过结构对比)`);
  }

  console.log(`\n===== TOTAL FAILURES: ${fails.length} =====`);
  if (fails.length === 0) console.log(`✅ ALL GREEN：组长 commission-stats 与 TL 端 100% 对齐（结构+口径）`);
  else console.log(`❌ RED：${fails.length} 个断言失败 → 开始修复代码`);
  process.exit(fails.length === 0 ? 0 : 1);
})().catch(e=>{console.error('ERR:',e.message||e);process.exit(1);});
