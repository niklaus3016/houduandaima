const mongoose = require('mongoose');
const Team = require('./models/Team');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('MongoDB连接成功');
    
    console.log('=== 所有团队详细信息 ===\n');
    
    const teams = await Team.find({});
    
    if (teams.length === 0) {
      console.log('暂无团队数据');
    } else {
      teams.forEach((team, index) => {
        console.log(`团队 ${index + 1}:`);
        console.log(`- 团队ID: ${team._id}`);
        console.log(`- 团队名称: ${team.name}`);
        console.log(`- 领导ID: ${team.leaderId}`);
        console.log(`- 成员数量: ${team.members ? team.members.length : 0}`);
        
        if (team.members && team.members.length > 0) {
          console.log(`- 成员列表:`);
          team.members.forEach((member, mIndex) => {
            console.log(`  ${mIndex + 1}. userId: ${member.userId}, role: ${member.role}`);
          });
        }
        console.log('');
      });
    }
    
    mongoose.disconnect();
    console.log('操作完成');
  })
  .catch(err => {
    console.error('MongoDB连接失败:', err);
    mongoose.disconnect();
  });
