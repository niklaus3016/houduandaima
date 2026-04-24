const mongoose = require('mongoose');
const Admin = require('./models/Admin');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function checkFanjieUser() {
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
      console.log('密码:', user.password);
      console.log('teamGroupId:', user.teamGroupId);
      console.log('teamName:', user.teamName);
      console.log('role:', user.role);
      
      // 检查是否有其他管理员用户
      const admins = await Admin.find({});
      console.log('\n=== 所有管理员用户 ===');
      admins.forEach(admin => {
        console.log(`${admin.username} (${admin.realName || '无姓名'})`);
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

checkFanjieUser();