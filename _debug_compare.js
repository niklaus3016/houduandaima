const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb';

(async () => {
  await mongoose.connect(MONGODB_URI);
  const Admin = require('./models/Admin');
  const dashboard = require('./routes/dashboard');

  console.log('=== 对比两次 computeNewKpi 调用 ===\n');

  const admin = await Admin.findOne({ username: 'huangzhenhui' }).lean();
  
  // 清除缓存
  const redis = require('./utils/redis');
  const { getFromCache, setCache } = require('./utils/cache');
  
  const commissionCacheKey = `tl_real_commission_${String(admin._id)}`;
  console.log('清除提成率缓存:', commissionCacheKey);
  
  // 第一次调用
  console.log('\n第1次调用 computeNewKpi:');
  const scope = { kind: 'TL', adminId: String(admin._id) };
  const kpi1 = await dashboard.computeNewKpi(scope, 'lastMonth');
  console.log('  teamCommission:', kpi1.teamCommission);
  console.log('  teamRevenue:', kpi1.teamRevenue);
  console.log('  directCommission:', kpi1.directCommission);
  console.log('  indirectCommission:', kpi1.indirectCommission);
  console.log('  _scope:', kpi1._scope);
  
  // 清除缓存
  console.log('\n清除提成率缓存后再调用...');
  
  // 第二次调用
  const kpi2 = await dashboard.computeNewKpi(scope, 'lastMonth');
  console.log('\n第2次调用 computeNewKpi:');
  console.log('  teamCommission:', kpi2.teamCommission);
  console.log('  teamRevenue:', kpi2.teamRevenue);
  console.log('  directCommission:', kpi2.directCommission);
  console.log('  indirectCommission:', kpi2.indirectCommission);
  
  // 对比
  console.log('\n=== 对比结果 ===');
  console.log('teamCommission 变化:', kpi1.teamCommission, '->', kpi2.teamCommission);
  console.log('差值:', (kpi2.teamCommission - kpi1.teamCommission).toFixed(2));

  await mongoose.disconnect();
})();
