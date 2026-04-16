const mongoose = require('mongoose');
const Admin = require('./models/Admin');

// 连接数据库
const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
mongoose.connect(MONGODB_URI);

// 查询 Admin 集合
async function checkAdmin() {
  try {
    console.log('查询 Admin 集合...');
    const admins = await Admin.find();
    console.log(`找到 ${admins.length} 个管理员账号:`);
    admins.forEach(admin => {
      console.log(`  用户名: ${admin.username}, 密码: ${admin.password}, 角色: ${admin.role}`);
    });
    process.exit(0);
  } catch (error) {
    console.error('查询 Admin 集合错误:', error);
    process.exit(1);
  }
}

// 运行脚本
checkAdmin();
