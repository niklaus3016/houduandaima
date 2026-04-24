const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const UserGold = require('../models/UserGold');
const Employee = require('../models/Employee');
const Admin = require('../models/Admin');
const Verification = require('../models/Verification');
const TeamGroup = require('../models/TeamGroup');
const GoldLog = require('../models/GoldLog');
const { generateToken, comparePassword } = require('../utils/auth');
const authMiddleware = require('../middleware/auth');
const { uploadFile } = require('../services/storage');
const { get, set, clear } = require('../utils/cache');

// 配置文件上传（临时存储）
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../temp');
    const fs = require('fs');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png|pdf/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('文件类型不支持，仅支持 jpg, jpeg, png, pdf'));
  }
});

// 财务权限中间件
const financeMiddleware = (req, res, next) => {
  if (req.user.role !== 'finance' && req.user.role !== 'superadmin') {
    return res.status(403).json({ success: false, message: '没有财务权限' });
  }
  next();
};

// 1. 认证相关接口

// 用户登录
router.post('/auth/login', async (req, res) => {
  try {
    const { employeeId, password } = req.body;
    
    // 检查数据库连接状态
    if (mongoose.connection.readyState !== 1) {
      console.error('数据库未连接，连接状态:', mongoose.connection.readyState);
      return res.status(503).json({ success: false, message: '服务暂时不可用，请稍后重试' });
    }
    
    // 先检查是否为员工
    let user = await Employee.findOne({ employeeId });
    let userType = 'employee';
    
    // 如果不是员工，检查是否为超管
    if (!user) {
      user = await Admin.findOne({ username: employeeId });
      userType = 'admin';
      
      if (!user) {
        return res.status(401).json({ success: false, message: '账号或密码错误' });
      }
      
      // 验证超管密码
      const isPasswordValid = comparePassword(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ success: false, message: '账号或密码错误' });
      }
    }
    
    // 生成token
    const token = generateToken({
      id: user._id,
      username: userType === 'employee' ? user.employeeId : user.username,
      role: userType === 'employee' ? user.role : user.role
    });
    
    res.json({
      success: true,
      token,
      user: {
        userId: user._id.toString(),
        employeeId: userType === 'employee' ? user.employeeId : user.username,
        name: userType === 'employee' ? user.realName || '' : user.username
      }
    });
  } catch (error) {
    console.error('登录错误:', error);
    
    // 检查是否是数据库连接错误
    if (error.name === 'MongoNetworkError' || error.message.includes('connection') || error.message.includes('timed out')) {
      return res.status(503).json({ success: false, message: '服务暂时不可用，请稍后重试' });
    }
    
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 验证token
router.get('/auth/verify', authMiddleware, (req, res) => {
  res.json({
    success: true,
    user: {
      userId: req.user.id,
      employeeId: req.user.username,
      name: req.user.username
    }
  });
});

// 2. 金币管理接口

// 获取用户金币信息
router.get('/user/gold', authMiddleware, async (req, res) => {
  try {
    const userGold = await UserGold.findOne({ employeeId: req.user.username });
    if (!userGold) {
      return res.json({
        success: true,
        data: {
          currentMonthGold: 0,
          lastMonthGold: 0,
          totalGold: 0
        }
      });
    }
    
    const totalGold = userGold.currentMonthGold + userGold.lastMonthGold;
    
    res.json({
      success: true,
      data: {
        currentMonthGold: userGold.currentMonthGold,
        lastMonthGold: userGold.lastMonthGold,
        totalGold
      }
    });
  } catch (error) {
    console.error('获取金币信息错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 更新用户金币
router.post('/user/gold/update', authMiddleware, async (req, res) => {
  try {
    const { currentMonthGold, lastMonthGold } = req.body;
    
    const userGold = await UserGold.findOneAndUpdate(
      { employeeId: req.user.username },
      { currentMonthGold, lastMonthGold },
      { upsert: true, new: true }
    );
    
    res.json({ success: true, message: '金币更新成功' });
  } catch (error) {
    console.error('更新金币错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 3. 核销申请接口

// 提交核销申请
router.post('/verification/submit', authMiddleware, upload.single('invoiceFile'), async (req, res) => {
  // 确保返回JSON响应
  res.setHeader('Content-Type', 'application/json');
  
  try {
    console.log('开始处理核销申请提交');
    console.log('请求参数:', req.body);
    console.log('文件信息:', req.file);
    
    const { amount, alipayName, alipayAccount } = req.body;
    const invoiceFile = req.file;
    
    // 验证金额
    if (!amount || amount <= 0 || amount > 1500) {
      console.log('金额验证失败:', amount);
      return res.status(400).json({ success: false, message: '金额必须大于0且不超过1500元' });
    }
    
    // 验证文件
    if (!invoiceFile) {
      console.log('文件验证失败: 未上传文件');
      return res.status(400).json({ success: false, message: '请上传发票文件' });
    }
    
    // 检查用户金币
    console.log('检查用户金币信息:', req.user.username);
    const userGold = await UserGold.findOne({ employeeId: req.user.username });
    if (!userGold) {
      console.log('用户金币信息不存在:', req.user.username);
      return res.status(400).json({ success: false, message: '用户金币信息不存在' });
    }
    
    const requiredGold = parseFloat(amount) * 1000;
    const availableGold = userGold.currentMonthGold + userGold.lastMonthGold;
    
    console.log('金币检查:', { requiredGold, availableGold });
    if (availableGold < requiredGold) {
      console.log('金币不足:', { requiredGold, availableGold });
      return res.status(400).json({ success: false, message: '金币不足' });
    }
    
    // 上传文件（会自动处理对象存储失败的情况，回退到本地存储）
    const objectName = `invoices/${invoiceFile.filename}`;
    console.log('开始上传文件:', invoiceFile.path);
    console.log('目标对象:', objectName);
    
    let fileUrl;
    try {
      fileUrl = await uploadFile(invoiceFile.path, objectName);
      console.log('文件上传成功，URL:', fileUrl);
    } catch (uploadError) {
      console.error('文件上传失败:', uploadError);
      // 即使文件上传失败，也继续执行，使用默认路径
      const randomFileName = 'invoiceFile-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + '.file';
      fileUrl = `/uploads/invoices/${randomFileName}`;
      console.log('使用默认文件路径:', fileUrl);
    }
    
    // 创建核销申请
    console.log('用户信息:', req.user);
    console.log('用户ID类型:', typeof req.user.id);
    
    let verification;
    try {
      verification = new Verification({
        userId: req.user.id.toString(), // 确保userId是字符串类型
        employeeId: req.user.username,
        amount: parseFloat(amount), // 确保amount是数字类型
        invoiceFile: fileUrl,
        alipayName: alipayName || '',
        alipayAccount: alipayAccount || '',
        status: 'pending'
      });
      
      console.log('保存核销申请到数据库');
      await verification.save();
      console.log('核销申请保存成功，ID:', verification._id.toString());
    } catch (dbError) {
      console.error('数据库操作失败:', dbError);
      // 清理临时文件
      if (req.file) {
        try {
          const fs = require('fs');
          if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
        } catch (unlinkError) {
          console.error('删除临时文件错误:', unlinkError.message);
        }
      }
      return res.status(500).json({ 
        success: false, 
        message: '数据库操作失败',
        error: dbError.message 
      });
    }
    
    // 删除临时文件
    try {
      const fs = require('fs');
      if (fs.existsSync(invoiceFile.path)) {
        console.log('删除临时文件:', invoiceFile.path);
        fs.unlinkSync(invoiceFile.path);
        console.log('临时文件删除成功');
      } else {
        console.log('临时文件不存在，跳过删除');
      }
    } catch (unlinkError) {
      console.error('删除临时文件错误:', unlinkError.message);
      // 即使删除临时文件失败，也继续执行
    }
    
    console.log('返回成功响应');
    res.json({
      success: true,
      message: '核销申请提交成功',
      verificationId: verification._id.toString()
    });
  } catch (error) {
    console.error('提交核销申请错误:', error);
    console.error('错误详情:', error.message);
    console.error('错误堆栈:', error.stack);
    
    // 清理临时文件
    if (req.file) {
      try {
        const fs = require('fs');
        if (fs.existsSync(req.file.path)) {
          console.log('删除临时文件:', req.file.path);
          fs.unlinkSync(req.file.path);
          console.log('临时文件删除成功');
        } else {
          console.log('临时文件不存在，跳过删除');
        }
      } catch (unlinkError) {
        console.error('删除临时文件错误:', unlinkError.message);
      }
    }
    
    // 确保返回JSON响应
    try {
      res.status(500).json({ 
        success: false, 
        message: '服务器错误',
        error: error.message // 添加错误信息，便于前端诊断
      });
    } catch (responseError) {
      console.error('返回响应错误:', responseError);
      // 即使返回响应失败，也确保连接被关闭
      res.end();
    }
  }
});

// 获取核销记录
router.get('/verification/records', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    
    const query = { employeeId: req.user.username };
    if (status) {
      query.status = status;
    }
    
    const records = await Verification.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });
    
    const total = await Verification.countDocuments(query);
    
    res.json({
      success: true,
      data: {
        records: records.map(record => ({
          id: record._id.toString(),
          amount: record.amount,
          status: record.status,
          date: record.createdAt,
          alipayName: record.alipayName,
          alipayAccount: record.alipayAccount,
          invoiceUrl: record.invoiceFile,
          rejectReason: record.remark
        })),
        total
      }
    });
  } catch (error) {
    console.error('获取核销记录错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取核销详情
router.get('/verification/records/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const verification = await Verification.findOne({ _id: id, employeeId: req.user.username });
    if (!verification) {
      return res.status(404).json({ success: false, message: '核销记录不存在' });
    }
    
    res.json({
      success: true,
      data: {
        id: verification._id.toString(),
        amount: verification.amount,
        status: verification.status,
        date: verification.createdAt,
        alipayName: verification.alipayName,
        alipayAccount: verification.alipayAccount,
        invoiceUrl: verification.invoiceFile,
        rejectReason: verification.remark
      }
    });
  } catch (error) {
    console.error('获取核销详情错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 4. 财务处理接口

// 获取待处理核销申请
router.get('/verification/admin/pending', authMiddleware, financeMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const records = await Verification.find({ status: 'pending' })
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });
    
    const total = await Verification.countDocuments({ status: 'pending' });
    
    res.json({
      success: true,
      data: {
        records: records.map(record => ({
          id: record._id.toString(),
          employeeId: record.employeeId,
          amount: record.amount,
          status: record.status,
          date: record.createdAt,
          alipayName: record.alipayName,
          alipayAccount: record.alipayAccount,
          invoiceUrl: record.invoiceFile,
          rejectReason: record.remark
        })),
        total
      }
    });
  } catch (error) {
    console.error('获取待处理核销申请错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 更新核销状态
router.put('/verification/admin/:id/status', authMiddleware, financeMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remark } = req.body;
    
    // 验证状态
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: '无效的状态' });
    }
    
    const verification = await Verification.findById(id);
    if (!verification) {
      return res.status(404).json({ success: false, message: '核销记录不存在' });
    }
    
    // 如果审核通过，扣除用户金币
    if (status === 'approved') {
      const userGold = await UserGold.findOne({ employeeId: verification.employeeId });
      if (userGold) {
        const requiredGold = verification.amount * 1000;
        const availableGold = userGold.currentMonthGold + userGold.lastMonthGold;
        
        if (availableGold >= requiredGold) {
          // 优先扣除上月金币
          if (userGold.lastMonthGold >= requiredGold) {
            userGold.lastMonthGold -= requiredGold;
          } else {
            const remaining = requiredGold - userGold.lastMonthGold;
            userGold.lastMonthGold = 0;
            userGold.currentMonthGold -= remaining;
          }
          await userGold.save();
        }
      }
    }
    
    // 更新核销状态
    verification.status = status;
    verification.remark = remark;
    await verification.save();
    
    res.json({ success: true, message: '状态更新成功' });
  } catch (error) {
    console.error('更新核销状态错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取已处理核销记录
router.get('/verification/admin/list', authMiddleware, financeMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    
    const query = {};
    if (status) {
      query.status = status;
    } else {
      query.status = { $in: ['approved', 'rejected'] };
    }
    
    const records = await Verification.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });
    
    const total = await Verification.countDocuments(query);
    
    res.json({
      success: true,
      data: {
        records: records.map(record => ({
          id: record._id.toString(),
          employeeId: record.employeeId,
          amount: record.amount,
          status: record.status,
          date: record.createdAt,
          alipayName: record.alipayName,
          alipayAccount: record.alipayAccount,
          invoiceUrl: record.invoiceFile,
          rejectReason: record.remark
        })),
        total
      }
    });
  } catch (error) {
    console.error('获取已处理核销记录错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取核销统计
router.get('/verification/admin/stats', authMiddleware, financeMiddleware, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const query = {};
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }
    
    const records = await Verification.find(query);
    
    const totalAmount = records.reduce((sum, record) => sum + record.amount, 0);
    const pendingCount = records.filter(record => record.status === 'pending').length;
    const approvedCount = records.filter(record => record.status === 'approved').length;
    const rejectedCount = records.filter(record => record.status === 'rejected').length;
    
    const pendingAmount = records
      .filter(record => record.status === 'pending')
      .reduce((sum, record) => sum + record.amount, 0);
    
    const approvedAmount = records
      .filter(record => record.status === 'approved')
      .reduce((sum, record) => sum + record.amount, 0);
    
    const rejectedAmount = records
      .filter(record => record.status === 'rejected')
      .reduce((sum, record) => sum + record.amount, 0);
    
    res.json({
      success: true,
      data: {
        totalAmount,
        pendingCount,
        approvedCount,
        rejectedCount,
        pendingAmount,
        approvedAmount,
        rejectedAmount
      }
    });
  } catch (error) {
    console.error('获取核销统计错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取北京时间（UTC+8）
function getBeijingDate(date = new Date()) {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000);
}

// 获取时间范围
function getTimeRange(range) {
  const now = new Date();
  const beijingNow = getBeijingDate(now);
  let startTime, endTime;

  if (range === 'today') {
    // 今天（北京时间）
    startTime = new Date(beijingNow);
    startTime.setUTCHours(0, 0, 0, 0);
    startTime = new Date(startTime.getTime() - 8 * 60 * 60 * 1000);
    endTime = new Date(startTime);
    endTime.setUTCDate(endTime.getUTCDate() + 1);
  } else if (range === 'yesterday') {
    // 昨天（北京时间）
    startTime = new Date(beijingNow);
    startTime.setUTCDate(startTime.getUTCDate() - 1);
    startTime.setUTCHours(0, 0, 0, 0);
    startTime = new Date(startTime.getTime() - 8 * 60 * 60 * 1000);
    endTime = new Date(startTime);
    endTime.setUTCDate(endTime.getUTCDate() + 1);
  } else if (range === 'week') {
    // 本周一（北京时间）
    const dayOfWeek = beijingNow.getUTCDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    startTime = new Date(beijingNow);
    startTime.setUTCDate(startTime.getUTCDate() + mondayOffset);
    startTime.setUTCHours(0, 0, 0, 0);
    startTime = new Date(startTime.getTime() - 8 * 60 * 60 * 1000);
    endTime = now;
  } else if (range === 'month') {
    // 本月1日（北京时间）
    startTime = new Date(beijingNow);
    startTime.setUTCDate(1);
    startTime.setUTCHours(0, 0, 0, 0);
    startTime = new Date(startTime.getTime() - 8 * 60 * 60 * 1000);
    endTime = now;
  } else {
    // 默认今天
    startTime = new Date(beijingNow);
    startTime.setUTCHours(0, 0, 0, 0);
    startTime = new Date(startTime.getTime() - 8 * 60 * 60 * 1000);
    endTime = new Date(startTime);
    endTime.setUTCDate(endTime.getUTCDate() + 1);
  }

  return { startTime, endTime };
}

// 获取多个时间范围的函数
function getMultipleTimeRanges() {
  const now = new Date();
  const beijingNow = getBeijingDate(now);
  
  // 今日
  const todayStart = new Date(beijingNow);
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayStartTime = new Date(todayStart.getTime() - 8 * 60 * 60 * 1000);
  const todayEndTime = new Date(todayStartTime);
  todayEndTime.setUTCDate(todayEndTime.getUTCDate() + 1);
  
  // 本月
  const monthStart = new Date(beijingNow);
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthStartTime = new Date(monthStart.getTime() - 8 * 60 * 60 * 1000);
  const monthEndTime = now;
  
  // 上月
  const lastMonthStart = new Date(beijingNow);
  lastMonthStart.setUTCMonth(lastMonthStart.getUTCMonth() - 1);
  lastMonthStart.setUTCDate(1);
  lastMonthStart.setUTCHours(0, 0, 0, 0);
  const lastMonthStartTime = new Date(lastMonthStart.getTime() - 8 * 60 * 60 * 1000);
  
  const lastMonthEnd = new Date(beijingNow);
  lastMonthEnd.setUTCDate(1);
  lastMonthEnd.setUTCHours(0, 0, 0, 0);
  const lastMonthEndTime = new Date(lastMonthEnd.getTime() - 8 * 60 * 60 * 1000);
  
  // 累计（从最早的数据开始）
  const allStartTime = new Date(0);
  const allEndTime = now;
  
  return {
    today: { startTime: todayStartTime, endTime: todayEndTime },
    month: { startTime: monthStartTime, endTime: monthEndTime },
    lastMonth: { startTime: lastMonthStartTime, endTime: lastMonthEndTime },
    all: { startTime: allStartTime, endTime: allEndTime }
  };
}

// 计算指定时间范围内的提成收益
async function calculateCommissionStats(employees, employeeIds, employeeMap, group, startTime, endTime) {
  // 生成缓存键
  const cacheKey = `commission-stats-${JSON.stringify(employeeIds)}-${startTime.getTime()}-${endTime.getTime()}`;
  
  // 尝试从缓存获取
  const cachedStats = get(cacheKey);
  if (cachedStats) {
    return cachedStats;
  }

  const goldLogs = await GoldLog.find({
    employeeId: { $in: employeeIds },
    createTime: { $gte: startTime, $lt: endTime }
  });

  const stats = calculateStatsFromLogs(goldLogs, employeeMap, group, startTime, endTime);
  
  // 缓存结果，10分钟过期
  set(cacheKey, stats, 10 * 60 * 1000);
  
  return stats;
}

// 从预获取的日志中计算统计数据
function calculateStatsFromLogs(goldLogs, employeeMap, group, startTime, endTime) {
  let totalEarnings = 0;
  let totalCommission = 0;
  let totalGold = 0;

  for (const log of goldLogs) {
    // 过滤时间范围
    if (log.createTime >= startTime && log.createTime < endTime) {
      const employee = employeeMap.get(log.employeeId);
      if (employee) {
        const joinedGroupAt = employee.joinedGroupAt || log.createTime;
        if (log.createTime >= joinedGroupAt) {
          const earnings = log.earnings || (log.gold / 1000); // 使用聚合查询的结果或回退计算
          const commissionRate = log.commissionRate || group.commission;
          const commissionAmount = earnings * commissionRate;
          
          totalEarnings += earnings;
          totalCommission += commissionAmount;
          totalGold += log.gold;
        }
      }
    }
  }

  return {
    totalEarnings,
    totalCommission,
    totalGold
  };
}

// 组长专用接口：获取组提成收益（今日、本月、上月、累计）
router.get('/group-leader/commission-stats', authMiddleware, async (req, res) => {
  try {
    // 生成缓存键
    const cacheKey = `group-leader-commission-stats-${req.user.id}`;
    
    // 尝试从缓存获取
    const cachedData = get(cacheKey);
    if (cachedData) {
      // 创建缓存数据的深拷贝
      const responseData = JSON.parse(JSON.stringify(cachedData));
      // 更新时间范围为当前时间
      const timeRanges = getMultipleTimeRanges();
      responseData.data.today.timeRange = {
        startTime: timeRanges.today.startTime.toISOString(),
        endTime: timeRanges.today.endTime.toISOString()
      };
      responseData.data.month.timeRange = {
        startTime: timeRanges.month.startTime.toISOString(),
        endTime: timeRanges.month.endTime.toISOString()
      };
      responseData.data.lastMonth.timeRange = {
        startTime: timeRanges.lastMonth.startTime.toISOString(),
        endTime: timeRanges.lastMonth.endTime.toISOString()
      };
      responseData.data.all.timeRange = {
        startTime: timeRanges.all.startTime.toISOString(),
        endTime: timeRanges.all.endTime.toISOString()
      };
      console.log('✅ Using cached data for commission-stats');
      return res.json(responseData);
    }
    console.log('❌ No cached data found for commission-stats');

    // 获取当前登录用户
    const currentAdmin = await Admin.findById(req.user.id);
    if (!currentAdmin) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }

    // 检查是否为组长
    if (!currentAdmin.teamGroupId) {
      return res.status(403).json({ success: false, message: '您不是组长，没有权限访问此接口' });
    }

    // 获取组信息
    const group = await TeamGroup.findById(currentAdmin.teamGroupId);
    if (!group) {
      return res.status(404).json({ success: false, message: '组不存在' });
    }

    // 获取该组的所有员工（使用多种条件筛选）
    let employees;
    const fanjieUserId = currentAdmin._id.toString();
    const fanjieTeamGroupId = currentAdmin.teamGroupId;
    
    employees = await Employee.find({
      $or: [
        { teamGroupId: fanjieTeamGroupId.toString() },
        { teamGroupId: fanjieTeamGroupId },
        { teamGroupId: fanjieUserId }, // 处理直接存储用户ID的情况
        { teamGroupId: currentAdmin._id } // 处理ObjectId的情况
      ]
    });
    const employeeIds = employees.map(e => e.employeeId);
    const memberCount = employees.length;

    // 创建员工ID到员工信息的映射
    const employeeMap = new Map();
    employees.forEach(employee => {
      employeeMap.set(employee.employeeId, employee);
    });

    // 获取多个时间范围
    const timeRanges = getMultipleTimeRanges();

    // 使用聚合查询在数据库端完成所有时间范围的统计计算
    const pipeline = [
      {
        $match: {
          employeeId: { $in: employeeIds },
          createTime: { $gte: timeRanges.lastMonth.startTime, $lt: timeRanges.all.endTime }
        }
      },
      {
        $project: {
          employeeId: 1,
          gold: 1,
          createTime: 1,
          commissionRate: 1,
          earnings: { $divide: ["$gold", 1000] },
          // 标记各个时间范围
          isToday: {
            $and: [
              { $gte: ["$createTime", timeRanges.today.startTime] },
              { $lt: ["$createTime", timeRanges.today.endTime] }
            ]
          },
          isMonth: {
            $and: [
              { $gte: ["$createTime", timeRanges.month.startTime] },
              { $lt: ["$createTime", timeRanges.month.endTime] }
            ]
          },
          isLastMonth: {
            $and: [
              { $gte: ["$createTime", timeRanges.lastMonth.startTime] },
              { $lt: ["$createTime", timeRanges.lastMonth.endTime] }
            ]
          },
          isAll: true // 所有记录都属于累计范围
        }
      },
      {
        $group: {
          _id: null,
          // 今日统计
          today: {
            $push: {
              $cond: ["$isToday", "$$ROOT", "$$REMOVE"]
            }
          },
          // 本月统计
          month: {
            $push: {
              $cond: ["$isMonth", "$$ROOT", "$$REMOVE"]
            }
          },
          // 上月统计
          lastMonth: {
            $push: {
              $cond: ["$isLastMonth", "$$ROOT", "$$REMOVE"]
            }
          },
          // 累计统计
          all: {
            $push: "$$ROOT"
          }
        }
      },
      {
        $project: {
          _id: 0,
          // 计算今日统计数据
          todayStats: {
            totalEarnings: { $sum: "$today.earnings" },
            totalCommission: {
              $sum: {
                $map: {
                  input: "$today",
                  as: "item",
                  in: { $multiply: ["$$item.earnings", { $literal: group.commission }] }
                }
              }
            },
            totalGold: { $sum: "$today.gold" }
          },
          // 计算本月统计数据
          monthStats: {
            totalEarnings: { $sum: "$month.earnings" },
            totalCommission: {
              $sum: {
                $map: {
                  input: "$month",
                  as: "item",
                  in: { $multiply: ["$$item.earnings", { $literal: group.commission }] }
                }
              }
            },
            totalGold: { $sum: "$month.gold" }
          },
          // 计算上月统计数据
          lastMonthStats: {
            totalEarnings: { $sum: "$lastMonth.earnings" },
            totalCommission: {
              $sum: {
                $map: {
                  input: "$lastMonth",
                  as: "item",
                  in: { $multiply: ["$$item.earnings", { $literal: group.commission }] }
                }
              }
            },
            totalGold: { $sum: "$lastMonth.gold" }
          },
          // 计算累计统计数据
          allStats: {
            totalEarnings: { $sum: "$all.earnings" },
            totalCommission: {
              $sum: {
                $map: {
                  input: "$all",
                  as: "item",
                  in: { $multiply: ["$$item.earnings", { $literal: group.commission }] }
                }
              }
            },
            totalGold: { $sum: "$all.gold" }
          }
        }
      }
    ];

    const [aggregationResult] = await GoldLog.aggregate(pipeline).exec();

    // 提取统计结果，处理空数据情况
    const todayStats = aggregationResult?.todayStats || { totalEarnings: 0, totalCommission: 0, totalGold: 0 };
    const monthStats = aggregationResult?.monthStats || { totalEarnings: 0, totalCommission: 0, totalGold: 0 };
    const lastMonthStats = aggregationResult?.lastMonthStats || { totalEarnings: 0, totalCommission: 0, totalGold: 0 };
    const allStats = aggregationResult?.allStats || { totalEarnings: 0, totalCommission: 0, totalGold: 0 };

    const responseData = {
      success: true,
      data: {
        groupName: group.groupName,
        groupLeaderName: group.groupLeaderName || currentAdmin.realName || currentAdmin.username,
        commissionRate: group.commission,
        memberCount: memberCount,
        today: {
          totalEarnings: todayStats.totalEarnings,
          totalCommission: todayStats.totalCommission,
          totalGold: todayStats.totalGold,
          timeRange: {
            startTime: timeRanges.today.startTime.toISOString(),
            endTime: timeRanges.today.endTime.toISOString()
          }
        },
        month: {
          totalEarnings: monthStats.totalEarnings,
          totalCommission: monthStats.totalCommission,
          totalGold: monthStats.totalGold,
          timeRange: {
            startTime: timeRanges.month.startTime.toISOString(),
            endTime: timeRanges.month.endTime.toISOString()
          }
        },
        lastMonth: {
          totalEarnings: lastMonthStats.totalEarnings,
          totalCommission: lastMonthStats.totalCommission,
          totalGold: lastMonthStats.totalGold,
          timeRange: {
            startTime: timeRanges.lastMonth.startTime.toISOString(),
            endTime: timeRanges.lastMonth.endTime.toISOString()
          }
        },
        all: {
          totalEarnings: allStats.totalEarnings,
          totalCommission: allStats.totalCommission,
          totalGold: allStats.totalGold,
          timeRange: {
            startTime: timeRanges.all.startTime.toISOString(),
            endTime: timeRanges.all.endTime.toISOString()
          }
        }
      }
    };
    
    // 缓存结果，15分钟过期
    set(cacheKey, responseData, 15 * 60 * 1000);
    console.log('✅ Data cached successfully for commission-stats');

    res.json(responseData);
  } catch (error) {
    console.error('获取组长提成统计错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 组长专用接口：获取组提成和平均金币
router.get('/group-leader/stats', authMiddleware, async (req, res) => {
  try {
    const { range = 'today' } = req.query;

    // 生成缓存键
    const cacheKey = `group-leader-stats-${req.user.id}-${range}`;
    
    // 尝试从缓存获取
    const cachedData = get(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    // 获取当前登录用户
    const currentAdmin = await Admin.findById(req.user.id);
    if (!currentAdmin) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }

    // 检查是否为组长
    if (!currentAdmin.teamGroupId) {
      return res.status(403).json({ success: false, message: '您不是组长，没有权限访问此接口' });
    }

    // 获取组信息
    const group = await TeamGroup.findById(currentAdmin.teamGroupId);
    if (!group) {
      return res.status(404).json({ success: false, message: '组不存在' });
    }

    // 获取时间范围
    const { startTime, endTime } = getTimeRange(range);

    // 获取该组的所有员工（使用多种条件筛选）
    let employees;
    const fanjieUserId = currentAdmin._id.toString();
    const fanjieTeamGroupId = currentAdmin.teamGroupId;
    
    employees = await Employee.find({
      $or: [
        { teamGroupId: fanjieTeamGroupId.toString() },
        { teamGroupId: fanjieTeamGroupId },
        { teamGroupId: fanjieUserId }, // 处理直接存储用户ID的情况
        { teamGroupId: currentAdmin._id } // 处理ObjectId的情况
      ]
    });
    const employeeIds = employees.map(e => e.employeeId);
    const memberCount = employees.length;

    // 获取指定时间范围内的金币记录
    const goldLogs = await GoldLog.find({
      employeeId: { $in: employeeIds },
      createTime: { $gte: startTime, $lt: endTime }
    });

    // 创建员工ID到员工信息的映射
    const employeeMap = new Map();
    employees.forEach(employee => {
      employeeMap.set(employee.employeeId, employee);
    });

    // 计算总收益、总提成和总金币
    let totalEarnings = 0;
    let totalCommission = 0;
    let totalGold = 0;
    let totalAdExposure = 0; // 总广告曝光量

    // 使用组的统一提成比率
    const commissionRate = group.commission;

    for (const log of goldLogs) {
      const employee = employeeMap.get(log.employeeId);
      if (employee) {
        // 不考虑入组时间，直接计算所有符合时间范围的金币记录
        const earnings = log.gold / 1000;
        const commissionAmount = earnings * commissionRate;
        
        totalEarnings += earnings;
        totalCommission += commissionAmount;
        totalGold += log.gold;
        totalAdExposure += 1; // 每个GoldLog记录代表一次广告曝光
      }
    }

    // 获取昨日数据用于计算增长率
    const { startTime: yesterdayStart, endTime: yesterdayEnd } = getTimeRange('yesterday');
    const yesterdayGoldLogs = await GoldLog.find({
      employeeId: { $in: employeeIds },
      createTime: { $gte: yesterdayStart, $lt: yesterdayEnd }
    });

    let yesterdayEarnings = 0;
    let yesterdayCommission = 0;
    let yesterdayAdExposure = 0;

    for (const log of yesterdayGoldLogs) {
      const employee = employeeMap.get(log.employeeId);
      if (employee) {
        // 不考虑入组时间，直接计算所有符合时间范围的金币记录
        const earnings = log.gold / 1000;
        const commissionAmount = earnings * commissionRate;
        
        yesterdayEarnings += earnings;
        yesterdayCommission += commissionAmount;
        yesterdayAdExposure += 1; // 每个GoldLog记录代表一次广告曝光
      }
    }

    // 计算增长率
    const calculateGrowthRate = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    const earningsGrowthRate = calculateGrowthRate(totalEarnings, yesterdayEarnings);
    const commissionGrowthRate = calculateGrowthRate(totalCommission, yesterdayCommission);
    const adExposureGrowthRate = calculateGrowthRate(totalAdExposure, yesterdayAdExposure);

    const responseData = {
      success: true,
      data: {
        groupName: group.groupName,
        groupLeaderName: group.groupLeaderName || currentAdmin.realName || currentAdmin.username,
        memberCount: memberCount,
        totalAdExposure: totalAdExposure,
        totalGold: totalGold,
        totalEarnings: totalEarnings,
        totalCommission: totalCommission,
        earningsGrowthRate: earningsGrowthRate,
        commissionGrowthRate: commissionGrowthRate,
        adExposureGrowthRate: adExposureGrowthRate
      }
    };
    
    // 缓存结果，15分钟过期
    set(cacheKey, responseData, 15 * 60 * 1000);

    res.json(responseData);
  } catch (error) {
    console.error('获取组长统计错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
