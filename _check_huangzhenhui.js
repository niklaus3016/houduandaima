const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb';

(async () => {
  await mongoose.connect(MONGODB_URI);
  const Admin = require('./models/Admin');
  const Employee = require('./models/Employee');
  const dashboard = require('./routes/dashboard');

  console.log('=== 检查 huangzhenhui 数据 ===\n');

  // 1. 查询 Admin 数据
  const admin = await Admin.findOne({ username: 'huangzhenhui' }).lean();
  console.log('1. Admin 数据:');
  console.log('   _id:', admin._id);
  console.log('   username:', admin.username);
  console.log('   role:', admin.role);
  console.log('   teamName:', admin.teamName);
  console.log('   commission:', admin.commission, '(类型:', typeof admin.commission, ')');
  console.log('   commission 在 0-1 范围内?', admin.commission >= 0 && admin.commission <= 1 ? '是' : '否');

  // 2. 查询 Employee 数据
  const employee = await Employee.findOne({ employeeId: admin.username }).lean();
  console.log('\n2. Employee 数据:');
  if (employee) {
    console.log('   employeeId:', employee.employeeId);
    console.log('   name:', employee.name);
    console.log('   teamName:', employee.teamName);
    console.log('   level:', employee.level);
  } else {
    console.log('   未找到 Employee 记录');
  }

  // 3. 检查下属员工
  console.log('\n3. 检查下属员工:');
  const subEmployees = await Employee.find({ 
    $or: [
      { teamLeaderId: admin._id.toString() },
      { teamLeaderId: admin.username }
    ]
  }).lean();
  console.log('   下属员工数量:', subEmployees.length);
  if (subEmployees.length > 0) {
    subEmployees.forEach(e => {
      console.log('     - employeeId:', e.employeeId, 'name:', e.name);
    });
  }

  // 4. 使用 dashboard 计算上月 KPI
  console.log('\n4. 计算上月 KPI:');
  try {
    const kpi = await dashboard.computeTlKpi('lastMonth', admin._id.toString());
    console.log('   KPI 结果:');
    console.log('     teamCommission:', kpi.teamCommission);
    console.log('     totalCommission:', kpi.totalCommission);
    console.log('     personalCommission:', kpi.personalCommission);
    console.log('     level:', kpi.level);
    console.log('     commissionRate:', kpi.commissionRate);
  } catch (e) {
    console.log('   计算失败:', e.message);
  }

  // 5. 检查 verification.js 中的计算逻辑
  console.log('\n5. 检查 verification 接口计算上月收益:');
  const verification = require('./routes/verification');
  
  console.log('\n=== 调查完成 ===');
  await mongoose.disconnect();
})();
