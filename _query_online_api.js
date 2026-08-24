const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb';

(async () => {
  await mongoose.connect(MONGODB_URI);
  const Admin = require('./models/Admin');
  const verification = require('./routes/verification');
  const dashboard = require('./routes/dashboard');

  console.log('=== 模拟线上接口查询 ===\n');

  // 查询三个用户
  const users = ['huangzhenhui', 'admin002', 'admin003'];

  for (const username of users) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`查询用户: ${username}`);
    console.log('='.repeat(60));

    const admin = await Admin.findOne({ username }).lean();
    if (!admin) {
      console.log('用户不存在');
      continue;
    }

    console.log('角色:', admin.role);
    console.log('commission:', admin.commission);
    console.log('parentTlId:', admin.parentTlId || '无');
    console.log('managedTeamIds:', (admin.managedTeamIds || []).map(id => String(id)));

    // 判断角色（与路由层一致：NORMAL_ADMIN = 团队长；ADMIN_MANAGER/SUPER_ADMIN = 高管）
    const isTeamLeader = admin.role === 'NORMAL_ADMIN' || admin.role === 'normal_admin';
    const isAdminManager = admin.role === 'ADMIN_MANAGER' || admin.role === 'admin_manager';
    const isSuperAdmin = admin.role === 'SUPER_ADMIN' || admin.role === 'super_admin' || admin.role === 'superadmin';

    if (isTeamLeader) {
      console.log('\n角色: 团队长 (NORMAL_ADMIN)');
      console.log('调用 /admin/dashboard/team-leader/commission 接口...');

      // 直接复用路由内部 helper（与接口 100% 同口径）
      const result = await router_TEST_getTlCommissionStats(dashboard, String(admin._id));

      console.log('\n返回数据:');
      console.log('  今日预估收益 (today):', result.today);
      console.log('  本月预估收益 (month):', result.month);
      console.log('  上月收益 (lastMonth):', result.lastMonth);
      console.log('  总收益 (total):', result.total);
      console.log('  可提现余额 (availableBalance):', result.availableBalance);
    } else if (isAdminManager || isSuperAdmin) {
      console.log('\n角色: 高管');
      console.log('调用 /admin/dashboard/super/dividend-summary 接口...');

      const data = await computeDividendSummary(admin);

      console.log('\n返回数据:');
      console.log('  今日分红总计 (today.dividendTotal):', data.today.dividendTotal);
      console.log('  本月分红总计 (month.dividendTotal):', data.month.dividendTotal);
      console.log('  上月收益 (lastMonth.dividendTotal):', data.lastMonth.dividendTotal);
      console.log('  上月业务收入 (lastMonth.businessRevenue):', data.lastMonth.businessRevenue);
      console.log('  上月用户分成 (lastMonth.userShareCommission):', data.lastMonth.userShareCommission);
      console.log('  上月管理分成 (lastMonth.managementCommission):', data.lastMonth.managementCommission);
      console.log('  可提现余额 (availableBalance):', data.availableBalance);
    } else {
      console.log('其他角色:', admin.role);
    }
  }

  await mongoose.disconnect();
})();

// 复用 router._TEST_getTlCommissionStats（与线上接口完全同口径）
async function router_TEST_getTlCommissionStats(dashboard, adminId) {
  if (typeof dashboard._TEST_getTlCommissionStats === 'function') {
    return dashboard._TEST_getTlCommissionStats(adminId);
  }
  // 兜底：直接构造 scope 调用 _buildCommissionStatsFlatExported
  const adminDoc = await Admin.findById(adminId).select('_id username realName role teamName commission teamGroupId parentTlId').lean();
  adminDoc.constructor = Admin;
  const scope = { kind: 'TL', adminId: String(adminId) };
  const r = await verification._buildCommissionStatsFlatExported(scope, adminDoc, (s, rng) => dashboard.computeNewKpi(s, rng));
  return { ...r.flat, detail: r.detail };
}

