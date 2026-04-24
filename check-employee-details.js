const mongoose = require('mongoose');
const Admin = require('./models/Admin');
const Employee = require('./models/Employee');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function checkEmployeeDetails() {
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
      console.log('teamName:', user.teamName);
      
      // 查询所有员工，看看他们的字段
      console.log('\n=== 所有员工信息（前20个）===');
      const allEmployees = await Employee.find({}).limit(20);
      
      allEmployees.forEach((emp, index) => {
        console.log(`\n${index + 1}. ${emp.realName || emp.username} (${emp.employeeId})`);
        console.log(`   groupName: ${emp.groupName}`);
        console.log(`   teamGroupId: ${emp.teamGroupId}`);
        console.log(`   parentId: ${emp.parentId}`);
        console.log(`   status: ${emp.status}`);
      });
      
      // 统计不同 teamGroupId 的员工数量
      console.log('\n=== 按 teamGroupId 分组统计 ===');
      const teamGroupStats = {};
      const allEmployeesFull = await Employee.find({});
      
      allEmployeesFull.forEach(emp => {
        if (emp.teamGroupId) {
          if (!teamGroupStats[emp.teamGroupId]) {
            teamGroupStats[emp.teamGroupId] = 0;
          }
          teamGroupStats[emp.teamGroupId]++;
        }
      });
      
      Object.entries(teamGroupStats).forEach(([teamGroupId, count]) => {
        console.log(`teamGroupId: ${teamGroupId}, 员工数量: ${count}`);
      });
      
    } else {
      console.log('❌ 未找到 fanjie 用户');
    }
    
  } catch (error) {
    console.error('错误:', error);
  } finally {
    await mongoose.connection.close();
  }
}

checkEmployeeDetails();