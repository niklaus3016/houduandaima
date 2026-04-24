const mongoose = require('mongoose');
const Employee = require('./models/Employee');
const TeamGroup = require('./models/TeamGroup');

mongoose.connect('mongodb://127.0.0.1:27017/lz');

async function check() {
  const group = await TeamGroup.findOne({ groupName: '洁然如初代理' });
  console.log('组ID:', group._id.toString());
  
  const employees = await Employee.find({ teamGroupId: group._id.toString() });
  console.log('\n员工数量:', employees.length);
  console.log('员工号列表:');
  employees.forEach((e, i) => console.log(`${i+1}. ${e.employeeId}`));
  
  console.log('\n---');
  process.exit(0);
}

check();
