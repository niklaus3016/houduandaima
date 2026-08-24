// 测试 GoldLog 使用缓存提成率（直推 + 间推）
(async () => {
  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017', {});
  
  const Admin = require('./models/Admin');
  const Employee = require('./models/Employee');
  const GoldLog = require('./models/GoldLog');
  const { getTeamLeaderRealCommission } = require('./utils/commissionRateCache');
  
  const huang = await Admin.findOne({ username: 'huangzhenhui' }).lean().exec();
  if (!huang) {
    console.log('黄振汇不存在');
    process.exit(0);
  }
  
  // 获取实时提成率（应该是14%）
  const realRate = await getTeamLeaderRealCommission(String(huang._id));
  console.log('黄振汇实时提成率:', (realRate * 100).toFixed(1) + '%');
  
  // 1. 测试直推（D员工，没有teamGroupId）
  console.log('\n=== 测试直推（D员工）===');
  const dEmp = await Employee.findOne({ teamGroupId: { $exists: false }, parentId: String(huang._id) }).lean().exec();
  if (dEmp) {
    const testLog1 = new GoldLog({
      employeeId: dEmp.employeeId,
      userId: String(dEmp._id),
      gold: 100,
      type: 'test_direct',
      revenue: 1000,
      source: 'test',
      teamLeaderId: String(huang._id)
    });
    await testLog1.save();
    console.log('直推 tlCommissionRate:', (testLog1.tlCommissionRate * 100).toFixed(1) + '%');
    console.log('期望:', (realRate * 100).toFixed(1) + '%');
    console.log('一致:', Math.abs(testLog1.tlCommissionRate - realRate) < 0.001 ? '✅' : '❌');
    await GoldLog.findByIdAndDelete(testLog1._id);
  } else {
    console.log('没有找到黄振汇的直推员工');
  }
  
  // 2. 测试间推（G员工，有teamGroupId）
  console.log('\n=== 测试间推（G员工）===');
  const gEmp = await Employee.findOne({ teamGroupId: { $exists: true } }).lean().exec();
  if (gEmp) {
    const testLog2 = new GoldLog({
      employeeId: gEmp.employeeId,
      userId: String(gEmp._id),
      gold: 100,
      type: 'test_indirect',
      revenue: 1000,
      source: 'test',
      teamLeaderId: String(huang._id)
    });
    await testLog2.save();
    console.log('间推 commissionRate(组长率):', (testLog2.commissionRate * 100).toFixed(1) + '%');
    console.log('间推 tlCommissionRate(级差):', (testLog2.tlCommissionRate * 100).toFixed(1) + '%');
    console.log('级差 = TL率 - 组长率:', ((realRate - testLog2.commissionRate) * 100).toFixed(1) + '%');
    await GoldLog.findByIdAndDelete(testLog2._id);
  } else {
    console.log('没有找到间推员工');
  }
  
  await mongoose.disconnect();
  console.log('\n测试完成');
})().catch(e => {
  console.error(e);
  process.exit(1);
});