// 复用 super/dividend-summary 接口的核心逻辑（与路由层 100% 同口径）
async function computeDividendSummary(adminDoc) {
  const Admin = mongoose.model('Admin');
  const GoldLog = mongoose.model('GoldLog');
  const WithdrawRecord = mongoose.model('WithdrawRecord');
  const TeamGroup = mongoose.model('TeamGroup');
  const Employee = mongoose.model('Employee');
  const safeToFixed2 = (v) => +(+v || 0).toFixed(2);

  const scopeTeamIds = (adminDoc.managedTeamIds || []).map(id => String(id));

  // === 1. 计算 scopeEmpIds（高管管理的所有员工集合）===
  let scopeEmpIds = null;
  if (scopeTeamIds.length > 0) {
    const managedIdStrings = scopeTeamIds;
    const allGroups = await TeamGroup.find({ teamLeaderId: { $in: managedIdStrings } }).select('_id groupLeaderId groupName').lean();

    const subGroupFuzzy = new Set();
    const subLeaderIds = new Set();
    for (const g of allGroups) {
      subGroupFuzzy.add(String(g._id));
      if (g.groupLeaderId) {
        subGroupFuzzy.add(String(g.groupLeaderId));
        subLeaderIds.add(String(g.groupLeaderId));
      }
      if (g.groupName) subGroupFuzzy.add(String(g.groupName));
    }

    const subTls = await Admin.find({
      parentTlId: { $in: managedIdStrings },
      role: { $in: ['NORMAL_ADMIN', 'normal_admin'] }
    }).select('_id').lean();
    const subTlIds = subTls.map(t => String(t._id));

    const subTlGroups = await TeamGroup.find({ teamLeaderId: { $in: subTlIds } }).select('_id groupLeaderId groupName').lean();
    const subTlGroupFuzzy = new Set();
    for (const g of subTlGroups) {
      subTlGroupFuzzy.add(String(g._id));
      if (g.groupLeaderId) subTlGroupFuzzy.add(String(g.groupLeaderId));
      if (g.groupName) subTlGroupFuzzy.add(String(g.groupName));
    }

    const allEmps = await Employee.find({
      $or: [
        { parentId: { $in: managedIdStrings } },
        { parentId: { $in: subTlIds } },
        { parentId: { $in: [...subLeaderIds] } },
        { teamGroupId: { $in: [...subGroupFuzzy] } },
        { teamGroupId: { $in: [...subTlGroupFuzzy] } }
      ]
    }).select('employeeId parentId teamGroupId groupName').lean();

    const scopeEmpSet = new Set();
    for (const emp of allEmps) {
      const empId = emp.employeeId;
      if (!empId) continue;
      const gid = emp.teamGroupId ? String(emp.teamGroupId) : '';
      const gn = emp.groupName ? String(emp.groupName) : '';
      const parentId = emp.parentId ? String(emp.parentId) : '';

      const isDirectD = managedIdStrings.includes(parentId) && !subGroupFuzzy.has(gid) && !subGroupFuzzy.has(gn);
      const isSubG = managedIdStrings.includes(parentId) && (subGroupFuzzy.has(gid) || subGroupFuzzy.has(gn));
      const isSubTlD = subTlIds.includes(parentId) && !subTlGroupFuzzy.has(gid) && !subTlGroupFuzzy.has(gn);
      const isSubTlG = subTlIds.includes(parentId) && (subTlGroupFuzzy.has(gid) || subTlGroupFuzzy.has(gn));
      const isLeaderDirect = subLeaderIds.has(parentId);

      if (isDirectD || isSubG || isSubTlD || isSubTlG || isLeaderDirect) {
        scopeEmpSet.add(empId);
      }
    }
    scopeEmpIds = [...scopeEmpSet];
    console.log(`  (高管管理的员工总数: ${scopeEmpIds.length})`);
  } else {
    console.log('  (⚠ managedTeamIds 为空，高管未配置管理范围)');
  }

  // === 2. 计算 today/month/lastMonth 的分红 ===
  const computeDividend = async (range) => {
    const { start: s, end: e } = dashboard._getKpiTimeRange ? dashboard._getKpiTimeRange(range) : require('./routes/dashboard')._getKpiTimeRange(range);

    const pipe = [{ $match: { createTime: { $gte: s, $lt: e } } }];
    if (scopeEmpIds && scopeEmpIds.length > 0) {
      pipe.push({ $match: { employeeId: { $in: scopeEmpIds } } });
    }
    pipe.push({
      $group: {
        _id: null,
        totalEcpm: { $sum: { $ifNull: ['$ecpm', 0] } },
        totalGold: { $sum: { $ifNull: ['$gold', 0] } },
        filteredGold: { $sum: { $cond: [{ $lte: ['$gold', 10000] }, { $ifNull: ['$gold', 0] }, 0] } }
      }
    });

    const rows = await GoldLog.aggregate(pipe).allowDiskUse(true).exec();
    const r = rows[0] || { totalEcpm: 0, totalGold: 0, filteredGold: 0 };

    const businessRevenue = safeToFixed2((+r.totalEcpm || 0) / 1000);
    const userShareCommission = safeToFixed2((+r.totalGold || 0) / 1000);

    const kpi = await dashboard.computeSuperKpi(range, scopeTeamIds);
    const managementCommission = kpi.managementCommission;

    const filteredUserShare = safeToFixed2((+r.filteredGold || 0) / 1000);
    const dividendTotalRaw = filteredUserShare * 0.25 - managementCommission;
    const dividendTotal = safeToFixed2(Math.max(0, dividendTotalRaw));

    return {
      businessRevenue,
      userShareCommission,
      managementCommission,
      dividendTotal
    };
  };

  const [today, month, lastMonth] = await Promise.all([
    computeDividend('today'),
    computeDividend('month'),
    computeDividend('lastMonth')
  ]);

  // === 3. availableBalance = max(0, lastMonth.dividendTotal - 本月已申请提现 status:0) ===
  let availableBalance = 0;
  try {
    const adminUsername = adminDoc.username;
    if (adminUsername) {
      const wdAgg = await WithdrawRecord.aggregate([
        { $match: { userId: adminUsername, type: 'admin', status: 0 } },
        { $group: { _id: null, sumAmount: { $sum: '$amount' } } }
      ]).exec();
      const pendingAmount = +(wdAgg?.[0]?.sumAmount || 0);
      availableBalance = Math.max(0, lastMonth.dividendTotal - pendingAmount);
    }
  } catch (e) {
    availableBalance = lastMonth.dividendTotal;
  }

  return {
    today,
    month,
    lastMonth,
    availableBalance: safeToFixed2(availableBalance)
  };
}
