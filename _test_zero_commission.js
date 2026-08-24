const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb';

(async () => {
  await mongoose.connect(MONGODB_URI);
  const Admin = require('./models/Admin');
  const dashboard = require('./routes/dashboard');

  console.log('=== 测试：将 Admin.commission 改为 0 后看计算结果 ===\n');

  // 先缓存原来的值
  const admins = await Admin.find({ role: 'NORMAL_ADMIN' }).select('username commission').lean();
  console.log('当前所有团队长的 commission 字段:');
  for (const a of admins) {
    console.log(`  ${a.username}: ${a.commission}`);
  }
  
  // 将所有团队长的 commission 改为 0（模拟之前的状态）
  console.log('\n将所有团队长的 commission 改为 0...');
  await Admin.updateMany(
    { role: 'NORMAL_ADMIN' },
    { $set: { commission: 0, updatedAt: new Date() } }
  );
  
  // 验证修改
  const verifyAdmins = await Admin.find({ role: 'NORMAL_ADMIN' }).select('username commission').lean();
  console.log('\n修改后:');
  for (const a of verifyAdmins) {
    console.log(`  ${a.username}: ${a.commission}`);
  }
  
  // 清除缓存后重新计算
  console.log('\n清除缓存后重新计算 huangzhenhui 的上月收益...');
  
  const admin = await Admin.findOne({ username: 'huangzhenhui' }).lean();
  const scope = { kind: 'TL', adminId: String(admin._id) };
  const kpi = await dashboard.computeNewKpi(scope, 'lastMonth');
  console.log('teamCommission:', kpi.teamCommission);
  console.log('teamRevenue:', kpi.teamRevenue);
  console.log('directCommission:', kpi.directCommission);
  console.log('indirectCommission:', kpi.indirectCommission);

  await mongoose.disconnect();
})();
