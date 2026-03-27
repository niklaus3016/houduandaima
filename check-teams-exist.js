const mongoose = require('mongoose');
const Team = require('./models/Team');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function checkTeamsExist() {
  try {
    // 连接MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功');

    // 查询所有团队
    const teams = await Team.find({});
    console.log('团队数量:', teams.length);

    if (teams.length > 0) {
      console.log('\n团队列表:');
      teams.forEach((team, index) => {
        console.log(`${index + 1}. ${team.name} (ID: ${team._id})`);
        console.log(`   成员数量: ${team.members ? team.members.length : 0}`);
        console.log(`   队长ID: ${team.leaderId || '无'}`);
      });
    } else {
      console.log('没有团队');
    }

    // 断开连接
    await mongoose.disconnect();
  } catch (error) {
    console.error('查询错误:', error);
    // 断开连接
    await mongoose.disconnect();
  }
}

checkTeamsExist();