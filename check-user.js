const mongoose = require('mongoose');
const Admin = require('./models/Admin');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function checkUserInfo() {
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
      console.log('真实姓名:', user.realName);
      console.log('teamGroupId:', user.teamGroupId);
      console.log('teamName:', user.teamName);
      console.log('是否有 teamGroupId 字段:', user.teamGroupId ? '是' : '否');
      
      if (user.teamGroupId) {
        // 查询组信息
        const TeamGroup = mongoose.model('TeamGroup', new mongoose.Schema({}));
        const group = await TeamGroup.findById(user.teamGroupId);
        if (group) {
          console.log('\n=== 组信息 ===');
          console.log('组名:', group.groupName);
          console.log('组长姓名:', group.groupLeaderName);
        } else {
          console.log('\n❌ 未找到对应组信息');
        }
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

checkUserInfo();