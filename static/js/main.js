// 全局状态
let state = {
    fastRefresh: false,
    fastRefreshTimeout: null,
    vmTimers: {},
    confirmAction: null,
    sortKey: 'status',      // 默认排序键为 'status'
    sortDirection: 'asc'    // 默认升序，'asc' 或 'desc'
};

// 添加全局错误处理
window.addEventListener('error', function(e) {
    console.error('全局错误:', e.error);
});

// 添加fetch错误处理
const originalFetch = window.fetch;
window.fetch = function(...args) {
    return originalFetch.apply(this, args)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP错误 ${response.status}: ${response.statusText}`);
            }
            return response;
        })
        .catch(error => {
            console.error('Fetch错误:', error);
            throw error;
        });
};

// DOM 加载完成后执行
document.addEventListener('DOMContentLoaded', function() {
    // 初始化加载数据
    loadNodeInfo();
    loadVMs();
    
    // 设置刷新按钮事件
    document.getElementById('refreshBtn').addEventListener('click', function() {
        loadNodeInfo();
        loadVMs();
    });
    
    // 设置快速刷新按钮事件
    document.getElementById('fastRefreshBtn').addEventListener('click', function() {
        toggleFastRefresh();
    });
    
    // 设置模态框事件
    document.getElementById('modalCancel').addEventListener('click', hideModal);
    document.getElementById('modalConfirm').addEventListener('click', executeConfirmedAction);
});

// 加载节点信息
async function loadNodeInfo() {
    try {
        console.log("正在加载节点信息...");
        const response = await fetch('/api/node');
        
        if (!response.ok) {
            throw new Error(`HTTP错误: ${response.status}`);
        }
        
        const node = await response.json();
        console.log("节点数据:", node);
        
        if (node.error) {
            console.error('API返回错误:', node.error);
            document.getElementById('nodeInfo').innerHTML = `
                <div class="bg-red-50 p-4 rounded-lg col-span-4">
                    <h3 class="text-lg font-semibold text-red-800">错误</h3>
                    <p>无法获取节点信息: ${node.error}</p>
                </div>
            `;
            return;
        }
        
        // 原有的显示代码...
        
    } catch (error) {
        console.error('加载节点信息失败:', error);
        document.getElementById('nodeInfo').innerHTML = `
            <div class="bg-red-50 p-4 rounded-lg col-span-4">
                <h3 class="text-lg font-semibold text-red-800">连接错误</h3>
                <p>无法连接到PVE服务器: ${error.message}</p>
                <p class="text-sm mt-2">请检查网络连接和PVE服务器状态</p>
            </div>
        `;
    }
}

// 加载虚拟机列表
async function loadVMs() {
    try {
        const response = await fetch('/api/vms');
        const vms = await response.json();
        
        if (vms.error) {
            alert('错误: ' + vms.error);
            return;
        }
        
        const vmsListDiv = document.getElementById('vmsList');
        let html = '<table class="min-w-full divide-y divide-gray-200"><thead class="bg-gray-50"><tr>';
        html += '<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">名称</th>';
        html += '<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">VMID</th>';
        html += '<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>';
        html += '<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CPU</th>';
        html += '<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">内存</th>';
        html += '<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">运行时间</th>';
        html += '</tr></thead><tbody class="bg-white divide-y divide-gray-200">';
        
        // --- 排序逻辑开始 ---
        vms.sort((a, b) => {
            // 默认优先按状态排序：running 在前
            const statusA = a.status === 'running' ? 0 : 1;
            const statusB = b.status === 'running' ? 0 : 1;

            if (statusA !== statusB) {
                return statusA - statusB;
            }

            // 次级排序：根据 state.sortKey 和 state.sortDirection
            const key = state.sortKey;
            const dir = state.sortDirection === 'asc' ? 1 : -1;
            
            let valA, valB;

            if (key === 'name' || key === 'vmid') {
                valA = a[key];
                valB = b[key];
            } else {
                // 对于 VMID，进行特殊处理，确保数字排序
                valA = parseInt(a[key], 10);
                valB = parseInt(b[key], 10);
            }

            if (valA < valB) return -1 * dir;
            if (valA > valB) return 1 * dir;
            return 0;
        });
        // --- 排序逻辑结束 ---
        
        // const vmsListDiv = document.getElementById('vmsList');


        vms.forEach(vm => {
            const statusColor = vm.status === 'running' ? 'text-green-600' : 'text-red-600';
            const cpuColor = vm.cpu_usage < 70 ? 'text-green-600' : 'text-red-600';
            const memColor = vm.mem_percent < 70 ? 'text-green-600' : 'text-red-600';
            
            html += `
                <tr class="vm-row cursor-pointer hover:bg-gray-50" data-vmid="${vm.vmid}">
                    <td class="px-6 py-4 whitespace-nowrap">${vm.name}</td>
                    <td class="px-6 py-4 whitespace-nowrap">${vm.vmid}</td>
                    <td class="px-6 py-4 whitespace-nowrap"><span class="${statusColor} font-semibold">${vm.status}</span></td>
                    <td class="px-6 py-4 whitespace-nowrap"><span class="${cpuColor} font-semibold">${vm.cpu_usage}%</span></td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="${memColor} font-semibold">${formatBytes(vm.mem_usage)}</span> / 
                        ${formatBytes(vm.max_mem)} (${vm.mem_percent}%)
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">${vm.uptime_formatted}</td>
                </tr>
                <tr class="vm-details hidden" id="vm-details-${vm.vmid}">
                    <td colspan="6" class="px-6 py-4 bg-gray-50">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <h4 class="font-semibold mb-2">详细信息</h4>
                                <p>CPU: ${vm.cpus} 核心</p>
                                <p>内存: ${formatBytes(vm.mem_usage)} / ${formatBytes(vm.max_mem)}</p>
                                <p>磁盘: ${formatBytes(vm.disk_usage)} / ${formatBytes(vm.max_disk)}</p>
                                <p>网络流入: ${formatBytes(vm.netin)}</p>
                                <p>网络流出: ${formatBytes(vm.netout)}</p>
                            </div>
                            <div>
                                <h4 class="font-semibold mb-2">操作</h4>
                                <div class="flex flex-wrap gap-2">
                                    <button class="vm-start bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded ${vm.status === 'running' ? 'opacity-50 cursor-not-allowed' : ''}" 
                                            data-vmid="${vm.vmid}" ${vm.status === 'running' ? 'disabled' : ''}>
                                        开机
                                    </button>
                                    <button class="vm-shutdown bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded ${vm.status !== 'running' ? 'opacity-50 cursor-not-allowed' : ''}" 
                                            data-vmid="${vm.vmid}" ${vm.status !== 'running' ? 'disabled' : ''}>
                                        关机
                                    </button>
                                    <button class="vm-reboot bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded ${vm.status !== 'running' ? 'opacity-50 cursor-not-allowed' : ''}" 
                                            data-vmid="${vm.vmid}" ${vm.status !== 'running' ? 'disabled' : ''}>
                                        重启
                                    </button>
                                    <button class="vm-stop bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded ${vm.status !== 'running' ? 'opacity-50 cursor-not-allowed' : ''}" 
                                            data-vmid="${vm.vmid}" ${vm.status !== 'running' ? 'disabled' : ''}>
                                        强制停止
                                    </button>
                                </div>
                                
                                <div class="mt-4 p-3 bg-gray-100 rounded-lg">
    <h4 class="font-semibold mb-2">自动关机</h4>
    <div id="auto-shutdown-${vm.vmid}">
        ${vm.auto_shutdown_formatted ?
                    `<p>预计关机时间: <span class="font-semibold">${vm.auto_shutdown_formatted}</span></p>
             <p>延迟关机时间: <span class="font-semibold">${vm.auto_shutdown_delay}小时</span></p>
             <div class="flex flex-wrap gap-2 mt-2">
                 <button class="vm-delay-shutdown bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded" 
                         data-vmid="${vm.vmid}">
                     延迟6小时
                 </button>
                 <button class="vm-reset-shutdown bg-purple-500 hover:bg-purple-600 text-white px-3 py-1 rounded" 
                         data-vmid="${vm.vmid}">
                     重置关机时间
                 </button>
             </div>` :
                    `<p class="text-gray-500">未设置自动关机</p>`}
    </div>
</div>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        });
        
        html += '</tbody></table>';
        vmsListDiv.innerHTML = html;

        // 添加自动关机按钮事件处理
        document.querySelectorAll('.vm-delay-shutdown').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const vmid = this.getAttribute('data-vmid');
                delayShutdown(vmid);
            });
        });

        document.querySelectorAll('.vm-reset-shutdown').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const vmid = this.getAttribute('data-vmid');
                resetShutdown(vmid);
            });
        });
        
        // 添加行点击事件
        document.querySelectorAll('.vm-row').forEach(row => {
            row.addEventListener('click', function() {
                const vmid = this.getAttribute('data-vmid');
                const details = document.getElementById(`vm-details-${vmid}`);
                details.classList.toggle('hidden');
            });
        });
        
        // 添加操作按钮事件
        document.querySelectorAll('.vm-start').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const vmid = this.getAttribute('data-vmid');
                startVM(vmid);
            });
        });
        
        document.querySelectorAll('.vm-shutdown').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const vmid = this.getAttribute('data-vmid');
                confirmAction('shutdown', vmid, '确定要关机吗？');
            });
        });
        
        document.querySelectorAll('.vm-reboot').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const vmid = this.getAttribute('data-vmid');
                confirmAction('reboot', vmid, '确定要重启吗？');
            });
        });
        
        document.querySelectorAll('.vm-stop').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const vmid = this.getAttribute('data-vmid');
                confirmAction('stop', vmid, '确定要强制停止吗？此操作可能导致数据丢失！');
            });
        });
        
    } catch (error) {
        console.error('加载虚拟机列表失败:', error);
    }
}

