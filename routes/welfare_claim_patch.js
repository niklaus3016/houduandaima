const { userId, employeeId: bodyEmployeeId } = req.body;
    const employeeId = bodyEmployeeId || req.user.username;
    
    if (!employeeId) {
      return res.status(400).json({ success: false, message: '员工号不能为空' });
    }
    
    // 兼容逻辑：优先按userId+employeeId查询，查不到则按employeeId查询
    let wallet = await WelfareWallet.findOne({ userId, employeeId });
    if (!wallet) {
      wallet = await WelfareWallet.findOne({ employeeId });
    }