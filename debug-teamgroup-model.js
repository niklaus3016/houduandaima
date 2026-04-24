const mongoose = require('mongoose');

// MongoDB连接字符串
const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

// 定义TeamGroup模型
const teamGroupSchema = new mongoose.Schema({
  teamLeaderId: {
    type: mongoose.Schema.Types.ObjectId, // 改为ObjectId类型
    required: true
  },
  teamName: {
    type: String,
    required: true
  },
  groupName: {
    type: String,
    required: true
  },
  groupLeaderId: {
    type: String,
    default: null
  },
  groupLeaderName: {
    type: String,
    default: null
  },
  commission: {
    type: Number,
    default: 0.05
  },
  memberCount: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const TeamGroup = mongoose.model('TeamGroup', teamGroupSchema);

async function debugTeamGroupModel() {
  try {
    console.log('=== 调试TeamGroup模型 ===\n');

    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功\n');

    const fanjieUserId = '69cd2b814b7bff2403ab4f70';
    console.log(`测试用户ID: ${fanjieUserId}\n`);

    // 测试用ObjectId查询
    console.log('测试用ObjectId查询:');
    const groups1 = await TeamGroup.find({ 
      teamLeaderId: new mongoose.Types.ObjectId(fanjieUserId) 
    });
    console.log(`  找到 ${groups1.length} 个组`);

    // 测试用字符串查询
    console.log('测试用字符串查询:');
    const groups2 = await TeamGroup.find({ teamLeaderId: fanjieUserId });
    console.log(`  找到 ${groups2.length} 个组`);

    // 测试用$or查询
    console.log('测试用$or查询:');
    const groups3 = await TeamGroup.find({
      $or: [
        { teamLeaderId: fanjieUserId },
        { teamLeaderId: new mongoose.Types.ObjectId(fanjieUserId) }
      ]
    });
    console.log(`  找到 ${groups3.length} 个组`);

    // 测试查询所有
    console.log('\n测试查询所有TeamGroup:');
    const allGroups = await TeamGroup.find({});
    console.log(`  找到 ${allGroups.length} 个组`);
    allGroups.forEach(g => {
      console.log(`  - ${g.groupName}: teamLeaderId = ${g.teamLeaderId}`);
    });

    await mongoose.connection.close();

  } catch (error) {
    console.error('调试失败:', error.message);
  }
}

debugTeamGroupModel();
