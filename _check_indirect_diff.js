const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb';

(async () => {
  await mongoose.connect(MONGODB_URI);
  const Admin = require('./models/Admin');
  const Employee = require('./models/Employee');
  const TeamGroup = require('./models/TeamGroup');
  const GoldLog = require('./models/GoldLog');
  const dashboard = require('./routes/dashboard');

  console.log('=== 直接计算间推（不过滤）===');

  const admin = await Admin.findOne({ username: 'huangzhenhui' }).lean();
  const tlId = String(admin._id);
  
  // 获取下属组
  const groups = await TeamGroup.find({ teamLeaderId: tlId }).select('_id groupLeaderId groupName').lean();
  const groupNames = groups.map(g => g.groupName);
  const teamGroupIds = groups.map(g => String(g._id));
  const groupLeaderIds = groups.filter(g => g.groupLeaderId).map(g => String(g.groupLeaderId));
  
  console.log('\n下属组:');
  for (const g of groups) {
    console.log(`  ${g.groupName} (groupId=${g._id}, groupLeaderId=${g.groupLeaderId})`);
  }
  
  // 不过滤，直接获取所有员工
  const orConds = [];
  if (teamGroupIds.length) orConds.push({ teamGroupId: { $in: teamGroupIds } });
  if (groupLeaderIds.length) orConds.push({ teamGroupId: { $in: groupLeaderIds } });
  if (groupNames.length) orConds.push({ groupName: { $in: groupNames } });
  
  const allEmps = await Employee.find({ $or: orConds }).select('employeeId parentId').lean();
  console.log('\n所有员工数:', allEmps.length);
  
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
  
  const _ptlRateExprForSubordinate = dashboard._ptlRateExprForSubordinate;
  const tlFallbackRate = 0.14;
  
  // 计算所有员工的间推（不过滤）
  console.log('\n=== 不过滤，直接计算所有员工的间推 ===');
  const allEmpIds = allEmps.map(e => e.employeeId).filter(Boolean);
  const rateExpr = _ptlRateExprForSubordinate(0.05, Math.max(0, tlFallbackRate - 0.05));
  
  const agg = await dashboard._aggGold(allEmpIds, lastMonthStart, lastMonthEnd, rateExpr);
  const totalCommission = (+agg.totalCommissionGold || 0) / 1000;
  
  console.log('员工数:', allEmpIds.length);
  console.log('totalGold:', (+agg.totalGold || 0).toFixed(2));
  console.log('totalCommission:', totalCommission.toFixed(2));
  
  // 对比：当前计算的间推
  const subGIds = await dashboard._getTLSubGroupGIds(tlId);
  const subTls = await Admin.find({ parentTlId: tlId, role: /NORMAL_ADMIN|normal_admin/i }).lean();
  
  let currentIndirectCommission = 0;
  // G 员工
  if (subGIds.length > 0) {
    const gRateExpr = _ptlRateExprForSubordinate(0.05, Math.max(0, tlFallbackRate - 0.05));
    const gAgg = await dashboard._aggGold(subGIds, lastMonthStart, lastMonthEnd, gRateExpr);
    currentIndirectCommission += (+gAgg.totalCommissionGold || 0) / 1000;
    console.log('\n当前计算 - G 员工:', subGIds.length, '人, commission=', ((+gAgg.totalCommissionGold || 0) / 1000).toFixed(2));
  }
  
  // 下属 TL 的 D 员工
  for (const st of subTls) {
    const subTlRate = +st.commission;
    const subDIds = await dashboard._getTLDirectDIds(String(st._id));
    if (subDIds.length > 0) {
      const subRateExpr = _ptlRateExprForSubordinate(subTlRate, Math.max(0, tlFallbackRate - subTlRate));
      const subAgg = await dashboard._aggGold(subDIds, lastMonthStart, lastMonthEnd, subRateExpr);
      currentIndirectCommission += (+subAgg.totalCommissionGold || 0) / 1000;
      console.log(`当前计算 - ${st.username} D 员工: ${subDIds.length} 人, commission=${((+subAgg.totalCommissionGold || 0) / 1000).toFixed(2)}`);
    }
  }
  
  console.log('\n当前间推合计:', currentIndirectCommission.toFixed(2));
  
  // 对比
  console.log('\n=== 对比 ===');
  console.log('不过滤计算:', totalCommission.toFixed(2));
  console.log('当前计算:', currentIndirectCommission.toFixed(2));
  console.log('差异:', (totalCommission - currentIndirectCommission).toFixed(2));
  console.log('用户截图间推:', (5643.75 - 3489.5).toFixed(2));  // 假设直推是 3489.5

  await mongoose.disconnect();
})();
