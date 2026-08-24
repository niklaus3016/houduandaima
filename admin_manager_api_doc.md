# 高管（ADMIN_MANAGER）接口文档

## 一、角色定义

### 1.1 角色层级

```
┌─────────────────────────────────────┐
│           SUPER_ADMIN (超管)          │
│     管理所有团队，无数据范围限制        │
└─────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│         ADMIN_MANAGER (高管)          │
│  协助超管管理指定团队，有数据范围限制    │
│  权限：除了创建/删除高管，其余与超管一致  │
└─────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│         NORMAL_ADMIN (团队长)         │
│     管理自己的团队和下属组长           │
└─────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│        GROUP_LEADER (组长)            │
│        管理自己组内的员工             │
└─────────────────────────────────────┘
```

### 1.2 核心字段

`Admin` 模型新增字段：

| 字段名 | 类型 | 说明 |
|---|---|---|
| `managedTeamIds` | Array<ObjectId> | 高管管理的团队长 ID 列表 |

### 1.3 角色判断

前端判断逻辑：

```javascript
// 超管
const isSuperAdmin = role === 'superadmin' || role === 'SUPER_ADMIN';

// 高管
const isAdminManager = role === 'ADMIN_MANAGER';

// 超管或高管
const isSuperOrAdminManager = isSuperAdmin || isAdminManager;

// 团队长
const isTeamLeader = role === 'NORMAL_ADMIN';
```

---

## 二、新增接口

### 2.1 高管管理接口

#### POST /api/admin/supervisor/admin-managers
**创建高管（仅超管）**

请求体：
```json
{
  "realName": "高管姓名",
  "username": "admin002",
  "passwordPlain": "admin002",
  "phone": "13800138002",
  "teamName": "",
  "commission": 0,
  "managedTeamIds": ["团队长ID1", "团队长ID2"]
}
```

响应：
```json
{
  "success": true,
  "data": {
    "_id": "6a5623952d9a34ce8fb38dcf",
    "username": "admin002",
    "status": "active",
    "createdAt": "2026-07-14T08:00:00.000Z"
  }
}
```

#### GET /api/admin/supervisor/admin-managers
**获取高管列表（仅超管）**

查询参数：`page`, `pageSize`

响应：
```json
{
  "success": true,
  "total": 2,
  "data": [
    {
      "_id": "6a5623952d9a34ce8fb38dcf",
      "role": "ADMIN_MANAGER",
      "realName": "高管002",
      "username": "admin002",
      "phone": "13800138002",
      "teamName": "",
      "status": "active",
      "commission": 0,
      "managedTeamIds": ["团队长ID1", "团队长ID2"],
      "createdAt": "2026-07-14T08:00:00.000Z"
    }
  ]
}
```

#### PUT /api/admin/supervisor/admin-managers/:id
**编辑高管（仅超管）**

请求体：
```json
{
  "realName": "更新姓名",
  "username": "admin002",
  "passwordPlain": "newpassword",
  "phone": "13800138003",
  "teamName": "",
  "status": "active",
  "managedTeamIds": ["团队长ID1", "团队长ID2", "团队长ID3"]
}
```

响应：
```json
{
  "success": true,
  "data": {
    "_id": "6a5623952d9a34ce8fb38dcf",
    "updatedAt": "2026-07-14T09:00:00.000Z"
  }
}
```

#### DELETE /api/admin/supervisor/admin-managers/:id
**删除高管（仅超管）**

响应：
```json
{
  "success": true,
  "data": {
    "_id": "6a5623952d9a34ce8fb38dcf"
  }
}
```

#### PUT /api/admin/supervisor/admin-managers/:id/managed-teams
**分配团队给高管（仅超管）**

请求体：
```json
{
  "teamIds": ["团队长ID1", "团队长ID2"]
}
```

响应：
```json
{
  "success": true,
  "data": {
    "_id": "6a5623952d9a34ce8fb38dcf",
    "managedTeamIds": ["团队长ID1", "团队长ID2"],
    "updatedAt": "2026-07-14T09:00:00.000Z"
  }
}
```

