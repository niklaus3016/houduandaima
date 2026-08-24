const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb';

(async () => {
  await mongoose.connect(MONGODB_URI);
  const Admin = require('./models/Admin');
  const Employee = require('./models/Employee');
  const TeamGroup = require('./models/TeamGroup');

  console.log('=== 检查被过滤的员工 ===\n');

  const admin = await Admin.findOne({ username: 'huangzhenhui' }).lean();
  const tlId = String(admin._id);
  
  // 查询下属 TL
  const subTls = await Admin.find({ parentTlId: tlId, role: /NORMAL_ADMIN|normal_admin/i }).select('_id username').lean();
  const subTlIds = new Set(subTls.map(t => String(t._id)));
  console.log('下属 TL IDs:', [...subTlIds]);
  
  // 查询下属组
  const groups = await TeamGroup.find({ teamLeaderId: tlId }).select('_id groupLeaderId groupName').lean();
  const teamGroupIds = groups.map(g => String(g._id));
  const groupLeaderIds = groups.filter(g => g.groupLeaderId).map(g => String(g.groupLeaderId));
  const groupNames = groups.map(g => g.groupName);
  
  const orConds = [];
  if (teamGroupIds.length) orConds.push({ teamGroupId: { $in: teamGroupIds } });
  if (groupLeaderIds.length) orConds.push({ teamGroupId: { $in: groupLeaderIds } });
  if (groupNames.length) orConds.push({ groupName: { $in: groupNames } });
  
  const emps = await Employee.find({ $or: orConds }).select('employeeId parentId groupName teamGroupId').lean();
  console.log('\n查询到的员工总数:', emps.length);
  
  // 统计 parentId 分布
  const parentIdDist = {};
  for (const e of emps) {
    const pid = e.parentId ? String(e.parentId) : 'null';
    if (!parentIdDist[pid]) parentIdDist[pid] = { count: 0, employeeIds: [] };
    parentIdDist[pid].count++;
    parentIdDist[pid].employeeIds.push(e.employeeId);
  }
  
  console.log('\nparentId 分布:');
  for (const [pid, info] of Object.entries(parentIdDist)) {
    const isSubTl = subTlIds.has(pid);
    console.log(`  ${pid}: ${info.count} 人 ${isSubTl ? '(下属TL - 被过滤)' : '(保留)'}`);
  }
  
  // 手动计算过滤后的员工
  const filteredEmps = emps.filter(e => {
    const pid = e.parentId ? String(e.parentId) : '';
    return !subTlIds.has(pid);
  });
  console.log('\n过滤后员工数:', filteredEmps.length);
  console.log('过滤后员工 IDs:', filteredEmps.map(e => e.employeeId));
  
  // 检查是否有 parentId 为 null 的员工
  const nullParentEmps = emps.filter(e => !e.parentId);
  console.log('\nparentId 为 null 的员工数:', nullParentEmps.length);
  if (nullParentEmps.length > 0) {
    for (const e of nullParentEmps) {
      console.log(`  employeeId=${e.employeeId}, groupName=${e.groupName}, teamGroupId=${e.teamGroupId}`);
    }
  }

  await mongoose.disconnect();
})();
