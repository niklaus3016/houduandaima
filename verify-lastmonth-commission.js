const mongoose = require('mongoose');
const Admin = require('./models/Admin');
const Employee = require('./models/Employee');
const TeamGroup = require('./models/TeamGroup');
const GoldLog = require('./models/GoldLog');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017').then(async () => {
  const admin = await Admin.findOne({ username: 'cuiding' });
  
  const employees = await Employee.find({ parentId: admin._id.toString() });
  const employeeIds = employees.map(e => e.employeeId);
  
  const groups = await TeamGroup.find({ teamName: admin.teamName });
  
  // 上月时间范围
  const beijingNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const lastMonthStartBeijing = new Date(beijingNow);
  lastMonthStartBeijing.setMonth(lastMonthStartBeijing.getMonth() - 1);
  lastMonthStartBeijing.setDate(1);
  lastMonthStartBeijing.setHours(0, 0, 0, 0);
  const lastMonthStart = new Date(lastMonthStartBeijing.getTime() - 8 * 60 * 60 * 1000);
  
  const thisMonthStartBeijing = new Date(beijingNow);
  thisMonthStartBeijing.setDate(1);
  thisMonthStartBeijing.setHours(0, 0, 0, 0);
  const lastMonthEnd = new Date(thisMonthStartBeijing.getTime() - 8 * 60 * 60 * 1000);
  
  // 上月总金币
  const allGold = await GoldLog.aggregate([
    { $match: { employeeId: { $in: employeeIds }, createTime: { $gte: lastMonthStart, $lt: lastMonthEnd } } },
    { $group: { _id: null, totalGold: { $sum: '$gold' } } }
  ]);
  
  const totalGold = allGold[0]?.totalGold || 0;
  const teamRevenue20Percent = (totalGold / 1000) * 0.2;
  
  // 上月组长提成
  let totalGroupLeaderRevenue = 0;
  for (const group of groups) {
    const groupEmps = employees.filter(e => 
      e.groupName === group.groupName || 
      e.teamGroupId === group._id.toString()
    );
    const groupEmpIds = groupEmps.map(e => e.employeeId);
    
    const groupGold = await GoldLog.aggregate([
      { $match: { employeeId: { $in: groupEmpIds }, createTime: { $gte: lastMonthStart, $lt: lastMonthEnd } } },
      { $group: { _id: null, totalGold: { $sum: '$gold' } } }
    ]);
    
    const groupGoldTotal = groupGold[0]?.totalGold || 0;
    const groupRevenue = (groupGoldTotal * (group.commission || 0.05)) / 1000;
    totalGroupLeaderRevenue += groupRevenue;
    
    console.log(`组 ${group.groupName}: 金币=${groupGoldTotal.toLocaleString()}, 提成=${groupRevenue.toFixed(2)}元`);
  }
  
  const teamCommission = Math.max(0, teamRevenue20Percent - totalGroupLeaderRevenue);
  
  console.log('');
  console.log('=== 上月收益计算 ===');
  console.log(`总金币: ${totalGold.toLocaleString()}`);
  console.log(`团队收益20%: ${teamRevenue20Percent.toFixed(2)}元`);
  console.log(`组长提成总和: ${totalGroupLeaderRevenue.toFixed(2)}元`);
  console.log(`团队长提成(最终): ${teamCommission.toFixed(2)}元`);
  console.log(`接口返回值: 791.84元`);
  console.log(`匹配: ${Math.abs(teamCommission - 791.84) < 0.01 ? '是' : '否'}`);
  
  await mongoose.connection.close();
});