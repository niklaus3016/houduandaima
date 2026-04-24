const mongoose = require('mongoose');

// MongoDB连接字符串
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

async function fixTeamLeaderId() {
  try {
    console.log('=== 修复TeamGroup表中teamLeaderId ===\n');

    // 连接MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功\n');

    // 查询"洁然如初代理"组的当前数据
    const group = await TeamGroup.findOne({ groupName: '洁然如初代理' });
    if (!group) {
      console.log('未找到"洁然如初代理"组');
      return;
    }

    console.log('修改前的数据:');
    console.log(`  _id: ${group._id}`);
    console.log(`  groupName: ${group.groupName}`);
    console.log(`  groupLeaderName: ${group.groupLeaderName}`);
    console.log(`  teamLeaderId: ${group.teamLeaderId}`);
    console.log(`  teamName: ${group.teamName}`);

    // fanjie的userId
    const fanjieUserId = '69cd2b814b7bff2403ab4f70';

    // 更新teamLeaderId
    const result = await TeamGroup.updateOne(
      { _id: group._id },
      { $set: { teamLeaderId: new mongoose.Types.ObjectId(fanjieUserId) } }
    );

    console.log('\n更新结果:', result);

    // 验证更新后的数据
    const updatedGroup = await TeamGroup.findOne({ groupName: '洁然如初代理' });
    console.log('\n修改后的数据:');
    console.log(`  _id: ${updatedGroup._id}`);
    console.log(`  groupName: ${updatedGroup.groupName}`);
    console.log(`  groupLeaderName: ${updatedGroup.groupLeaderName}`);
    console.log(`  teamLeaderId: ${updatedGroup.teamLeaderId}`);
    console.log(`  teamName: ${updatedGroup.teamName}`);

    console.log('\n✅ 修复完成！');

    await mongoose.connection.close();

  } catch (error) {
    console.error('修复失败:', error.message);
    if (error.stack) {
      console.error('错误堆栈:', error.stack);
    }
  }
}

fixTeamLeaderId();
