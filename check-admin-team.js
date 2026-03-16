const mongoose = require('mongoose');
const Admin = require('./models/Admin');
const Team = require('./models/Team');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI).then(async () => {
  console.log('=== 检查团队长账号和团队数据 ===');
  
  // 检查管理员账号
  const admins = await Admin.find({ role: 'admin' });
  console.log(`\n找到 ${admins.length} 个管理员账号`);
  
  admins.forEach(admin => {
    console.log(`\n管理员: ${admin.username}`);
    console.log(`团队名称: ${admin.teamName || '无'}`);
    console.log(`真实姓名: ${admin.realName || '无'}`);
    console.log(`状态: ${admin.status}`);
  });
  
  // 检查团队数据
  const teams = await Team.find({});
  console.log(`\n找到 ${teams.length} 个团队`);
  
  teams.forEach(team => {
    console.log(`\n团队: ${team.name}`);
    console.log(`成员数量: ${team.members ? team.members.length : 0}`);
    if (team.members && team.members.length > 0) {
      console.log('成员ID:', team.members.map(m => m.userId).join(', '));
    }
  });
  
  mongoose.disconnect();
});