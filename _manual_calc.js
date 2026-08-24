const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb';

(async () => {
  await mongoose.connect(MONGODB_URI);
  const Admin = require('./models/Admin');
  const Employee = require('./models/Employee');
  const TeamGroup = require('./models/TeamGroup');
  const GoldLog = require('./models/GoldLog');
  const dashboard = require('./routes/dashboard');
  const { getFromCache, setCache, clearCache } = require('./utils/cache');

  console.log('=== 清除所有缓存后重新计算 ===\n');

  const admin = await Admin.findOne({ username: 'huangzhenhui' }).lean();
  
  // 清除所有相关缓存
  console.log('清除提成率缓存...');
  const cacheKey = `tl_real_commission_${String(admin._id)}`;
  clearCache(cacheKey);
  
  console.log('清除 TL commission 缓存...');
  clearCache(`team_leader_commission_v2_${admin._id}_${admin._id}`);
  
  // 重新获取直推员工
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
  
  console.log('直推员工数:', directDIds.length);
  
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

  // 手动计算直推提成（使用 _dRateExpr）
  console.log('\n=== 手动计算直推提成 ===');
  const dRateExpr = dashboard._dRateExpr;
  const tlFallback = 0.14; // 使用实时算档的 14%
  
  const directAgg = await GoldLog.aggregate([
    { $match: { employeeId: { $in: directDIds }, createTime: { $gte: lastMonthStart, $lt: lastMonthEnd } } },
    { $group: {
      _id: null,
      count: { $sum: 1 },
      totalGold: { $sum: '$gold' },
      totalCommissionGold: { $sum: { $cond: [{ $lte: ['$gold', 10000] }, { $multiply: ['$gold', dRateExpr(tlFallback)] }, 0] } }
    } }
  ]);
  
  const directCommissionAmount = (directAgg?.[0]?.totalCommissionGold || 0) / 1000;
  console.log('直推提成:', directCommissionAmount.toFixed(2), '元');
  
  // 手动计算间推（下属组长的 G 员工级差提成）
  console.log('\n=== 手动计算间推 ===');
  
  // 获取所有下属组长的 G 员工
  const subGLGroups = groups.map(g => String(g._id));
  const subGLEmployees = await Employee.find({ 
    groupName: { $in: groups.map(g => g.groupName) },
    status: 'enabled'
  }).select('employeeId').lean();
  
  console.log('下属 G 员工数:', subGLEmployees.length);
  
  if (subGLEmployees.length > 0) {
    const gEmployeeIds = subGLEmployees.map(e => e.employeeId).filter(Boolean);
    
    // 使用 _glCommRateExpr 和 _ptlRateExprForSubordinate 计算
    const ptlRateExpr = dashboard._ptlRateExprForSubordinate;
    const glRateExpr = dashboard._glCommRateExpr;
    
    // 组长的本级率是 0.05，TL 的级差率是 max(0, 0.14 - 0.05) = 0.09
    const glFallback = 0.05;
    const subOwnRate = 0.05;
    const fb = Math.max(0.02, 0.14 - 0.05); // max(0.02, 0.09) = 0.09
    
    // 计算 G 员工的本级提成
    const glAgg = await GoldLog.aggregate([
      { $match: { employeeId: { $in: gEmployeeIds }, createTime: { $gte: lastMonthStart, $lt: lastMonthEnd } } },
      { $group: {
        _id: null,
        count: { $sum: 1 },
        totalGold: { $sum: '$gold' },
        totalGlCommissionGold: { $sum: { $cond: [{ $lte: ['$gold', 10000] }, { $multiply: ['$gold', glRateExpr(glFallback)] }, 0] } },
        totalPtlCommissionGold: { $sum: { $cond: [{ $lte: ['$gold', 10000] }, { $multiply: ['$gold', ptlRateExpr(subOwnRate, fb)] }, 0] } }
      } }
    ]);
    
    const glCommission = (glAgg?.[0]?.totalGlCommissionGold || 0) / 1000;
    const ptlCommission = (glAgg?.[0]?.totalPtlCommissionGold || 0) / 1000;
    console.log('G 员工本级提成 (组长):', glCommission.toFixed(2), '元');
    console.log('G 员工级差提成 (TL):', ptlCommission.toFixed(2), '元');
    console.log('间推合计:', (glCommission + ptlCommission).toFixed(2), '元');
  }
  
  // 汇总
  console.log('\n=== 汇总 ===');
  console.log('直推提成:', directCommissionAmount.toFixed(2), '元');
  
  // 调用 computeNewKpi
  console.log('\n=== 调用 computeNewKpi ===');
  const scope = { kind: 'TL', adminId: String(admin._id) };
  const kpi = await dashboard.computeNewKpi(scope, 'lastMonth');
  console.log('teamCommission:', kpi.teamCommission);
  console.log('directCommission:', kpi.directCommission);
  console.log('indirectCommission:', kpi.indirectCommission);

  await mongoose.disconnect();
})();
