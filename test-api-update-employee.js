const mongoose = require('mongoose');
const express = require('express');
const Employee = require('./models/Employee');
const TeamGroup = require('./models/TeamGroup');
const Admin = require('./models/Admin');

// 数据库连接字符串
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function testAPIUpdateEmployee() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('数据库连接成功\n');

    // 1. 查找一个团队长账号
    const admin = await Admin.findOne({ role: 'TEAM_LEADER' });
    if (!admin) {
      console.log('没有找到团队长账号');
      mongoose.connection.close();
      return;
    }
    console.log('1. 团队长信息:');
    console.log(`   _id: ${admin._id}`);
    console.log(`   username: ${admin.username}`);
    console.log(`   teamName: ${admin.teamName}`);

    // 2. 查找该团队长下的一个组
    const teamGroup = await TeamGroup.findOne({ teamLeaderId: admin._id });
    if (!teamGroup) {
      console.log('没有找到TeamGroup记录');
      mongoose.connection.close();
      return;
    }
    console.log('\n2. TeamGroup信息:');
    console.log(`   _id: ${teamGroup._id}`);
    console.log(`   groupName: ${teamGroup.groupName}`);

    // 3. 查找该团队长下的一个员工
    const employee = await Employee.findOne({ parentId: admin._id.toString() });
    if (!employee) {
      console.log('没有找到员工记录');
      mongoose.connection.close();
      return;
    }
    console.log('\n3. 员工信息 (更新前):');
    console.log(`   _id: ${employee._id}`);
    console.log(`   employeeId: ${employee.employeeId}`);
    console.log(`   realName: ${employee.realName}`);
    console.log(`   teamGroupId: ${employee.teamGroupId}`);
    console.log(`   groupName: ${employee.groupName}`);

    // 4. 模拟API更新员工的teamGroupId
    console.log('\n4. 模拟API调用...');
    console.log(`   请求路径: PUT /api/admin/employee/${employee._id}`);
    console.log(`   请求体: { teamGroupId: "${teamGroup._id}", groupName: "${teamGroup.groupName}" }`);

    // 执行更新
    const oldTeamGroupId = employee.teamGroupId;
    const oldGroupName = employee.groupName;

    employee.teamGroupId = teamGroup._id;
    employee.groupName = teamGroup.groupName;
    if (oldTeamGroupId !== teamGroup._id.toString()) {
      employee.joinedGroupAt = new Date();
    }
    employee.updatedAt = new Date();

    await employee.save();

    // 5. 验证更新结果
    const updatedEmployee = await Employee.findById(employee._id);
    console.log('\n5. 员工信息 (更新后):');
    console.log(`   _id: ${updatedEmployee._id}`);
    console.log(`   employeeId: ${updatedEmployee.employeeId}`);
    console.log(`   realName: ${updatedEmployee.realName}`);
    console.log(`   teamGroupId: ${updatedEmployee.teamGroupId}`);
    console.log(`   groupName: ${updatedEmployee.groupName}`);
    console.log(`   joinedGroupAt: ${updatedEmployee.joinedGroupAt}`);

    // 6. 恢复原数据
    console.log('\n6. 恢复原数据...');
    updatedEmployee.teamGroupId = oldTeamGroupId;
    updatedEmployee.groupName = oldGroupName;
    updatedEmployee.updatedAt = new Date();
    await updatedEmployee.save();

    const restoredEmployee = await Employee.findById(employee._id);
    console.log('\n7. 员工信息 (恢复后):');
    console.log(`   teamGroupId: ${restoredEmployee.teamGroupId}`);
    console.log(`   groupName: ${restoredEmployee.groupName}`);

    console.log('\n✅ API更新员工分组测试完成');

    mongoose.connection.close();
  } catch (error) {
    console.error('\n❌ 测试错误:', error.message);
    console.error(error.stack);
    mongoose.connection.close();
  }
}

testAPIUpdateEmployee();