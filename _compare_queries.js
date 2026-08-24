const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb';

(async () => {
  await mongoose.connect(MONGODB_URI);
  const Admin = require('./models/Admin');
  const Employee = require('./models/Employee');
  const TeamGroup = require('./models/TeamGroup');

  console.log('=== 对比查询方式 ===\n');

  const admin = await Admin.findOne({ username: 'huangzhenhui' }).lean();
  
  // 方式1：用 groupName 查询（之前用的）
  const groups = await TeamGroup.find({ teamLeaderId: String(admin._id) }).select('_id groupLeaderId groupName').lean();
  console.log('下属组长组:');
  for (const g of groups) {
    console.log(`  groupId=${g._id}, groupName=${g.groupName}, groupLeaderId=${g.groupLeaderId}`);
  }
  
  const groupNames = groups.map(g => g.groupName);
  console.log('\ngroupNames:', groupNames);
  
  // 方式1结果
  const emps1 = await Employee.find({ groupName: { $in: groupNames } }).select('employeeId parentId groupName').lean();
  console.log('\n方式1 (按 groupName 查询) 员工数:', emps1.length);
  console.log('  parentId 分布:');
  const parentIdDist = {};
  for (const e of emps1) {
    const pid = e.parentId ? String(e.parentId) : 'null';
    parentIdDist[pid] = (parentIdDist[pid] || 0) + 1;
  }
  for (const [pid, count] of Object.entries(parentIdDist)) {
    console.log(`    ${pid}: ${count} 人`);
  }
  
  // 获取下属 TL IDs
  const subTls = await Admin.find({ parentTlId: String(admin._id), role: /NORMAL_ADMIN|normal_admin/i }).select('_id username').lean();
  const subTlIds = new Set(subTls.map(t => String(t._id)));
  console.log('\n下属 TL IDs:', [...subTlIds]);
  
  // 方式2：_getTLSubGroupGIds 的逻辑
  const teamGroupIds = groups.map(g => String(g._id));
  const groupLeaderIds = groups.filter(g => g.groupLeaderId).map(g => String(g.groupLeaderId));
  
  const orConds = [];
  if (teamGroupIds.length) orConds.push({ teamGroupId: { $in: teamGroupIds } });
  if (groupLeaderIds.length) orConds.push({ teamGroupId: { $in: groupLeaderIds } });
  if (groupNames.length) orConds.push({ groupName: { $in: groupNames } });
  
  console.log('\norConds:', JSON.stringify(orConds));
  
  const emps2 = await Employee.find({ $or: orConds }).select('employeeId parentId').lean();
  console.log('\n方式2 (_getTLSubGroupGIds 逻辑) 员工数:', emps2.length);
  
  // 过滤掉下属 TL 的 D 员工
  const emps2Filtered = emps2.filter(e => {
    const pid = e.parentId ? String(e.parentId) : '';
    return !subTlIds.has(pid);
  });
  console.log('方式2 过滤后员工数:', emps2Filtered.length);
  
  // 对比
  const empIds1 = new Set(emps1.map(e => e.employeeId));
  const empIds2 = new Set(emps2.map(e => e.employeeId));
  const empIds2Filtered = new Set(emps2Filtered.map(e => e.employeeId));
  
  console.log('\n=== 对比差异 ===');
  console.log('方式1 有但方式2 没有的员工数:', [...empIds1].filter(id => !empIds2.has(id)).length);
  console.log('方式2 有但方式1 没有的员工数:', [...empIds2].filter(id => !empIds1.has(id)).length);
  console.log('方式1 有但方式2(过滤后)没有的员工数:', [...empIds1].filter(id => !empIds2Filtered.has(id)).length);

  await mongoose.disconnect();
})();
