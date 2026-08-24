// 检查范洁的角色和提成率
(async () => {
  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017', {});
  
  const Admin = require('./models/Admin');
  const TeamGroup = require('./models/TeamGroup');
  const { getTeamLeaderRealCommission, getGroupLeaderRealCommission } = require('./utils/commissionRateCache');
  const verification = require('./routes/verification');
  
  const fanjie = await Admin.findOne({ username: 'fanjie' }).lean().exec();
  if (!fanjie) {
    console.log('范洁不存在');
    process.exit(0);
  }
  
  console.log('范洁信息:', JSON.stringify(fanjie, null, 2));
  
  // 检查角色
  console.log('\n=== 角色 ===');
  console.log('role:', fanjie.role);
  
  // 获取提成率
  console.log('\n=== 提成率 ===');
  console.log('Admin.commission:', (fanjie.commission * 100).toFixed(1) + '%');
  
  // 尝试两种方式获取
  const tlRate = await getTeamLeaderRealCommission(String(fanjie._id));
  const glRate = await getGroupLeaderRealCommission(String(fanjie._id));
  
  console.log('getTeamLeaderRealCommission:', (tlRate * 100).toFixed(1) + '%');
  console.log('getGroupLeaderRealCommission:', (glRate * 100).toFixed(1) + '%');
  
  // 直接调用 verification
  try {
    const tlPerf = await verification.getTeamLeaderPerformance(String(fanjie._id), { monthCount: 1 });
    console.log('\ngetTeamLeaderPerformance:', JSON.stringify(tlPerf.data?.level, null, 2));
  } catch (e) {
    console.log('getTeamLeaderPerformance 失败:', e.message);
  }
  
  try {
    const glPerf = await verification.getGroupLeaderPerformance(String(fanjie._id));
    console.log('\ngetGroupLeaderPerformance:', JSON.stringify(glPerf.data?.level, null, 2));
  } catch (e) {
    console.log('getGroupLeaderPerformance 失败:', e.message);
  }
  
  // 检查所属团队组
  const tg = await TeamGroup.findOne({ groupLeaderId: String(fanjie._id) }).lean().exec();
  console.log('\n所属团队组:', JSON.stringify(tg, null, 2));
  
  await mongoose.disconnect();
})().catch(e => {
  console.error(e);
  process.exit(1);
});