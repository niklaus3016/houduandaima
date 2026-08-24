// TDD RED: supervisorManage 8条新增接口关键约束（跑通时应该全部 FAIL，除了用现有真实账号查询的非空检查可能 PASS）
// 用法：node _tdd_supervisor_manage_RED.js
const mongoose = require('mongoose');
const MONGO = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
require('./models/Admin');
require('./models/Employee');
require('./models/GoldLog');
require('./models/TeamGroup');

const assert = require('assert');
let fails = 0;
function pass(msg) { console.log('  ✅ PASS ' + msg); }
function fail(msg, want, got) { fails++; console.log('  ❌ FAIL ' + msg + '  期望=' + want + '  实际=' + got); }
function assertEq(msg, got, want) { if (got === want) pass(msg); else fail(msg, JSON.stringify(want), JSON.stringify(got)); }
function assertIn(msg, val, arr) { if (arr.includes(val)) pass(msg + ` (got=${val})`); else fail(msg, JSON.stringify(arr), String(val)); }
function assertNum(msg, v) { if (typeof v === 'number' && isFinite(v)) pass(msg + ` (num=${v})`); else fail(msg, 'finite number', String(typeof v) + '|' + String(v)); }

(async () => {
  await mongoose.connect(MONGO, {});
  const Admin = mongoose.model('Admin');
  const TeamGroup = mongoose.model('TeamGroup');
  const Employee = mongoose.model('Employee');

  // 加载待实现的路由（导出内部函数以便直接调用）
  let sv = null;
  try { sv = require('./routes/supervisorManage'); } catch (_) { sv = null; }
  console.log('\n[预检查] supervisorManage 路由是否存在？');
  if (!sv) {
    fail('supervisorManage 还未创建/不可 require', '已导出 router', 'null (未找到模块)');
  } else {
    pass('supervisorManage 已 require 成功');
  }

  console.log('\n══════════════════ [A] GET /team-leaders 字段 & 枚举 ══════════════════');
  // 直接用现在实际数据 cuiding（团队长）
  const cui = await Admin.findOne({ username: 'cuiding' }).lean().exec();
  console.log(`实际 cuiding =`, {
    role: cui?.role, statusRaw: cui?.status, commission: cui?.commission,
    hasPasswordPlain: cui && 'passwordPlain' in cui,
    passwordPlainLen: cui?.passwordPlain ? cui.passwordPlain.length : 'undefined'
  });
  if (cui) {
    assertEq('A1. cuiding role=NORMAL_ADMIN', cui.role, 'NORMAL_ADMIN');
    const statusOut = (cui.status === 'enabled' || cui.status === 'active') ? 'active' : 'inactive';
    assertIn('A2. cuiding status 对外返回 active/inactive（兼容 enabled/disabled 存 DB）', statusOut, ['active', 'inactive']);
    assertNum('A3. cuiding commission 数值', +cui.commission);
    // Schema 里定义了 passwordPlain 字段（对于老账号，DB 里可能没值，但 Schema 上定义了，返回接口会补 ''）
    const schemaHas = 'passwordPlain' in Admin.schema.paths;
    if (schemaHas) pass('A4. Admin Schema 已定义 passwordPlain 字段（新账号明文双写；老账号 bcrypt 不可逆因此允许空，接口返回空字符串） 实际 paths 含：' + Object.keys(Admin.schema.paths).filter(k => /pass/i.test(k)).join(','));
    else fail('A4. Admin Schema 定义 passwordPlain', 'true', 'false');

    // 再验 GET /team-leaders 接口返回的 cuiding 条目，passwordPlain 字段（即使空字符串）一定存在
    const tls = await sv._getTeamLeaders();
    const cuiEntry = (tls.data || []).find(x => x && x.username === 'cuiding');
    if (cuiEntry && ('passwordPlain' in cuiEntry)) pass('A4b. GET /team-leaders 的 cuiding 条目里一定有 passwordPlain 字段（可能是空串） 值=' + JSON.stringify(cuiEntry.passwordPlain));
    else fail('A4b. GET /team-leaders 返回的条目里有 passwordPlain 字段', '字段存在', '字段缺失');
    // supervisor 导出函数存在性
    const fnList = ['_getTeamLeaders', '_getGroupLeaders', '_postTeamLeader', '_postGroupLeader',
      '_putTeamLeader', '_putGroupLeader', '_deleteTeamLeader', '_deleteGroupLeader'];
    for (const f of fnList) {
      if (sv && typeof sv[f] === 'function') pass(`A5. 函数导出存在 ${f}`);
      else fail(`A5. 函数导出存在 ${f}`, 'function', sv ? typeof sv[f] : '(模块未导出)');
    }
  }

  console.log('\n══════════════════ [B] GET /group-leaders：accountOpened 删除 + groupLeaderId 非空 ══════════════════');
  // 实际：范洁组 team_groups 应该有 groupLeaderId = fanjie admin._id
  const fan = await Admin.findOne({ username: 'fanjie' }).lean().exec();
  let fanGroup = null;
  if (fan) fanGroup = await TeamGroup.findOne({ groupLeaderId: String(fan._id) }).lean().exec();
  console.log(`实际 fanjie admin._id = ${fan?._id}`);
  console.log(`实际 fanjie 组 =`, fanGroup ? { _id: fanGroup._id, teamLeaderId: fanGroup.teamLeaderId, groupLeaderId: fanGroup.groupLeaderId, groupName: fanGroup.groupName, commission: fanGroup.commission } : null);
  if (fan && fanGroup) {
    assertEq('B1. fanjie 组 groupLeaderId == fan._id（新建组长自动开通账号）', String(fanGroup.groupLeaderId), String(fan._id));
    // 如果 sv 已实现，直接调 _getGroupLeaders 看返回
    if (sv && typeof sv._getGroupLeaders === 'function') {
      const res = await sv._getGroupLeaders();
      const fanEntry = (res.data || res).find(x => x && x.groupLeaderId === String(fan._id));
      if (!fanEntry) {
        fail('B2. _getGroupLeaders 返回中含 fanjie 那条（groupLeaderId匹配）', '找到条目', '未找到');
      } else {
        if (fanEntry.accountOpened === undefined) pass('B3. fanjie 条目里没有 accountOpened 字段（正确删除了）');
        else fail('B3. fanjie 条目里没有 accountOpened 字段（正确删除了）', '不存在', '实际=' + String(fanEntry.accountOpened));
        assertEq('B4. fanjie 条目 role=GROUP_LEADER（前端区分组长卡片）', fanEntry.role, 'GROUP_LEADER');
        if ('passwordPlain' in fanEntry) {
          // 【放宽】老账号 bcrypt 不可逆所以允许空；新账号如 D4b 明文非空已经验证过
          // 这里只要求字段存在，值随意（空字符串也 OK）
          pass('B5. fanjie 条目里有 passwordPlain 字段（老账号 bcrypt 不可逆因此允许空） 值=' + JSON.stringify(fanEntry.passwordPlain));
        } else {
          fail('B5. fanjie 条目有 passwordPlain 字段（SUPER_ADMIN 接口必须返回该字段）', '字段存在', '字段缺失');
        }
        assertEq('B6. fanjie 条目 groupId == teamGroup._id（编辑/删除URL用）', String(fanEntry.groupId), String(fanGroup._id));
      }
    }
  }

  console.log('\n══════════════════ [C] PUT 编辑：commission 必须忽略！ ══════════════════');
  // 选一个实际团队长：黄振汇 huangzhenhui，先记原 commission
  const hzh = await Admin.findOne({ username: 'huangzhenhui' }).lean().exec();
  if (hzh && sv && typeof sv._putTeamLeader === 'function') {
    const beforeCommission = +hzh.commission;
    console.log(`    黄振汇原 commission = ${beforeCommission}`);
    // 调用 PUT 传 commission=0.99（明显越界，看返回后实际 DB 的 commission 还是原值）
    await sv._putTeamLeader(String(hzh._id), { commission: 0.99 });
    const after = await Admin.findOne({ username: 'huangzhenhui' }).lean().exec();
    assertEq('C1. PUT /team-leaders/:id 传入 commission=0.99 必须忽略（DB 里 commission 不变）',
      +after.commission, beforeCommission);
  } else {
    fail('C1. 前置：huangzhenhui 账号存在 + _putTeamLeader 函数导出', 'true',
      'hzh存在=' + !!hzh + '  fnExport=' + !!(sv && sv._putTeamLeader));
  }

  console.log('\n══════════════════ [D] POST 新建组长：自动开通账号（一步到位）+ 唯一校验 ══════════════════');
  if (sv && typeof sv._postGroupLeader === 'function' && cui) {
    // D1. password 太短
    const d1 = await sv._postGroupLeader({
      realName: '测试GL01', username: '__test_gl01__', passwordPlain: '123', phone: '13800000001',
      teamId: String(cui._id), teamName: cui.teamName || '鼎盛战队', groupName: '__测试组01__', commission: 0.06
    });
    console.log('    D1 (pw<6) 输出 =', d1);
    if (d1 && (d1.statusCode === 400 || d1.code === 400 || (d1.message || '').includes('密码') || (d1.message || '').includes('6'))) {
      pass('D1. 密码<6位 → 400');
    } else {
      fail('D1. 密码<6位 → 400', 'HTTP 400 + message含 密码/6', JSON.stringify(d1));
    }

    // D2. commission 越界（2）
    const d2 = await sv._postGroupLeader({
      realName: '测试GL01', username: '__test_gl01__', passwordPlain: '123456', phone: '13800000001',
      teamId: String(cui._id), teamName: cui.teamName || '鼎盛战队', groupName: '__测试组01__', commission: 2
    });
    if (d2 && (d2.statusCode === 400 || /commission|分成|范围|0.*1/i.test(d2.message || ''))) {
      pass('D2. commission>1 越界 → 400');
    } else {
      fail('D2. commission>1 越界 → 400', 'HTTP 400', JSON.stringify(d2));
    }

    // D3. teamId 不存在
    const d3 = await sv._postGroupLeader({
      realName: '测试GL01', username: '__test_gl01__', passwordPlain: '123456', phone: '13800000001',
      teamId: 'ffffffffffffffffffffffff', teamName: '不存在战队', groupName: '__测试组01__', commission: 0.06
    });
    if (d3 && (d3.statusCode === 400 || /战队|teamId|不存在/i.test(d3.message || ''))) {
      pass('D3. teamId 不存在 → 400');
    } else {
      fail('D3. teamId 不存在 → 400', 'HTTP 400', JSON.stringify(d3));
    }

    // D4. 成功：建出来后 TG.groupLeaderId 非空 + Admin 存在该 username + 明文密码可返回
    const UNAME_D4 = '__test_gl_d4_success__';
    const GNAME_D4 = '__唯一临时测试组D4__';
    // 先确保没残留（DB TeamGroup 字段名是 teamLeaderId，不是对外字段 teamId！）
    await Admin.deleteOne({ username: UNAME_D4 }).exec();
    await TeamGroup.deleteOne({ teamLeaderId: String(cui._id), groupName: GNAME_D4 }).exec();

    const d4 = await sv._postGroupLeader({
      realName: '测试GL_D4', username: UNAME_D4, passwordPlain: 'D4pass@2026', phone: '13800000004',
      teamId: String(cui._id), teamName: cui.teamName || '鼎盛战队', groupName: GNAME_D4, commission: 0.06
    });
    console.log('    D4 成功响应 =', JSON.stringify(d4).slice(0, 300));
    const adminD4 = await Admin.findOne({ username: UNAME_D4 }).lean().exec();
    const tgD4    = await TeamGroup.findOne({ teamLeaderId: String(cui._id), groupName: GNAME_D4 }).lean().exec();
    if (!adminD4) fail('D4a. Admin 表存在 username=' + UNAME_D4, '有记录', '无');
    else {
      if (adminD4.role === 'GROUP_LEADER') pass('D4a. Admin.role = GROUP_LEADER');
      else fail('D4a. Admin.role = GROUP_LEADER', 'GROUP_LEADER', adminD4.role);
      if ('passwordPlain' in adminD4 && adminD4.passwordPlain === 'D4pass@2026') pass('D4b. passwordPlain 明文正确双写 = D4pass@2026');
      else fail('D4b. passwordPlain 明文正确双写 = D4pass@2026', 'D4pass@2026', '实际=' + String(adminD4.passwordPlain));
      // hash 也对得上（用 comparePassword）
      const { comparePassword } = require('./utils/auth');
      if (comparePassword('D4pass@2026', adminD4.password)) pass('D4c. Admin.password hash 可登录（comparePassword 成功）');
      else fail('D4c. Admin.password hash 可登录', 'bcrypt compare=true', 'false');
    }
    if (!tgD4) fail('D4d. TeamGroup 表存在 groupName=' + GNAME_D4, '有记录', '无');
    else {
      if (tgD4.groupLeaderId && String(tgD4.groupLeaderId) === String(adminD4?._id)) {
        pass('D4d. TeamGroup.groupLeaderId = 新建 admin._id（一步到位，直接已开通，没有未开通中间态）');
      } else {
        fail('D4d. TeamGroup.groupLeaderId = 新建 admin._id（一步到位已开通）',
          String(adminD4?._id), String(tgD4.groupLeaderId));
      }
    }
    // D5. 再 POST 同 username → 400 重复
    const d5 = await sv._postGroupLeader({
      realName: '测试GL_D5重复', username: UNAME_D4, passwordPlain: 'D4pass@2026', phone: '13800000005',
      teamId: String(cui._id), teamName: cui.teamName || '鼎盛战队', groupName: '__重复名组D5__', commission: 0.06
    });
    if (d5 && (d5.statusCode === 400 || /用户名已存在|username|duplicate|unique/i.test(d5.message || ''))) {
      pass('D5. username 重复 → 400');
    } else {
      fail('D5. username 重复 → 400', 'HTTP 400', JSON.stringify(d5));
    }
    // D6. 同战队同 groupName → 400 重复
    const d6 = await sv._postGroupLeader({
      realName: '测试GL_D6', username: '__test_gl_d6__', passwordPlain: '1234567', phone: '13800000006',
      teamId: String(cui._id), teamName: cui.teamName || '鼎盛战队', groupName: GNAME_D4, commission: 0.06
    });
    if (d6 && (d6.statusCode === 400 || /组名|同名|groupName|组别/i.test(d6.message || ''))) {
      pass('D6. 同战队同 groupName → 400');
    } else {
      fail('D6. 同战队同 groupName → 400', 'HTTP 400', JSON.stringify(d6));
    }
    // 清理 D4/D5/D6 残留
    await Admin.deleteOne({ username: UNAME_D4 }).exec();
    await Admin.deleteOne({ username: '__test_gl_d6__' }).exec();
    await TeamGroup.deleteOne({ teamLeaderId: String(cui._id), groupName: GNAME_D4 }).exec();
  }

  console.log('\n══════════════════ [E] DELETE 级联 ══════════════════');
  if (sv && typeof sv._deleteTeamLeader === 'function' && cui) {
    // 为了不破坏真实用户，构造一个"临时团队长 + 他的 1 个组 + 1 个员工"测方式 A
    const UNAME_E1 = '__tl_del_test_e1__';
    const GNAME_E1 = '__TL_DEL_TEST_E1_GROUP__';
    await Admin.deleteOne({ username: UNAME_E1 }).exec();
    await TeamGroup.deleteOne({ groupName: GNAME_E1 }).exec();
    await Employee.deleteOne({ employeeId: 'E199' }).exec();
    // 建临时 TL
    const { hashPassword } = require('./utils/auth');
    const tmpTL = await new Admin({
      username: UNAME_E1, password: hashPassword('e1Pass@99'),
      passwordPlain: 'e1Pass@99', role: 'NORMAL_ADMIN', realName: '测试TL删除',
      phone: '13900000001', teamName: '__测试战队E1__', status: 'enabled', commission: 0.10
    }).save();
    // 建他的一个组
    const tmpTG = await new TeamGroup({
      teamLeaderId: String(tmpTL._id), teamName: '__测试战队E1__', groupName: GNAME_E1,
      groupLeaderId: null, commission: 0.06, status: 'active'
    }).save();
    // 建一个员工 parentId=tmpTL，teamId=tmpTL._id，teamGroupId=tmpTG._id
    const tmpEmp = await new Employee({
      employeeId: 'E199', realName: '员工测试删除', status: 'enabled',
      parentId: String(tmpTL._id), teamId: String(tmpTL._id),
      teamGroupId: String(tmpTG._id), groupName: GNAME_E1
    }).save();

    console.log(`    临时TL id=${tmpTL._id}  TG id=${tmpTG._id}  Emp id=${tmpEmp._id}`);

    // 方式 A：删 TL → 1) Admin 没了，2) TG.teamLeaderId = NULL，3) Employee.parentId/teamId = NULL，teamGroupId 不改（组还活着）
    await sv._deleteTeamLeader(String(tmpTL._id));
    const tlAfter = await Admin.findById(tmpTL._id).lean().exec();
    if (!tlAfter) pass('E1. 方式A：Admin 表临时 TL 已删除');
    else fail('E1. 方式A：Admin 表临时 TL 已删除', '无记录', '仍存在');

    const tgAfter = await TeamGroup.findById(tmpTG._id).lean().exec();
    if (!tgAfter) fail('E2. 方式A：TeamGroup 组保留（不删组，将来分配给新 TL）', '仍存在', '被删了');
    else {
      if (!tgAfter.teamLeaderId || String(tgAfter.teamLeaderId) === 'null') {
        pass('E2. 方式A：TeamGroup 保留，teamLeaderId 清空为 null（防止悬空引用）');
      } else {
        fail('E2. 方式A：TeamGroup.teamLeaderId 清空', 'null', String(tgAfter.teamLeaderId));
      }
    }

    const empAfter = await Employee.findById(tmpEmp._id).lean().exec();
    if (!empAfter) fail('E3. 方式A：Employee 本人不删除', '记录存在', '被删了');
    else {
      if (!empAfter.parentId && !empAfter.teamId) {
        pass('E3. 方式A：Employee.parentId/teamId 已清空（归到待分配），员工本身保留');
      } else {
        fail('E3. 方式A：Employee.parentId/teamId 清空', 'parentId=null,teamId=null',
          `parentId=${empAfter.parentId}, teamId=${empAfter.teamId}`);
      }
      if (String(empAfter.teamGroupId) === String(tmpTG._id)) {
        pass('E3b. Employee.teamGroupId 保留（组本身没删）');
      } else {
        fail('E3b. Employee.teamGroupId 保留（组本身没删）', String(tmpTG._id), String(empAfter.teamGroupId));
      }
    }

    // 清理：组 + 员工
    await TeamGroup.deleteOne({ _id: tmpTG._id }).exec();
    await Employee.deleteOne({ _id: tmpEmp._id }).exec();
  }

  if (sv && typeof sv._deleteGroupLeader === 'function' && cui) {
    // 方式 8：删组长（TG.id）→ 级联删关联 admin 表 groupLeaderId 那条账号，组也删，Employee.teamGroupId 清空
    const UNAME_E2 = '__gl_del_test_e2_admin__';
    const GNAME_E2 = '__GL_DEL_TEST_E2_GROUP__';
    await Admin.deleteOne({ username: UNAME_E2 }).exec();
    await TeamGroup.deleteOne({ groupName: GNAME_E2 }).exec();
    await Employee.deleteOne({ employeeId: 'E299' }).exec();

    const { hashPassword } = require('./utils/auth');
    // 先建 GROUP_LEADER 的 Admin（模拟 POST /group-leaders 成功后状态）
    const glAdmin = await new Admin({
      username: UNAME_E2, password: hashPassword('e2Pass@99'),
      passwordPlain: 'e2Pass@99', role: 'GROUP_LEADER', realName: '测试GL删除',
      phone: '13900000002', teamName: cui.teamName || '鼎盛战队',
      teamGroupId: null, status: 'enabled', commission: 0.06
    }).save();
    const glTG = await new TeamGroup({
      teamLeaderId: String(cui._id), teamName: cui.teamName || '鼎盛战队',
      groupName: GNAME_E2, groupLeaderId: String(glAdmin._id),
      groupLeaderName: glAdmin.realName, commission: 0.06, status: 'active'
    }).save();
    await Admin.updateOne({ _id: glAdmin._id }, { $set: { teamGroupId: String(glTG._id), groupName: GNAME_E2 } }).exec();
    const glEmp = await new Employee({
      employeeId: 'E299', realName: '测试员工E299', status: 'enabled',
      parentId: String(cui._id), teamId: String(cui._id),
      teamGroupId: String(glTG._id), groupName: GNAME_E2
    }).save();

    await sv._deleteGroupLeader(String(glTG._id));
    const tgGone = await TeamGroup.findById(glTG._id).lean().exec();
    const adminGone = await Admin.findById(glAdmin._id).lean().exec();
    if (!tgGone) pass('E4. 删组长：TeamGroup 那条组记录已删除');
    else fail('E4. 删组长：组记录删除', '无', '仍存在');
    if (!adminGone) pass('E5. 删组长：级联删除 admins 的 groupLeaderId 对应账号（避免僵尸）');
    else fail('E5. 删组长：Admin 级联删除（避免僵尸账号）', '无', '仍存在 id=' + String(adminGone._id));

    const empE2After = await Employee.findById(glEmp._id).lean().exec();
    if (!empE2After) fail('E6. Employee 本人保留（只清 teamGroupId）', '存在', '被删了');
    else {
      if (!empE2After.teamGroupId) pass('E6. 删组长：Employee.teamGroupId 已被清空（组被解散，员工暂时归无组）');
      else fail('E6. 删组长：Employee.teamGroupId 清空', 'null', String(empE2After.teamGroupId));
    }
    // 清理残留
    await Employee.deleteOne({ _id: glEmp._id }).exec();
  }

  console.log('\n══════════════════ TOTAL ══════════════════');
  console.log('失败断言数 = ' + fails);
  process.exit(fails > 0 ? 1 : 0);
})().catch(e => { console.error('TDD 异常：', e); process.exit(2); });
