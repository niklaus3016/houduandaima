const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const employeeRoutes = require('./routes/employee');
const userRoutes = require('./routes/user');
const goldRoutes = require('./routes/gold');
const { router: adminRoutes, _prewarmEcpmCache } = require('./routes/admin');
const dashboardRoutes = require('./routes/dashboard');
const teamRoutes = require('./routes/team');
const accountRoutes = require('./routes/account');
const alertRoutes = require('./routes/alert');
const userAdminRoutes = require('./routes/userAdmin');
const newuserRoutes = require('./routes/newuser');
const withdrawRoutes = require('./routes/withdraw');
const dailyTargetRoutes = require('./routes/dailyTarget');
const dailyBonusRoutes = require('./routes/dailyBonus');
const activityRoutes = require('./routes/activity');
const userEarningsRoutes = require('./routes/userEarnings');
const employeeManageRoutes = require('./routes/employeeManage');
const settingsRoutes = require('./routes/settings');
const withdrawAdminRoutes = require('./routes/withdrawAdmin');
const teamPublicRoutes = require('./routes/teamPublic');
const newuserPublicRoutes = require('./routes/newuserPublic');
const healthRoutes = require('./routes/health');
const groupRoutes = require('./routes/group');
const poolRoutes = require('./routes/pool');
const deviceRoutes = require('./routes/device');
const lotteryRoutes = require('./routes/lottery');
const verificationRoutes = require('./routes/verification');
const teamPerformanceRoutes = require('./routes/teamPerformance');
const teamMembersRoutes = require('./routes/teamMembers');
const weeklyTargetRoutes = require('./routes/weeklyTarget');
const weeklyBonusRoutes = require('./routes/weeklyBonus');
const welfareRoutes = require('./routes/welfare');
const dailyGuaranteeRoutes = require('./routes/welfare/dailyGuarantee');
const rankingRoutes = require('./routes/ranking');
const supervisorManageRoutes = require('./routes/supervisorManage');
const downloadRoutes = require('./routes/download');
const adRoutes = require('./routes/ad');


const app = express();
const PORT = process.env.PORT || 3003;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb';

// 中间件
app.use(cors());
app.use(express.json());

// 静态文件服务
const path = require('path');
const uploadPath = path.join(__dirname, 'uploads');
const fs = require('fs');

// 确保上传目录存在
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

// 配置静态文件服务
app.use('/uploads', express.static(uploadPath));

// 路由
app.use('/api/employee', employeeRoutes);
app.use('/api/user', userRoutes);
app.use('/api/gold', goldRoutes);
app.use('/api/withdraw', withdrawRoutes);
app.use('/api/daily-target', dailyTargetRoutes);
app.use('/api/daily-bonus', dailyBonusRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/admin/user', userEarningsRoutes);

// 管理员相关路由
app.use('/api/admin', adminRoutes);
app.use('/api/admin/dashboard', dashboardRoutes);
app.use('/api/admin/team', teamRoutes);
app.use('/api/admin/account', accountRoutes);
app.use('/api/admin/alert', alertRoutes);
app.use('/api/admin/user', userAdminRoutes);
app.use('/api/admin/newuser', newuserRoutes);
app.use('/api/admin/employee', employeeManageRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/admin/withdraw', withdrawAdminRoutes);
app.use('/api/team', teamPublicRoutes);
app.use('/api/newuser', newuserPublicRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/group', groupRoutes);
app.use('/api/pool', poolRoutes);
app.use('/api/device', deviceRoutes);
app.use('/api/lottery', lotteryRoutes);
app.use('/api', verificationRoutes);
app.use('/api', welfareRoutes);
app.use('/api/weeklyTarget', weeklyTargetRoutes);
app.use('/api/weeklyBonus', weeklyBonusRoutes);
app.use('/api/welfare/daily-guarantee', dailyGuaranteeRoutes);
app.use('/api/ranking', rankingRoutes);
app.use('/api/admin/team-performance', teamPerformanceRoutes);
app.use('/api/admin/dashboard', teamMembersRoutes);
app.use('/api/admin/supervisor', supervisorManageRoutes);
app.use('/api/download', downloadRoutes);
app.use('/api/ad', adRoutes);

// 连接MongoDB（副本集，读写分离）
mongoose.connect(MONGODB_URI, {
  maxPoolSize: 100,
  minPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 30000,
  connectTimeoutMS: 5000,
  readPreference: 'secondaryPreferred',
})
  .then(async () => {
    console.log('MongoDB连接成功');
    
    await _prewarmEcpmCache();
    
    // 移除自动开奖监控，所有开奖由超管手动控制
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`服务器运行在端口 ${PORT}`);
    });
  })
  .catch(err => {
    console.error('MongoDB连接失败:', err);
  });

// 监听MongoDB连接事件
mongoose.connection.on('connected', () => {
  console.log('Mongoose连接已建立');
});

mongoose.connection.on('error', (err) => {
  console.error('Mongoose连接错误:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose连接已断开');
});

// 进程终止时关闭连接
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('Mongoose连接通过应用终止已关闭');
  process.exit(0);
});

// 健康检查
app.get('/', (req, res) => {
  res.json({ message: '广告变现系统后端服务正常运行' });
});