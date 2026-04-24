const mongoose = require('mongoose');

async function findTeamByName() {
  try {
    // 连接数据库
    const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功');

    // 直接查询teamgroups集合，搜索"四季发财"相关的团队
    const db = mongoose.connection;
    const teamGroups = await db.collection('teamgroups').find({ teamName: { $regex: /四季发财/i } }).toArray();
    
    console.log('=== 搜索"四季发财"团队 ===');
    console.log(`找到 ${teamGroups.length} 个相关团队`);
    
    teamGroups.forEach((group, index) => {
      console.log(`\n团队组 ${index + 1}:`);
      console.log('  _id:', group._id);
      console.log('  teamLeaderId:', group.teamLeaderId);
      console.log('  teamName:', group.teamName);
      console.log('  groupName:', group.groupName);
    });

    // 也搜索所有团队，看完整列表
    const allTeamGroups = await db.collection('teamgroups').find({}).toArray();
    console.log('\n=== 所有团队列表 ===');
    console.log(`找到 ${allTeamGroups.length} 个团队组`);
    
    allTeamGroups.forEach((group, index) => {
      console.log(`${index + 1}. ${group.teamName} - ${group.groupName}`);
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error('查询失败:', error);
    await mongoose.disconnect();
  }
}

findTeamByName();