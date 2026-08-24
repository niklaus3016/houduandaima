# CSJ 系统设备数限制 - 前后端联调文档

## 一、背景

为防止用户在 CSJ（穿山甲）系统中使用多个设备刷量，需要实现设备数限制功能。超管在后台为每个用户设置每日可使用的最大设备数，用户登录时后端会校验当天设备数是否超限。

---

## 二、前端改动（已完成）

### 1. 新增文件：`src/utils/device.ts`

```typescript
export const getDeviceId = (): string => {
  let deviceId = localStorage.getItem('csj_deviceId');
  if (!deviceId) {
    deviceId = 'csj_device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('csj_deviceId', deviceId);
  }
  return deviceId;
};
```

**关键说明**：
- localStorage key 使用 `csj_deviceId`（与百度系统的 `deviceId` 隔离）
- deviceId 格式：`csj_device_{时间戳}_{随机字符串}`
- 一旦生成，同一设备上保持不变（除非用户清除本地存储或恢复出厂设置）

### 2. 修改文件：`src/api/apiService.ts`

**函数签名变更**：
```typescript
// 修改前
export async function checkEmployee(employeeId: string): Promise<ApiResponse<EmployeeInfo>>

// 修改后
export async function checkEmployee(employeeId: string, deviceId?: string): Promise<ApiResponse<EmployeeInfo>>
```

**请求体变更**：
```json
// 修改前
{ "employeeId": "8202" }

// 修改后
{ "employeeId": "8202", "deviceId": "csj_device_1735043770523_c89qhuhh4" }
```

**接口地址**：`POST /api/employee/check`

### 3. 修改文件：`src/pages/Login.vue`

- 登录时自动获取 deviceId 并传递给后端
- 添加设备超限弹窗提示

**设备超限错误处理**：
```typescript
if (response.code === 'DEVICE_LIMIT_EXCEEDED') {
  limitMessage.value = response.message || '今日设备数已达上限，请明天再来';
  showLimitDialog.value = true;
}
```

### 4. 修改文件：`src/pages/Home.vue`

- 删除原有的 `getDeviceId()` 函数（与百度系统隔离）
- 改为从 `utils/device.ts` 导入

---

## 三、后端需要配合的接口

### 1. 修改现有接口：`POST /api/employee/check`

**请求体**：
```json
{
  "employeeId": "8202",
  "deviceId": "csj_device_1735043770523_c89qhuhh4"
}
```

**成功响应**（设备数校验通过）：
```json
{
  "success": true,
  "message": "登录成功",
  "data": { /* 员工信息 */ },
  "token": "jwt_token"
}
```

**失败响应 - 设备数超限**：
```json
{
  "success": false,
  "message": "今日设备数已达上限（3台），请明天再来或联系管理员",
  "code": "DEVICE_LIMIT_EXCEEDED"
}
```

**失败响应 - 其他错误**：
```json
{
  "success": false,
  "message": "员工号不存在或已禁用"
}
```

---

## 四、后端数据库设计建议

### 员工设备登录记录表

```sql
CREATE TABLE employee_device_logins (
  id INT PRIMARY KEY AUTO_INCREMENT,
  employee_id VARCHAR(50) NOT NULL COMMENT '员工ID',
  device_id VARCHAR(100) NOT NULL COMMENT '设备ID（csj_device_前缀）',
  login_date DATE NOT NULL COMMENT '登录日期（用于按日统计）',
  last_login_at DATETIME NOT NULL COMMENT '最后登录时间',
  login_count INT DEFAULT 1 COMMENT '当日登录次数',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_employee_device_date (employee_id, device_id, login_date),
  INDEX idx_login_date (login_date),
  INDEX idx_employee_id (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='员工设备登录记录';
```

### 员工设备数配置表

