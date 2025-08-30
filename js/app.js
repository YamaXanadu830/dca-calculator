// Vue 3 cTrader DCA cBot 参数优化应用

const { createApp, ref, reactive, computed } = Vue;

createApp({
    setup() {
        // 响应式数据：cBot输入参数
        const inputParams = reactive({
            pipStep: 5,                  // DCA间距(点数)
            firstVolume: 1,              // 首次仓位手数
            volumeExponent: 1,           // 仓位倍数指数
            maxPositions: 20,            // 最大仓位数
            maxDrawdownPips: 200,        // 预期最大回撤点数
            pipValue: 10                 // 每点价值(USD)
        });

        // 响应式数据：计算结果
        const calculationResults = reactive({
            positions: [],
            totalVolume: 0,
            totalInvestment: 0,
            avgCostPrice: 0,
            drawdownAnalysis: [],
            riskMetrics: {
                maxPossibleLoss: 0,
                breakEvenPips: 0,
                marginRequired: 0,
                riskRewardRatio: 0,
                positionSizeRisk: 0
            }
        });

        // 错误信息和状态
        const errorMessage = ref('');
        const isCalculating = ref(false);

        // 调试面板相关数据
        const showDebugPanel = ref(false);
        const debugInfo = reactive({
            calculationSteps: [],
            potentialErrors: [],
            referencePrice: 1.00000
        });
        const formulaVerification = ref(null);
        
        // 新增UI状态管理
        const collapsedSections = reactive({
            charts: false,
            calculation: true, // 默认折叠计算详情，为图表腾出空间
            actions: true, // 默认折叠快捷操作
            verification: true // 默认折叠公式验证
        });
        const chartAnimationEnabled = ref(true);
        const fullscreenMode = ref({
            active: false,
            chart: null
        });
        
        // ECharts图表实例 - 使用普通变量避免Vue3响应式干扰
        let charts = {
            positionChart: null,
            drawdownChart: null
        };

        // 计算DCA cBot风险分析的主要方法
        function calculateDCA() {
            try {
                // 清除之前的错误信息
                errorMessage.value = '';
                isCalculating.value = true;

                // 验证输入参数
                const validation = validateDCABotParams(inputParams);
                
                if (!validation.isValid) {
                    errorMessage.value = validation.errors.join('；');
                    isCalculating.value = false;
                    return;
                }

                // 执行DCA cBot计算
                const result = calculateDCABot(inputParams);

                // 更新计算结果
                Object.assign(calculationResults, result);

                // 生成调试信息
                if (showDebugPanel.value) {
                    generateDebugInfo();
                    updateCharts();
                }

                console.log('cBot参数分析完成:', result);
                
            } catch (error) {
                console.error('计算错误:', error);
                errorMessage.value = '计算过程中发生错误：' + error.message;
                
                // 重置计算结果
                resetCalculationResults();
            } finally {
                isCalculating.value = false;
            }
        }

        // 重置计算结果
        function resetCalculationResults() {
            Object.assign(calculationResults, {
                positions: [],
                totalVolume: 0,
                totalInvestment: 0,
                avgCostPrice: 0,
                drawdownAnalysis: [],
                riskMetrics: {
                    maxPossibleLoss: 0,
                    breakEvenPips: 0,
                    marginRequired: 0,
                    riskRewardRatio: 0,
                    positionSizeRisk: 0
                }
            });
        }

        // 格式化货币显示
        function formatCurrency(amount) {
            if (typeof amount !== 'number' || isNaN(amount)) {
                return '$0.00';
            }
            
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(amount);
        }

        // 格式化价格显示（5位小数）
        function formatPrice(price) {
            if (typeof price !== 'number' || isNaN(price)) {
                return '0.00000';
            }
            return price.toFixed(5);
        }

        // 格式化手数显示
        function formatVolume(volume) {
            if (typeof volume !== 'number' || isNaN(volume)) {
                return '0.00';
            }
            return volume.toFixed(2);
        }

        // 格式化点数显示
        function formatPips(pips) {
            if (typeof pips !== 'number' || isNaN(pips)) {
                return '0点';
            }
            return pips.toFixed(0) + '点';
        }

        // 计算风险建议
        const riskAdvice = computed(() => {
            if (calculationResults.totalVolume === 0) {
                return '';
            }
            
            return generateDCABotAdvice(calculationResults);
        });



        // 导出计算结果
        function exportResults() {
            if (calculationResults.totalVolume === 0) {
                alert('请先进行分析计算！');
                return;
            }

            const exportData = {
                inputParams: { ...inputParams },
                calculationResults: { ...calculationResults },
                riskAdvice: riskAdvice.value,
                timestamp: new Date().toISOString(),
                version: '1.0',
                type: 'cTrader_DCA_cBot_Analysis'
            };

            const dataStr = JSON.stringify(exportData, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            
            const link = document.createElement('a');
            link.href = URL.createObjectURL(dataBlob);
            link.download = `dca-cbot-analysis-${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            
            console.log('分析结果已导出');
        }

        // 重置表单到默认值
        function resetToDefaults() {
            Object.assign(inputParams, {
                pipStep: 5,
                firstVolume: 1,
                volumeExponent: 1,
                maxPositions: 20,
                maxDrawdownPips: 200,
                pipValue: 10
            });

            resetCalculationResults();
            errorMessage.value = '';
            
            console.log('已重置为默认参数');
        }

        // 计算总投资需求（估算）
        const totalInvestmentRequired = computed(() => {
            if (calculationResults.totalVolume === 0) return 0;
            
            // 简化估算：总手数 × 参考价格 ÷ 杠杆比例（假设100倍）
            return (calculationResults.totalVolume * 1.0) / 100;
        });

        // 计算最大仓位手数
        const maxPositionSize = computed(() => {
            if (calculationResults.positions.length === 0) return 0;
            
            return Math.max(...calculationResults.positions.map(p => p.volume));
        });

        // 计算风险等级
        const riskLevel = computed(() => {
            const maxLoss = calculationResults.riskMetrics.maxPossibleLoss;
            
            if (maxLoss > 10000) return { level: 'HIGH', color: '#dc3545', label: '高风险' };
            if (maxLoss > 5000) return { level: 'MEDIUM', color: '#ffa726', label: '中风险' };
            return { level: 'LOW', color: '#28a745', label: '低风险' };
        });

        // 自动保存参数到本地存储
        function saveParametersToLocal() {
            try {
                const paramsToSave = {
                    ...inputParams,
                    savedAt: new Date().toISOString()
                };
                localStorage.setItem('dcaBotParams', JSON.stringify(paramsToSave));
            } catch (error) {
                console.warn('无法保存参数到本地存储:', error);
            }
        }

        // 从本地存储加载参数
        function loadParametersFromLocal() {
            try {
                const saved = localStorage.getItem('dcaBotParams');
                if (saved) {
                    const params = JSON.parse(saved);
                    // 移除时间戳，只恢复参数
                    delete params.savedAt;
                    Object.assign(inputParams, params);
                    
                    console.log('已从本地存储恢复参数');
                    return true;
                }
            } catch (error) {
                console.warn('无法从本地存储加载参数:', error);
            }
            return false;
        }

        // 调试面板控制方法（模态框模式）
        function toggleDebugPanel() {
            showDebugPanel.value = !showDebugPanel.value;
            
            if (showDebugPanel.value) {
                // 禁用body滚动
                document.body.classList.add('debug-modal-active');
                
                if (calculationResults.totalVolume > 0) {
                    // 延迟一下让DOM更新，然后初始化图表
                    setTimeout(() => {
                        generateDebugInfo();
                        initializeCharts();
                        updateCharts();
                    }, 200);
                }
            } else {
                // 恢复body滚动
                document.body.classList.remove('debug-modal-active');
                
                // 销毁图表实例以释放资源
                if (charts.positionChart) {
                    charts.positionChart.dispose();
                    charts.positionChart = null;
                }
                if (charts.drawdownChart) {
                    charts.drawdownChart.dispose();
                    charts.drawdownChart = null;
                }
            }
            
            console.log('调试面板已', showDebugPanel.value ? '开启' : '关闭');
        }

        // 点击遮罩关闭模态框
        function closeOnOverlayClick(event) {
            // 只有点击遮罩本身时才关闭，点击内容区域不关闭
            if (event.target === event.currentTarget) {
                toggleDebugPanel();
            }
        }

        // ESC键关闭模态框
        function handleKeydown(event) {
            if (event.key === 'Escape' && showDebugPanel.value) {
                toggleDebugPanel();
            }
        }

        // 生成调试信息
        function generateDebugInfo() {
            if (calculationResults.totalVolume === 0) return;

            // 获取详细计算步骤
            const detailInfo = getCalculationDebugInfo(inputParams);
            Object.assign(debugInfo, detailInfo);

            // 生成公式验证数据
            formulaVerification.value = generateFormulaVerification();
        }

        // 生成公式验证数据
        function generateFormulaVerification() {
            if (calculationResults.positions.length === 0) return [];

            const verification = [];
            
            // 验证第一个仓位的计算
            const firstPos = calculationResults.positions[0];
            verification.push({
                name: '第1层入场价格',
                formula: `1.00000 - (0 * ${inputParams.pipStep} * 0.0001)`,
                result: firstPos.entryPrice.toFixed(5),
                status: firstPos.entryPrice === 1.00000 ? 'ok' : 'warning'
            });

            verification.push({
                name: '第1层仓位手数',
                formula: `${inputParams.firstVolume} * ${inputParams.volumeExponent}^0`,
                result: firstPos.volume.toFixed(2),
                status: firstPos.volume === inputParams.firstVolume ? 'ok' : 'warning'
            });

            // 验证平均成本价计算
            verification.push({
                name: '平均成本价',
                formula: '∑(入场价格 * 手数) / 总手数',
                result: calculationResults.avgCostPrice.toFixed(5),
                status: calculationResults.avgCostPrice > 0 ? 'ok' : 'warning'
            });

            // 验证最大可能亏损
            verification.push({
                name: '最大可能亏损',
                formula: `点数差 * ${calculationResults.totalVolume.toFixed(2)} * ${inputParams.pipValue}`,
                result: formatCurrency(calculationResults.riskMetrics.maxPossibleLoss),
                status: calculationResults.riskMetrics.maxPossibleLoss > 0 ? 'ok' : 'warning'
            });

            return verification;
        }

        // 初始化图表（优化模态框模式）
        function initializeCharts() {
            if (typeof echarts === 'undefined') {
                console.error('ECharts库未加载');
                return;
            }

            // 初始化仓位构建图表
            const positionChartDom = document.getElementById('positionChart');
            if (positionChartDom && !charts.positionChart) {
                charts.positionChart = echarts.init(positionChartDom);
                
                // 模态框模式下，延迟resize以适应容器尺寸
                setTimeout(() => {
                    if (charts.positionChart) {
                        charts.positionChart.resize();
                    }
                }, 100);
            }

            // 初始化回撤风险图表
            const drawdownChartDom = document.getElementById('drawdownChart');
            if (drawdownChartDom && !charts.drawdownChart) {
                charts.drawdownChart = echarts.init(drawdownChartDom);
                
                // 模态框模式下，延迟resize以适应容器尺寸
                setTimeout(() => {
                    if (charts.drawdownChart) {
                        charts.drawdownChart.resize();
                    }
                }, 100);
            }
        }

        // 更新图表数据
        function updateCharts() {
            if (calculationResults.positions.length === 0) return;

            updatePositionChart();
            updateDrawdownChart();
        }

        // 更新仓位构建图表
        function updatePositionChart() {
            if (!charts.positionChart) return;

            const option = {
                animation: chartAnimationEnabled.value,
                animationDuration: chartAnimationEnabled.value ? 800 : 0,
                title: {
                    text: '各层DCA仓位分布',
                    left: 'center',
                    textStyle: { fontSize: 14 }
                },
                tooltip: {
                    trigger: 'axis',
                    axisPointer: { type: 'shadow' },
                    formatter: function(params) {
                        const data = params[0];
                        const pos = calculationResults.positions[data.dataIndex];
                        return `层级: ${pos.level}<br/>` +
                               `入场价格: ${pos.entryPrice.toFixed(5)}<br/>` +
                               `仓位手数: ${pos.volume.toFixed(2)}<br/>` +
                               `距离起始: ${pos.pipDistance}点<br/>` +
                               `累计手数: ${pos.cumulativeVolume.toFixed(2)}`;
                    }
                },
                xAxis: {
                    type: 'category',
                    data: calculationResults.positions.map(p => `第${p.level}层`),
                    axisLabel: { rotate: 45 }
                },
                yAxis: {
                    type: 'value',
                    name: '手数',
                    axisLabel: { formatter: '{value}' }
                },
                series: [{
                    name: '仓位手数',
                    type: 'bar',
                    data: calculationResults.positions.map(p => p.volume),
                    itemStyle: {
                        color: function(params) {
                            // 根据手数大小设置颜色
                            const volume = params.value;
                            const firstVolume = inputParams.firstVolume;
                            if (volume > firstVolume * 5) return '#FF6B6B'; // 红色 - 高风险
                            if (volume > firstVolume * 2) return '#FFB347'; // 橙色 - 中风险
                            return '#4ECDC4'; // 蓝绿色 - 低风险
                        }
                    },
                    emphasis: {
                        itemStyle: { opacity: 0.8 }
                    },
                    animationDelay: chartAnimationEnabled.value ? function(idx) {
                        return idx * 50; // 逐个动画延迟
                    } : 0
                }],
                grid: {
                    left: '10%',
                    right: '10%',
                    bottom: '15%'
                }
            };

            charts.positionChart.setOption(option);
        }

        // 更新回撤风险图表
        function updateDrawdownChart() {
            if (!charts.drawdownChart || !calculationResults.drawdownAnalysis) return;

            const drawdownData = calculationResults.drawdownAnalysis;
            
            const option = {
                animation: chartAnimationEnabled.value,
                animationDuration: chartAnimationEnabled.value ? 1000 : 0,
                title: {
                    text: '回撤风险分析曲线',
                    left: 'center',
                    textStyle: { fontSize: 14 }
                },
                tooltip: {
                    trigger: 'axis',
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    borderColor: '#667eea',
                    borderWidth: 2,
                    borderRadius: 8,
                    padding: [12, 16],
                    textStyle: {
                        fontSize: 13,
                        color: '#333'
                    },
                    // 移动端优化配置
                    confine: true, // 确保tooltip不超出图表容器
                    enterable: true, // 允许鼠标进入tooltip
                    hideDelay: 200, // 延迟隐藏，防止意外关闭
                    position: function (point, params, dom, rect, size) {
                        // 响应式定位逻辑
                        const isMobile = window.innerWidth <= 768;
                        if (isMobile) {
                            // 移动端优先显示在顶部，避免被手指遮挡
                            return [point[0] - size.contentSize[0] / 2, 10];
                        }
                        // 桌面端默认定位
                        return null;
                    },
                    formatter: function(params) {
                        // 调试信息：验证数据传递
                        console.log('🔍 Tooltip Debug Info (New Method):');
                        console.log('params:', params);
                        console.log('params[0].data:', params[0].data);
                        
                        // 基础数据验证
                        if (!params || !params[0] || !params[0].data) {
                            console.warn('⚠️ params或data为空或无效');
                            return '<div>数据加载中...</div>';
                        }
                        
                        // 直接从params[0].data获取嵌入的完整数据
                        const point = params[0].data;
                        console.log('embedded point data:', point);
                        
                        // 验证必要的数据字段
                        if (!point.pipsFromStart && point.pipsFromStart !== 0) {
                            console.warn('⚠️ 关键数据字段缺失');
                            return `<div>数据结构错误:<br/>point: ${JSON.stringify(point)}</div>`;
                        }
                        
                        // 确定盈亏颜色和风险颜色
                        const pnlColor = point.floatingPnL >= 0 ? '#28a745' : '#dc3545';
                        const riskColor = point.riskLevel === '高风险' ? '#dc3545' : 
                                        point.riskLevel === '中风险' ? '#ffa726' : '#28a745';
                        
                        // 响应式宽度调整
                        const isMobile = window.innerWidth <= 768;
                        const tooltipWidth = isMobile ? '260px' : '280px';
                        const maxWidth = isMobile ? '90vw' : '320px';
                        const fontSize = isMobile ? '13px' : '14px';
                        const detailFontSize = isMobile ? '11px' : '12px';
                        
                        // 返回响应式的完整tooltip
                        return `
                        <div style="min-width: ${tooltipWidth}; max-width: ${maxWidth}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                            <div style="font-weight: bold; font-size: ${fontSize}; margin-bottom: 8px; color: #333; border-bottom: 1px solid #eee; padding-bottom: 6px;">
                                📊 回撤分析详情 (${point.pipsFromStart}点)
                            </div>
                            
                            <!-- 核心信息突出显示 -->
                            <div style="background: #f8f9fa; padding: ${isMobile ? '6px' : '8px'}; border-radius: 4px; margin-bottom: ${isMobile ? '6px' : '8px'};">
                                <div style="margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center;">
                                    <span style="font-size: ${detailFontSize}; font-weight: 600;">💰 浮动盈亏:</span>
                                    <span style="color: ${pnlColor}; font-weight: bold; font-size: ${detailFontSize};">${formatCurrency(point.floatingPnL)}</span>
                                </div>
                                <div style="margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center;">
                                    <span style="font-size: ${detailFontSize}; font-weight: 600;">📈 累计仓位:</span>
                                    <span style="font-weight: bold; font-size: ${detailFontSize};">${point.activePositions}层 / ${point.totalActiveVolume.toFixed(2)}手</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <span style="font-size: ${detailFontSize}; font-weight: 600;">🎯 距离回本:</span>
                                    <span style="color: #667eea; font-weight: bold; font-size: ${detailFontSize};">${point.breakEvenPipsNeeded}点</span>
                                </div>
                            </div>
                            
                            <!-- 详细信息 -->
                            <div style="font-size: ${detailFontSize}; color: #666; line-height: 1.4;">
                                <div style="margin-bottom: 2px;">💵 累计投入: <strong>${formatCurrency(point.cumulativeInvestment)}</strong></div>
                                <div style="margin-bottom: 2px;">📊 平均成本: <strong>${point.avgCostPrice.toFixed(5)}</strong></div>
                                <div style="margin-bottom: 2px;">💎 当前价格: <strong>${point.price.toFixed(5)}</strong></div>
                                ${point.nextDcaTriggerPrice ? 
                                    `<div style="margin-bottom: 2px;">⬇️ 下层触发: <strong>${point.nextDcaTriggerPrice.toFixed(5)}</strong></div>` : 
                                    `<div style="margin-bottom: 2px; color: #ffa726;">⚠️ 已达最大仓位</div>`
                                }
                                <div style="margin-bottom: 4px;">🛡️ 保证金: <strong>${formatCurrency(point.marginRequired)}</strong></div>
                                <div style="padding-top: 4px; border-top: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
                                    <span>⚠️ 风险等级:</span>
                                    <span style="color: ${riskColor}; font-weight: bold;">${point.riskLevel}</span>
                                </div>
                            </div>
                        </div>
                        `;
                    }
                },
                xAxis: {
                    type: 'value',
                    name: '回撤点数',
                    axisLabel: { formatter: '{value}点' }
                },
                yAxis: {
                    type: 'value',
                    name: '浮动盈亏 (USD)',
                    axisLabel: { formatter: '${value}' },
                    axisLine: { show: true },
                    splitLine: { 
                        show: true,
                        lineStyle: { 
                            color: '#E0E0E0',
                            type: 'dashed'
                        }
                    }
                },
                series: [{
                    name: '浮动盈亏',
                    type: 'line',
                    smooth: true,
                    data: drawdownData.map(point => ({
                        // 图表显示的坐标数据
                        value: [point.pipsFromStart, point.floatingPnL],
                        // 嵌入完整的tooltip数据
                        pipsFromStart: point.pipsFromStart,
                        price: point.price,
                        floatingPnL: point.floatingPnL,
                        activePositions: point.activePositions,
                        totalActiveVolume: point.totalActiveVolume,
                        breakEvenPipsNeeded: point.breakEvenPipsNeeded || 0,
                        cumulativeInvestment: point.cumulativeInvestment || 0,
                        avgCostPrice: point.avgCostPrice || point.price,
                        nextDcaTriggerPrice: point.nextDcaTriggerPrice || null,
                        riskLevel: point.riskLevel || '低风险',
                        marginRequired: point.marginRequired || 0,
                        drawdownPercentage: point.drawdownPercentage || 0,
                        pointType: point.pointType || 'hardcoded' // 添加点类型数据
                    })),
                    lineStyle: { width: 2 },
                    itemStyle: { 
                        color: function(params) {
                            // 触发点显示黄色
                            if (params.data.pointType === 'trigger') {
                                return '#FFD700';
                            }
                            // 硬编码点保持原逻辑
                            return params.data.value[1] >= 0 ? '#4ECDC4' : '#FF6B6B';
                        }
                    },
                    areaStyle: {
                        color: {
                            type: 'linear',
                            x: 0, y: 0, x2: 0, y2: 1,
                            colorStops: [
                                { offset: 0, color: 'rgba(78, 205, 196, 0.3)' },
                                { offset: 1, color: 'rgba(255, 107, 107, 0.1)' }
                            ]
                        }
                    },
                    markLine: {
                        data: [
                            { yAxis: 0, lineStyle: { color: '#999', type: 'solid' }, label: { formatter: '盈亏平衡线' } }
                        ]
                    },
                    animationEasing: 'cubicOut'
                }],
                grid: {
                    left: '12%',
                    right: '10%',
                    bottom: '15%',
                    top: '15%'
                }
            };

            charts.drawdownChart.setOption(option);
        }

        // 刷新调试数据
        function refreshDebugData() {
            if (calculationResults.totalVolume === 0) {
                alert('请先进行风险分析计算！');
                return;
            }

            generateDebugInfo();
            if (charts.positionChart || charts.drawdownChart) {
                updateCharts();
            }
            
            console.log('调试数据已刷新');
        }

        // 导出调试数据
        function exportDebugData() {
            if (calculationResults.totalVolume === 0) {
                alert('请先进行分析计算！');
                return;
            }

            const debugExport = {
                timestamp: new Date().toISOString(),
                inputParams: { ...inputParams },
                calculationResults: { ...calculationResults },
                debugInfo: { ...debugInfo },
                formulaVerification: formulaVerification.value,
                version: '1.0-debug',
                type: 'DCA_Debug_Analysis'
            };

            const dataStr = JSON.stringify(debugExport, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            
            const link = document.createElement('a');
            link.href = URL.createObjectURL(dataBlob);
            link.download = `dca-debug-analysis-${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            
            console.log('调试数据已导出');
        }

        // 新增UI交互功能

        // 折叠/展开面板部分
        function toggleSection(sectionName) {
            if (collapsedSections.hasOwnProperty(sectionName)) {
                collapsedSections[sectionName] = !collapsedSections[sectionName];
                
                // 如果展开图表区域，延迟调整图表尺寸
                if (sectionName === 'charts' && !collapsedSections[sectionName]) {
                    setTimeout(() => {
                        if (charts.positionChart) charts.positionChart.resize();
                        if (charts.drawdownChart) charts.drawdownChart.resize();
                    }, 300);
                }
                
                console.log(`${sectionName}面板已${collapsedSections[sectionName] ? '折叠' : '展开'}`);
            }
        }

        // 图表全屏功能
        function fullscreenChart(chartType) {
            if (!charts[chartType + 'Chart']) {
                alert('图表未初始化，请先进行分析计算！');
                return;
            }

            const chartContainer = document.getElementById(chartType + 'Chart');
            if (!chartContainer) return;

            if (!fullscreenMode.value.active) {
                // 进入全屏模式
                fullscreenMode.value = {
                    active: true,
                    chart: chartType
                };
                
                // 添加全屏样式类
                chartContainer.classList.add('chart-fullscreen');
                document.body.classList.add('chart-fullscreen-mode');
                
                // 创建全屏覆盖层
                const overlay = document.createElement('div');
                overlay.className = 'fullscreen-overlay';
                overlay.innerHTML = `
                    <div class="fullscreen-header">
                        <h3>${chartType === 'position' ? '📊 仓位构建分析' : '📈 回撤风险曲线'}</h3>
                        <button class="fullscreen-close" onclick="window.exitFullscreenChart()">✕ 退出全屏</button>
                    </div>
                `;
                document.body.appendChild(overlay);
                
                // 调整图表尺寸
                setTimeout(() => {
                    charts[chartType + 'Chart'].resize();
                }, 100);
                
                console.log(`${chartType}图表已进入全屏模式`);
            } else {
                exitFullscreenChart();
            }
        }

        // 退出全屏模式
        function exitFullscreenChart() {
            if (!fullscreenMode.value.active) return;

            const chartType = fullscreenMode.value.chart;
            const chartContainer = document.getElementById(chartType + 'Chart');
            
            if (chartContainer) {
                chartContainer.classList.remove('chart-fullscreen');
            }
            
            document.body.classList.remove('chart-fullscreen-mode');
            
            // 移除覆盖层
            const overlay = document.querySelector('.fullscreen-overlay');
            if (overlay) {
                overlay.remove();
            }
            
            fullscreenMode.value = { active: false, chart: null };
            
            // 调整图表尺寸
            setTimeout(() => {
                if (charts[chartType + 'Chart']) {
                    charts[chartType + 'Chart'].resize();
                }
            }, 100);
            
            console.log('已退出全屏模式');
        }

        // 暴露全局函数供HTML调用
        window.exitFullscreenChart = exitFullscreenChart;

        // 重置图表缩放
        function resetChartZoom() {
            if (charts.positionChart) {
                charts.positionChart.dispatchAction({
                    type: 'restore'
                });
            }
            if (charts.drawdownChart) {
                charts.drawdownChart.dispatchAction({
                    type: 'restore'
                });
            }
            console.log('图表缩放已重置');
        }

        // 切换图表动画
        function toggleChartAnimation() {
            chartAnimationEnabled.value = !chartAnimationEnabled.value;
            
            // 重新设置图表配置
            if (charts.positionChart || charts.drawdownChart) {
                updateCharts();
            }
            
            console.log('图表动画已', chartAnimationEnabled.value ? '开启' : '关闭');
        }

        // 初始化时尝试加载保存的参数
        loadParametersFromLocal();

        // 添加ESC键监听器
        document.addEventListener('keydown', handleKeydown);
        
        // Vue 3 的 onUnmounted 钩子清理事件监听器
        const { onUnmounted } = Vue;
        onUnmounted(() => {
            document.removeEventListener('keydown', handleKeydown);
            document.body.classList.remove('debug-modal-active');
        });

        // 监听参数变化，自动保存（预留功能）
        // const paramWatcher = computed(() => JSON.stringify(inputParams));
        // 这里可以添加 watch 来监听参数变化并自动保存

        // 返回所有需要在模板中使用的数据和方法
        return {
            // 数据
            inputParams,
            calculationResults,
            errorMessage,
            isCalculating,
            
            // 调试相关数据
            showDebugPanel,
            debugInfo,
            formulaVerification,
            
            // 新增UI状态数据
            collapsedSections,
            chartAnimationEnabled,
            fullscreenMode,
            
            // 计算属性
            riskAdvice,
            totalInvestmentRequired,
            maxPositionSize,
            riskLevel,
            
            // 方法
            calculateDCA,
            exportResults,
            resetToDefaults,
            formatCurrency,
            formatPrice,
            formatVolume,
            formatPips,
            saveParametersToLocal,
            
            // 调试方法
            toggleDebugPanel,
            refreshDebugData,
            exportDebugData,
            generateDebugInfo,
            
            // 新增交互方法
            toggleSection,
            fullscreenChart,
            resetChartZoom,
            toggleChartAnimation,
            
            // 模态框交互方法
            closeOnOverlayClick
        };
    }
}).mount('#app');