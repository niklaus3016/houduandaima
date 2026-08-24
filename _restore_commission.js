const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb';

(async () => {
  await mongoose.connect(MONGODB_URI);
  const Admin = require('./models/Admin');
  const dashboard = require('./routes/dashboard');

  console.log('=== 恢复正确的 commission 值 ===\n');

  // 用户截图中 huangzhenhui 的正确数据是 14% (0.14)
  // 检查实时算档
  const verification = require('./routes/verification');
  const perf = await verification.getTeamLeaderPerformance(
    (await Admin.findOne({ username: 'huangzhenhui' }))._id, 
    { allowLazy: false }
  );
  
  console.log('实时算档结果:');
  console.log('  currentCommission:', perf?.data?.level?.currentCommission);
  console.log('  currentLevel:', perf?.data?.level?.currentLevel);
  console.log('  totalRevenue:', perf?.data?.summary?.totalRevenue);
  
  // 用户截图中的数据是 ¥5,643.75，这是用 14% 计算的
  // 所以我们应该把 commission 设置为 0.14
  
  // 恢复 huangzhenhui 的 commission
  await Admin.updateOne(
    { username: 'huangzhenhui' },
    { $set: { commission: 0.14, updatedAt: new Date() } }
  );
  
  console.log('\n已将 huangzhenhui.commission 设置为 0.14 (14%)');
  
  // 验证
  const admin = await Admin.findOne({ username: 'huangzhenhui' }).lean();
  console.log('验证:', admin.username, 'commission =', admin.commission);
  
  // 重新计算
  console.log('\n重新计算 computeNewKpi...');
  const scope = { kind: 'TL', adminId: String(admin._id) };
  const kpi = await dashboard.computeNewKpi(scope, 'lastMonth');
  
  console.log('\n计算结果:');
  console.log('  teamCommission:', kpi.teamCommission);
  console.log('  directCommission:', kpi.directCommission);
  console.log('  indirectCommission:', kpi.indirectCommission);
  
  console.log('\n=== 对比用户截图 ===');
  console.log('用户截图中的正确数据: ¥5,643.75');
  console.log('当前计算结果:          ¥' + kpi.teamCommission);
  console.log('差异:                  ¥' + (kpi.teamCommission - 5643.75).toFixed(2));

  await mongoose.disconnect();
})();
