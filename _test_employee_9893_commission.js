// 测试员工9893的间推提成计算
(async () => {
  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017', {});
  
  const Employee = require('./models/Employee');
  const Admin = require('./models/Admin');
  const GoldLog = require('./models/GoldLog');
  const TeamGroup = require('./models/TeamGroup');
  const { getTeamLeaderRealCommission, getGroupLeaderRealCommission } = require('./utils/commissionRateCache');
  
  console.log('=== 查询员工9893归属关系 ===');
  const emp = await Employee.findOne({ employeeId: '9893' }).lean().exec();
  if (!emp) {
    console.log('员工9893不存在');
    process.exit(0);
  }
  
  console.log('员工信息:', JSON.stringify(emp, null, 2));
  
  // 查询组长（范洁）
  let gl = null;
  if (emp.teamGroupId) {
    const tg = await TeamGroup.findById(emp.teamGroupId).lean().exec();
    if (tg && tg.groupLeaderId) {
      gl = await Admin.findById(tg.groupLeaderId).lean().exec();
    }
  } else if (emp.parentId) {
    gl = await Admin.findById(emp.parentId).lean().exec();
  }
  
  // 查询团队长（崔鼎）
  let tl = null;
  if (gl && gl.parentTlId) {
    tl = await Admin.findById(gl.parentTlId).lean().exec();
  }
  
  console.log('\n=== 归属链 ===');
  console.log('员工9893');
  console.log('  → 组长:', gl ? gl.username + '(' + gl.realName + ')' : '无');
  console.log('    → 团队长:', tl ? tl.username + '(' + tl.realName + ')' : '无');
  
  // 获取提成率
  console.log('\n=== 提成率 ===');
  const glRate = gl ? await getGroupLeaderRealCommission(String(gl._id)) : 0;
  const tlRate = tl ? await getTeamLeaderRealCommission(String(tl._id)) : 0;
  
  console.log('组长(' + (gl?.username || '无') + ') 提成率:', (glRate * 100).toFixed(1) + '%');
  console.log('团队长(' + (tl?.username || '无') + ') 提成率:', (tlRate * 100).toFixed(1) + '%');
  console.log('级差(TL-GL):', ((tlRate - glRate) * 100).toFixed(1) + '%');
  
  // 创建测试记录
  console.log('\n=== 创建测试 GoldLog（金币100，收入1000）===');
  const testLog = new GoldLog({
    employeeId: emp.employeeId,
    userId: String(emp._id),
    gold: 100,
    type: 'test_9893',
    revenue: 1000,
    source: 'test',
    teamLeaderId: tl ? String(tl._id) : null
  });
  
  await testLog.save();
  
  console.log('固化结果:');
  console.log('  commissionRate(组长率):', (testLog.commissionRate * 100).toFixed(1) + '%');
  console.log('  tlCommissionRate(级差):', (testLog.tlCommissionRate * 100).toFixed(1) + '%');
  console.log('  parentTlCommissionRate(上上级级差):', testLog.parentTlCommissionRate ? (testLog.parentTlCommissionRate * 100).toFixed(1) + '%' : '无');
  
  // 验证
  console.log('\n=== 验证 ===');
  const expectedGlRate = glRate || 0;
  const expectedTlRate = Math.max(0, tlRate - expectedGlRate);
  
  console.log('期望组长率:', (expectedGlRate * 100).toFixed(1) + '%');
  console.log('期望级差:', (expectedTlRate * 100).toFixed(1) + '%');
  
  const glMatch = Math.abs(testLog.commissionRate - expectedGlRate) < 0.001;
  const tlMatch = Math.abs(testLog.tlCommissionRate - expectedTlRate) < 0.001;
  
  console.log('组长率一致:', glMatch ? '✅' : '❌');
  console.log('级差一致:', tlMatch ? '✅' : '❌');
  
  // 清理测试数据
  await GoldLog.findByIdAndDelete(testLog._id);
  console.log('\n测试数据已清理');
  
  await mongoose.disconnect();
  console.log('测试完成');
})().catch(e => {
  console.error(e);
  process.exit(1);
});