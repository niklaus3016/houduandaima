const mongoose = require('mongoose');
const Team = require('./models/Team');
const GoldLog = require('./models/GoldLog');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('MongoDB连接成功');
    
    console.log('=== 查询崔杰战队成员数据 ===\n');
    
    const teamId = '69af8bd4132651c70aa855cd';
    const team = await Team.findById(teamId);
    
    if (!team) {
      console.log('未找到该团队');
    } else {
      console.log('找到团队:');
      console.log(`- 团队ID: ${team._id}`);
      console.log(`- 团队名称: ${team.name}`);
      console.log(`- 领导ID: ${team.leaderId}`);
      console.log(`- 成员数量: ${team.members ? team.members.length : 0}`);
      
      if (team.members && team.members.length > 0) {
        console.log('\n=== 团队成员列表 ===');
        const memberIds = team.members.map(m => m.userId);
        console.log(`- memberIds: ${memberIds}`);
        
        // 查询这些userId的金币记录
        const goldLogs = await GoldLog.find({ userId: { $in: memberIds } });
        console.log(`- 找到金币记录数: ${goldLogs.length}`);
        
        // 查询2222的金币记录
        const goldLogs2222 = await GoldLog.find({ employeeId: '2222' });
        console.log(`\n- 员工2222的金币记录数: ${goldLogs2222.length}`);
        
        if (goldLogs2222.length > 0) {
          console.log(`- 2222的userId: ${goldLogs2222[0].userId}`);
        }
      }
    }
    
    mongoose.disconnect();
    console.log('\n操作完成');
  })
  .catch(err => {
    console.error('MongoDB连接失败:', err);
    mongoose.disconnect();
  });
