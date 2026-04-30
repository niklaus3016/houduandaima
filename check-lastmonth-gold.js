const mongoose = require('mongoose');
const Admin = require('./models/Admin');
const Employee = require('./models/Employee');
const GoldLog = require('./models/GoldLog');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017').then(async () => {
  const admin = await Admin.findOne({ username: 'cuiding' });
  
  // 获取所有员工
  const employees = await Employee.find({ parentId: admin._id.toString() });
  const employeeIds = employees.map(e => e.employeeId);
  
  // 上月时间范围（北京时间）
  const beijingNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
  
  // 上月1日
  const lastMonthStartBeijing = new Date(beijingNow);
  lastMonthStartBeijing.setMonth(lastMonthStartBeijing.getMonth() - 1);
  lastMonthStartBeijing.setDate(1);
  lastMonthStartBeijing.setHours(0, 0, 0, 0);
  const lastMonthStart = new Date(lastMonthStartBeijing.getTime() - 8 * 60 * 60 * 1000);
  
  // 本月1日（上月结束）
  const thisMonthStartBeijing = new Date(beijingNow);
  thisMonthStartBeijing.setDate(1);
  thisMonthStartBeijing.setHours(0, 0, 0, 0);
  const lastMonthEnd = new Date(thisMonthStartBeijing.getTime() - 8 * 60 * 60 * 1000);
  
  // 查询上月所有员工的金币
  const lastMonthGold = await GoldLog.aggregate([
    { $match: { employeeId: { $in: employeeIds }, createTime: { $gte: lastMonthStart, $lt: lastMonthEnd } } },
    { $group: { _id: null, totalGold: { $sum: '$gold' } } }
  ]);
  
  const totalGold = lastMonthGold[0]?.totalGold || 0;
  const teamUserRevenue = totalGold / 1000;
  const teamRevenue20Percent = teamUserRevenue * 0.2;
  
  console.log('=== 上月团队金币统计 ===');
  console.log(`团队: ${admin.teamName}`);
  console.log(`员工数: ${employees.length}`);
  console.log(`上月总金币: ${totalGold.toLocaleString()}`);
  console.log(`上月团队收益(金币/1000): ${teamUserRevenue.toFixed(2)}元`);
  console.log(`上月团队收益20%: ${teamRevenue20Percent.toFixed(2)}元`);
  
  await mongoose.connection.close();
});