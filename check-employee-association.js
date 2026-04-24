const mongoose = require('mongoose');
const Admin = require('./models/Admin');
const Employee = require('./models/Employee');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function checkEmployeeGroupAssociation() {
  try {
    // 连接数据库
    await mongoose.connect(MONGODB_URI, {
      maxPoolSize: 100,
      minPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 30000,
      connectTimeoutMS: 5000,
    });
    
    console.log('MongoDB连接成功');
    
    // 查询 fanjie 用户
    const user = await Admin.findOne({ username: 'fanjie' });
    
    if (user) {
      console.log('=== fanjie 用户信息 ===');
      console.log('用户名:', user.username);
      console.log('用户ID:', user._id);
      console.log('teamGroupId:', user.teamGroupId);
      console.log('teamName:', user.teamName);
      
      // 检查通过不同字段关联的员工
      console.log('\n=== 按 teamGroupId 关联的员工（当前接口使用的方式）===');
      const employeesByTeamGroupId = await Employee.find({
        $or: [
          { teamGroupId: user.teamGroupId.toString() },
          { teamGroupId: user.teamGroupId }
        ]
      });
      console.log('数量:', employeesByTeamGroupId.length);
      
      console.log('\n=== 按 groupName 关联的员工（使用 teamName）===');
      const employeesByGroupName = await Employee.find({ groupName: user.teamName });
      console.log('数量:', employeesByGroupName.length);
      
      console.log('\n=== 按 parentId 关联的员工（直接关联到组长）===');
      const employeesByParentId = await Employee.find({ parentId: user._id.toString() });
      console.log('数量:', employeesByParentId.length);
      
      // 显示部分员工信息
      if (employeesByGroupName.length > 0) {
        console.log('\n按 groupName 关联的部分员工:');
        employeesByGroupName.slice(0, 10).forEach((emp, index) => {
          console.log(`${index + 1}. ${emp.realName || emp.username} (${emp.employeeId}), groupName: ${emp.groupName}, teamGroupId: ${emp.teamGroupId}, parentId: ${emp.parentId}`);
        });
      }
      
    } else {
      console.log('❌ 未找到 fanjie 用户');
    }
    
  } catch (error) {
    console.error('错误:', error);
  } finally {
    await mongoose.connection.close();
  }
}

checkEmployeeGroupAssociation();