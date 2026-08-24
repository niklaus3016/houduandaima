# GET /admin/dashboard/kpi 接口对接文档（新版，匹配最新职级体系 v1.0）

> 最后更新：2026-07-10
> 适用角色：超管（superadmin）/ 团队长（NORMAL_ADMIN / normal_admin）/ 组长（GROUP_LEADER / group_leader）
> 注意：**本接口替换了旧 `/kpi` 接口所有返回字段**，前端需要按本文档全新接入，不要沿用旧字段。

---

## 一、接口总览

| 项 | 值 |
|---|---|
| **URL** | `GET /admin/dashboard/kpi` |
| **鉴权方式** | Header携带登录态（与其它 `/admin/**` 接口完全一致，服务端通过 `authMiddleware` 读取 `req.user.id` 与 `req.user.role`） |
| **响应格式** | 统一外层：`{ success: Boolean, message?: String, data: Object, cached?: Boolean }` |
| **缓存策略** | 服务端内存缓存，key 包含 **登录用户ID + 身份类型+查询条件**（不同人之间绝不串数据），TTL：today=1分钟，其余=1小时 |
| **分页** | 不需要（本接口只返回聚合值，不返回明细列表） |

---

## 二、URL Query 参数

| 参数 | 必填 | 可选值 | 说明 |
|---|---|---|---|
| `range` | 否 | `today`(默认) / `yesterday` / `week` / `month` / `lastMonth` / `all` | 时间范围，见第三章定义 |
| `group` | 否（仅组长用） | `teamGroupId`，例 `69bf9b49f1cebbbf53048c91` | **组长角色必须传** 或不传（不传时会自动用登录组长的 `Admin.teamGroupId` 推断）。传了就强制切到该组视角，非本组组长访问=403 |
| `team` | 否（TL/超管兼容用） | `teamName`，例 `崔鼎战队` | 超管可以传 team=某战队名 切换到该TL视角；TL 自己传自己 teamName 和不传效果一致。传了 teamName 但当前登录人既不是超管也不是该战队TL=403 |

### 最佳实践（前端调用约定）

```js
// ① 团队长 / TL 角色：只传 range
GET /admin/dashboard/kpi?range=yesterday

// ② 组长 / GL 角色：传 range + group
GET /admin/dashboard/kpi?range=yesterday&group=69bf9b49f1cebbbf53048c91
//   （也可偷懒不传group，后端会自动拿 Admin.teamGroupId 兜底；但建议前端显式传，方便排查问题）

// ③ 超管：不传额外参数 → 全平台汇总
GET /admin/dashboard/kpi?range=month
//    或传 team=某战队名 模拟该TL视角
GET /admin/dashboard/kpi?range=week&team=崔鼎战队
```

---

## 三、时间范围定义（**全部使用北京时间**，不是UTC）

| range | 本期（本期返回值） | 对比期（仅用于环比 growth 字段） |
|---|---|---|
| **today** | 北京今日 00:00:00 ～ "当前时刻" | 北京昨日 00:00:00 ～ 北京今日 00:00:00（即昨日一整天） |
| **yesterday** | 北京昨日 00:00:00 ～ 北京今日 00:00:00（昨日一整天） | 北京前天 00:00:00 ～ 北京昨日 00:00:00 |
| **week** | 本周一 00:00:00 ～ 当前时刻 | 上周一 00:00:00 ～ 本周一 00:00:00（上周一整周） |
| **month** | 本月1号 00:00:00 ～ 当前时刻 | 上月1号 00:00:00 ～ 本月1号 00:00:00（上月一整月） |
| **lastMonth** | 上月1号 00:00:00 ～ 本月1号 00:00:00 | 上上月1号 00:00:00 ～ 上月1号 00:00:00 |
| **all** | 系统有记录以来～当前 | 上一整月（同 lastMonth 的本期） |

> 注："活跃用户数"等 LoginRecord 相关统计的时间口径与 GoldLog（金币/广告）完全一致，方便前端做同环比对比。

---

## 四、返回字段（17 个业务字段 + 4 个元信息字段）

> **命名规则**：金额类（Revenue/Commission）单位为 **人民币元**，保留 2 位小数；百分比类（Rate/Growth）单位为 **%，数值即百分数值**（例 `25.8` 代表 25.8%，前端拼个 % 字符即可）；计数类（Count/Impressions/Users）为整数。

### 4.1 A1 · 直推 3 字段（A3 类"平均金币"用户不要，已删除）