// 切换快速刷新模式
function toggleFastRefresh() {
    const fastRefreshBtn = document.getElementById('fastRefreshBtn');
    
    if (state.fastRefresh) {
        // 停止快速刷新
        clearTimeout(state.fastRefreshTimeout);
        state.fastRefresh = false;
        fastRefreshBtn.classList.remove('bg-red-500');
        fastRefreshBtn.classList.add('bg-green-500');
        fastRefreshBtn.innerHTML = '<i class="fas fa-bolt mr-2"></i> 快速刷新';
    } else {
        // 开始快速刷新
        state.fastRefresh = true;
        fastRefreshBtn.classList.remove('bg-green-500');
        fastRefreshBtn.classList.add('bg-red-500');
        startFastRefresh(30);
    }
}

// 开始快速刷新
function startFastRefresh(seconds) {
    const fastRefreshBtn = document.getElementById('fastRefreshBtn');
    fastRefreshBtn.innerHTML = `<i class="fas fa-bolt mr-2"></i> 快速刷新 (${seconds}s)`;
    
    if (seconds > 0) {
        state.fastRefreshTimeout = setTimeout(() => {
            loadNodeInfo();
            loadVMs();
            startFastRefresh(seconds - 1);
        }, 1000);
    } else {
        toggleFastRefresh();
    }
}

