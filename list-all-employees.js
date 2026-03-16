const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');
const Employee = require('./models/Employee');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI).then(async () => {
  console.log('=== 所有用户（包括金币为0）===');
  
  // 1. 从Employee集合获取所有用户
  const employees = await Employee.find({});
  const employeeIds = employees.map(emp => emp.employeeId);
  
  // 2. 从GoldLog中获取有记录的用户及其金币数
  const goldStats = await GoldLog.aggregate([
    { $group: { _id: '$employeeId', totalGold: { $sum: '$gold' }, count: { $sum: 1 } } }
  ]);
  
  // 3. 构建金币统计映射
  const goldMap = new Map();
  goldStats.forEach(stat => {
    goldMap.set(stat._id, { totalGold: stat.totalGold, count: stat.count });
  });
  
  // 4. 合并显示所有用户
  console.log('总用户数:', employeeIds.length);
  console.log('\n用户列表:');
  
  for (const employeeId of employeeIds) {
    const stats = goldMap.get(employeeId) || { totalGold: 0, count: 0 };
    console.log(`- ${employeeId}: ${stats.totalGold} 金币 (${stats.count}条记录)`);
  }
  
  mongoose.disconnect();
});