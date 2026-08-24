// 测试提成率缓存功能
(async () => {
  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017', {});
  
  const Admin = require('./models/Admin');
  const dashboard = require('./routes/dashboard');
  
  const huang = await Admin.findOne({ username: 'huangzhenhui' }).lean().exec();
  if (!huang) {
    console.log('黄振汇不存在');
    process.exit(0);
  }
  
  console.log('测试提成率缓存功能...');
  
  const start1 = Date.now();
  const kpi1 = await dashboard.computeNewKpi({ kind: 'TL', adminId: String(huang._id) }, 'today');
  const time1 = Date.now() - start1;
  console.log('1. 第一次调用（计算提成率）');
  console.log('   耗时:', time1 + 'ms');
  
  const start2 = Date.now();
  const kpi2 = await dashboard.computeNewKpi({ kind: 'TL', adminId: String(huang._id) }, 'today');
  const time2 = Date.now() - start2;
  console.log('2. 第二次调用（应该命中缓存）');
  console.log('   耗时:', time2 + 'ms');
  
  console.log('3. 验证两次结果一致');
  const ratesMatch = Math.abs(kpi1.directCommission - kpi2.directCommission) < 0.01;
  console.log('   直推提成一致:', ratesMatch ? 'PASS' : 'FAIL');
  
  console.log('4. 验证缓存效果');
  const cacheHit = time2 < time1 * 0.5;
  console.log('   第二次更快:', cacheHit ? 'PASS (缓存生效)' : 'FAIL (缓存未生效)');
  
  const verification = require('./routes/verification');
  const perf = await verification.getTeamLeaderPerformance(String(huang._id), { monthCount: 1 });
  const expectedRate = perf.data.level.currentCommission;
  const actualRate = kpi1.directRevenue > 0 ? kpi1.directCommission / kpi1.directRevenue : 0;
  console.log('5. 验证提成率正确');
  console.log('   期望提成率:', (expectedRate * 100).toFixed(1) + '%');
  console.log('   实际提成率:', (actualRate * 100).toFixed(1) + '%');
  console.log('   一致:', Math.abs(expectedRate - actualRate) < 0.001 ? 'PASS' : 'FAIL');
  
  await mongoose.disconnect();
  console.log('\n测试完成');
})().catch(e => {
  console.error(e);
  process.exit(1);
});