const mongoose = require('mongoose');
const TeamGroup = require('./models/TeamGroup');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function checkGroupTeam() {
  try {
    // 连接MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功');

    // 查询测试组333的信息
    const group = await TeamGroup.findOne({ groupName: '测试组333' });
    console.log('测试组333的信息:', group);

    if (group) {
      console.log('测试组333的leaderId:', group.leaderId);
    } else {
      console.log('未找到测试组333');
    }

    // 断开连接
    await mongoose.disconnect();
  } catch (error) {
    console.error('查询错误:', error);
    // 断开连接
    await mongoose.disconnect();
  }
}

checkGroupTeam();