---

## 三、改造接口

### 3.1 数据看板接口

#### GET /api/admin/dashboard/super/kpi
**超管/高管数据看板**

权限：superadmin / ADMIN_MANAGER

查询参数：`range=today|yesterday|week|month|lastMonth|all`

数据范围：
- **超管**：返回所有团队数据合计
- **高管**：只返回 `managedTeamIds` 范围内的团队数据合计

响应示例：
```json
{
  "success": true,
  "data": {
    "businessRevenue": 10000.00,
    "userShareCommission": 5000.00,
    "managementCommission": 1000.00,
    "dividendTotal": 250.00,
    "newUserCount": 10,
    "platformProfit": 3750.00,
    "platformProfitRate": 37.50,
    "impressions": 1000,
    "ecpmAvg": 10.00,
    "registeredUserCount": 1000,
    "activeUserCount": 100,
    "activeUserRate": 10.0,
    "businessRevenueGrowth": 10.5,
    "userShareGrowth": 8.2,
    "managementCommissionGrowth": 5.0,
    "dividendTotalGrowth": 12.0,
    "platformProfitGrowth": 15.0,
    "platformProfitRateGrowth": 2.5,
    "impressionsGrowth": 20.0,
    "ecpmAvgGrowth": 5.0
  }
}
```

#### GET /api/admin/dashboard/super/manager-direct-cards
**管理者直属业绩卡列表**

权限：superadmin / ADMIN_MANAGER

查询参数：`range`, `role`, `page`, `limit`

数据范围：
- **超管**：返回所有管理者数据
- **高管**：只返回 `managedTeamIds` 范围内的团队长及其下属组长数据

响应示例：
```json
{
  "success": true,
  "data": [...],
  "total": 10,
  "page": 1,
  "limit": 100
}
```

### 3.2 团队管理接口

#### GET /api/admin/supervisor/team-leaders
**团队长列表**

权限：superadmin / ADMIN_MANAGER

数据范围：
- **超管**：返回所有团队长
- **高管**：只返回 `managedTeamIds` 范围内的团队长

#### GET /api/admin/supervisor/group-leaders
**组长列表**

权限：superadmin / ADMIN_MANAGER

数据范围：
- **超管**：返回所有组长
- **高管**：只返回 `managedTeamIds` 范围内团队长下属的组长

#### POST /api/admin/supervisor/team-leaders
**创建团队长**

权限：superadmin / ADMIN_MANAGER

特殊逻辑：**高管创建团队长时，新团队长自动加入其 `managedTeamIds`**

#### DELETE /api/admin/supervisor/team-leaders/:id
**删除团队长**

权限：superadmin / ADMIN_MANAGER

特殊逻辑：**团队长删除时，自动从所有高管的 `managedTeamIds` 中移除**

#### POST /api/admin/supervisor/group-leaders
**创建组长**

权限：superadmin / ADMIN_MANAGER

### 3.3 员工管理接口

#### GET /api/admin/employee/team-leaders
**团队长下拉列表**

权限：登录用户

数据范围：
- **超管**：返回所有团队长
- **高管**：只返回 `managedTeamIds` 范围内的团队长
- **团队长/组长**：只返回自己

### 3.4 管理员接口

#### GET /api/admin/account/admins
**管理员列表**

权限：superadmin / ADMIN_MANAGER

数据范围：
- **超管**：返回所有管理员
- **高管**：只返回 `managedTeamIds` 范围内的团队长和组长

#### POST /api/admin/account/add-admin
**添加管理员**

权限：superadmin / ADMIN_MANAGER / NORMAL_ADMIN

特殊逻辑：**高管创建团队长时，新团队长自动加入其 `managedTeamIds`**

#### POST /api/admin/account/create
**创建管理员（新接口）**

权限：superadmin / ADMIN_MANAGER / NORMAL_ADMIN

特殊逻辑：**高管创建团队长时，新团队长自动加入其 `managedTeamIds`**

### 3.5 业绩接口

#### GET /api/admin/verification/team-leader/performance?userId=xxx
**代理查看团队长业绩**

