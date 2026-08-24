// ================================================================
// HTTP层 smoke test（无side effect，只读Mongo，不写数据，不启动服务）
// 目标：验证路由handler的 scope推断 + 缓存key防越权 + 返回17字段一致性
// ================================================================
const mongoose = require('mongoose');
require('./models/Admin'); require('./models/Employee'); require('./models/TeamGroup');
require('./models/GoldLog'); require('./models/LoginRecord');
const MONGO = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
const dashboardRouter = require('./routes/dashboard');
const assert = require('assert');

(async () => {
  await mongoose.connect(MONGO);
  const Admin = mongoose.model('Admin');
  const cui = await Admin.findOne({ username:'cuiding' }).select('_id role username').lean();
  const fj  = await Admin.findOne({ username:'fanjie'  }).select('_id role username').lean();
  // 找一个真实组长（带teamGroupId）
  const gl = await Admin.findOne({ teamGroupId: { $exists: true, $ne: null }, role: { $in:['GROUP_LEADER','group_leader','NORMAL_ADMIN','normal_admin'] }}).select('_id role teamGroupId username').lean();

  let FAILED = 0, TOTAL = 0;
  function chk(name, cond, detail) {
    TOTAL++;
    if (cond) { console.log('  ✔', name); }
    else { FAILED++; console.log('  ❌', name, detail||''); }
  }

  // 工具：构造fake req/res，调用handler
  async function callKpi({ user, query }) {
    return await new Promise((resolve, reject) => {
      const req = { user, query, originalUrl: '/admin/dashboard/kpi', method: 'GET' };
      let statusCode = 200;
      const res = {
        status(c) { statusCode = c; return this; },
        json(payload) { resolve({ status: statusCode, body: payload }); }
      };
      // dashboard.js kpi 路由是第1个router.stack。直接取其handler。
      const route = dashboardRouter.stack.find(l => l.route && l.route.path === '/kpi' && l.route.methods.get);
      if (!route) return reject(new Error('route /kpi not found'));
      // authMiddleware依赖实际mongo且被绑定在router级别，这里手动跳过：kpi路由定义里内部有判断逻辑
      // 但router.get('/kpi', authMiddleware, handler)。所以stack是 [authMiddleware, handler]
      const layer = route.route.stack[route.route.stack.length - 1];
      try { layer.handle(req, res, err => reject(err)); } catch (e) { reject(e); }
    });
  }

  // 检查route存在
  const kpiRoute = dashboardRouter.stack.find(l => l.route && l.route.path === '/kpi');
  chk('GET /kpi 路由存在', !!kpiRoute);

  // ========= Case 1: TL cuiding 不传参数，自动推断TL视角 =========
  console.log('\nCase1: TL cuiding 不带参数（自动TL视角）');
  const r1 = await callKpi({ user:{ id:cui._id, role:'NORMAL_ADMIN' }, query:{ range:'yesterday' }});
  chk('HTTP 200 success=true', r1.status===200 && r1.body?.success===true, r1.status+' '+JSON.stringify(r1.body).slice(0,200));
  const d1 = r1.body?.data || {};
  chk('返回17业务字段（忽略_scope等meta）', Object.keys(d1).filter(k=>!k.startsWith('_')).length===17, '实际='+Object.keys(d1).filter(k=>!k.startsWith('_')).join(','));
  chk('_scope=TL', d1._scope==='TL', d1._scope);
  chk('_range=yesterday', d1._range==='yesterday', d1._range);
  chk('directRevenue 值合理（非null>0）', typeof d1.directRevenue==='number' && d1.directRevenue>0, JSON.stringify(d1.directRevenue));
  chk('间推commission非零（历史兜底应生效）', d1.indirectCommission>0, '实际='+d1.indirectCommission);
  chk('战队提成=直推+间推', Math.abs((d1.teamCommission||0) - (d1.directCommission||0) - (d1.indirectCommission||0)) < 0.03,
    `${d1.teamCommission} vs ${d1.directCommission}+${d1.indirectCommission}`);
  chk('战队业绩=直推+间推', Math.abs((d1.teamRevenue||0) - (d1.directRevenue||0) - (d1.indirectRevenue||0)) < 0.03,
    `${d1.teamRevenue} vs ${d1.directRevenue}+${d1.indirectRevenue}`);

  // ========= Case 2: TL fanjie 无下属组和下属TL → 间推=0 =========
  console.log('\nCase2: TL fanjie 无下属 → 间推字段全0');
  const r2 = await callKpi({ user:{ id:fj._id, role:'NORMAL_ADMIN' }, query:{ range:'yesterday' }});
  chk('HTTP 200 success=true', r2.status===200 && r2.body?.success===true);
  const d2 = r2.body?.data || {};
  chk('间推Revenue=0', d2.indirectRevenue===0, d2.indirectRevenue);
  chk('间推Impressions=0', d2.indirectImpressions===0, d2.indirectImpressions);
  chk('间推Commission=0', d2.indirectCommission===0, d2.indirectCommission);
  chk('战队提成=直推提成', Math.abs((d2.teamCommission||0) - (d2.directCommission||0)) < 0.02);

  // ========= Case 3: 组长传 group 参数 → 组长视角 =========
  if (gl && gl.teamGroupId) {
    console.log('\nCase3: 组长 '+gl.username+' 传 group='+gl.teamGroupId+'（GL视角）');
    const r3 = await callKpi({ user:{ id:gl._id, role:'GROUP_LEADER' }, query:{ range:'yesterday', group: String(gl.teamGroupId) }});
    chk('HTTP 200 success=true', r3.status===200 && r3.body?.success===true, r3.status+' '+JSON.stringify(r3.body||{}).slice(0,120));
    const d3 = r3.body?.data || {};
    chk('_scope=GL', d3._scope==='GL', d3._scope);
    chk('GL 间推Revenue恒=0', d3.indirectRevenue===0, d3.indirectRevenue);
    chk('GL 间推Commission恒=0', d3.indirectCommission===0, d3.indirectCommission);
    chk('GL 战队业绩=直推业绩', Math.abs((d3.teamRevenue||0) - (d3.directRevenue||0)) < 0.03, `${d3.teamRevenue} vs ${d3.directRevenue}`);
    chk('返回17业务字段', Object.keys(d3).filter(k=>!k.startsWith('_')).length===17);
  } else {
    console.log('\nCase3 SKIP：系统中暂无 teamGroupId 不为空的组长账号');
  }

  // ========= Case 4: 无权组长访问别人组 → 403 =========
  if (gl && gl.teamGroupId) {
    console.log('\nCase4: 组长A 尝试访问 组长B 的组 → 应 403');
    // 找另一个不同的组（如果有）或直接用cuiding自己的teamName（应400/403）
    const anotherGroup = await mongoose.model('TeamGroup').findOne({ _id: { $ne: gl.teamGroupId }}).select('_id').lean();
    if (anotherGroup) {
      const r4 = await callKpi({ user:{ id:gl._id, role:'GROUP_LEADER' }, query:{ range:'yesterday', group: String(anotherGroup._id) }});
      chk('无权访问他组 HTTP 403', r4.status===403, '实际='+r4.status);
    } else {
      console.log('  ⚠ 只有一个组，跳过越权测试');
    }
  }

  // ========= Case 5: 不包含用户不想要的字段（AvgGoldPerImp / indirectRevenueGrowth等） =========
  console.log('\nCase5: 确认不包含用户明确剔除的字段');
  chk('不含 directAvgGoldPerImp(A3不要)', !('directAvgGoldPerImp' in d1));
  chk('不含 indirectAvgGoldPerImp(A3不要)', !('indirectAvgGoldPerImp' in d1));
  chk('不含 indirectRevenueGrowth(D4不要)', !('indirectRevenueGrowth' in d1));

  console.log(`\n🏁 HTTP Smoke 结果: ${TOTAL-FAILED}/${TOTAL} 通过`);
  process.exit(FAILED===0 ? 0 : 1);
})().catch(e=>{console.error(e);process.exit(1)});
