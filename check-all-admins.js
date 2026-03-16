const mongoose = require('mongoose');
const Admin = require('./models/Admin');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI).then(async () => {
  console.log('=== 检查所有管理员账号 ===');
  
  // 检查所有管理员账号
  const allAdmins = await Admin.find({});
  console.log(`找到 ${allAdmins.length} 个管理员账号`);
  
  allAdmins.forEach(admin => {
    console.log(`\nID: ${admin._id}`);
    console.log(`用户名: ${admin.username}`);
    console.log(`角色: ${admin.role}`);
    console.log(`团队名称: ${admin.teamName || '无'}`);
    console.log(`真实姓名: ${admin.realName || '无'}`);
    console.log(`状态: ${admin.status}`);
  });
  
  mongoose.disconnect();
});