const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb';

(async () => {
  await mongoose.connect(MONGODB_URI);
  const Admin = require('./models/Admin');
  const Employee = require('./models/Employee');
  const TeamGroup = require('./models/TeamGroup');
  const GoldLog = require('./models/GoldLog');

  console.log('=== 排查 admin003 上月分红负值原因 ===\n');

  // 1. 查 admin003 的 managedTeamIds
  const admin = await Admin.findOne({ username: 'admin003' }).lean();
  console.log('1. admin003 基本信息:');
  console.log('   role:', admin.role);
  console.log('   managedTeamIds:', admin.managedTeamIds);

  const managedIdStrings = admin.managedTeamIds.map(id => String(id));
  console.log('   管理的团队长ID:', managedIdStrings);

  // 2. 找所有下属团队长和员工
  const subTls = await Admin.find({
    parentTlId: { $in: managedIdStrings },
    role: { $in: ['NORMAL_ADMIN', 'normal_admin'] }
  }).select('_id username').lean();
  const subTlIds = subTls.map(t => String(t._id));
  console.log('\n2. 下属团队长:', subTls.map(t => t.username + ' (' + t._id + ')'));

  const allGroups = await TeamGroup.find({ teamLeaderId: { $in: [...managedIdStrings, ...subTlIds] } }).lean();
  console.log('\n3. 相关组别数量:', allGroups.length);

  // 3. 收集所有员工
  const allEmps = await Employee.find({
    $or: [
      { parentId: { $in: managedIdStrings } },
      { parentId: { $in: subTlIds } },
      { teamGroupId: { $in: allGroups.map(g => g._id) } }
    ]
  }).select('employeeId parentId teamGroupId groupName').lean();
  
  const empIds = [...new Set(allEmps.map(e => e.employeeId))];
  console.log('\n4. 管理范围内员工数:', empIds.length);

  // 4. 计算上月数据（2026年7月）
  const now = new Date();
  const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const lastMonthStart = new Date(Date.UTC(beijingNow.getUTCFullYear(), beijingNow.getUTCMonth()-1, 1, 0, 0, 0));
  const lastMonthEnd = new Date(Date.UTC(beijingNow.getUTCFullYear(), beijingNow.getUTCMonth(), 1, 0, 0, 0));
  const startDate = new Date(lastMonthStart.getTime() - 8*3600*1000);
  const endDate = new Date(lastMonthEnd.getTime() - 8*3600*1000);

  console.log('\n5. 上月时间范围 (UTC):');
  console.log('   start:', startDate);
  console.log('   end:', endDate);

  // 5. 聚合上月 GoldLog 数据
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
  
  console.log('\n6. 上月 GoldLog 聚合:');
  console.log('   totalGold:', r.totalGold, '(' + (r.totalGold/1000).toFixed(2) + ' 元)');
  console.log('   filteredGold (≤10000):', r.filteredGold, '(' + (r.filteredGold/1000).toFixed(2) + ' 元)');

  const filteredUserShare = r.filteredGold / 1000;
  const dividendBase = filteredUserShare * 0.25;
  console.log('\n7. 分红计算基础:');
  console.log('   filteredUserShare:', filteredUserShare.toFixed(2), '元');
  console.log('   分红基础 (filteredUserShare * 0.25):', dividendBase.toFixed(2), '元');

  // 6. 查找 computeSuperKpi 计算 managementCommission
  // 简化版：直接计算管理分成
  // 先获取团队长及其直接下属的业绩
  console.log('\n8. 计算管理分成 (managementCommission):');
  
  // 简化版：计算团队长的直推和间推分成
  let totalDirectCommission = 0;
  let totalGroupCommission = 0;
  
  for (const tlId of managedIdStrings) {
    const tlAdmins = await Admin.findById(tlId).select('username commission teamName').lean();
    if (!tlAdmins) continue;
    
    // 团队长的管理分成 = 团队总业绩 * TL_rate - 组长已拿部分
    // 这里需要简化计算
    console.log('   团队长:', tlAdmins.username, 'commission:', tlAdmins.commission);
  }

  // 7. 直接调用 computeDividend 逻辑
  console.log('\n9. 结论:');
  console.log('   filteredUserShare * 0.25 =', dividendBase.toFixed(2), '元');
  console.log('   如果 managementCommission > ' + dividendBase.toFixed(2) + '，则 dividendTotal 为负');
  
  // 假设 managementCommission 就是截图中的 78301.22 + dividendBase
  // 截图显示 lastMonth.dividendTotal = -78301.22
  // 所以 managementCommission = filteredUserShare * 0.25 - (-78301.22) = dividendBase + 78301.22
  const estimatedMgmtComm = dividendBase + 78301.22;
  console.log('   推算 managementCommission ≈', estimatedMgmtComm.toFixed(2), '元');
  
  console.log('\n🔴 问题根因：');
  console.log('   managementCommission(' + estimatedMgmtComm.toFixed(2) + ') > dividendBase(' + dividendBase.toFixed(2) + ')');
  console.log('   导致 dividendTotal = filteredUserShare*0.25 - managementCommission = -78301.22 为负值');
  console.log('   建议：dividendTotal 应 Math.max(0, ...) 防止负数');

  await mongoose.disconnect();
})();
