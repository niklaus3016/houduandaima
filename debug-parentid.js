const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb://127.0.0.1:27017/sealos';

async function run() {
  await mongoose.connect(MONGODB_URI);

  const Admin = require('./models/Admin');
  const Employee = require('./models/Employee');
  const TeamGroup = require('./models/TeamGroup');

  const teamId = '69af8e34132651c70aa85608';

  const employees = await Employee.find({ parentId: teamId }).limit(5);
  const groups = await TeamGroup.find({ teamLeaderId: teamId });

  console.log('=== 团队长 Admin ===');
  const teamAdmin = await Admin.findById(teamId);
  console.log(`_id: ${teamAdmin._id}`);
  console.log(`username: ${teamAdmin.username}`);
  console.log(`realName: ${teamAdmin.realName}`);
  console.log();

  console.log('=== 员工数据 ===');
  employees.forEach(emp => {
    console.log(`employeeId: ${emp.employeeId}, realName: ${emp.realName}`);
    console.log(`  parentId: ${emp.parentId}`);
    console.log(`  teamGroupId: ${emp.teamGroupId}`);
    console.log(`  groupName: ${emp.groupName}`);
  });

  console.log('\n=== 组数据 ===');
  groups.forEach(g => {
    console.log(`groupName: ${g.groupName}`);
    console.log(`  _id: ${g._id}`);
    console.log(`  groupLeaderId: ${g.groupLeaderId}`);
    console.log(`  teamLeaderId: ${g.teamLeaderId}`);
  });

  console.log('\n=== 组长 Admin ===');
  const groupLeaderIds = groups.map(g => g.groupLeaderId).filter(id => id);
  const groupLeaderAdmins = await Admin.find({ _id: { $in: groupLeaderIds } });
  groupLeaderAdmins.forEach(admin => {
    console.log(`_id: ${admin._id}, username: ${admin.username}, realName: ${admin.realName}`);
  });

  await mongoose.disconnect();
}

run();
