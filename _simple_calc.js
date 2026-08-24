const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb';

(async () => {
  await mongoose.connect(MONGODB_URI);
  const Admin = require('./models/Admin');
  const Employee = require('./models/Employee');
  const TeamGroup = require('./models/TeamGroup');
  const GoldLog = require('./models/GoldLog');
  const WithdrawRecord = require('./models/WithdrawRecord');

  console.log('=== 简单计算：如果全部用 14% 提成率 ===\n');

  const admin = await Admin.findOne({ username: 'huangzhenhui' }).lean();
  
  // 获取直推员工
  const groups = await TeamGroup.find({ teamLeaderId: String(admin._id) }).select('_id groupLeaderId groupName').lean();
  const subGroupFuzzy = new Set();
  for (const g of groups) {
    subGroupFuzzy.add(String(g._id));
    if (g.groupLeaderId) subGroupFuzzy.add(String(g.groupLeaderId));
    if (g.groupName) subGroupFuzzy.add(String(g.groupName));
  }
  
  const allChildren = await Employee.find({ parentId: String(admin._id) }).select('employeeId teamGroupId groupName').lean();
  const directDIds = allChildren
    .filter(e => {
      const gid = e.teamGroupId ? String(e.teamGroupId) : '';
      const gn = e.groupName ? String(e.groupName) : '';
      const inSubGroup = (gid && subGroupFuzzy.has(gid)) || (gn && subGroupFuzzy.has(gn));
      return !inSubGroup;
    })
    .map(e => e.employeeId).filter(Boolean);
  
  console.log(`直推员工数: ${directDIds.length}`);
  
  // 计算上月时间范围
  const now = new Date();
  const bjNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const curYear = bjNow.getUTCFullYear();
  const curMonth = bjNow.getUTCMonth() + 1;
  
  let lastMonthStart, lastMonthEnd;
  if (curMonth === 1) {
    lastMonthStart = new Date(Date.UTC(curYear - 1, 10, 1));
    lastMonthEnd = new Date(Date.UTC(curYear - 1, 11, 1));
  } else {
    lastMonthStart = new Date(Date.UTC(curYear, curMonth - 2, 1));
    lastMonthEnd = new Date(Date.UTC(curYear, curMonth - 1, 1));
  }

  // 简单计算：直推员工的所有有效记录（gold <= 10000）都用 14%
  const simpleAgg = await GoldLog.aggregate([
    { $match: { employeeId: { $in: directDIds }, createTime: { $gte: lastMonthStart, $lt: lastMonthEnd }, gold: { $lte: 10000 } } },
    { $group: { _id: null, totalGold: { $sum: '$gold' }, count: { $sum: 1 } } }
  ]);
  
  const directTotalGold = simpleAgg?.[0]?.totalGold || 0;
  const directCommission = directTotalGold * 0.14 / 1000;
  console.log(`\n直推简单计算 (全部 14%):`);
  console.log(`  记录数: ${simpleAgg?.[0]?.count || 0}`);
  console.log(`  总金币: ${directTotalGold.toFixed(2)}`);
  console.log(`  总收益: ${(directTotalGold / 1000).toFixed(2)} 元`);
  console.log(`  提成 (14%): ${directCommission.toFixed(2)} 元`);
  
  // 间推：下属组长的 G 员工
  const groupNames = groups.map(g => g.groupName);
  const subGLEmployees = await Employee.find({ 
    groupName: { $in: groupNames }
  }).select('employeeId').lean();
  
  console.log(`\n下属 G 员工数: ${subGLEmployees.length}`);
  
  if (subGLEmployees.length > 0) {
    const gIds = subGLEmployees.map(e => e.employeeId).filter(Boolean);
    
    const gAgg = await GoldLog.aggregate([
      { $match: { employeeId: { $in: gIds }, createTime: { $gte: lastMonthStart, $lt: lastMonthEnd }, gold: { $lte: 10000 } } },
      { $group: { _id: null, totalGold: { $sum: '$gold' }, count: { $sum: 1 } } }
    ]);
    
    const gTotalGold = gAgg?.[0]?.totalGold || 0;
    // 组长本级率 5% + TL 级差 (14% - 5%) = 9%
    const glCommission = gTotalGold * 0.05 / 1000;  // 组长本级
    const ptlCommission = gTotalGold * 0.09 / 1000;  // TL 级差
    const totalGCommission = glCommission + ptlCommission;
    
    console.log(`\nG 员工简单计算 (组长 5% + TL 9% 级差):`);
    console.log(`  记录数: ${gAgg?.[0]?.count || 0}`);
    console.log(`  总金币: ${gTotalGold.toFixed(2)}`);
    console.log(`  组长本级 (5%): ${glCommission.toFixed(2)} 元`);
    console.log(`  TL 级差 (9%): ${ptlCommission.toFixed(2)} 元`);
    console.log(`  间推合计: ${totalGCommission.toFixed(2)} 元`);
    
    // 总提成
    const totalCommission = directCommission + totalGCommission;
    console.log(`\n总提成 = 直推 + 间推`);
    console.log(`       = ${directCommission.toFixed(2)} + ${totalGCommission.toFixed(2)}`);
    console.log(`       = ${totalCommission.toFixed(2)} 元`);
    console.log(`\n用户截图中的正确数据: ¥5,643.75`);
    console.log(`简单计算结果:           ¥${totalCommission.toFixed(2)}`);
    console.log(`差异:                   ¥${(totalCommission - 5643.75).toFixed(2)}`);
  }

  await mongoose.disconnect();
})();
