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
  commission: Number
}, { collection: 'teamgroups' });

const TeamGroup = mongoose.model('TeamGroup', TeamGroupSchema);

async function checkTeamGroup() {
  try {
    console.log('=== 检查TeamGroup表中teamLeaderId ===\n');

    // 连接MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功\n');

    // 查询所有TeamGroup
    const groups = await TeamGroup.find({});
    console.log(`TeamGroup表中共 ${groups.length} 条记录:\n`);

    groups.forEach((g, i) => {
      console.log(`${i+1}. ${g.groupName}`);
      console.log(`   _id: ${g._id}`);
      console.log(`   teamLeaderId: ${g.teamLeaderId}`);
      console.log('');
    });

    // 测试查询条件
    const fanjieUserId = '69cd2b814b7bff2403ab4f70';
    console.log(`测试查询 teamLeaderId = ${fanjieUserId}:`);

    const groups1 = await TeamGroup.find({ teamLeaderId: fanjieUserId });
    console.log(`直接用字符串查询: 找到 ${groups1.length} 条`);

    const groups2 = await TeamGroup.find({ teamLeaderId: new mongoose.Types.ObjectId(fanjieUserId) });
    console.log(`使用ObjectId查询: 找到 ${groups2.length} 条`);

    const groups3 = await TeamGroup.find({
      $or: [
        { teamLeaderId: fanjieUserId },
        { teamLeaderId: new mongoose.Types.ObjectId(fanjieUserId) }
      ]
    });
    console.log(`使用$or查询: 找到 ${groups3.length} 条`);

    await mongoose.connection.close();

  } catch (error) {
    console.error('检查失败:', error.message);
  }
}

checkTeamGroup();
