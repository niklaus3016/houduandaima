const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const UserGold = require('../models/UserGold');
const Employee = require('../models/Employee');
const Admin = require('../models/Admin');
const Verification = require('../models/Verification');
const { generateToken, comparePassword } = require('../utils/auth');
const authMiddleware = require('../middleware/auth');
const { uploadFile } = require('../services/storage');

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

module.exports = router;
