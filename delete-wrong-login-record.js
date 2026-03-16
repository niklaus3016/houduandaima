const mongoose = require('mongoose');
const LoginRecord = require('./models/LoginRecord');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('MongoDB连接成功');
    
    const userId = 'user_2222_1773112309254';
    
    const result = await LoginRecord.deleteMany({ userId: userId });
    console.log('删除结果:', result);
    
    mongoose.disconnect();
    console.log('操作完成');
  })
  .catch(err => {
    console.error('MongoDB连接失败:', err);
    mongoose.disconnect();
  });
