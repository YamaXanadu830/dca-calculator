// cTrader DCA cBot 参数优化计算工具

/**
 * 计算DCA cBot回撤分析和仓位构建
 * @param {Object} params - cBot参数
 * @param {number} params.pipStep - DCA间距(点数)
 * @param {number} params.firstVolume - 首次仓位手数
 * @param {number} params.volumeExponent - 仓位倍数指数
 * @param {number} params.maxPositions - 最大仓位数
 * @param {number} params.maxDrawdownPips - 预期最大回撤点数
 * @param {number} params.pipValue - 每点价值(美元)
 * @returns {Object} 计算结果
 */
function calculateDCABot(params) {
    const {
        pipStep,
        firstVolume,
        volumeExponent,
        maxPositions,
        maxDrawdownPips,
        pipValue = 1.0 // 默认每点1美元
    } = params;

    // 使用固定参考价格进行相对计算
    const referencePrice = 1.00000;

    // 参数验证
    if (!pipStep || !firstVolume || maxPositions <= 0) {
        throw new Error('参数不完整或无效');
    }

    // 计算每层仓位的详细信息
    const positions = [];
    let totalVolume = 0;
    let totalInvestment = 0;
    
    // 构建仓位层级
    for (let level = 0; level < maxPositions; level++) {
        const entryPrice = referencePrice - (level * pipStep * 0.0001); // 相对价格计算
        const positionVolume = firstVolume * Math.pow(volumeExponent, level);
        const investment = positionVolume * referencePrice; // 使用参考价格计算投资额
        
        totalVolume += positionVolume;
        totalInvestment += investment;
        
        positions.push({
            level: level + 1,
            entryPrice,
            volume: positionVolume,
            investment,
            pipDistance: level * pipStep,
            cumulativeVolume: totalVolume,
            cumulativeInvestment: totalInvestment
        });
    }
    
    // 计算加权平均成本价
    const avgCostPrice = positions.reduce((sum, pos) => sum + (pos.entryPrice * pos.volume), 0) / totalVolume;
    
    // 生成回撤分析数据
    const drawdownAnalysis = generateDrawdownAnalysis({
        positions,
        referencePrice,
        maxDrawdownPips,
        pipValue,
        avgCostPrice
    });
    
    return {
        positions,
        totalVolume,
        totalInvestment,
        avgCostPrice,
        drawdownAnalysis,
        riskMetrics: calculateRiskMetrics({
            positions,
            referencePrice,
            maxDrawdownPips,
            pipValue,
            totalVolume,
            avgCostPrice
        })
    };
}

/**
 * 生成回撤分析数据
 * @param {Object} params - 分析参数
 * @returns {Array} 回撤分析数据点
 */
