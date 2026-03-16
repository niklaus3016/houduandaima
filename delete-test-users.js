const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');
const Employee = require('./models/Employee');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

// 需要删除的用户ID列表
const usersToDelete = [
  '3048', '7439', '1414', '1063', '5571', '9173', '6938', '1640',
  '2828', '5748', '5230', '5244', '1847', '3378', '4461', '9035', '2436'
];

mongoose.connect(MONGODB_URI).then(async () => {
  console.log('=== 删除测试用户 ===');
  console.log('需要删除的用户数:', usersToDelete.length);
  
  let deletedEmployees = 0;
  let deletedGoldLogs = 0;
  
  for (const employeeId of usersToDelete) {
    // 删除Employee记录
    const employeeResult = await Employee.deleteOne({ employeeId });
    if (employeeResult.deletedCount > 0) {
      deletedEmployees++;
    }
    
    // 删除GoldLog记录
    const goldLogResult = await GoldLog.deleteMany({ employeeId });
    deletedGoldLogs += goldLogResult.deletedCount;
    
    console.log(`- ${employeeId}: 删除员工记录 ${employeeResult.deletedCount}条, 删除金币记录 ${goldLogResult.deletedCount}条`);
  }
  
  console.log('\n=== 删除结果 ===');
  console.log('删除员工记录:', deletedEmployees, '条');
  console.log('删除金币记录:', deletedGoldLogs, '条');
  
  // 验证剩余用户
  const remainingEmployees = await Employee.find({});
  console.log('\n剩余用户数:', remainingEmployees.length);
  console.log('剩余用户列表:');
  for (const emp of remainingEmployees) {
    console.log(`- ${emp.employeeId}`);
  }
  
  mongoose.disconnect();
});