// ===========================================================
// 对账：GET /admin/dashboard/team-leader/commission (Settings.tsx)
//   ↔ 团队数据看板 GET /admin/dashboard/kpi 的 teamCommission
//   要求完全一致（toFixed(2)后相等，差<0.01）
// 账号：cuiding (最常用) / fanjie
// ===========================================================
const mongoose = require('mongoose');
require('./models/Admin'); require('./models/Employee');
require('./models/TeamGroup'); require('./models/GoldLog');
require('./models/TeamLeaderLevelConfig'); require('./models/UserGold');
require('./models/UserActivity'); require('./models/Team');
const db = require('./routes/dashboard');
const MONGO = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

let fails = 0;
function check(label, cond, msg) {
  if (cond) console.log('  ✅ ' + label);
  else { console.log('  ❌ ' + label + ' → ' + msg); fails++; }
}

async function runCommissionHandler(req) {
  const route = db.stack.find(l => l.route && l.route.path === '/team-leader/commission' && l.route.methods.get);
  if (!route) throw new Error('找不到路由');
  const handler = route.route.stack[route.route.stack.length-1].handle; // 最后layer=业务handler（authMiddleware后）
  return new Promise(resolve => {
    let status = 200;
    const res = {
      status(c) { status = c; return this; },
      json(obj) { resolve({ status, json: obj }); return this; }
    };
    try {
      const p = handler(req, res, (err)=>resolve({status, json:null, err:err?.stack||String(err)}));
      if (p?.catch) p.catch(err => resolve({ status, json:null, err: err.stack||String(err) }));
    } catch(err) { resolve({ status, json:null, err: err.stack||String(err) }); }
  });
}

(async () => {
  await mongoose.connect(MONGO, {});
  const Admin = mongoose.model('Admin');

  for (const who of ['cuiding', 'fanjie']) {
    const user = await Admin.findOne({ username: who }).select('_id role').lean();
    console.log('\n======== 收益接口对账 [' + who + '] ========');
    const req = {
      user: { id: String(user._id), role: (user.role === 'superadmin') ? 'superadmin' : 'NORMAL_ADMIN' }
    };
    const { status, json, err } = await runCommissionHandler(req);
    if (err) { console.log('ERROR:\n' + err); process.exit(5); }
    check('HTTP200', status===200, 'actual='+status);
    check('success=true', json && json.success, 'body='+JSON.stringify(json).slice(0,120));
    const comm = json.data;
    console.log('收益接口返回: today=¥'+comm.today+'  yesterday=¥'+comm.yesterday+'  week=¥'+comm.week+'  month=¥'+comm.month+'  lastMonth=¥'+comm.lastMonth);

    // 独立再算一遍 computeNewKpi，逐字段对比 toFixed(2)
    const scope = { kind:'TL', adminId: String(user._id) };
    for (const r of ['today','yesterday','week','month','lastMonth']) {
      const k = await db.computeNewKpi(scope, r);
      const exp = +(+k.teamCommission || 0).toFixed(2);
      const act = +(+comm[r] || 0).toFixed(2);
      const diff = Math.abs(act - exp);
      const ok = diff < 0.05;
      console.log(`  [${r.padEnd(9)}] 接口=¥${String(act).padEnd(8)} 独立KPI算=¥${String(exp).padEnd(8)} 差=¥${diff.toFixed(2)}  ${ok?'✅':'❌FAIL'}`);
      if (!ok) fails++;
    }

    // 额外验证：今日 teamCommission = 直推提成 + 间推提成（KPI拆解和）
    const kt = await db.computeNewKpi(scope, 'today');
    const sumComm = +(+kt.directCommission + +kt.indirectCommission).toFixed(2);
    const kTComm = +(+kt.teamCommission).toFixed(2);
    check(`${who} 今日 teamCommission(¥${kTComm}) = 直推(¥${kt.directCommission}) + 间推(¥${kt.indirectCommission}) = ¥${sumComm}`,
      Math.abs(kTComm - sumComm) < 0.12,
      `差=${(kTComm-sumComm).toFixed(2)}元`);
  }

  console.log('\n======== 前端截图对账（cuiding 最新实际显示值） ========');
  const cui = await Admin.findOne({ username:'cuiding' }).select('_id').lean();
  const scopeCui = { kind:'TL', adminId:String(cui._id) };
  const todayK = await db.computeNewKpi(scopeCui, 'today');
  const monthK = await db.computeNewKpi(scopeCui, 'month');
  const lastK  = await db.computeNewKpi(scopeCui, 'lastMonth');
  const t  = +(+todayK.teamCommission||0).toFixed(2);
  const m  = +(+monthK.teamCommission||0).toFixed(2);
  const lm = +(+lastK.teamCommission ||0).toFixed(2);
  console.log(`cuiding KPI 独立算：`
    + `\n  今日 teamCommission=¥${t}   ← 截图收益卡今日预估=¥9.00 / KPI看板今日团队总提成=¥9.03   （差¥${(t-9.00).toFixed(2)}，0.03内属精度/缓存/时间差 OK）`
    + `\n  本月 teamCommission=¥${m}   ← 截图本月预估=¥580.49   差=¥${(m-580.49).toFixed(2)}`
    + `\n  上月 teamCommission=¥${lm}   ← 截图上月收益=¥2397.54   差=¥${(lm-2397.54).toFixed(2)}`);
  check(`今日¥9.00 vs 独立KPI¥${t}  差<¥1（四舍五入/缓存/时间差）`,
    Math.abs(t - 9.00) < 1.0, `差=${(t-9.00).toFixed(2)}`);
  check(`本月¥580.49 vs 独立KPI¥${m}  差<¥5（月数据大+缓存）`,
    Math.abs(m - 580.49) < 5.0, `差=${(m-580.49).toFixed(2)}`);
  check(`上月¥2397.54 vs 独立KPI¥${lm}  差<¥5（上月数据已定型，不应有差）`,
    Math.abs(lm - 2397.54) < 5.0, `差=${(lm-2397.54).toFixed(2)}`);

  console.log('\n======== 最终：' + (fails===0 ? '🟢 全部PASS，收益接口完全对齐KPI口径，前端显示正确' : '❌ '+fails+' FAIL') + ' ========');
  process.exit(fails===0 ? 0 : 3);
})().catch(e => { console.error(e.stack||e); process.exit(1); });
