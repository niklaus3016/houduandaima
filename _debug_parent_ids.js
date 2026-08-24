const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb';

(async () => {
  await mongoose.connect(MONGODB_URI);
  const Admin = require('./models/Admin');
  const Employee = require('./models/Employee');
  const TeamGroup = require('./models/TeamGroup');

  console.log('=== 检查员工 parentId ===\n');

  const admin = await Admin.findOne({ username: 'huangzhenhui' }).lean();
  const tlId = String(admin._id);
  
  // 查找下属 TL
  const subTls = await Admin.find({ parentTlId: tlId, role: /NORMAL_ADMIN|normal_admin/i }).select('_id username').lean();
  const subTlIds = new Set(subTls.map(t => String(t._id)));
  console.log('下属 TL IDs:', [...subTlIds]);
  
  // 查找上级 TL (huangzhenhui 可能有上级)
  const parentTl = await Admin.findById(admin.parentTlId).select('username').lean().catch(() => null);
  console.log('上级 TL:', parentTl ? parentTl.username : '无');
  
  // 查询所有员工的 parentId 分布
  const groups = await TeamGroup.find({ teamLeaderId: tlId }).select('_id groupLeaderId groupName').lean();
  
  const teamGroupIds = groups.map(g => String(g._id));
  const groupLeaderIds = groups.filter(g => g.groupLeaderId).map(g => String(g.groupLeaderId));
  const groupNames = groups.map(g => g.groupName);
  
  const orConds = [];
  if (teamGroupIds.length) orConds.push({ teamGroupId: { $in: teamGroupIds } });
  if (groupLeaderIds.length) orConds.push({ teamGroupId: { $in: groupLeaderIds } });
  if (groupNames.length) orConds.push({ groupName: { $in: groupNames } });
  
  const allEmps = await Employee.find({ $or: orConds }).select('employeeId parentId groupName teamGroupId').lean();
  
  // 统计 parentId 分布
  const parentIdDist = {};
  for (const e of allEmps) {
    const pid = e.parentId ? String(e.parentId) : 'null';
    if (!parentIdDist[pid]) parentIdDist[pid] = { count: 0, employeeIds: [], empDetails: [] };
    parentIdDist[pid].count++;
    parentIdDist[pid].employeeIds.push(e.employeeId);
    parentIdDist[pid].empDetails.push({
      employeeId: e.employeeId,
      groupName: e.groupName,
      teamGroupId: e.teamGroupId
    });
  }
  
  console.log('\nparentId 分布:');
  for (const [pid, info] of Object.entries(parentIdDist)) {
    const isSubTl = subTlIds.has(pid);
    const isTl = pid === tlId;
    const isUnknown = !isSubTl && !isTl && pid !== 'null';
    
    let label = '';
    if (isTl) label = '(TL - 直推D员工)';
    else if (isSubTl) label = '(下属TL - 被过滤，应通过subTlBuckets计算)';
    else if (isUnknown) label = '(未知 - 保留为G员工)';
    else if (pid === 'null') label = '(parentId为null)';
    
    // 查询这个 parentId 对应的 Admin
    const parentAdmin = await Admin.findById(pid).select('username role commission').catch(() => null);
    
    console.log(`  ${pid}: ${info.count} 人 ${label}`);
    if (parentAdmin) {
      console.log(`    -> ${parentAdmin.username} (${parentAdmin.role}, commission=${parentAdmin.commission})`);
    }
    console.log(`    -> employeeIds: ${info.employeeIds.join(', ')}`);
  }
  
  // 检查 "未知" parentId 的详细信息
  console.log('\n=== 检查未知 parentId 的员工 ===');
  for (const [pid, info] of Object.entries(parentIdDist)) {
    const isSubTl = subTlIds.has(pid);
    const isTl = pid === tlId;
    if (!isSubTl && !isTl && pid !== 'null') {
      console.log(`\nparentId: ${pid}`);
      const parentAdmin = await Admin.findById(pid).catch(() => null);
      console.log(`  对应的 Admin: ${parentAdmin ? `${parentAdmin.username} (${parentAdmin.role})` : '不存在'}`);
      console.log(`  员工详情:`);
      for (const detail of info.empDetails) {
        console.log(`    employeeId=${detail.employeeId}, groupName=${detail.groupName}, teamGroupId=${detail.teamGroupId}`);
      }
    }
  }

  await mongoose.disconnect();
})();