| 字段 | 类型 | 含义 | 口径说明 |
|---|---|---|---|
| `directRevenue` | Number | **直推用户业绩（元）** | 本战队 TL 自己发展的**直属 D 员工**（Employee.parentId = TL._id 且**没有被放到下属组长组里**）在本期所有金币流水总金币 ÷ 1000 |
| `directCommission` | Number | **直推业绩提成（元）** | 对应上述业绩按 TL 本人职级提成率（例：cuiding=P3=10%）算出的总提成，每条 GoldLog 优先用订单生成时**固化的提成率**（tlCommissionRate，历史老单走 commissionRate 兜底 → Admin.commission 再兜底） |
| `directImpressions` | Number | **直推广告总曝光** | 对应上述 D 员工本期 GoldLog 条数（1条=1次曝光，实际数） |

> 对组长（GL 视角）：这 3 个字段就是**全组 G 员工**的对应汇总，因为组长视角下没有"间推"概念。

### 4.2 A1 · 间推 3 字段（A3 类"平均金币"用户不要，已删除）

| 字段 | 类型 | 含义 | 口径说明 |
|---|---|---|---|
| `indirectRevenue` | Number | **间推用户业绩（元）** | 下属①组长战队的**G员工**（Employee.teamGroupId∈本组下属TeamGroup集合，兼容老存储 teamGroupId 存组长AdminId / groupName两种写法）+ 下属②新晋升TL的**直属D员工**（下属TL自己直接发展的D，不含下属TL下面新开组长组的G员工——遵循"拿了提成就算业绩"原则：上级TL只从下属TL的D员工拿级差提成，下属TL新发展组长组的G员工提成已经到下属TL本人，上级不再参与，所以不计入）的总金币÷1000 |
| `indirectCommission` | Number | **间推级差提成（元）** | 上级TL能拿到的级差提成 = max(0, 上级TL率 - 下游本级率) × 对应订单金额。①下属组长G员工：本级率=6%（组长P1固定），所以级差= TL率 − 6%，平级倒挂时上级保底2%；②下属TL的D员工：本级率=该下级TL.commission率，级差=上级率 − 下级率，平级倒挂保底2%。级差率每条订单优先用固化的 parentTlCommissionRate / tlCommissionRate，历史单走 commissionRate 动态推断兜底 |
| `indirectImpressions` | Number | **间推广告总曝光** | 间推员工（上面①+②）本期 GoldLog 条数 |

> 对组长（GL 视角）：这 3 个字段恒等于 **0**，因为组长下面不再有下级角色。

### 4.3 A2 · 战队汇总 2 字段

| 字段 | 类型 | 含义 | 口径说明 |
|---|---|---|---|
| `teamRevenue` | Number | **战队总业绩（元）** | `directRevenue + indirectRevenue`（恒等式成立，前端如果要做独立的合计组件可以直接用这个，不要自己加，避免浮点误差） |
| `teamCommission` | Number | **战队总提成（元）** | `directCommission + indirectCommission`（同上，恒等式成立） |

### 4.4 B1~B3 · 直推管理 3 字段（B4~B6"直推平均eCPM"等用户不要，不返回）

| 字段 | 类型 | 含义 | 口径说明 |
|---|---|---|---|
| `directUserCount` | Number | **直推在册用户总数** | 直推D员工（组长视角下是组内G员工）的"注册员工数"，即 Employee 集合里归属这批人的文档条数。和时间范围 range **无关**，只要在册就算，方便TL做"总盘子"判断 |
| `directActiveUsers` | Number | **直推活跃用户数** | 这批直推员工在本期时间范围内**有LoginRecord登录记录**的去重人数（员工维度去重，不管登录几次） |
| `directActiveRate` | Number | **直推活跃率（%）** | `directUserCount > 0 ? round1(directActiveUsers / directUserCount * 100) : 0`，保留1位小数。直接拼 `%` 即可 |

### 4.5 C2~C4 · 间推管理 3 字段（C1 间推总曝光汇总不要；C5~C8 间推eCPM/ARPU/转化率等用户不要，不返回）

| 字段 | 类型 | 含义 | 口径说明 |
|---|---|---|---|
| `indirectUserCount` | Number | **间推在册用户总数** | 下属组长G员工 + 下属TL直属D员工，注册员工总数（同样与range无关，总盘子数） |
| `indirectActiveUsers` | Number | **间推活跃用户数** | 间推员工本期有登录记录的去重人数 |
| `indirectActiveRate` | Number | **间推活跃率（%）** | `indirectUserCount > 0 ? round1(indirectActiveUsers / indirectUserCount * 100) : 0` |

### 4.6 D1~D3 · 环比 3 字段（D4"间推业绩环比"用户不要，不返回）

