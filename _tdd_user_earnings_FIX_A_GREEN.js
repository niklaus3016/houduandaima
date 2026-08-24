// TDD GREEN：/user/:id/earnings 方案A修复验证（支持 emp_xxx / 工号 / ObjectId / UserGold.userId 4种）
const mongoose = require('mongoose');
require('./models/Admin'); require('./models/Employee');
require('./models/TeamGroup'); require('./models/GoldLog');
require('./models/TeamLeaderLevelConfig'); require('./models/UserGold');
require('./models/UserActivity'); require('./models/Team');
require('./models/GroupLeaderLevelConfig');
const ueRoute = require('./routes/userEarnings');
const MONGO = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
let fails=0;
function c(lab,cond,msg){ if(cond) console.log('✅ '+lab); else { console.log('❌ '+lab+' → '+msg); fails++; } }

function findRoute(router, path, method) {
  for (const l of router.stack) {
    if (!l.route) continue;
    if (l.route.path !== path) continue;
    if (!l.route.methods[method]) continue;
    return l.route.stack;
  }
  return null;
}
async function runEarnings(userId, user) {
  const stack = findRoute(ueRoute, '/:userId/earnings', 'get');
  if (!stack) { console.log('⚠️  找不到 route'); return { status:500, json:null }; }
  const handler = stack[stack.length - 1].handle; // 跳 authMiddleware
  return new Promise(res2 => {
    let s=200;
    const res={ status(x){ s=x; return this; }, json(o){ res2({ status:s, json:o }); return this; } };
    try {
      const p = handler({ params:{ userId }, user: user || { id:'test', role:'SUPER_ADMIN' } },
        res, err=>res2({ status:s, json:null, err:err?.stack||String(err) }));
      if (p?.catch) p.catch(err=>res2({ status:s, json:null, err:err.stack||String(err) }));
    } catch(e) { res2({ status:s, json:null, err:e.stack||String(e) }); }
  });
}

