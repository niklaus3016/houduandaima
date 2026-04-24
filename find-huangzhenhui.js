const mongoose = require('mongoose');

async function findHuangzhenhui() {
  try {
    // 连接数据库
    const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功');

    // 直接查询admins集合，搜索huangzhenhui
    const db = mongoose.connection;
    const admins = await db.collection('admins').find({ username: 'huangzhenhui' }).toArray();
    
    console.log('=== 搜索huangzhenhui ===');
    console.log(`找到 ${admins.length} 个管理员`);
    
    admins.forEach((admin, index) => {
      console.log(`\n管理员 ${index + 1}:`);
      console.log('  _id:', admin._id);
      console.log('  username:', admin.username);
      console.log('  realName:', admin.realName);
      console.log('  role:', admin.role);
      console.log('  teamName:', admin.teamName);
    });

    // 也查询所有管理员
    const allAdmins = await db.collection('admins').find({}).toArray();
    console.log('\n=== 所有管理员 ===');
    console.log(`找到 ${allAdmins.length} 个管理员`);
    
    allAdmins.forEach((admin, index) => {
      console.log(`${index + 1}. ${admin.username} - ${admin.realName} - ${admin.role}`);
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error('查询失败:', error);
    await mongoose.disconnect();
  }
}

findHuangzhenhui();