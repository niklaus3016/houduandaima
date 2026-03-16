const mongoose = require('mongoose');
const Team = require('./models/Team');
const Employee = require('./models/Employee');
const UserGold = require('./models/UserGold');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('MongoDB连接成功');
    
    // 查找"崔杰战队"团队
    console.log('=== 查找"崔杰战队"团队 ===\n');
    
    const team = await Team.findOne({ name: '崔杰战队' });
    
    if (!team) {
      console.log('未找到"崔杰战队"团队');
    } else {
      console.log('找到"崔杰战队"团队:');
      console.log(`- 团队ID: ${team._id}`);
      console.log(`- 团队名称: ${team.name}`);
      console.log(`- 领导ID: ${team.leaderId}`);
      console.log(`- 成员数量: ${team.members ? team.members.length : 0}`);
      
      if (team.members && team.members.length > 0) {
        console.log('\n=== 团队成员列表 ===');
        team.members.forEach((member, index) => {
          console.log(`\n成员 ${index + 1}:`);
          console.log(`- userId: ${member.userId}`);
          console.log(`- role: ${member.role}`);
        });
        
        // 查找对应的Employee记录
        console.log('\n=== 查找对应的Employee记录 ===');
        for (const member of team.members) {
          const employee = await Employee.findOne({ employeeId: member.userId });
          if (employee) {
            console.log(`\nuserId: ${member.userId} -> 找到employeeId: ${employee.employeeId}`);
          } else {
            console.log(`\nuserId: ${member.userId} -> 未找到对应的Employee记录`);
          }
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
