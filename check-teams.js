const mongoose = require('mongoose');

async function checkTeams() {
  try {
    // 连接数据库
    const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功');

    // 直接查询teams集合
    const db = mongoose.connection;
    const teams = await db.collection('teams').find({}).toArray();
    
    console.log('=== 直接查询teams集合 ===');
    console.log(`找到 ${teams.length} 个团队`);
    
    teams.forEach((team, index) => {
      console.log(`\n团队 ${index + 1}:`);
      console.log('  _id:', team._id);
      console.log('  name:', team.name);
      console.log('  leaderId:', team.leaderId);
      console.log('  members:', team.members ? team.members.length : 0, '人');
      if (team.members) {
        console.log('  成员:', team.members.map(m => m.userId).join(', '));
      }
    });

    // 也查询teamgroups集合，看看是否有其他团队数据
    const teamGroups = await db.collection('teamgroups').find({}).toArray();
    console.log('\n=== 直接查询teamgroups集合 ===');
    console.log(`找到 ${teamGroups.length} 个团队组`);
    
    teamGroups.forEach((group, index) => {
      console.log(`\n团队组 ${index + 1}:`);
      console.log('  _id:', group._id);
      console.log('  teamLeaderId:', group.teamLeaderId);
      console.log('  teamName:', group.teamName);
      console.log('  groupName:', group.groupName);
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error('查询失败:', error);
    await mongoose.disconnect();
  }
}

checkTeams();