// 显示确认模态框
function showModal(title, message) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalMessage').textContent = message;
    document.getElementById('confirmModal').classList.remove('hidden');
}

// 隐藏模态框
function hideModal() {
    document.getElementById('confirmModal').classList.add('hidden');
    state.confirmAction = null;
}

// 确认操作
function confirmAction(action, vmid, message) {
    state.confirmAction = { action, vmid };
    showModal('确认操作', message);
}

// 执行确认的操作
async function executeConfirmedAction() {
    if (!state.confirmAction) return;
    
    const { action, vmid } = state.confirmAction;
    hideModal();
    
    try {
        const response = await fetch(`/api/vm/${vmid}/${action}`, { method: 'POST' });
        const result = await response.json();
        
        if (result.error) {
            alert('操作失败: ' + result.error);
        } else {
            // 操作成功，刷新数据
            setTimeout(() => {
                loadNodeInfo();
                loadVMs();
            }, 1000);
        }
    } catch (error) {
        console.error('操作失败:', error);
        alert('操作失败: ' + error.message);
    }
}

// 启动虚拟机
async function startVM(vmid) {
    try {
        const response = await fetch(`/api/vm/${vmid}/start`, { method: 'POST' });
        const result = await response.json();
        
        if (result.error) {
            alert('启动失败: ' + result.error);
        } else {
            // 启动成功，刷新数据
            setTimeout(() => {
                loadNodeInfo();
                loadVMs();
            }, 1000);
        }
    } catch (error) {
        console.error('启动失败:', error);
        alert('启动失败: ' + error.message);
    }
}

// 添加自动关机操作函数
async function delayShutdown(vmid) {
    try {
        const response = await fetch(`/api/vm/${vmid}/autoshutdown`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action: 'delay' })
        });
        
        const result = await response.json();
        
        if (result.error) {
            alert('操作失败: ' + result.error);
        } else {
            // 操作成功，刷新数据
            setTimeout(() => {
                loadNodeInfo();
                loadVMs();
            }, 1000);
        }
    } catch (error) {
        console.error('操作失败:', error);
        alert('操作失败: ' + error.message);
    }
}
// 自动关机
async function resetShutdown(vmid) {
    try {
        const response = await fetch(`/api/vm/${vmid}/autoshutdown`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action: 'reset' })
        });
        
        const result = await response.json();
        
        if (result.error) {
            alert('操作失败: ' + result.error);
        } else {
            // 操作成功，刷新数据
            setTimeout(() => {
                loadNodeInfo();
                loadVMs();
            }, 1000);
        }
    } catch (error) {
        console.error('操作失败:', error);
        alert('操作失败: ' + error.message);
    }
}

// 格式化字节大小
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}