// ================================================================
// ✅ 新版 KPI TDD（v3，稳定不随日期变化的断言集）
// 账号：cuiding (TL) + fanjie (TL下属, 无下属组/TL)
// range = yesterday
// 断言：只写"稳定恒等式"和"类型约束"，不写死数值（因为数值每天变）
//       另加特征约束：cuiding 间推必须>0（有下属组+TL）/ fanjie 间推必须=0
// ================================================================
const mongoose = require('mongoose');
require('./models/Admin'); require('./models/Employee'); require('./models/TeamGroup');
require('./models/GoldLog'); require('./models/LoginRecord');
const MONGO = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
const assert = require('assert');
const dashboard = require('./routes/dashboard');

// 构造 fake req / res 调用路由 handler
async function callKpi({ user, query }) {
  return await new Promise((resolve, reject) => {
    const req = { user, query, originalUrl:'/admin/dashboard/kpi', method:'GET' };
    let statusCode = 200;
    const res = {
      status(c) { statusCode = c; return this; },
      json(payload) { resolve({ status: statusCode, body: payload }); }
    };
    const route = dashboard.stack.find(l => l.route && l.route.path === '/kpi' && l.route.methods.get);
    if (!route) return reject(new Error('route/kpi not found'));
    const layer = route.route.stack[route.route.stack.length-1];
    try { layer.handle(req, res, err => reject(err)); } catch(e) { reject(e); }
  });
}

const FIELDS_17 = ['directRevenue','directCommission','directImpressions',
                   'indirectRevenue','indirectCommission','indirectImpressions',
                   'teamRevenue','teamCommission',
                   'directUserCount','directActiveUsers','directActiveRate',
                   'indirectUserCount','indirectActiveUsers','indirectActiveRate',
                   'teamRevenueGrowth','teamCommissionGrowth','directRevenueGrowth'];
const TOL = 0.03;
let TOTAL = 0, FAILED = 0;
function chk(name, cond, detail) {
  TOTAL++;
  if (cond) console.log(`  ✔ #${TOTAL}: ${name}`);
  else { FAILED++; console.log(`  ❌ #${TOTAL}: ${name}`, detail||''); }
}
function typeOf(x) { return Object.prototype.toString.call(x).slice(8,-1); }
function isNum(x) { return typeOf(x)==='Number' && isFinite(x); }
function isInt(x) { return isNum(x) && Math.floor(x)===x && x>=0; }
function isPct(x) { return isNum(x) && x>=-10000 && x<=10000; } // %数在±10000范围内就合理

