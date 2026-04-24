const mongoose = require('mongoose');
const Admin = require('./models/Admin');
const Employee = require('./models/Employee');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function testFixedQuery() {
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
      
      // 使用修复后的查询逻辑
      console.log('\n=== 修复后的查询结果 ===');
      const fanjieUserId = user._id.toString();
      const fanjieTeamGroupId = user.teamGroupId;
      
      const employees = await Employee.find({
        $or: [
          { teamGroupId: fanjieTeamGroupId.toString() },
          { teamGroupId: fanjieTeamGroupId },
          { teamGroupId: fanjieUserId }, // 处理直接存储用户ID的情况
          { teamGroupId: user._id } // 处理ObjectId的情况
        ]
      });
      
      console.log('员工总数:', employees.length);
      
      // 显示部分员工信息
      if (employees.length > 0) {
        console.log('\n部分员工列表:');
        employees.slice(0, 10).forEach((emp, index) => {
          console.log(`${index + 1}. ${emp.realName || emp.username} (${emp.employeeId}), teamGroupId: ${emp.teamGroupId}`);
        });
        
        // 统计不同 teamGroupId 的分布
        console.log('\n=== teamGroupId 分布 ===');
        const teamGroupDistribution = {};
        employees.forEach(emp => {
          const tgId = emp.teamGroupId || 'null';
          teamGroupDistribution[tgId] = (teamGroupDistribution[tgId] || 0) + 1;
        });
        
        Object.entries(teamGroupDistribution).forEach(([tgId, count]) => {
          console.log(`teamGroupId: ${tgId}, 数量: ${count}`);
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

testFixedQuery();