(async()=>{
  await mongoose.connect(MONGO,{});
  const Employee = mongoose.model('Employee');
  const Admin = mongoose.model('Admin');
  const GoldLog = mongoose.model('GoldLog');

  // 选一个有 GoldLog 数据的真实员工（先 dashboard/users 常用的：找一个 employeeId 有>0 金币数据的）
  const cui = await Admin.findOne({ username:'cuiding' }).select('_id commission role').lean();
  // 找 cuiding 直属的某个 D 员工（有今日 earnings）：用 Employee.find(parentId=cui._id) 拿第一个，看 GoldLog
  const cuiDirectD = await Employee.find({ parentId: String(cui._id) }).select('_id employeeId realName').limit(5).lean();
  console.log('cuiding 直推D样例 5人:', cuiDirectD.map(e=>({id:e.employeeId, name:e.realName, _id:String(e._id).slice(-6)})));

  // 选第一个有 GoldLog 数据的员工做测试样本（至少有金币的）
  let sampleEmp = null;
  for (const e of cuiDirectD) {
    const cnt = await GoldLog.countDocuments({ employeeId: e.employeeId });
    console.log(`  employeeId=${e.employeeId}(${e.realName}) GoldLog数=${cnt}`);
    if (cnt > 0) { sampleEmp = e; break; }
  }
  if (!sampleEmp) { console.log('❌ 没找到有 GoldLog 的 cuiding 直推D，改走周俊霞1065');
    const zhou = await Employee.findOne({ employeeId:'1065' }).select('_id employeeId realName').lean();
    if (zhou) sampleEmp = zhou;
  }
  if (!sampleEmp) { console.log('❌ 连周俊霞1065都找不到，exit'); process.exit(1); }
  console.log(`\n🎯 样本员工: employeeId=${sampleEmp.employeeId} realName=${sampleEmp.realName} Employee._id=${String(sampleEmp._id)}`);

  // 先直接用 GoldLog 聚合算出真值（用于对比不同ID形式返回是否一致）
  const groundTruth = await GoldLog.aggregate([
    { $match: { employeeId: sampleEmp.employeeId } },
    { $group: { _id: null, g: { $sum: '$gold' }, n: { $sum: 1 } } }
  ]).allowDiskUse(true);
  const trueEarnings = (groundTruth[0]?.g || 0) / 1000;
  console.log(`  真值 totalEarnings=¥${trueEarnings.toFixed(2)} GoldLog记录数=${groundTruth[0]?.n||0}`);

  // ============ RED 前：修前的 bug 验证（如果我们没改，应该全 404）============
  // 现在修完了，应该全绿
  console.log('\n========== 1. emp_ 前缀形式（dashboard/users 的 userId，前端现在传的）==========');
  const r1 = await runEarnings('emp_'+sampleEmp.employeeId, { role:'NORMAL_ADMIN', id: String(cui._id) });
  c('HTTP 200', r1.status===200 && r1.json?.success, 'st='+r1.status+' msg='+(r1.json?.message||r1.json?.error?.slice(0,200)));
  const d1 = r1.json?.data;
  if (d1) {
    c(`totalEarnings ≈ 真值 ${trueEarnings.toFixed(2)}`,
      Math.abs((d1.totalEarnings||0) - trueEarnings) < 0.02,
      `接口=${d1.totalEarnings} 真值=${trueEarnings.toFixed(2)}`);
    c('返回 userId = employeeId', String(d1.userId)===String(sampleEmp.employeeId),
      `接口返回 userId=${d1.userId} 期望=${sampleEmp.employeeId}`);
    c('_debug.matchBy=emp_prefix', r1.json?._debug?.matchBy==='emp_prefix', 'matchBy='+r1.json?._debug?.matchBy);
    console.log(`   totalEarnings=¥${d1.totalEarnings} currentMonth=¥${d1.currentMonth?.totalEarnings} 历史月=${(d1.historyMonths||[]).length}个`);
  }

  console.log('\n========== 2. 纯数字工号形式（employeeId 直接传）==========');
  const r2 = await runEarnings(String(sampleEmp.employeeId), { role:'SUPER_ADMIN', id: 'sa' });
  c('HTTP 200', r2.status===200 && r2.json?.success, 'st='+r2.status+' msg='+(r2.json?.message||'').slice(0,100));
  const d2 = r2.json?.data;
  if (d2) {
    c(`totalEarnings ≈ 真值 ${trueEarnings.toFixed(2)}`,
      Math.abs((d2.totalEarnings||0) - trueEarnings) < 0.02,
      `接口=${d2.totalEarnings} 真值=${trueEarnings.toFixed(2)}`);
    c('和 emp_ 形式 totalEarnings 完全相等', String(d2.totalEarnings)===String(d1?.totalEarnings||'0'),
      `emp_=${d1?.totalEarnings} 纯数字=${d2.totalEarnings}`);
    c('_debug.matchBy=employeeId_digits', r2.json?._debug?.matchBy==='employeeId_digits', 'matchBy='+r2.json?._debug?.matchBy);
  }

  console.log('\n========== 3. Employee._id 形式（24位 Mongo ObjectId）==========');
  const r3 = await runEarnings(String(sampleEmp._id), { role:'SUPER_ADMIN', id: 'sa' });
  c('HTTP 200', r3.status===200 && r3.json?.success, 'st='+r3.status+' msg='+(r3.json?.message||'').slice(0,100));
  const d3 = r3.json?.data;
  if (d3) {
    c(`totalEarnings ≈ 真值 ${trueEarnings.toFixed(2)}`,
      Math.abs((d3.totalEarnings||0) - trueEarnings) < 0.02,
      `接口=${d3.totalEarnings} 真值=${trueEarnings.toFixed(2)}`);
    c('和 emp_ 形式 totalEarnings 完全相等', String(d3.totalEarnings)===String(d1?.totalEarnings||'0'),
      `emp_=${d1?.totalEarnings} ObjectId=${d3.totalEarnings}`);
    c('_debug.matchBy=employeeObjectId', r3.json?._debug?.matchBy==='employeeObjectId', 'matchBy='+r3.json?._debug?.matchBy);
  }

  console.log('\n========== 4. 不存在的ID → 404（边界用例）==========');
  const r4 = await runEarnings('emp_00000099999_nope', { role:'SUPER_ADMIN', id:'sa' });
  c('不存在 emp_ 形式返回 404', r4.status===404, 'st='+r4.status);
  const r5 = await runEarnings('9999999', { role:'SUPER_ADMIN', id:'sa' });
  c('不存在 超长数字 返回 404', r5.status===404, 'st='+r5.status);
  const r6 = await runEarnings('', { role:'SUPER_ADMIN', id:'sa' });
  c('空串返回 404', r6.status===404 || (r6.json && !r6.json.success), 'st='+r6.status);

  console.log('\n========== 5. Employee.findBy_id(Admin._id) 不同表 ID：正常找不到返回404；若恰好命中则200 ==========');
  // 重要：Admin._id 和 Employee._id 是两张独立表的 ObjectId，绝大多数不相等，所以返回 404 是正确的
  // case3(Employee._id 传 sampleEmp._id) 已经验证过合法 Employee._id 能正确查到
  const r7 = await runEarnings(String(cui._id), { role:'SUPER_ADMIN', id:'sa' });
  const cuiAsEmpByAdminId = await Employee.findById(cui._id).select('_id employeeId').lean();
  console.log(`  Employee.findById(Admin.cui._id) 结果：${cuiAsEmpByAdminId ? '有记录 employeeId='+cuiAsEmpByAdminId.employeeId : '无(正常，因为不同表)'}`);
  if (cuiAsEmpByAdminId) {
    // 如果恰好 Admin._id == Employee._id（少见，可能是测试环境数据）
    c('若 Admin._id 恰好命中 Employee._id，则 200', r7.status===200 && r7.json?.success, 'st='+r7.status);
  } else {
    // 正常情况：Admin._id 查不到 Employee → 返回 404 正确
    c('Admin._id 不是合法 Employee._id → 返回 404 正常（前端不会这么传，前端传 emp_ 工号）',
      r7.status===404, 'st='+r7.status);
  }

  console.log('\n===== TOTAL FAILURES: '+fails+' =====');
  if (fails > 0) process.exit(1);
  console.log('✅ ALL GREEN');
  process.exit(0);
})().catch(e=>{ console.error('💥 CRASH:', e.stack||String(e)); process.exit(1); });