// 对1个账号跑 17字段 类型 + 恒等式 + 特征
function assertAccount(label, d, feature) {
  console.log(`\n— ${label} 字段类型（17项）—`);
  for (const f of ['Revenue','Commission']) {
    chk(`${label}.direct${f} 是¥数值`, isNum(d[`direct${f}`]) && d[`direct${f}`]>=0);
    chk(`${label}.indirect${f} 是¥数值`, isNum(d[`indirect${f}`]) && d[`indirect${f}`]>=0);
    chk(`${label}.team${f} 是¥数值`, isNum(d[`team${f}`]) && d[`team${f}`]>=0);
  }
  chk(`${label}.directImpressions 是整数曝光`, isInt(d.directImpressions));
  chk(`${label}.indirectImpressions 是整数曝光`, isInt(d.indirectImpressions));
  chk(`${label}.directUserCount 在册整数`, isInt(d.directUserCount));
  chk(`${label}.directActiveUsers 活跃整数`, isInt(d.directActiveUsers));
  chk(`${label}.directActiveRate %数`, isPct(d.directActiveRate));
  chk(`${label}.indirectUserCount 在册整数`, isInt(d.indirectUserCount));
  chk(`${label}.indirectActiveUsers 活跃整数`, isInt(d.indirectActiveUsers));
  chk(`${label}.indirectActiveRate %数`, isPct(d.indirectActiveRate));
  chk(`${label}.teamRevenueGrowth %数`, isPct(d.teamRevenueGrowth));
  chk(`${label}.teamCommissionGrowth %数`, isPct(d.teamCommissionGrowth));
  chk(`${label}.directRevenueGrowth %数`, isPct(d.directRevenueGrowth));

  console.log(`\n— ${label} 恒等式（3项）—`);
  chk(`${label}.teamRevenue = direct+indirect`,
    Math.abs(d.teamRevenue - d.directRevenue - d.indirectRevenue) < TOL,
    `${d.teamRevenue} vs ${d.directRevenue}+${d.indirectRevenue}`);
  chk(`${label}.teamCommission = direct+indirect`,
    Math.abs(d.teamCommission - d.directCommission - d.indirectCommission) < TOL,
    `${d.teamCommission} vs ${d.directCommission}+${d.indirectCommission}`);
  chk(`${label}.directActiveUsers ≤ directUserCount`, d.directActiveUsers <= d.directUserCount,
    `${d.directActiveUsers} > ${d.directUserCount}`);
  chk(`${label}.indirectActiveUsers ≤ indirectUserCount`, d.indirectActiveUsers <= d.indirectUserCount,
    `${d.indirectActiveUsers} > ${d.indirectUserCount}`);
  chk(`${label}.字段总数=17（无多余无遗漏）`,
    Object.keys(d).filter(k=>!k.startsWith('_')).length === 17,
    '多余/遗漏：'+Object.keys(d).filter(k=>!k.startsWith('_')).filter(k=>!FIELDS_17.includes(k)).join(',')
    +' —缺失：'+FIELDS_17.filter(k=>!(k in d)).join(','));

  console.log(`\n— ${label} 特征校验 —`);
  if (feature === '有下属') {
    chk(`${label} indirectRevenue>0（有下属组长组/下级TL）`, d.indirectRevenue > 0, '实际='+d.indirectRevenue);
    chk(`${label} indirectCommission>0（上级拿级差提成）`, d.indirectCommission > 0, '实际='+d.indirectCommission);
    chk(`${label} indirectUserCount>0（间推在册>0）`, d.indirectUserCount > 0, '实际='+d.indirectUserCount);
    // 直推率 ≈ TL率(10%) 容差±5pct（允许老单按之前低档位固化的差，比如cuiding老单大量按P2=8%入账）
    if (d.directRevenue > 0) {
      const r = d.directCommission/d.directRevenue*100;
      chk(`${label} 直推综合率≈TL档10%（±5%，含老单按低档位固化）`, Math.abs(r-10) <= 5, '实际='+r.toFixed(2)+'%');
    }
  } else {
    chk(`${label} indirectRevenue=0（无下属）`, d.indirectRevenue===0);
    chk(`${label} indirectCommission=0（无下属）`, d.indirectCommission===0);
    chk(`${label} indirectImpressions=0（无下属）`, d.indirectImpressions===0);
    chk(`${label} indirectUserCount=0（无下属）`, d.indirectUserCount===0);
    chk(`${label} teamRevenue=directRevenue`, Math.abs(d.teamRevenue-d.directRevenue)<TOL);
    chk(`${label} teamCommission=directCommission`, Math.abs(d.teamCommission-d.directCommission)<TOL);
    // fan杰 直推综合率 ≈ 8% ±5%（老单按P3/P4档10%/12%固化的，容差放宽）
    if (d.directRevenue > 0) {
      const r = d.directCommission/d.directRevenue*100;
      chk(`${label} 直推综合率≈TL档8%（±5%，含老单固化）`, Math.abs(r-8) <= 5, '实际='+r.toFixed(2)+'%');
    }
  }
  if (feature === '有下属') chk(`${label} _scope=TL`, d._scope==='TL', d._scope);
  else                     chk(`${label} _scope=TL`, d._scope==='TL', d._scope);
  chk(`${label} _range=yesterday`, d._range==='yesterday', d._range);
}

