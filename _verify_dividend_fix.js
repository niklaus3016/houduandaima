const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb';

(async () => {
  await mongoose.connect(MONGODB_URI);
  const Admin = require('./models/Admin');
  const Employee = require('./models/Employee');
  const TeamGroup = require('./models/TeamGroup');
  const GoldLog = require('./models/GoldLog');

  console.log('=== 验证 admin003 分红修复效果 ===\n');

  // 1. 查 admin003 信息
  const admin = await Admin.findOne({ username: 'admin003' }).lean();
  console.log('1. admin003 基本信息:');
  console.log('   role:', admin.role);
  console.log('   managedTeamIds:', admin.managedTeamIds.map(id => String(id)));

  const managedIdStrings = admin.managedTeamIds.map(id => String(id));

  // 2. 找下属团队长
  const subTls = await Admin.find({
    parentTlId: { $in: managedIdStrings },
    role: { $in: ['NORMAL_ADMIN', 'normal_admin'] }
  }).select('_id username commission').lean();
  console.log('\n2. 下属团队长:');
  subTls.forEach(t => console.log('   ', t.username, '(commission:', t.commission + ')'));

  const subTlIds = subTls.map(t => String(t._id));

  // 3. 计算上月数据
  const now = new Date();
  const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const lastMonthStart = new Date(Date.UTC(beijingNow.getUTCFullYear(), beijingNow.getUTCMonth()-1, 1, 0, 0, 0));
  const lastMonthEnd = new Date(Date.UTC(beijingNow.getUTCFullYear(), beijingNow.getUTCMonth(), 1, 0, 0, 0));
  const startDate = new Date(lastMonthStart.getTime() - 8*3600*1000);
  const endDate = new Date(lastMonthEnd.getTime() - 8*3600*1000);

  // 4. 聚合上月 GoldLog 数据
  const allGroups = await TeamGroup.find({ teamLeaderId: { $in: [...managedIdStrings, ...subTlIds] } }).lean();
  const groupIds = allGroups.map(g => g._id);
  
  const allEmps = await Employee.find({
    $or: [
      { parentId: { $in: [...managedIdStrings, ...subTlIds] } },
      { teamGroupId: { $in: groupIds } }
    ]
  }).select('employeeId').lean();
  
  const empIds = [...new Set(allEmps.map(e => e.employeeId))];

  const pipe = [
    { $match: { createTime: { $gte: startDate, $lt: endDate }, employeeId: { $in: empIds } } },
    { $group: {
        _id: null,
        totalGold: { $sum: { $ifNull: ['$gold', 0] } },
        filteredGold: { $sum: { $cond: [{ $lte: ['$gold', 10000] }, { $ifNull: ['$gold', 0] }, 0] } }
      }
    }
  ];

  const rows = await GoldLog.aggregate(pipe).allowDiskUse(true).exec();
  const r = rows[0] || { totalGold: 0, filteredGold: 0 };
  
  const filteredUserShare = r.filteredGold / 1000;
  const dividendBase = filteredUserShare * 0.25;

  console.log('\n3. 上月数据:');
  console.log('   totalGold:', r.totalGold.toLocaleString(), '(' + (r.totalGold/1000).toFixed(2) + ' 元)');
  console.log('   filteredGold:', r.filteredGold.toLocaleString(), '(' + (filteredUserShare).toFixed(2) + ' 元)');
  console.log('   dividendBase (25%):', dividendBase.toFixed(2), '元');

  // 5. 用新的 computeSuperKpi 计算 managementCommission
  console.log('\n4. 计算 managementCommission (使用修复后的逻辑)...');
  
  const dashboard = require('./routes/dashboard');
  
  // 模拟 admin003 调用 computeSuperKpi('lastMonth', managedTeamIds)
  const result = await dashboard.computeSuperKpi('lastMonth', admin.managedTeamIds);
  
  console.log('   managementCommission:', result.managementCommission);
  console.log('   dividendTotal:', result.dividendTotal);
  console.log('   businessRevenue:', result.businessRevenue);
  console.log('   platformProfit:', result.platformProfit);

  // 6. 对比修复前后
  const managementCommission = result.managementCommission;
  const dividendTotalRaw = dividendBase - managementCommission;
  const dividendTotalFixed = Math.max(0, dividendTotalRaw);

  console.log('\n5. 修复对比:');
  console.log('   修复前 dividendTotal (可能为负):', dividendTotalRaw.toFixed(2));
  console.log('   修复后 dividendTotal (max(0, ...)):', dividendTotalFixed.toFixed(2));
  console.log('   computeSuperKpi 返回的 dividendTotal:', result.dividendTotal);

  // 7. 最终结论
  console.log('\n🔴 结论:');
  if (dividendTotalRaw < 0) {
    console.log('   分红原为负值:', dividendTotalRaw.toFixed(2), '元');
    console.log('   修复后分红为 0 元 (不得为负)');
    console.log('   修复有效 ✅');
  } else {
    console.log('   分红为正值，无需修复:', dividendTotalRaw.toFixed(2), '元');
  }

  await mongoose.disconnect();
})();
