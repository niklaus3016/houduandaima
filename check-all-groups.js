const mongoose = require('mongoose');

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
    
    // 查询所有组
    const TeamGroup = mongoose.model('TeamGroup', new mongoose.Schema({}));
    const groups = await TeamGroup.find({});
    
    console.log('=== 所有组信息 ===');
    console.log('组数量:', groups.length);
    
    groups.forEach((group, index) => {
      console.log(`\n${index + 1}. 组ID: ${group._id}`);
      console.log(`   组名: ${group.groupName}`);
      console.log(`   团队名: ${group.teamName}`);
      console.log(`   组长ID: ${group.teamLeaderId}`);
      console.log(`   组长姓名: ${group.groupLeaderName}`);
      console.log(`   提成比例: ${group.commission}`);
    });
    
  } catch (error) {
    console.error('错误:', error);
  } finally {
    await mongoose.connection.close();
  }
}

checkGroupInfo();