const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb';

(async () => {
  await mongoose.connect(MONGODB_URI);
  const Admin = require('./models/Admin');
  const dashboard = require('./routes/dashboard');

  console.log('=== 测试修改后的 _dRateExpr 逻辑 ===\n');

  // 恢复 Admin.commission 到正确的分成比例
  console.log('运行 recomputeAllAdminsCommission 恢复分成比例...');
  const verification = require('./routes/verification');
  const updatedCount = await verification.recomputeAllAdminsCommission('restore');
  console.log(`更新了 ${updatedCount} 个 Admin 的 commission 字段`);
  
  // 验证
  const admins = await Admin.find({ username: 'huangzhenhui' }).lean();
  console.log('huangzhenhui commission:', admins.commission);
  
  // 清除缓存
  console.log('\n清除缓存后重新计算...');
  
  // 调用 computeNewKpi
  const admin = await Admin.findOne({ username: 'huangzhenhui' }).lean();
  const scope = { kind: 'TL', adminId: String(admin._id) };
  const kpi = await dashboard.computeNewKpi(scope, 'lastMonth');
  console.log('\n修改后 computeNewKpi 结果:');
  console.log('  teamCommission:', kpi.teamCommission);
  console.log('  teamRevenue:', kpi.teamRevenue);
  console.log('  directCommission:', kpi.directCommission);
  console.log('  indirectCommission:', kpi.indirectCommission);
  
  // 对比用户截图的正确数据
  console.log('\n=== 与用户截图对比 ===');
  console.log('用户截图中的正确数据: ¥5,643.75');
  console.log('当前计算结果:          ¥' + kpi.teamCommission);
  console.log('差异:                  ¥' + (kpi.teamCommission - 5643.75).toFixed(2));

  await mongoose.disconnect();
})();