权限：superadmin / ADMIN_MANAGER / NORMAL_ADMIN

数据范围：
- **超管**：可查看任意团队长业绩
- **高管**：只能查看 `managedTeamIds` 范围内团队长的业绩
- **团队长**：只能查看自己或下属团队长的业绩

### 3.6 新人接口

#### GET /api/admin/newuser/list
**新人列表**

权限：登录用户

数据范围：
- **超管**：返回所有新人
- **高管**：返回 `managedTeamIds` 范围内团队的新人
- **团队长/组长**：返回自己团队的新人

### 3.7 小组接口

#### GET /api/admin/group/list
**小组列表**

权限：登录用户

数据范围：
- **超管**：返回所有小组
- **高管**：返回 `managedTeamIds` 范围内团队的小组
- **团队长/组长**：返回自己团队的小组

---

## 四、前端对接要点

### 4.1 角色枚举

新增角色枚举：
```javascript
const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN_MANAGER: 'ADMIN_MANAGER',
  NORMAL_ADMIN: 'NORMAL_ADMIN',
  GROUP_LEADER: 'GROUP_LEADER'
};
```

### 4.2 页面权限控制

| 页面 | 超管 | 高管 | 团队长 | 组长 |
|---|---|---|---|---|
| 数据看板（总览） | ✅ | ✅（限范围） | ❌ | ❌ |
| 团队页面 | ✅ | ✅（限范围） | ❌ | ❌ |
| 高管管理 | ✅ | ❌ | ❌ | ❌ |
| 团队长管理 | ✅ | ✅（限范围） | ❌ | ❌ |
| 组长管理 | ✅ | ✅（限范围） | ✅（自己团队） | ❌ |
| 新人列表 | ✅ | ✅（限范围） | ✅（自己团队） | ✅（自己组） |
| 个人业绩 | ❌ | ❌ | ✅ | ✅ |

### 4.3 高管管理页面需求

**页面功能：**
1. 显示高管列表（仅超管可见）
2. 创建高管按钮（仅超管）
3. 编辑高管弹窗（仅超管）
4. 删除高管按钮（仅超管）
5. **分配团队功能**：编辑高管时，通过勾选团队长来分配管理范围

**分配团队交互：**
- 弹窗中显示所有团队长列表
- 已分配的团队长显示勾选状态
- 超管可以勾选/取消勾选团队长
- 保存后更新 `managedTeamIds`

### 4.4 数据范围适配

所有数据看板和团队页面的接口调用，后端会根据当前用户角色自动过滤数据范围，前端**无需额外处理**。

### 4.5 缓存策略

后端缓存键已包含 scope 信息：
```
kpi:super:${adminId}    // 超管
kpi:senior:${adminId}   // 高管
```

前端无需关心缓存策略，正常调用接口即可。

### 4.6 登录接口

登录接口已支持 ADMIN_MANAGER 角色，登录成功后返回：
```json
{
  "success": true,
  "token": "xxx",
  "admin": {
    "id": "6a5623952d9a34ce8fb38dcf",
    "username": "admin002",
    "role": "ADMIN_MANAGER",
    "teamName": "",
    "teamGroupId": null
  }
}
```

---

## 五、测试账号

| 账号 | 密码 | 角色 |
|---|---|---|
| admin002 | admin002 | ADMIN_MANAGER |
| admin003 | admin003 | ADMIN_MANAGER |

---

## 六、注意事项

1. **数据范围一致性**：所有查询接口都会根据 `managedTeamIds` 自动过滤，前端无需额外处理
2. **团队长生命周期**：高管创建的团队长自动加入 `managedTeamIds`，删除时自动移除
3. **权限中间件**：新增 `superOrAdminManagerOnly` 中间件，同时允许超管和高管访问
4. **缓存隔离**：缓存键包含 scope 信息，避免超管和高管数据串台
5. **历史数据兼容**：未分配 `managedTeamIds` 的高管看不到任何团队数据（需超管分配）
6. **敏感操作保护**：创建/删除高管仍仅限超管操作，防止权限提升