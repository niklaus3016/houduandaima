const mongoose = require('mongoose');
const TeamGroup = require('./models/TeamGroup');
const Employee = require('./models/Employee');

mongoose.connect('mongodb://127.0.0.1:27017/lz');

(async () => {
  const group = await TeamGroup.findOne({ groupName: '洁然如初代理' });
  console.log('组ID:', group._id.toString());
  
  const employees = await Employee.find({ teamGroupId: group._id.toString() });
  console.log('员工数量:', employees.length);
  console.log('员工号列表:');
  employees.forEach((e, i) => {
    console.log(`  ${i+1}. ${e.employeeId} - ${e.realName || ''}`);
  });
  
  // 再查一下parentId等于团队长的员工
  console.log('\nparentId等于团队长的员工:');
  const parentEmployees = await Employee.find({ parentId: group.teamLeaderId });
  console.log('数量:', parentEmployees.length);
  parentEmployees.forEach((e, i) => {
    console.log(`  ${i+1}. ${e.employeeId} - ${e.realName || ''}`);
  });
  
  process.exit(0);
})();
