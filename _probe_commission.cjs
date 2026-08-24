const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
(async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/app_db?replicaSet=rs0', { serverSelectionTimeoutMS: 8000 });
  const Admin = require('./models/Admin');
  const TeamGroup = require('./models/TeamGroup');
  const GoldLog = require('./models/GoldLog');
  const CommissionHistory = require('./models/CommissionHistory');
  const Employee = require('./models/Employee');
  const fanjie = await Admin.findOne({ username: 'fanjie' }).select('_id username role teamGroupId').lean();
  console.log('fanjie admin=', JSON.stringify(fanjie));
  let group = null;
  if (fanjie?.teamGroupId) group = await TeamGroup.findById(fanjie.teamGroupId).lean();
  else if (fanjie?._id) group = await TeamGroup.findOne({ groupLeaderId: fanjie._id }).lean();
  console.log('fanjie teamGroup=', JSON.stringify({
    _id: group?._id, groupName: group?.groupName, commission: group?.commission,
    teamLeaderId: group?.teamLeaderId, createdAt: group?.createdAt
  }));
  const gid = group?._id;
  const gidStr = gid ? String(gid) : '';
  const emps = await Employee.find({ $or: [{ teamGroupId: gid }, { teamGroupId: gidStr }] }).select('employeeId').lean();
  console.log('member count=', emps.length, 'sample IDs=', emps.slice(0,3).map(e=>e.employeeId));
  const ids = emps.map(e=>e.employeeId);
  if (ids.length === 0) { await mongoose.disconnect(); return; }
  const total = await GoldLog.countDocuments({ employeeId: { $in: ids } });
  const zero = await GoldLog.countDocuments({ employeeId: { $in: ids }, commissionRate: 0 });
  const nonzero = total - zero;
  const agg = await GoldLog.aggregate([
    { $match: { employeeId: { $in: ids }, createTime: { $gte: new Date(Date.now() - 365*86400000) } } },
    { $group: { _id: null, totalGold: { $sum: '$gold' }, weightedCommGold: { $sum: { $multiply: ['$gold', { $ifNull: ['$commissionRate', 0] }] } }, zeroCount: { $sum: { $cond: [{ $eq: [{ $ifNull: ['$commissionRate', 0] }, 0] }, 1, 0] } }, total: { $sum: 1 } } }
  ]);
  console.log('GOLD COUNT total=', total, 'zeroRate=', zero, 'nonzero=', nonzero, 'ratio%=', total ? (zero/total*100).toFixed(1) : 'N/A');
  console.log('近 365 天 agg=', JSON.stringify(agg[0]));
  console.log('group.commission 当前值=', group?.commission, '→ 如果全部按老逻辑 totalGold/1000*commission =', agg[0] ? +(agg[0].totalGold/1000 * (group?.commission||0)).toFixed(2) : 'N/A');
  console.log('按新逻辑 sum(gold*commissionRate)/1000 =', agg[0] ? +(agg[0].weightedCommGold/1000).toFixed(2) : 'N/A');
  const chCount = gid ? await CommissionHistory.countDocuments({ teamGroupId: gid }) : 0;
  console.log('CommissionHistory count for this group=', chCount);
  await mongoose.disconnect();
})().catch(e => { console.error('ERR', e); process.exit(1) });
