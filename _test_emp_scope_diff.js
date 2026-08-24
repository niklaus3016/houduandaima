const mongoose = require('mongoose');
const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function test() {
  await mongoose.connect(MONGODB_URI);
  
  const Admin = require('./models/Admin');
  const TeamGroup = require('./models/TeamGroup');
  const Employee = require('./models/Employee');
  
  console.log('=== 验证修复后的 super/kpi 员工范围 ===\n');
  
  const admin002 = await Admin.findOne({ username: 'admin002' }).lean();
  const scopeTeamIds = admin002.managedTeamIds?.map(id => String(id)) || [];
  const scopeTeamIdStrings = scopeTeamIds;
  
  console.log('1. admin002 管理的团队长:', scopeTeamIdStrings.length);
  const tls = await Admin.find({ _id: { $in: scopeTeamIdStrings } }).select('username teamName').lean();
  tls.forEach(tl => console.log(`   - ${tl.username} (${tl.teamName})`));
  
  console.log('\n2. 获取下属组信息:');
  const allGroups = await TeamGroup.find({ teamLeaderId: { $in: scopeTeamIdStrings } }).lean();
  const groupIds = allGroups.map(g => String(g._id));
  const groupNames = allGroups.map(g => g.groupName).filter(Boolean);
  
  console.log('\n3. 查询所有管理者(TL+GL):');
  const managers = await Admin.find({
    $or: [
      { role: /NORMAL_ADMIN|NORMAL|TEAM_LEADER/i, _id: { $in: scopeTeamIdStrings } },
      { role: /GROUP_LEADER/i, teamGroupId: { $in: groupIds } },
      { role: /GROUP_LEADER/i, groupName: { $in: groupNames } }
    ]
  }).select('_id username role teamGroupId groupName realName').lean();
  console.log(`   管理者数: ${managers.length}`);
  
  console.log('\n4. 使用 manager-direct-cards 逻辑收集员工:');
  const mdEmpIds = new Set();
  for (const adm of managers) {
    const id = String(adm._id);
    const rowsA = await Employee.find({ parentId: id }).select('employeeId').lean();
    rowsA.forEach(e => { if (e.employeeId) mdEmpIds.add(String(e.employeeId)); });
    const rowsC = await Employee.find({ teamGroupId: id }).select('employeeId').lean();
    rowsC.forEach(e => { if (e.employeeId) mdEmpIds.add(String(e.employeeId)); });
    if (adm.teamGroupId) {
      const rowsGroup = await Employee.find({ 
        $or: [{ teamGroupId: adm.teamGroupId }, { groupName: adm.groupName }]
      }).select('employeeId').lean();
      rowsGroup.forEach(e => { if (e.employeeId) mdEmpIds.add(String(e.employeeId)); });
    }
    if (adm.groupName && !adm.teamGroupId) {
      const rowsGN = await Employee.find({ groupName: adm.groupName }).select('employeeId').lean();
      rowsGN.forEach(e => { if (e.employeeId) mdEmpIds.add(String(e.employeeId)); });
    }
  }
  console.log(`   员工数: ${mdEmpIds.size}`);
  
  console.log('\n5. 使用修复后的 super/kpi 逻辑收集员工:');
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
    parentTlId: { $in: scopeTeamIdStrings },
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
      { parentId: { $in: scopeTeamIdStrings } },
      { parentId: { $in: subTlIds } },
      { parentId: { $in: [...subLeaderIds] } }, // ✅ 新增：组长的直接下属
      { teamGroupId: { $in: [...subGroupFuzzy] } },
      { teamGroupId: { $in: [...subTlGroupFuzzy] } }
    ]
  }).select('employeeId parentId teamGroupId groupName').lean();
  
  const kpiEmpIds = new Set();
  for (const emp of allEmps) {
    const empId = emp.employeeId;
    if (!empId) continue;
    
    const gid = emp.teamGroupId ? String(emp.teamGroupId) : '';
    const gn = emp.groupName ? String(emp.groupName) : '';
    const parentId = emp.parentId ? String(emp.parentId) : '';
    
    const isDirectD = scopeTeamIdStrings.includes(parentId) &&
      !subGroupFuzzy.has(gid) && !subGroupFuzzy.has(gn);
    
    const isSubG = scopeTeamIdStrings.includes(parentId) &&
      (subGroupFuzzy.has(gid) || subGroupFuzzy.has(gn));
    
    const isSubTlD = subTlIds.includes(parentId) &&
      !subTlGroupFuzzy.has(gid) && !subTlGroupFuzzy.has(gn);
    
    const isSubTlG = subTlIds.includes(parentId) &&
      (subTlGroupFuzzy.has(gid) || subTlGroupFuzzy.has(gn));
    
    const isLeaderDirect = subLeaderIds.has(parentId);
    
    if (isDirectD || isSubG || isSubTlD || isSubTlG || isLeaderDirect) {
      kpiEmpIds.add(empId);
    }
  }
  console.log(`   员工数: ${kpiEmpIds.size}`);
  
  console.log('\n6. 差异分析:');
  const mdOnly = new Set([...mdEmpIds].filter(id => !kpiEmpIds.has(id)));
  const kpiOnly = new Set([...kpiEmpIds].filter(id => !mdEmpIds.has(id)));
  console.log(`   manager-direct-cards 独有: ${mdOnly.size} 人`);
  console.log(`   super/kpi 独有: ${kpiOnly.size} 人`);
  
  if (mdOnly.size > 0) {
    console.log('\n   manager-direct-cards 独有的员工:');
    const emps = await Employee.find({ employeeId: { $in: [...mdOnly].slice(0, 10) } }).select('employeeId parentId teamGroupId groupName').lean();
    emps.forEach(e => console.log(`     - ${e.employeeId}: parentId=${e.parentId}, teamGroupId=${e.teamGroupId}, groupName=${e.groupName}`));
  }
  
  if (kpiOnly.size > 0) {
    console.log('\n   super/kpi 独有的员工:');
    const emps = await Employee.find({ employeeId: { $in: [...kpiOnly].slice(0, 10) } }).select('employeeId parentId teamGroupId groupName').lean();
    emps.forEach(e => console.log(`     - ${e.employeeId}: parentId=${e.parentId}, teamGroupId=${e.teamGroupId}, groupName=${e.groupName}`));
  }
  
  await mongoose.disconnect();
  
  console.log('\n✅ 测试完成！');
}

test().catch(err => {
  console.error('\n❌ 测试失败:', err);
  process.exit(1);
});