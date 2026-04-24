const mongoose = require('mongoose');
const Admin = require('./models/Admin');
const Employee = require('./models/Employee');
const GoldLog = require('./models/GoldLog');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function checkGroupInfo() {
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
      console.log('teamGroupId:', user.teamGroupId);
      console.log('teamName:', user.teamName);
      
      // 查询组内员工
      console.log('\n=== 组内员工信息 ===');
      const employees = await Employee.find({
        $or: [
          { teamGroupId: user.teamGroupId.toString() },
          { teamGroupId: user.teamGroupId }
        ]
      });
      
      console.log('组内员工数量:', employees.length);
      
      if (employees.length > 0) {
        console.log('员工列表:');
        employees.forEach((emp, index) => {
          console.log(`${index + 1}. ${emp.realName || emp.username} (${emp.employeeId})`);
        });
        
        // 获取员工ID列表
        const employeeIds = employees.map(e => e.employeeId);
        
        // 查询今日金币记录
        console.log('\n=== 今日金币记录 ===');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const goldLogs = await GoldLog.find({
          employeeId: { $in: employeeIds },
          createTime: { $gte: today }
        });
        
        console.log('今日金币记录数量:', goldLogs.length);
        if (goldLogs.length > 0) {
          console.log('部分金币记录:');
          goldLogs.slice(0, 5).forEach((log, index) => {
            console.log(`${index + 1}. 员工: ${log.employeeId}, 金币: ${log.gold}, 时间: ${log.createTime}`);
          });
        } else {
          console.log('今日无金币记录');
        }
        
      } else {
        console.log('组内无员工');
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

checkGroupInfo();