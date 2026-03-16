const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const employeeRoutes = require('./routes/employee');
const userRoutes = require('./routes/user');
const goldRoutes = require('./routes/gold');
const adminRoutes = require('./routes/admin');
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

const app = express();
const PORT = process.env.PORT || 3003;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

// 中间件
app.use(cors());
app.use(express.json());

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

// 连接MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('MongoDB连接成功');
    app.listen(PORT, () => {
      console.log(`服务器运行在端口 ${PORT}`);
    });
  })
  .catch(err => {
    console.error('MongoDB连接失败:', err);
  });

// 健康检查
app.get('/', (req, res) => {
  res.json({ message: '广告变现系统后端服务正常运行' });
});