function generateDrawdownAnalysis(params) {
    const { positions, referencePrice, maxDrawdownPips, pipValue, avgCostPrice } = params;
    
    // 生成价格点(从参考价格到最大回撤)
    const priceStep = 0.0001; // 1点的价格变化
    const endPrice = referencePrice - (maxDrawdownPips * priceStep);
    
    // 辅助函数：计算指定价格的分析数据
    function calculateAnalysisData(currentPrice, pointType = 'hardcoded') {
        const pipsFromStart = (referencePrice - currentPrice) / priceStep;
        
        // 计算当前价格下的浮动盈亏
        let floatingPnL = 0;
        let activePositions = 0;
        let totalActiveVolume = 0;
        let cumulativeInvestment = 0;
        let avgCostPrice = 0;
        
        positions.forEach(pos => {
            if (currentPrice <= pos.entryPrice) {
                // 仓位已触发
                activePositions++;
                totalActiveVolume += pos.volume;
                cumulativeInvestment += pos.investment;
                // 修复：正确计算浮动盈亏 - 价格差转换为点数后再计算
                const priceDiffInPips = (currentPrice - pos.entryPrice) / 0.0001;
                const positionPnL = priceDiffInPips * pos.volume * pipValue;
                floatingPnL += positionPnL;
            }
        });
        
        // 计算平均成本价
        if (totalActiveVolume > 0) {
            const activePositionsList = positions.slice(0, activePositions);
            avgCostPrice = activePositionsList.reduce((sum, pos) => sum + (pos.entryPrice * pos.volume), 0) / totalActiveVolume;
        }
        
        // 计算距离盈亏平衡的点数
        const breakEvenPipsNeeded = avgCostPrice > 0 ? Math.abs((avgCostPrice - currentPrice) / 0.0001) : 0;
        
        // 计算下一个DCA触发价格
        const nextDcaTriggerPrice = activePositions < positions.length ? 
            positions[activePositions].entryPrice : null;
        
        // 计算保证金占用（30倍杠杆，标准手100,000）
        const marginRequired = totalActiveVolume * 100000 * referencePrice / 30;
        
        // 评估风险等级
        let riskLevel = '低风险';
        const lossAmount = Math.abs(floatingPnL);
        if (lossAmount > 10000) {
            riskLevel = '高风险';
        } else if (lossAmount > 5000) {
            riskLevel = '中风险';
        }
        
        // 计算回撤百分比
        const drawdownPercentage = cumulativeInvestment > 0 ? (lossAmount / cumulativeInvestment) * 100 : 0;
        
        return {
            price: currentPrice,
            pipsFromStart: Math.round(pipsFromStart),
            floatingPnL,
            activePositions,
            totalActiveVolume,
            avgPrice: avgCostPrice,
            // 新增的增强属性
            breakEvenPipsNeeded: Math.round(breakEvenPipsNeeded),
            cumulativeInvestment,
            avgCostPrice,
            nextDcaTriggerPrice,
            riskLevel,
            marginRequired,
            drawdownPercentage: Math.round(drawdownPercentage * 10) / 10, // 保留1位小数
            pointType: pointType // 添加点类型标记
        };
    }
    
    // 1. 生成硬编码分析点（保持原逻辑：每10点一个数据点）
    const hardcodedPoints = [];
    for (let currentPrice = referencePrice; currentPrice >= endPrice; currentPrice -= (priceStep * 10)) {
        hardcodedPoints.push(calculateAnalysisData(currentPrice, 'hardcoded'));
    }
    
    // 2. 生成DCA触发点（黄色小圈）
    const triggerPoints = [];
    positions.forEach(pos => {
        if (pos.entryPrice >= endPrice && pos.entryPrice <= referencePrice) {
            triggerPoints.push(calculateAnalysisData(pos.entryPrice, 'trigger'));
        }
    });
    
    // 3. 合并并处理重合（精度0.0001，硬编码点优先）
    const priceMap = new Map();
    
    // 先添加硬编码点
    hardcodedPoints.forEach(point => {
        const priceKey = Math.round(point.price / 0.0001);
        priceMap.set(priceKey, point);
    });
    
    // 再添加触发点，但跳过重合的点
    triggerPoints.forEach(point => {
        const priceKey = Math.round(point.price / 0.0001);
        if (!priceMap.has(priceKey)) {
            priceMap.set(priceKey, point);
        }
    });
    
    // 转换为数组并按价格降序排列
    return Array.from(priceMap.values()).sort((a, b) => b.price - a.price);
}

/**
 * 计算风险指标
 * @param {Object} params - 计算参数
 * @returns {Object} 风险指标
 */
