const mongoose = require('mongoose');

// MongoDB连接字符串
const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

// 直接使用原生MongoDB客户端
const { MongoClient } = require('mongodb');

async function fixTeamLeaderId() {
  try {
    console.log('=== 修复teamLeaderId ===\n');

    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log('MongoDB连接成功\n');

    const db = client.db();
    
    // 团队长cuiding的ID
    const cuidingUserId = '69af8e34132651c70aa85608';
    
    // 修复fanjie组的teamLeaderId
    console.log('1. 修复fanjie组的teamLeaderId:');
    
    // 找到fanjie的组
    const fanjieGroup = await db.collection('teamgroups').findOne({ groupLeaderName: '范洁' });
    
    if (fanjieGroup) {
      console.log(`找到fanjie的组: ${fanjieGroup.groupName}`);
      console.log(`当前teamLeaderId: "${fanjieGroup.teamLeaderId}"`);
      console.log(`需要修改为: "${cuidingUserId}"`);
      
      // 修改teamLeaderId
      const result = await db.collection('teamgroups').updateOne(
        { _id: fanjieGroup._id },
        { $set: { teamLeaderId: cuidingUserId } }
      );
      
      console.log(`修改结果: ${result.modifiedCount} 条记录被修改`);
      console.log('');
    }

    // 验证修改结果
    console.log('2. 验证修改结果:');
    const updatedFanjieGroup = await db.collection('teamgroups').findOne({ groupLeaderName: '范洁' });
    if (updatedFanjieGroup) {
      console.log(`fanjie组的新teamLeaderId: "${updatedFanjieGroup.teamLeaderId}"`);
      console.log(`是否正确: ${updatedFanjieGroup.teamLeaderId === cuidingUserId}`);
    }
    console.log('');

    // 检查cuiding的所有组
    console.log('3. 检查cuiding的所有组:');
    const cuidingGroups = await db.collection('teamgroups').find({ teamLeaderId: cuidingUserId }).toArray();
    console.log(`cuiding现在有 ${cuidingGroups.length} 个组:`);
    cuidingGroups.forEach((g, i) => {
      console.log(`${i+1}. ${g.groupName}`);
      console.log(`   teamLeaderId: "${g.teamLeaderId}"`);
      console.log(`   groupLeaderId: "${g.groupLeaderId}"`);
      console.log(`   groupLeaderName: "${g.groupLeaderName}"`);
      console.log('');
    });

    await client.close();

  } catch (error) {
    console.error('修复失败:', error.message);
  }
}

fixTeamLeaderId();
