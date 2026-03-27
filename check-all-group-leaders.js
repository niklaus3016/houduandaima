const mongoose = require('mongoose');
const TeamGroup = require('./models/TeamGroup');
const Admin = require('./models/Admin');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function checkAllGroupLeaders() {
  try {
    // 连接MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功');

    // 查询所有团队组
    const teamGroups = await TeamGroup.find({});
    console.log('\n团队组数量:', teamGroups.length);

    if (teamGroups.length === 0) {
      console.log('没有团队组');
      await mongoose.disconnect();
      return;
    }

    // 存储组长信息
    const groupLeaders = [];

    for (const group of teamGroups) {
      // 尝试获取组长信息
      let leaderInfo = null;
      if (group.leaderId) {
        const leader = await Admin.findById(group.leaderId);
        if (leader) {
          leaderInfo = {
            id: leader._id,
            username: leader.username,
            realName: leader.realName || '',
            teamName: leader.teamName || ''
          };
        }
      }

      groupLeaders.push({
        groupId: group._id,
        groupName: group.name || '未命名团队',
        leaderId: group.leaderId || '无',
        leaderInfo: leaderInfo,
        commission: group.commission || 0,
        memberCount: group.members ? group.members.length : 0
      });
    }

    // 按团队名称排序
    groupLeaders.sort((a, b) => (a.groupName || '').localeCompare(b.groupName || ''));

    // 输出结果
    console.log('\n=== 所有组长账号 ===');
    groupLeaders.forEach((group, index) => {
      console.log(`${index + 1}. 团队组: ${group.groupName}`);
      console.log(`   组ID: ${group.groupId}`);
      if (group.leaderInfo) {
        console.log(`   组长: ${group.leaderInfo.realName || group.leaderInfo.username}`);
        console.log(`   组长账号: ${group.leaderInfo.username}`);
        console.log(`   所属团队: ${group.leaderInfo.teamName || '无'}`);
      } else {
        console.log(`   组长: 无`);
      }
      console.log(`   提成比例: ${group.commission}%`);
      console.log(`   成员数量: ${group.memberCount}`);
      console.log('');
    });

    // 统计信息
    const groupsWithLeader = groupLeaders.filter(g => g.leaderId !== '无').length;
    console.log(`\n=== 统计信息 ===`);
    console.log(`总团队组数: ${groupLeaders.length}`);
    console.log(`有组长的团队组数: ${groupsWithLeader}`);
    console.log(`无组长的团队组数: ${groupLeaders.length - groupsWithLeader}`);

    // 断开连接
    await mongoose.disconnect();
  } catch (error) {
    console.error('查询错误:', error);
    // 断开连接
    await mongoose.disconnect();
  }
}

checkAllGroupLeaders();