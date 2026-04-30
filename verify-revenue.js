const mongoose = require('mongoose');
const Admin = require('./models/Admin');
const Employee = require('./models/Employee');
const TeamGroup = require('./models/TeamGroup');
const GoldLog = require('./models/GoldLog');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017').then(async () => {
  const admin = await Admin.findOne({ username: 'cuiding' });
  
  // 获取所有员工
  const employees = await Employee.find({ parentId: admin._id.toString() });
  const employeeIds = employees.map(e => e.employeeId);
  
  // 获取组别
  const groups = await TeamGroup.find({ teamName: admin.teamName });
  
  // 本月时间范围（北京时间）
  const beijingNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const monthStartBeijing = new Date(beijingNow);
  monthStartBeijing.setDate(1);
  monthStartBeijing.setHours(0, 0, 0, 0);
  const monthStart = new Date(monthStartBeijing.getTime() - 8 * 60 * 60 * 1000);
  const todayEnd = new Date(beijingNow.getTime() + 8 * 60 * 60 * 1000);
  
  // 查询本月所有员工的金币记录
  const goldLogs = await GoldLog.aggregate([
    { $match: { employeeId: { $in: employeeIds }, createTime: { $gte: monthStart, $lt: todayEnd } } },
    { $group: { _id: null, totalGold: { $sum: '$gold' } } }
  ]);
  
  const totalGold = goldLogs[0]?.totalGold || 0;
  const teamUserRevenue = totalGold / 1000;
  const teamRevenue20Percent = teamUserRevenue * 0.2;
  
  // 计算组长提成
  let totalGroupLeaderRevenue = 0;
  for (const group of groups) {
    const groupEmps = employees.filter(e => 
      e.groupName === group.groupName || 
      e.teamGroupId === group._id.toString()
    );
    const groupEmpIds = groupEmps.map(e => e.employeeId);
    
    const groupGoldLogs = await GoldLog.aggregate([
      { $match: { employeeId: { $in: groupEmpIds }, createTime: { $gte: monthStart, $lt: todayEnd } } },
      { $group: { _id: null, totalGold: { $sum: '$gold' } } }
    ]);
    
    const groupGold = groupGoldLogs[0]?.totalGold || 0;
    const groupRevenue = (groupGold * (group.commission || 0.05)) / 1000;
    totalGroupLeaderRevenue += groupRevenue;
    
    console.log(`组 ${group.groupName}: 金币=${groupGold}, 提成=${groupRevenue.toFixed(2)}元`);
  }
  
  const teamCommission = Math.max(0, teamRevenue20Percent - totalGroupLeaderRevenue);
  
  console.log('');
  console.log('=== 本月收益计算 ===');
  console.log(`总员工数: ${employees.length}`);
  console.log(`分组员工数: ${employees.filter(e => e.groupName).length}`);
  console.log(`总金币: ${totalGold}`);
  console.log(`团队收益(金币/1000): ${teamUserRevenue.toFixed(2)}元`);
  console.log(`团队收益20%: ${teamRevenue20Percent.toFixed(2)}元`);
  console.log(`组长提成总和: ${totalGroupLeaderRevenue.toFixed(2)}元`);
  console.log(`团队长提成(最终): ${teamCommission.toFixed(2)}元`);
  
  await mongoose.connection.close();
});