const mongoose = require('mongoose');
const Admin = require('./models/Admin');
const { hashPassword } = require('./utils/auth');

// 连接数据库
mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('数据库连接成功');
    
    // 查找cuiding账号
    const admin = await Admin.findOne({ username: 'cuiding' });
    if (admin) {
      console.log('找到cuiding账号:', admin.username);
      
      // 更新密码
      admin.password = hashPassword('66668888');
      await admin.save();
      console.log('密码更新成功');
    } else {
      console.log('未找到cuiding账号');
    }
    
    mongoose.disconnect();
  })
  .catch(error => {
    console.error('数据库连接失败:', error);
  });