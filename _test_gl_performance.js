const mongoose = require('mongoose');
const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function test() {
  await mongoose.connect(MONGODB_URI);
  
  const Admin = require('./models/Admin');
  const TeamGroup = require('./models/TeamGroup');
  const Employee = require('./models/Employee');
  const GoldLog = require('./models/GoldLog');
  
  console.log('=== 组长业绩问题排查 ===\n');
  
  const linzhonghe = await Admin.findOne({ username: 'linzhonghe' }).lean();
  console.log('1. 林中合信息:');
  console.log(`   _id: ${linzhonghe._id}`);
  console.log(`   role: ${linzhonghe.role}`);
  console.log(`   teamGroupId: ${linzhonghe.teamGroupId}`);
  console.log(`   groupName: ${linzhonghe.groupName}`);
  
  const group = await TeamGroup.findById(linzhonghe.teamGroupId).lean();
  console.log(`\n2. 组信息: ${group?.groupName}`);
  console.log(`   _id: ${group?._id}`);
  console.log(`   createdAt: ${group?.createdAt}`);
  console.log(`   teamLeaderId: ${group?.teamLeaderId}`);
  console.log(`   groupLeaderId: ${group?.groupLeaderId}`);
  
  const employees = await Employee.find({
    $or: [{ teamGroupId: linzhonghe.teamGroupId }, { groupName: linzhonghe.groupName }]
  }).select('employeeId').lean();
  const employeeIds = employees.map(e => e.employeeId);
  console.log(`\n3. 组成员: ${employeeIds.length} 人`);
  
  console.log('\n4. 组创建时间后的累计业绩:');
  const groupCreatedUTC = group.createdAt ? new Date(group.createdAt) : new Date(0);
  const accStart = new Date(Math.max(groupCreatedUTC.getTime(), new Date(0).getTime()));
  const accEnd = new Date();
  
  const accPipeline = [
    { $match: { employeeId: { $in: employeeIds }, createTime: { $gte: accStart, $lt: accEnd } } },
    { $group: { _id: null, totalGold: { $sum: '$gold' } } }
  ];
  const accRaw = await GoldLog.aggregate(accPipeline).exec();
  const accGold = accRaw[0]?.totalGold || 0;
  const totalRevenue = +(accGold / 1000).toFixed(2);
  console.log(`   组创建时间: ${groupCreatedUTC}`);
  console.log(`   累计业绩（组创建后）: ¥${totalRevenue}`);
  
  console.log('\n5. 全部时间累计业绩:');
  const allPipeline = [
    { $match: { employeeId: { $in: employeeIds } } },
    { $group: { _id: null, totalGold: { $sum: '$gold' } } }
  ];
  const allRaw = await GoldLog.aggregate(allPipeline).exec();
  const allGold = allRaw[0]?.totalGold || 0;
  const allRevenue = +(allGold / 1000).toFixed(2);
  console.log(`   全部时间累计业绩: ¥${allRevenue}`);
  
  console.log('\n6. 月度累计业绩（验证是否正确）:');
  const beijingNow = new Date();
  beijingNow.setUTCHours(beijingNow.getUTCHours() + 8);
  const yyyy = beijingNow.getUTCFullYear();
  const mm = beijingNow.getUTCMonth();
  const monthlyStartUTC = new Date(Date.UTC(yyyy, mm, 1));
  const nextFirstUTC = new Date(Date.UTC(mm === 11 ? yyyy + 1 : yyyy, mm === 11 ? 0 : mm + 1, 1));
  const monthlyEndUTC = new Date(nextFirstUTC.getTime() - 8 * 60 * 60 * 1000);
  
  const monthlyPipeline = [
    { $match: { employeeId: { $in: employeeIds }, createTime: { $gte: monthlyStartUTC, $lt: monthlyEndUTC } } },
    { $group: { _id: null, totalGold: { $sum: '$gold' } } }
  ];
  const monthlyRaw = await GoldLog.aggregate(monthlyPipeline).exec();
  const monthlyGold = monthlyRaw[0]?.totalGold || 0;
  const monthlyRevenue = +(monthlyGold / 1000).toFixed(2);
  console.log(`   本月累计业绩: ¥${monthlyRevenue}`);
  
  console.log('\n7. 对比廖姣阳:');
  const liaojiaoyang = await Admin.findOne({ username: 'liaojiaoyang' }).lean();
  if (liaojiaoyang) {
    const ljyGroup = await TeamGroup.findById(liaojiaoyang.teamGroupId).lean();
    const ljyEmployees = await Employee.find({
      $or: [{ teamGroupId: liaojiaoyang.teamGroupId }, { groupName: liaojiaoyang.groupName }]
    }).select('employeeId').lean();
    const ljyEmployeeIds = ljyEmployees.map(e => e.employeeId);
    
    const ljyAccStart = ljyGroup.createdAt ? new Date(Math.max(new Date(ljyGroup.createdAt).getTime(), new Date(0).getTime())) : new Date(0);
    const ljyAccPipeline = [
      { $match: { employeeId: { $in: ljyEmployeeIds }, createTime: { $gte: ljyAccStart, $lt: accEnd } } },
      { $group: { _id: null, totalGold: { $sum: '$gold' } } }
    ];
    const ljyAccRaw = await GoldLog.aggregate(ljyAccPipeline).exec();
    const ljyTotalRevenue = +((ljyAccRaw[0]?.totalGold || 0) / 1000).toFixed(2);
    
    console.log(`   廖姣阳组创建时间: ${ljyGroup?.createdAt}`);
    console.log(`   累计业绩: ¥${ljyTotalRevenue}`);
  } else {
    console.log('   未找到廖姣阳');
  }
  
  await mongoose.disconnect();
  
  console.log('\n✅ 测试完成！');
}

test().catch(err => {
  console.error('\n❌ 测试失败:', err);
  process.exit(1);
});