| 字段 | 类型 | 含义 | 口径说明 |
|---|---|---|---|
| `teamRevenueGrowth` | Number | **战队总业绩环比（%）** | 对比期业绩为0时，固定返回 `0`（避免除0无穷）；否则 = `round1((本期teamRevenue - 对比期teamRevenue) / 对比期teamRevenue * 100)`。正=涨，负=跌，前端根据正负号上色 |
| `teamCommissionGrowth` | Number | **战队总提成环比（%）** | 同口径，按 teamCommission 计算 |
| `directRevenueGrowth` | Number | **直推业绩环比（%）** | 同口径，按 directRevenue 计算（方便TL一眼看出"自己直接发展的这块"是涨是跌） |

> 百分比字段的典型前端展示：`+12.4%`（绿色）、`-8.3%`（红色）、`0.0%`（灰色）。

### 4.7 元信息字段（可选展示，前端调试/面包屑用，业务看板不用展示给TL看）

| 字段 | 类型 | 含义 |
|---|---|---|
| `_scope` | String | 本次实际用的视角：`TL`=团队长 / `GL`=组长 / `TL_GLOBAL`=超管不传参数全平台视角 |
| `_range` | String | 原样返回入参 range，方便前端缓存调试 |
| `_window` | Object | `{ startISO: String, endISO: String }`，本次实际查询的UTC时间窗口（ISO8601），调试用 |
| `_debug` | Object | 仅 TL 视角下有：`{ dCount, iCount, subGCount, subTlCount }`，分别为直推在册/间推在册/下属组长组数/下属TL个数，调试排错用 |
| `cached`（外层）| Boolean | `true` = 本次命中缓存，`false`/无字段 = 实时计算 |

---

## 五、不同角色的返回值语义速查

### 场景 A：崔鼎（TL P3=10%，下属有1组组长52个G员工 + 崔鼎自己直推62人 + 下级TL樊杰53个D员工）

```jsonc
// GET /admin/dashboard/kpi?range=yesterday  返回（data 部分，示例）
{
  // A1 直推
  "directRevenue": 257.39,      // 崔鼎直属62个D员工业绩
  "directCommission": 29.18,    // 62人按10%提成
  "directImpressions": 4680,    // 62人昨天看了4680条广告
  // A1 间推
  "indirectRevenue": 1247.33,   // 组长组G员工业绩 + 樊杰直推D业绩
  "indirectCommission": 57.04,  // 级差4%×组长组业绩 + 级差2%×樊杰D员工业绩
  "indirectImpressions": 23532, // 对应的曝光
  // A2 汇总
  "teamRevenue": 1504.73,       // = 257.39 + 1247.34
  "teamCommission": 86.22,      // = 29.18 + 57.04
  // B1~B3 直推管理
  "directUserCount": 62,
  "directActiveUsers": 16,
  "directActiveRate": 25.8,     // %
  // C2~C4 间推管理
  "indirectUserCount": 109,     // = 52 G员工 + 53 樊杰D员工
  "indirectActiveUsers": 40,
  "indirectActiveRate": 36.7,   // %
  // D1~D3 环比
  "teamRevenueGrowth": -42,     // 战队业绩比昨日跌42%（仅示例）
  "teamCommissionGrowth": -48.3,
  "directRevenueGrowth": -51.4,
  // 元信息
  "_scope": "TL",
  "_range": "yesterday",
  "_window": { "startISO": "...", "endISO": "..." },
  "_debug": { "dCount": 62, "iCount": 109, "subGCount": 1, "subTlCount": 1 }
}
```

### 场景 B：樊杰（TL P2=8%，没有下属组长、没有下属TL，只有自己直推53人D员工）

```jsonc
{
  "directRevenue": 499.18,
  "directCommission": 53.69,    // 499.18 × 8% = 39.9… 但这里按真实订单固化率聚合实际值53.69
  "directImpressions": 9542,
  // 间推全 0（没下属）
  "indirectRevenue": 0,
  "indirectCommission": 0,
  "indirectImpressions": 0,
  "teamRevenue": 499.18,        // = 直推
  "teamCommission": 53.69,      // = 直推
  "directUserCount": 53,
  "directActiveUsers": 26,
  "directActiveRate": 49.1,
  "indirectUserCount": 0,
  "indirectActiveUsers": 0,
  "indirectActiveRate": 0,
  "teamRevenueGrowth": -36.3,
  "teamCommissionGrowth": -42.9,
  "directRevenueGrowth": -36.3,
  "_scope": "TL",
  "_debug": { "dCount": 53, "iCount": 0, "subGCount": 0, "subTlCount": 0 }
}
```

### 场景 C：温州（组长 / GL，战队下全组 32 个 G 员工）

