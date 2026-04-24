const mongoose = require('mongoose');
const TeamGroup = require('./models/TeamGroup');

// 连接数据库
mongoose.connect('mongodb://localhost:27017/ad-monetization', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function checkTeamGroupCommission() {
  try {
    // 查询所有团队组
    const groups = await TeamGroup.find({});
    
    console.log('团队组列表:');
    console.log('=' * 80);
    
    groups.forEach(group => {
      console.log(`组名: ${group.groupName}`);
      console.log(`团队名: ${group.teamName}`);
      console.log(`团队长ID: ${group.teamLeaderId}`);
      console.log(`组长ID: ${group.groupLeaderId}`);
      console.log(`提成比率: ${group.commission}`);
      console.log(`成员数: ${group.memberCount}`);
      console.log('-' * 80);
    });
    
    // 重点检查鼎盛战队的组
    const dingShengGroups = await TeamGroup.find({ teamName: '鼎盛战队' });
    console.log('\n鼎盛战队的组:');
    console.log('=' * 80);
    
    dingShengGroups.forEach(group => {
      console.log(`组名: ${group.groupName}`);
      console.log(`提成比率: ${group.commission}`);
      console.log('-' * 80);
    });
    
  } catch (error) {
    console.error('查询失败:', error);
  } finally {
    mongoose.disconnect();
  }
}

checkTeamGroupCommission();
