// 验证组长 P1 提成率已从 6% 改为 5%
(async () => {
  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017', {});

  const Admin = require('./models/Admin');
  const Employee = require('./models/Employee');
  const GoldLog = require('./models/GoldLog');
  const TeamGroup = require('./models/TeamGroup');

  console.log('=== 1. 检查所有组长 Admin.commission ===');
  const gls = await Admin.find({ role: /GROUP_LEADER|group_leader/i }).select('username realName commission').lean();
  gls.forEach(g => {
    const pct = (g.commission * 100).toFixed(1);
    const ok = pct === '5.0';
    console.log('  ' + g.username + ' (' + g.realName + '): ' + pct + '% ' + (ok ? '✅' : '❌'));
  });

  console.log('\n=== 2. 检查 TeamGroup.commission ===');
  const tgs = await TeamGroup.find({}).select('groupName commission groupLeaderId').lean();
  tgs.forEach(t => {
    console.log('  ' + t.groupName + ': ' + (t.commission * 100).toFixed(1) + '%');
  });

  console.log('\n=== 3. 测试 GoldLog 固化（找一个有组长的员工）===');
  // 找一个有 teamGroupId 的员工
  const emp = await Employee.findOne({ teamGroupId: { $exists: true, $ne: null } }).lean();
  if (emp) {
    console.log('  测试员工:', emp.employeeId, emp.realName);

    const testLog = new GoldLog({
      employeeId: emp.employeeId,
      userId: String(emp._id),
      gold: 100,
      type: 'test_5pct',
      revenue: 1000,
      source: 'test',
    });
    await testLog.save();

    console.log('  固化结果:');
    console.log('    commissionRate(组长率):', (testLog.commissionRate * 100).toFixed(1) + '%');
    console.log('    tlCommissionRate(级差):', (testLog.tlCommissionRate * 100).toFixed(1) + '%');
    console.log('    parentTlCommissionRate:', testLog.parentTlCommissionRate ? (testLog.parentTlCommissionRate * 100).toFixed(1) + '%' : '无');

    const isFivePct = Math.abs(testLog.commissionRate - 0.05) < 0.001;
    console.log('    组长率=5%:', isFivePct ? '✅' : '❌ (实际=' + (testLog.commissionRate * 100).toFixed(1) + '%)');

    await GoldLog.findByIdAndDelete(testLog._id);
    console.log('  测试数据已清理');
  } else {
    console.log('  没有找到有 teamGroupId 的员工');
  }

  console.log('\n=== 4. 检查代码中的默认值 ===');
  const verification = require('./routes/verification');
  const { getGroupLeaderCommission } = verification;
  if (typeof getGroupLeaderCommission === 'function') {
    const defaultRate = await getGroupLeaderCommission(null);
    console.log('  getGroupLeaderCommission(null) 默认值:', (defaultRate * 100).toFixed(1) + '%', defaultRate === 0.05 ? '✅' : '❌');
  }

  await mongoose.disconnect();
  console.log('\n验证完成');
})().catch(e => {
  console.error(e);
  process.exit(1);
});