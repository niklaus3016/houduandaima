const axios = require('axios');
const mongoose = require('mongoose');

// 本地API地址
const BASE_URL = 'http://127.0.0.1:3003/api';

// MongoDB连接字符串 - 和app.js中一致
const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

// 定义TeamGroup模型
const TeamGroupSchema = new mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  groupName: String,
  groupLeaderName: String,
  teamLeaderId: mongoose.Schema.Types.ObjectId,
  teamName: String,
  commission: Number,
  createdAt: Date
}, { collection: 'teamgroups' });

const TeamGroup = mongoose.model('TeamGroup', TeamGroupSchema);

async function debugTeamGroup() {
  try {
    console.log('=== 调试TeamGroup表数据 ===\n');

    // 连接MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功\n');

    // 查询所有TeamGroup数据
    const allGroups = await TeamGroup.find({});
    console.log(`TeamGroup表中共有 ${allGroups.length} 条记录:\n`);

    allGroups.forEach((group, index) => {
      console.log(`组 ${index + 1}:`);
      console.log(`  _id: ${group._id}`);
      console.log(`  groupName: ${group.groupName}`);
      console.log(`  groupLeaderName: ${group.groupLeaderName}`);
      console.log(`  teamLeaderId: ${group.teamLeaderId}`);
      console.log(`  teamName: ${group.teamName}`);
      console.log(`  commission: ${group.commission}`);
      console.log('');
    });

    // 测试用fanjie的userId查询
    const testUserId = '69cd2b814b7bff2403ab4f70';
    console.log(`\n使用 teamLeaderId: ${testUserId} 查询:`);

    const groups1 = await TeamGroup.find({ teamLeaderId: testUserId });
    console.log(`直接用字符串查询: 找到 ${groups1.length} 条`);

    const groups2 = await TeamGroup.find({ teamLeaderId: new mongoose.Types.ObjectId(testUserId) });
    console.log(`使用ObjectId查询: 找到 ${groups2.length} 条`);

    const groups3 = await TeamGroup.find({
      $or: [
        { teamLeaderId: testUserId },
        { teamLeaderId: new mongoose.Types.ObjectId(testUserId) }
      ]
    });
    console.log(`使用$or查询: 找到 ${groups3.length} 条`);

    await mongoose.connection.close();

  } catch (error) {
    console.error('调试失败:', error.message);
    if (error.stack) {
      console.error('错误堆栈:', error.stack);
    }
  }
}

debugTeamGroup();
