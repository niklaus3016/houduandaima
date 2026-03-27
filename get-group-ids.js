const mongoose = require('mongoose');
const TeamGroup = require('./models/TeamGroup');

// 连接数据库
mongoose.connect('mongodb://localhost:27017/your-database-name', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// 查询测试组333和测试组222的ID
async function getGroupIds() {
  try {
    console.log('=== 查询测试组333和测试组222的ID ===');
    
    // 查询测试组333
    const group333 = await TeamGroup.findOne({ groupName: '测试组333' });
    if (group333) {
      console.log(`测试组333 ID: ${group333._id}`);
    } else {
      console.log('测试组333不存在');
    }
    
    // 查询测试组222
    const group222 = await TeamGroup.findOne({ groupName: '测试组222' });
    if (group222) {
      console.log(`测试组222 ID: ${group222._id}`);
    } else {
      console.log('测试组222不存在');
    }
    
    mongoose.disconnect();
  } catch (error) {
    console.error('查询组ID错误:', error);
    mongoose.disconnect();
  }
}

getGroupIds();