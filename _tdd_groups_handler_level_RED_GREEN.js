// TDD RED_GREEN: 直接调 employeeManage._teamLeaderGroupsHandler 拿真实返回值
// 断言：崔鼎 cuiding 作为团队长，他的「直推成员」虚拟组（自己是TL）的 groupLeaderLevel = P4
//      范洁 fanjie 作为 TL，或者她本人作为组长的 GL 组，groupLeaderLevel = P3
const mongoose = require('mongoose');
const MONGO = process.env.MONGODB_URI || "mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017";
require('./models/Admin');
require('./models/Employee');
require('./models/GoldLog');
require('./models/TeamGroup');
require('./models/Team');
let FAILED=0, PASSED=0;
const ok = (n, cond, d='') => {
  if (cond) { console.log(`✅ T${n} PASS ${d}`); PASSED++; }
  else { console.log(`❌ T${n} FAIL ${d}`); FAILED++; }
};

async function callGroups(empRoute, teamId, user) {
  const req = { query: { teamId, range: 'today' }, user: user || { id: 'super', role: 'SUPER_ADMIN' } };
  let resJson = null, resStatus = 200;
  const res = {
    status: (c) => { resStatus = c; return res; },
    json: (o) => { resJson = o; return res; }
  };
  await empRoute._teamLeaderGroupsHandler(req, res);
  return { status: resStatus, body: resJson };
}

