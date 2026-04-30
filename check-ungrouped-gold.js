const mongoose = require('mongoose');
const Admin = require('./models/Admin');
const Employee = require('./models/Employee');
const TeamGroup = require('./models/TeamGroup');
const GoldLog = require('./models/GoldLog');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017').then(async () => {
  const admin = await Admin.findOne({ username: 'cuiding' });
  
  // 获取所有员工
  const employees = await Employee.find({ parentId: admin._id.toString() });
  
  // 获取组别
  const groups = await TeamGroup.find({ teamName: admin.teamName });
  
  // 本月时间范围
  const beijingNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const monthStartBeijing = new Date(beijingNow);
  monthStartBeijing.setDate(1);
  monthStartBeijing.setHours(0, 0, 0, 0);
  const monthStart = new Date(monthStartBeijing.getTime() - 8 * 60 * 60 * 1000);
  const todayEnd = new Date(beijingNow.getTime() + 8 * 60 * 60 * 1000);
  
  // 分组员工和未分组员工
  const groupedEmployees = [];
  const ungroupedEmployees = [];
  
  employees.forEach(emp => {
    const hasGroup = groups.some(g => 
      emp.groupName === g.groupName || 
      emp.teamGroupId === g._id.toString()
    );
    if (hasGroup) {
      groupedEmployees.push(emp);
    } else {
      ungroupedEmployees.push(emp);
    }
  });
  
  console.log('分组员工数:', groupedEmployees.length);
  console.log('未分组员工数:', ungroupedEmployees.length);
  console.log('总员工数:', employees.length);
  
  // 查询分组员工的金币
  const groupedEmpIds = groupedEmployees.map(e => e.employeeId);
  const groupedGold = await GoldLog.aggregate([
    { $match: { employeeId: { $in: groupedEmpIds }, createTime: { $gte: monthStart, $lt: todayEnd } } },
    { $group: { _id: null, totalGold: { $sum: '$gold' } } }
  ]);
  
  // 查询未分组员工的金币
  const ungroupedEmpIds = ungroupedEmployees.map(e => e.employeeId);
  const ungroupedGold = await GoldLog.aggregate([
    { $match: { employeeId: { $in: ungroupedEmpIds }, createTime: { $gte: monthStart, $lt: todayEnd } } },
    { $group: { _id: null, totalGold: { $sum: '$gold' } } }
  ]);
  
  // 查询所有员工的金币
  const allEmpIds = employees.map(e => e.employeeId);
  const allGold = await GoldLog.aggregate([
    { $match: { employeeId: { $in: allEmpIds }, createTime: { $gte: monthStart, $lt: todayEnd } } },
    { $group: { _id: null, totalGold: { $sum: '$gold' } } }
  ]);
  
  const groupedTotal = groupedGold[0]?.totalGold || 0;
  const ungroupedTotal = ungroupedGold[0]?.totalGold || 0;
  const allTotal = allGold[0]?.totalGold || 0;
  
  console.log('');
  console.log('=== 本月金币统计 ===');
  console.log(`分组员工金币: ${groupedTotal.toLocaleString()}`);
  console.log(`未分组员工金币: ${ungroupedTotal.toLocaleString()}`);
  console.log(`合计: ${(groupedTotal + ungroupedTotal).toLocaleString()}`);
  console.log(`所有员工金币(直接查询): ${allTotal.toLocaleString()}`);
  console.log(`匹配: ${Math.abs((groupedTotal + ungroupedTotal) - allTotal) < 0.01 ? '是' : '否'}`);
  
  await mongoose.connection.close();
});