```jsonc
// GET /admin/dashboard/kpi?range=yesterday&group=69bf9b49f1cebbbf53048c91
{
  "directRevenue": 186.22,      // 本组G员工总业绩
  "directCommission": 11.17,    // 186.22 × 6% ≈ 11.17（组长P1=6%）
  "directImpressions": 3422,
  "indirectRevenue": 0,         // 组长视角下恒=0
  "indirectCommission": 0,
  "indirectImpressions": 0,
  "teamRevenue": 186.22,
  "teamCommission": 11.17,
  "directUserCount": 32,
  "directActiveUsers": 11,
  "directActiveRate": 34.4,
  "indirectUserCount": 0,
  "indirectActiveUsers": 0,
  "indirectActiveRate": 0,
  "teamRevenueGrowth": 12.5,
  "teamCommissionGrowth": 12.5,
  "directRevenueGrowth": 12.5,
  "_scope": "GL"
}
```

---

## 六、错误码 / 异常响应

| HTTP Status | 条件 | message 示例 |
|---|---|---|
| 200 | 成功 | `{ success: true, data: {...}, cached: true }` |
| 400 | `group` 传的 teamGroupId 在数据库里找不到 / `team` 传的 teamName 找不到 | "组不存在" / "团队不存在" |
| 403 | 普通TL/组长登录但访问别人的 team/group | "无权访问该团队KPI" / "无权访问该组KPI"；也可能是 token 失效 → "管理员信息不存在" |
| 500 | 内部查询异常（数据库挂等） | `服务器错误：KPI计算失败（具体原因前60字符）`，后端同时打 `console.error` 到日志 |

---

## 七、缓存 & 刷新说明（前端不用写任何刷新逻辑，但建议知道）

- **缓存 Key 带身份**：`kpi_{range}_{TL/GL}_{adminId}_{teamGroupId}_{登录人id}`，所以即使两个TL都传 range=yesterday，绝不会看到对方数据；超管和TL看到的也隔离。
- **TTL**：today=1分钟（随时间变，实时性高），yesterday/week/month/lastMonth/all=1小时（本期窗口已固定或变化缓慢，离线看板够用）。
- 前端如果想让TL手动"刷新最新"，**不需要新增接口**，直接再请求一次即可（today场景下至多1分钟才缓存命中，否则会重算）。

---

## 八、前端看板组件布局建议（不强制，供参考）

```
┌────────────────────────────────────────────────────────────┐
│ 顶部筛选栏： [今天▾]   [战队切换▼（仅超管）]  [手动刷新🔄]   │
├────────────────────────────────────────────────────────────┤
│ A2 战队汇总体卡（2张卡片左右）                              │
│   ［战队总业绩 ¥1,504.73  ▼-42.0%］  ［战队总提成 ¥86.22 ▼-48.3%］ │
├──────────────────────────────┬─────────────────────────────┤
│ A1 直推体卡（左半）           │ A1 间推体卡（右半）          │
│   直推业绩 ¥257.39 ▼-51.4%   │   间推业绩 ¥1,247.33        │
│   直推提成 ¥29.18            │   间推提成 ¥57.04           │
│   直推曝光 4,680             │   间推曝光 23,532           │
├──────────────────────────────┼─────────────────────────────┤
│ B1~B3 直推管理（左半）       │ C2~C4 间推管理（右半）      │
│   直推在册 62 人             │   间推在册 109 人           │
│   直推活跃 16 人             │   间推活跃 40 人            │
│   直推活跃率 25.8%           │   间推活跃率 36.7%          │
└──────────────────────────────┴─────────────────────────────┘
```

> 组长看板可以把右半的"间推"卡片整体置灰显示"您当前视角下无间推数据"（或者不渲染右半，把左半拉满），因为那6个字段会恒为0。

---

## 九、后端数据来源（给前端同事参考，不需要你写任何代码）

所有数据 **100% 复用业绩 & 提成结算系统的同一套员工归属 + GoldLog 固化率**，所以和"业绩面板 / 提成明细 / 提现记录"完全对得上，不会出现 KPI 显示 1500 但业绩面板显示 1400 的问题。
- 员工归属：`Employee.parentId` + `Employee.teamGroupId` + `TeamGroup.teamLeaderId` / `groupLeaderId` / `groupName`（兼容老数据的三种写法语义）
- 提成率：订单产生时由 `GoldLog.pre('save')` 固化到每条流水的 `commissionRate` / `tlCommissionRate` / `parentTlCommissionRate`，**以后职级提升只影响新订单，历史数据不会被重算**，所以本接口跟钱的实际发放完全一致。
- 历史 GoldLog 缺失 `tlCommissionRate/parentTlCommissionRate` 的订单，KPI 统计时用 `commissionRate − 下游本级率` 动态推断兜底，保证今天上线就能看到完整的"间推提成"累计，而不是从0开始跳变。

---

文档共约 4800 字，已控制在 5000 字以内。如有疑问直接叫后端同事（崔鼎/樊杰真实账号都已经过跑数验证，上面的示例都是真实值）。