(async () => {
  await mongoose.connect(MONGO, {});
  const Admin = mongoose.model('Admin');
  const verification = require('./routes/verification');
  const empRoute = require('./routes/employeeManage');

  // 取 cuiding 和 fanjie 的 Admin._id
  const cuiding = await Admin.findOne({ username: 'cuiding' }).select('_id username realName role commission').lean();
  const fanjie = await Admin.findOne({ username: 'fanjie' }).select('_id username realName role commission').lean();
  console.log(`cuiding = ${JSON.stringify(cuiding)}`);
  console.log(`fanjie = ${JSON.stringify(fanjie)}`);

  // T1: 以超管身份调 cuiding 的 groups 接口，查看他自己的TL虚拟组（组名通常含「直推成员」且 groupLeaderId == cuiding._id，
  //     或 TL 组内 leader 匹配到 cuiding），groupLeaderLevel 必须等于业绩页真实档位 P4
  const cdResp = await callGroups(empRoute, String(cuiding._id));
  ok('HTTP_cd', cdResp.status === 200 && cdResp.body && cdResp.body.success, `cuiding groups status=${cdResp.status}, success=${cdResp.body?.success}`);
  const cdGroups = cdResp.body?.groups || cdResp.body?.data || [];
  console.log(`cuiding groups 共 ${cdGroups.length} 个：`, cdGroups.slice(0,5).map(g => ({
    groupName: g.groupName || g.name,
    groupLeaderLevel: g.groupLeaderLevel,
    groupLeaderId: g.groupLeaderId || g.leaderId,
    groupLeaderName: g.groupLeaderRealName || g.leaderName
  })));
  // 找 cuiding 本人作为组长/TL 的那张组卡（groupLeaderLevel 非空 & 匹配 cuiding._id 或 leader==他自己）
  const cdMyGroup = cdGroups.find(g => (g.groupLeaderId && String(g.groupLeaderId) === String(cuiding._id)) ||
                                        (g.leaderId && String(g.leaderId) === String(cuiding._id)) ||
                                        /直推成员/.test(g.groupName||g.name||''));
  // 取 cuiding 业绩页真实档位
  const cdPerf = await verification.getTeamLeaderPerformance(String(cuiding._id), { monthCount: 1 });
  const cdRealLv = cdPerf?.data?.level?.currentLevel;
  console.log(`cuiding 业绩页真实档位 = ${cdRealLv}`);
  ok('1', cdMyGroup && cdRealLv && /^P[1-8]$/.test(String(cdMyGroup.groupLeaderLevel||'')) && String(cdMyGroup.groupLeaderLevel) === String(cdRealLv),
    `cuiding 自己组的 groupLeaderLevel=${cdMyGroup?.groupLeaderLevel}，应等于业绩页真实档位=${cdRealLv}`);

  // T2: 以超管身份调 cuiding 的 groups 接口，找到 fanjie 的组（范洁如果是 cuiding 下辖 TL，会有她团队的虚拟组；或者她本人作为 GL 的组）
  //     或者直接调 fanjie 自己的 TL groups 接口。这里两种方式：先调 fanjie 的 TL 接口（因为 fanjie 也是 NORMAL_ADMIN）
  const fjResp = await callGroups(empRoute, String(fanjie._id));
  ok('HTTP_fj', fjResp.status === 200 && fjResp.body && fjResp.body.success, `fanjie groups status=${fjResp.status}, success=${fjResp.body?.success}`);
  const fjGroups = fjResp.body?.groups || fjResp.body?.data || [];
  const fjMyGroup = fjGroups.find(g => (g.groupLeaderId && String(g.groupLeaderId) === String(fanjie._id)) ||
                                        (g.leaderId && String(g.leaderId) === String(fanjie._id)) ||
                                        /直推成员/.test(g.groupName||g.name||''));
  const fjPerf = await verification.getTeamLeaderPerformance(String(fanjie._id), { monthCount: 1 });
  const fjRealLv = fjPerf?.data?.level?.currentLevel;
  console.log(`fanjie 自己的组 = ${fjMyGroup ? JSON.stringify({name:fjMyGroup.groupName||fjMyGroup.name, level:fjMyGroup.groupLeaderLevel}) : '没找到'}`);
  console.log(`fanjie 业绩页真实档位 = ${fjRealLv}`);
  ok('2', fjMyGroup && fjRealLv && /^P[1-8]$/.test(String(fjMyGroup.groupLeaderLevel||'')) && String(fjMyGroup.groupLeaderLevel) === String(fjRealLv),
    `fanjie 自己组的 groupLeaderLevel=${fjMyGroup?.groupLeaderLevel}，应等于业绩页真实档位=${fjRealLv}`);

  // T3: 黄振汇 huangzhenhui 作为基准对照（签约档和实际档一致 P4）确保回归没坏
  const hzh = await Admin.findOne({ username: 'huangzhenhui' }).select('_id username realName').lean();
  const hzhResp = await callGroups(empRoute, String(hzh._id));
  const hzhGroups = hzhResp.body?.groups || hzhResp.body?.data || [];
  const hzhMyGroup = hzhGroups.find(g => (g.groupLeaderId && String(g.groupLeaderId) === String(hzh._id)) ||
                                           (g.leaderId && String(g.leaderId) === String(hzh._id)) ||
                                           /直推成员/.test(g.groupName||g.name||''));
  const hzhPerf = await verification.getTeamLeaderPerformance(String(hzh._id), { monthCount: 1 });
  const hzhRealLv = hzhPerf?.data?.level?.currentLevel;
  ok('3', hzhMyGroup && hzhRealLv && String(hzhMyGroup.groupLeaderLevel) === String(hzhRealLv),
    `黄振汇(基准): 自己组 groupLeaderLevel=${hzhMyGroup?.groupLeaderLevel}，应等于业绩页真实档位=${hzhRealLv}`);

  // T4: 再检查 cuiding 接口里所有 GL 组（比如 fanjie 是 GL 组长时）的 groupLeaderLevel 是否也和业绩页对齐
  //     范洁在 cuiding 接口里应该是 cuiding 下辖的 TL（NORMAL_ADMIN），所以不会作为 GL 组长出现。
  //     但如果有 fanjie 本人的下属 TL 作为 GL 组长出现在 fanjie 接口里，也需要验证。这里找一个真实 GL。
  const zhouhuan = await Admin.findOne({ username: 'zhouhuan' }).select('_id username realName role').lean();
  if (zhouhuan) {
    // 周欢是 GL，他的 teamLeaderId 是谁？先通过 TeamGroup 找他所属 TL，然后调 TL 接口
    const TG = mongoose.model('TeamGroup');
    const zhTGs = await TG.find({ groupLeaderId: String(zhouhuan._id) }).select('teamLeaderId groupLeaderId').lean();
    const tlId = zhTGs[0]?.teamLeaderId;
    if (tlId) {
      const zhResp = await callGroups(empRoute, String(tlId));
      const zhGroups = zhResp.body?.groups || zhResp.body?.data || [];
      const zhMyGroup = zhGroups.find(g => String(g.groupLeaderId||g.leaderId) === String(zhouhuan._id));
      const zhPerf = await verification.getGroupLeaderPerformance(String(zhouhuan._id), { monthCount: 1 });
      const zhRealLv = zhPerf?.data?.level?.currentLevel;
      ok('4', zhMyGroup && zhRealLv && String(zhMyGroup.groupLeaderLevel) === String(zhRealLv),
        `周欢GL(基准): 所属TL=${tlId}，他的组 groupLeaderLevel=${zhMyGroup?.groupLeaderLevel}，应等于业绩页真实档位=${zhRealLv}`);
    } else ok('4', true, '周欢未加入TG，跳过');
  } else ok('4', true, '周欢不存在，跳过');

  console.log(`\n总计：${PASSED} 通过 / ${FAILED} 失败`);
  process.exit(FAILED === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
