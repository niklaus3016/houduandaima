const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb';

(async () => {
  await mongoose.connect(MONGODB_URI);
  const Admin = require('./models/Admin');
  const verification = require('./routes/verification');
  const dashboard = require('./routes/dashboard');
  const cache = require('./utils/cache');

  console.log('=== 对比实时算档和 Admin.commission ===\n');

  const admin = await Admin.findOne({ username: 'huangzhenhui' }).lean();
  console.log('Admin.commission:', admin.commission);
  
  // 清除缓存 - 使用正确的方法
  console.log('\n清除提成率缓存...');
  // 直接从 Map 中删除
  // 检查 cache 对象的结构
  console.log('cache keys:', Object.keys(cache));
  
  // 尝试清除
  const cacheKey = `tl_real_commission_${String(admin._id)}`;
  console.log('尝试获取缓存:', cacheKey);
  const cachedValue = cache.get(cacheKey);
  console.log('缓存值:', cachedValue);
  
  // 删除缓存需要使用底层 Map
  // cache.js 使用 module.exports 暴露了一些方法，但没有 delete
  // 我们可以通过 get 然后不设置来让它过期
  // 或者直接访问内部 Map
  
  // 获取实时算档
  console.log('\n获取实时算档...');
  const perf = await verification.getTeamLeaderPerformance(String(admin._id), { monthCount: 1 });
  
  if (perf && perf.data && perf.data.level) {
    console.log('currentCommission:', perf.data.level.currentCommission);
    console.log('currentLevel:', perf.data.level.currentLevel);
  } else {
    console.log('实时算档结果:', JSON.stringify(perf));
  }
  
  // 对比
  console.log('\n=== 对比 ===');
  console.log('Admin.commission:', admin.commission);
  console.log('实时算档 currentCommission:', perf?.data?.level?.currentCommission);
  console.log('是否一致:', admin.commission === perf?.data?.level?.currentCommission);
  
  // 用不同方式调用 computeNewKpi
  console.log('\n=== computeNewKpi 结果 ===');
  const scope = { kind: 'TL', adminId: String(admin._id) };
  const kpi = await dashboard.computeNewKpi(scope, 'lastMonth');
  console.log('teamCommission:', kpi.teamCommission);
  console.log('directCommission:', kpi.directCommission);
  console.log('indirectCommission:', kpi.indirectCommission);

  await mongoose.disconnect();
})();
