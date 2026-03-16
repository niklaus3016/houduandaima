const mongoose = require('mongoose');
const Team = require('./models/Team');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI).then(async () => {
  console.log('=== 检查团队数据结构 ===');
  
  // 获取所有团队
  const teams = await Team.find({});
  
  console.log(`找到 ${teams.length} 个团队`);
  
  for (const team of teams) {
    console.log(`\n团队: ${team.name}`);
    console.log(`ID: ${team._id}`);
    console.log(`Leader: ${team.leaderId}`);
    console.log(`Members: ${JSON.stringify(team.members, null, 2)}`);
    
    if (team.members && team.members.length > 0) {
      console.log(`Member IDs: ${team.members.map(m => m.userId || m.employeeId || m.id).join(', ')}`);
    }
  }
  
  mongoose.disconnect();
});