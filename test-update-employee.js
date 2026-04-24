const mongoose = require('mongoose');
const Employee = require('./models/Employee');

// 数据库连接字符串
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function testUpdateEmployee() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('数据库连接成功');

    // 查找一个员工
    const employee = await Employee.findOne({});
    if (!employee) {
      console.log('没有找到员工记录');
      mongoose.connection.close();
      return;
    }

    console.log('当前员工信息:');
    console.log(`_id: ${employee._id}`);
    console.log(`employeeId: ${employee.employeeId}`);
    console.log(`realName: ${employee.realName}`);
    console.log(`teamGroupId: ${employee.teamGroupId}`);
    console.log(`groupName: ${employee.groupName}`);

    // 查找一个TeamGroup
    const TeamGroup = require('./models/TeamGroup');
    const teamGroup = await TeamGroup.findOne({});
    if (teamGroup) {
      console.log('\nTeamGroup信息:');
      console.log(`_id: ${teamGroup._id}`);
      console.log(`groupName: ${teamGroup.groupName}`);
      console.log(`teamLeaderId: ${teamGroup.teamLeaderId}`);

      // 测试更新员工的teamGroupId
      console.log('\n尝试更新员工分组...');
      const updateResult = await Employee.updateOne(
        { _id: employee._id },
        {
          $set: {
            teamGroupId: teamGroup._id,
            groupName: teamGroup.groupName,
            joinedGroupAt: new Date()
          },
          $currentDate: { updatedAt: true }
        }
      );

      console.log('更新结果:', updateResult);

      // 验证更新
      const updatedEmployee = await Employee.findById(employee._id);
      console.log('\n更新后员工信息:');
      console.log(`teamGroupId: ${updatedEmployee.teamGroupId}`);
      console.log(`groupName: ${updatedEmployee.groupName}`);
      console.log(`joinedGroupAt: ${updatedEmployee.joinedGroupAt}`);
    } else {
      console.log('没有找到TeamGroup记录');
    }

    mongoose.connection.close();
  } catch (error) {
    console.error('测试错误:', error);
    mongoose.connection.close();
  }
}

testUpdateEmployee();