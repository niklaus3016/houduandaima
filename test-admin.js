const mongoose = require('mongoose');
const Admin = require('./models/Admin');

// 连接数据库
mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('数据库连接成功');
    
    // 查询所有管理员
    const admins = await Admin.find();
    console.log('所有管理员:', admins);
    
    // 特定查询cuiding账号
    const cuiding = await Admin.findOne({ username: 'cuiding' });
    console.log('cuiding账号:', cuiding);
    
    // 特定查询admin账号
    const admin = await Admin.findOne({ username: 'admin' });
    console.log('admin账号:', admin);
    
    mongoose.disconnect();
  })
  .catch(error => {
    console.error('数据库连接失败:', error);
  });