```sql
CREATE TABLE employee_device_config (
  id INT PRIMARY KEY AUTO_INCREMENT,
  employee_id VARCHAR(50) NOT NULL UNIQUE COMMENT '员工ID',
  max_devices_per_day INT DEFAULT 3 COMMENT '每日最大设备数',
  remark VARCHAR(200) COMMENT '备注',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='员工设备数配置';
```

---

## 五、后端校验逻辑

```
用户登录请求 → POST /api/employee/check
    ↓
1. 解析请求体，获取 employeeId 和 deviceId
    ↓
2. 查询员工信息（验证员工号是否有效）
    ↓
3. 查询员工设备数配置（默认 max_devices_per_day = 3）
    ↓
4. 查询今日已登录的不同设备数：
   SELECT COUNT(DISTINCT device_id) 
   FROM employee_device_logins 
   WHERE employee_id = ? AND login_date = CURDATE()
    ↓
5. 判断：
   ├── 如果当前 deviceId 已在今日登录列表 → 允许登录（同一设备重复登录）
   ├── 如果今日设备数 < max_devices_per_day → 允许登录，记录新设备
   └── 如果今日设备数 >= max_devices_per_day → 拒绝登录，返回 DEVICE_LIMIT_EXCEEDED
    ↓
6. 允许登录 → 记录设备登录信息 → 返回成功响应
   拒绝登录 → 返回错误响应（code: DEVICE_LIMIT_EXCEEDED）
```

---

## 六、测试用例

| 场景 | 操作 | 预期结果 |
|------|------|---------|
| 首次登录 | 员工号 + 新设备 | ✅ 登录成功 |
| 同设备再次登录 | 同一员工号 + 同一设备ID | ✅ 登录成功 |
| 多设备登录（未超限） | 同一员工号 + 新设备ID（< 限制数） | ✅ 登录成功 |
| 多设备登录（已超限） | 同一员工号 + 新设备ID（>= 限制数） | ❌ 提示"设备数超限" |
| 第二天登录 | 同一员工号 + 前一天的设备ID | ✅ 登录成功（设备数重置） |
| 跨天多设备 | 同一员工号 + 多个设备ID（第二天） | ✅ 登录成功（设备数重置） |
| 恢复出厂设置后 | 同一员工号 + 新设备ID | ⚠️ 视为新设备，占用限额 |

---

## 七、注意事项

1. **设备数按自然日重置**：每日 0 点自动重置，不需要手动清理
2. **数据隔离**：CSJ 系统使用 `csj_deviceId`，百度系统使用 `deviceId`，互不影响
3. **容错处理**：如果 `deviceId` 参数为空，建议后端不限制（兼容旧版本客户端）
4. **超管可配置**：建议在管理后台添加员工设备数配置功能
5. **日志记录**：建议后端记录设备登录日志，便于审计和排查

---

## 八、接口参数示例

### 登录请求

```json
POST /api/employee/check
Content-Type: application/json

{
  "employeeId": "8202",
  "deviceId": "csj_device_1735043770523_c89qhuhh4"
}
```

### 成功响应

```json
{
  "success": true,
  "message": "登录成功",
  "data": {
    "_id": "699c87e89ad7757d16c8b9e1",
    "userId": "user_8202_1772466028893",
    "employeeId": "8202",
    "name": "测试员工",
    "phone": "13800138000",
    "area": "北京",
    "status": 1
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### 设备超限响应

```json
{
  "success": false,
  "message": "今日设备数已达上限（3台），请明天再来或联系管理员",
  "code": "DEVICE_LIMIT_EXCEEDED"
}
```

---

## 九、前端代码位置

| 文件 | 改动说明 |
|------|---------|
| `src/utils/device.ts` | 新增：getDeviceId() 公共函数 |
| `src/api/apiService.ts` | 修改：checkEmployee() 增加 deviceId 参数 |
| `src/pages/Login.vue` | 修改：登录时传递 deviceId，添加设备超限弹窗 |
| `src/pages/Home.vue` | 修改：使用公共 getDeviceId()，删除本地定义 |