(async () => {
  await mongoose.connect(MONGO);
  const Admin = mongoose.model('Admin');
  const cui = await Admin.findOne({ username:'cuiding' }).select('_id role').lean();
  const fj  = await Admin.findOne({ username:'fanjie'  }).select('_id role').lean();

  // 路由存在吗？
  const route = dashboard.stack.find(l=>l.route&&l.route.path==='/kpi');
  chk('GET /admin/dashboard/kpi 路由存在', !!route);
  if (!route) { console.log('路由不存在退出'); process.exit(1); }

  const r1 = await callKpi({ user:{ id:cui._id, role: cui.role||'NORMAL_ADMIN' }, query:{ range:'yesterday' }});
  chk('cuiding HTTP 200 success', r1.status===200 && r1.body.success===true, 'HTTP='+r1.status+' msg='+(r1.body?.message||r1.body?.error||''));
  if (r1.body?.data) assertAccount('cuiding(TL有下属)', r1.body.data, '有下属');

  const r2 = await callKpi({ user:{ id:fj._id, role: fj.role||'NORMAL_ADMIN' }, query:{ range:'yesterday' }});
  chk('fanjie HTTP 200 success', r2.status===200 && r2.body.success===true);
  if (r2.body?.data) assertAccount('fanjie(TL无下属)', r2.body.data, '无下属');

  // 组长视角：找一个有teamGroupId的组长账号 + 自己的组 → GL视角
  const gl = await Admin.findOne({ teamGroupId:{ $exists:true, $ne:null }, role:/GROUP_LEADER|group_leader|NORMAL_ADMIN|normal_admin/i })
    .select('_id teamGroupId role teamName').lean();
  if (gl && gl.teamGroupId) {
    const r3 = await callKpi({ user:{ id:gl._id, role: gl.role||'GROUP_LEADER' }, query:{ range:'yesterday', group: String(gl.teamGroupId) }});
    chk(`组长(${gl.teamName||gl._id}) HTTP 200 success`, r3.status===200 && r3.body.success===true,
      'HTTP='+r3.status+' msg='+(r3.body?.message||r3.body?.error||''));
    if (r3.body?.data) {
      const d = r3.body.data;
      console.log(`\n— 组长 GL视角 10项特征断言 —`);
      chk('GL _scope=GL', d._scope==='GL', d._scope);
      chk('GL indirectRevenue=0', d.indirectRevenue===0, d.indirectRevenue);
      chk('GL indirectCommission=0', d.indirectCommission===0);
      chk('GL indirectImpressions=0', d.indirectImpressions===0);
      chk('GL indirectUserCount=0', d.indirectUserCount===0);
      chk('GL teamRevenue=directRevenue', Math.abs(d.teamRevenue-d.directRevenue)<TOL);
      chk('GL teamCommission=directCommission', Math.abs(d.teamCommission-d.directCommission)<TOL);
      chk('GL directUserCount>=directActiveUsers', d.directActiveUsers <= d.directUserCount);
      chk('GL 字段总数=17', Object.keys(d).filter(k=>!k.startsWith('_')).length===17);
      // 组长直推综合率≈6%（P1档）±2%
      if (d.directRevenue>0) {
        const r=d.directCommission/d.directRevenue*100;
        chk('GL 直推综合率≈P1档6%（±2%）', Math.abs(r-6)<=2, '实际='+r.toFixed(2)+'%');
      } else {
        TOTAL++; console.log(`  ⚠ #${TOTAL}: GL直推业绩为0，跳过率校验`);
      }
    }
    // 越权：组长访问别人组 → 403
    const other = await mongoose.model('TeamGroup').findOne({ _id: { $ne: gl.teamGroupId }}).select('_id').lean();
    if (other) {
      const r4 = await callKpi({ user:{ id:gl._id, role: gl.role||'GROUP_LEADER' }, query:{ range:'yesterday', group: String(other._id) }});
      chk('越权访问别组 HTTP 403', r4.status===403, '实际HTTP='+r4.status);
    }
  } else {
    console.log('\n⚠ 跳过GL视角测试：没有 teamGroupId 不为空的组长账号');
  }

  console.log(`\n🏁 KPI接口 V3 GREEN：${TOTAL-FAILED}/${TOTAL} 通过`);
  if (FAILED > 0) { console.log(`❌ 有 ${FAILED} 项失败，不可交付`); process.exit(1); }
  else console.log(`✅ 全绿 → 可交付`);
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
