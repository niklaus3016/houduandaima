const mongoose = require('mongoose');
const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function test() {
  await mongoose.connect(MONGODB_URI);
  
  const Team = require('./models/Team');
  const Admin = require('./models/Admin');
  
  console.log('=== Team 表数据 ===');
  const teams = await Team.find({}).lean();
  teams.forEach(team => {
    console.log(`团队: ${team.name} - leaderId: ${team.leaderId}`);
  });
  
  console.log('\n=== admin002 管理的团队 ===');
  const admin002 = await Admin.findOne({ username: 'admin002' }).lean();
  const managedTeamIds = admin002.managedTeamIds?.map(id => String(id)) || [];
  
  const filteredTeams = await Team.find({ leaderId: { $in: managedTeamIds } }).lean();
  filteredTeams.forEach(team => {
    console.log(`团队: ${team.name} - leaderId: ${team.leaderId}`);
  });
  
  await mongoose.disconnect();
}

test().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});