function calculateRiskMetrics(params) {
    const { positions, referencePrice, maxDrawdownPips, pipValue, totalVolume, avgCostPrice } = params;
    
    // 计算最大可能亏损 - 修复：基于平均成本价和最大回撤的点数差计算
    const maxDrawdownPrice = referencePrice - (maxDrawdownPips * 0.0001);
    const priceDiffInPips = (avgCostPrice - maxDrawdownPrice) / 0.0001;
    const maxPossibleLoss = priceDiffInPips * totalVolume * pipValue;
    
    // 计算回本所需点数
    const breakEvenPips = Math.abs((referencePrice - avgCostPrice) / 0.0001);
    
    // 计算保证金占用(基于30倍杠杆，标准手合约大小100,000)
    const marginRequired = totalVolume * 100000 * referencePrice / 30;
    
    return {
        maxPossibleLoss,
        breakEvenPips,
        marginRequired,
        riskRewardRatio: breakEvenPips / maxDrawdownPips,
        positionSizeRisk: totalVolume / positions[0].volume // 相对于初始手数的倍数
    };
}

/**
 * 验证cBot参数
 * @param {Object} params - 输入参数
 * @returns {Object} 验证结果
 */
function validateDCABotParams(params) {
    const errors = [];
    
    if (!params.pipStep || params.pipStep <= 0) {
        errors.push('DCA间距必须大于0');
    }
    
    if (!params.firstVolume || params.firstVolume <= 0) {
        errors.push('首次仓位手数必须大于0');
    }
    
    if (params.volumeExponent < 0.1 || params.volumeExponent > 5) {
        errors.push('仓位倍数指数必须在0.1-5之间');
    }
    
    if (!params.maxPositions || params.maxPositions < 1 || params.maxPositions > 50) {
        errors.push('最大仓位数必须在1-50之间');
    }
    
    if (!params.maxDrawdownPips || params.maxDrawdownPips < 10 || params.maxDrawdownPips > 10000) {
        errors.push('最大回撤点数必须在10-10000之间');
    }
    
    if (params.pipValue <= 0) {
        errors.push('每点价值必须大于0');
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * 生成DCA cBot风险建议
 * @param {Object} result - 计算结果
 * @returns {string} 风险建议文本
 */
function generateDCABotAdvice(result) {
    const { riskMetrics, totalVolume, positions } = result;
    const { maxPossibleLoss, breakEvenPips, riskRewardRatio } = riskMetrics;
    
    const advice = [];
    
    // 风险水平评估
    if (maxPossibleLoss > 6000) {
        advice.push('⚠️ 高风险：最大可能亏损超过$6,000，建议降低仓位手数或减少最大仓位数');
    } else if (maxPossibleLoss > 3000) {
        advice.push('⚡ 中风险：最大可能亏损在$3,000-$6,000之间，请确保账户资金充足');
    } else {
        advice.push('✅ 低风险：最大可能亏损在可控范围内');
    }
    
    // 仓位构建评估
    const maxVolume = Math.max(...positions.map(p => p.volume));
    if (maxVolume > totalVolume * 0.333) {
        advice.push('📊 仓位分布不均：最大单笔仓位过大，建议降低倍数指数');
    }
    
    // 回本难度评估
    if (breakEvenPips > 100) {
        advice.push('🎯 回本困难：需要回升' + breakEvenPips.toFixed(0) + '点才能回本，考虑减少DCA间距');
    } else if (breakEvenPips >= 50) {
        advice.push('🎯 回本中等：需要回升' + breakEvenPips.toFixed(0) + '点才能回本');
    } else {
        advice.push('🎯 回本容易：只需回升' + breakEvenPips.toFixed(0) + '点即可回本');
    }
    
    // 风险回报比评估
    if (riskRewardRatio < 0.1) {
        advice.push('⚖️ 风险回报比过低，建议优化参数配置');
    }
    
    return advice.join('\n');
}

/**
 * 计算最优参数建议
 * @param {Object} currentParams - 当前参数
 * @returns {Object} 优化建议
 */
function getOptimizationSuggestions(currentParams) {
    const suggestions = [];
    
    // 基于当前参数给出优化建议
    if (currentParams.volumeExponent > 2) {
        suggestions.push({
            parameter: 'volumeExponent',
            current: currentParams.volumeExponent,
            suggested: 1.5,
            reason: '降低倍数指数可以减少后期仓位过大的风险'
        });
    }
    
    if (currentParams.pipStep < 10) {
        suggestions.push({
            parameter: 'pipStep',
            current: currentParams.pipStep,
            suggested: 15,
            reason: '增加DCA间距可以减少仓位触发频率'
        });
    }
    
    return suggestions;
}

/**
 * 格式化金额显示
 * @param {number} amount - 金额
 * @returns {string} 格式化后的金额字符串
 */
function formatCurrency(amount) {
    return new Intl.NumberFormat('zh-CN', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
}

/**
 * 格式化价格显示（5位小数）
 * @param {number} price - 价格
 * @returns {string} 格式化后的价格字符串
 */
function formatPrice(price) {
    return price.toFixed(5);
}

/**
 * 格式化手数显示
 * @param {number} volume - 手数
 * @returns {string} 格式化后的手数字符串
 */
function formatVolume(volume) {
    return volume.toFixed(2);
}

/**
 * 格式化点数显示
 * @param {number} pips - 点数
 * @returns {string} 格式化后的点数字符串
 */
function formatPips(pips) {
    return pips.toFixed(0) + '点';
}

/**
 * 调试工具：获取详细计算步骤
 * @param {Object} params - 计算参数
 * @returns {Object} 详细计算步骤
 */
function getCalculationDebugInfo(params) {
    const {
        pipStep,
        firstVolume,
        volumeExponent,
        maxPositions
    } = params;

    const referencePrice = 1.00000;
    const debugInfo = {
        inputParams: params,
        referencePrice,
        calculationSteps: [],
        potentialErrors: []
    };

    // 记录每层计算的详细步骤
    for (let level = 0; level < maxPositions; level++) {
        const entryPrice = referencePrice - (level * pipStep * 0.0001);
        const positionVolume = firstVolume * Math.pow(volumeExponent, level);
        
        const stepInfo = {
            level: level + 1,
            calculation: {
                entryPriceFormula: `${referencePrice} - (${level} * ${pipStep} * 0.0001)`,
                entryPriceResult: entryPrice,
                volumeFormula: `${firstVolume} * ${volumeExponent}^${level}`,
                volumeResult: positionVolume,
                pipDistance: level * pipStep
            }
        };
        
        // 检查潜在异常
        if (positionVolume > firstVolume * 10) {
            debugInfo.potentialErrors.push(`层级${level + 1}仓位过大: ${positionVolume.toFixed(2)}手`);
        }
        
        if (entryPrice < 0) {
            debugInfo.potentialErrors.push(`层级${level + 1}入场价格异常: ${entryPrice.toFixed(5)}`);
        }
        
        debugInfo.calculationSteps.push(stepInfo);
    }

    return debugInfo;
}

/**
 * 调试工具：验证浮动盈亏计算
 * @param {number} currentPrice - 当前价格
 * @param {number} entryPrice - 入场价格  
 * @param {number} volume - 手数
 * @param {number} pipValue - 每点价值
 * @returns {Object} 验证结果
 */
function verifyFloatingPnL(currentPrice, entryPrice, volume, pipValue) {
    const priceDiff = currentPrice - entryPrice;
    const priceDiffInPips = priceDiff / 0.0001;
    const floatingPnL = priceDiffInPips * volume * pipValue;
    
    return {
        currentPrice: currentPrice.toFixed(5),
        entryPrice: entryPrice.toFixed(5),
        priceDiff: priceDiff.toFixed(5),
        priceDiffInPips: priceDiffInPips.toFixed(1),
        volume: volume.toFixed(2),
        pipValue: pipValue.toFixed(1),
        floatingPnL: floatingPnL.toFixed(2),
        formula: `(${currentPrice.toFixed(5)} - ${entryPrice.toFixed(5)}) / 0.0001 * ${volume.toFixed(2)} * ${pipValue.toFixed(1)}`
    };
}