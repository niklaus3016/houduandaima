const mongoose = require('mongoose');
const Employee = require('./models/Employee');

// 数据库连接字符串
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function checkEmployee() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('数据库连接成功\n');

    // 查找员工9763
    const employee = await Employee.findOne({ employeeId: '9763' });
    if (!employee) {
      console.log('未找到员工9763');
    } else {
      console.log('员工9763的数据库记录:');
      console.log(`_id: ${employee._id}`);
      console.log(`employeeId: ${employee.employeeId}`);
      console.log(`realName: ${employee.realName}`);
      console.log(`parentId: ${employee.parentId}`);
      console.log(`teamGroupId: ${employee.teamGroupId}`);
      console.log(`groupName: ${employee.groupName}`);
      console.log(`joinedGroupAt: ${employee.joinedGroupAt}`);
      console.log(`updatedAt: ${employee.updatedAt}`);
    }

    // 查找"洁然如初代理"组
    const TeamGroup = require('./models/TeamGroup');
    const group = await TeamGroup.findOne({ groupName: '洁然如初代理' });
    if (!group) {
      console.log('\n未找到"洁然如初代理"组');
    } else {
      console.log('\n"洁然如初代理"组信息:');
      console.log(`_id: ${group._id}`);
      console.log(`groupName: ${group.groupName}`);
      console.log(`groupLeaderId: ${group.groupLeaderId}`);
    }

    mongoose.connection.close();
  } catch (error) {
    console.error('错误:', error);
    mongoose.connection.close();
  }
}

checkEmployee();