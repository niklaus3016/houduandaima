const mongoose = require('mongoose');
const Admin = require('./models/Admin');
const Employee = require('./models/Employee');
const TeamGroup = require('./models/TeamGroup');

// 数据库连接字符串
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function checkData() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('数据库连接成功\n');

    // 1. 查找团队长cuiding
    console.log('1. 查找团队长cuiding:');
    const admin = await Admin.findOne({ username: 'cuiding' });
    if (!admin) {
      console.log('   未找到团队长cuiding');
    } else {
      console.log(`   _id: ${admin._id}`);
      console.log(`   username: ${admin.username}`);
      console.log(`   realName: ${admin.realName}`);
      console.log(`   teamName: ${admin.teamName}`);
      console.log(`   role: ${admin.role}`);
    }

    // 2. 查找员工9763
    console.log('\n2. 查找员工9763:');
    const employee = await Employee.findOne({ employeeId: '9763' });
    if (!employee) {
      console.log('   未找到员工9763');
    } else {
      console.log(`   _id: ${employee._id}`);
      console.log(`   employeeId: ${employee.employeeId}`);
      console.log(`   realName: ${employee.realName}`);
      console.log(`   parentId: ${employee.parentId}`);
      console.log(`   teamGroupId: ${employee.teamGroupId}`);
      console.log(`   groupName: ${employee.groupName}`);
    }

    // 3. 查找所有TeamGroup
    console.log('\n3. 所有TeamGroup记录:');
    const groups = await TeamGroup.find({});
    groups.forEach(group => {
      console.log(`   _id: ${group._id}`);
      console.log(`   groupName: ${group.groupName}`);
      console.log(`   teamLeaderId: ${group.teamLeaderId}`);
      console.log(`   teamName: ${group.teamName}`);
      console.log(`   groupLeaderId: ${group.groupLeaderId}`);
      console.log('   ---');
    });

    // 4. 查找"洁然如初"组
    console.log('\n4. 查找"洁然如初"组:');
    const jieranGroup = await TeamGroup.findOne({ groupName: '洁然如初' });
    if (!jieranGroup) {
      console.log('   未找到"洁然如初"组');
    } else {
      console.log(`   _id: ${jieranGroup._id}`);
      console.log(`   groupName: ${jieranGroup.groupName}`);
      console.log(`   teamLeaderId: ${jieranGroup.teamLeaderId}`);
      console.log(`   teamName: ${jieranGroup.teamName}`);
    }

    mongoose.connection.close();
  } catch (error) {
    console.error('错误:', error);
    mongoose.connection.close();
  }
}

checkData();