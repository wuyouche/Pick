// ======= 🚨請在此處替換成你的 Google 部署網址 🚨 =======
const API_URL = "https://script.google.com/macros/s/AKfycbx0JoBbQm2p-8nGht-Qr59vng2dnfWd_KBQdDuzAA2IlFMk2Ex1zxAqNlZtE5jHryJFYw/exec";
// ==========================================================

// 全域狀態管理
// 修改這行，讓 historyOrders 預設為空，等待雲端載入
let historyOrders = [];
let goods = [];
let cart = [];
let currentManagerFilter = 'all';
let currentShippingFilter = 'all';

// 用於追蹤觸控拖曳的變數 (手機版防抖)
let touchStartEl = null;
function isInCart(code) {
    return cart.some(item => item.code === code);
}


function toggleCart(index) {
    const good = goods[index];

    const existingIndex = cart.findIndex(item => item.code === good.code);

    if (existingIndex !== -1) {
        cart.splice(existingIndex, 1);
    } else {
        cart.push({
            ...good,
            quantity: 1
        });
    }

    render();
}
/**
 * 顯示或隱藏讀取動畫罩
 */
function showLoading(show) {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) spinner.classList.toggle('hidden', !show);
}
async function fetchHistoryFromCloud() {

    try {

        const response = await fetch(API_URL, {
            method: "POST",
            body: JSON.stringify({
                action: "getOrders"
            })
        });

        const data = await response.json();

        historyOrders = Array.isArray(data) ? data : [];

        render();

    } catch (error) {
        showLoading(false); // ⭐一定要關
        console.error(error);
    }
}
/**
 * 頁面加載時自動從雲端 Excel 抓取資料
 */
async function fetchGoodsFromCloud() {

    const syncStatus = document.getElementById('sync-status');

    showLoading(true);

    try {

        const response = await fetch(API_URL, {
            method: "POST",
            body: JSON.stringify({
                action: "getGoods"
            })
        });

        const data = await response.json();

        console.log("goods data:", data);

        // ⭐ 防呆
        goods = Array.isArray(data) ? data : [];

        render();

    } catch (error) {

        console.error("抓取雲端資料失敗:", error);

    } finally {

        showLoading(false);

    }
}

/**
 * 將目前整個貨物清單同步更新至雲端 Excel
 */
async function syncGoodsToCloud() {
    showLoading(true);
    try {
        await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: "saveGoods", data: goods })
        });
        await fetchGoodsFromCloud();
    } catch (e) {
        alert("上傳雲端失敗，請檢查網路！");
        showLoading(false);
    }
}

/**
 * 切換系統功能分頁
 */
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.remove('hidden');
    render();
}



/**
 * 新增或修改貨物資料
 */
function saveGood() {
    const goodData = {
        id: document.getElementById('edit-id').value,
        category: document.getElementById('good-category').value,
        code: document.getElementById('good-code').value.trim(),
        name: document.getElementById('good-name').value.trim(),
        price: parseFloat(document.getElementById('good-price').value || 0),
        note: document.getElementById('good-note').value.trim()
    };

    const action = goodData.id ? "updateGood" : "addGood";

    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
            action,
            data: goodData
        })
    }).then(() => fetchGoodsFromCloud());
}

/**
 * 將選定的貨物資料帶入上方表單進行編輯
 */
function editGood(id) {
    const g = goods.find(item => item.id === id);
    if (!g) return;

    document.getElementById('good-category').value = g.category || '10';
    document.getElementById('good-code').value = g.code || '';
    document.getElementById('good-name').value = g.name || '';
    document.getElementById('good-price').value = g.price || '';
    document.getElementById('good-note').value = g.note || '';

    document.getElementById('edit-id').value = g.id;

    document.getElementById('btn-save').innerText = '確認修改並同步';
}

/**
 * 刪除單項貨物項目
 */
async function deleteGood(id) {
    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
            action: "deleteGood", // ⚠️ 建議統一單數
            id
        })
    })
        .then(res => res.json())
        .then(data => {
            console.log("delete result:", data);
            fetchGoodsFromCloud();
        })
        .catch(err => console.error("delete error:", err));
}
/**
 * 清空手動新增區的表單欄位
 */
function clearGoodForm() {
    document.getElementById('good-category').value = '10';
    document.getElementById('good-code').value = '';
    document.getElementById('good-name').value = '';
    document.getElementById('good-price').value = '';
    document.getElementById('good-note').value = '';
    document.getElementById('edit-index').value = '';
    document.getElementById('btn-save').innerText = '儲存貨物至雲端';
    document.getElementById('btn-cancel').classList.add('hidden');
}

/**
 * 執行出貨流程：上傳雲端 orders 紀錄、寫入快取並調用系統列印
 */
async function printOrder() {
    if (cart.length === 0) {
        alert('出貨清單是空的喔！');
        return;
    }
    const customer = document.getElementById('order-customer').value.trim() || '未命名客戶';
    const today = new Date();
    const dateStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
    const timeStr = today.toLocaleString('zh-TW');

    let totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    let itemsSummary = cart.map(item => `${item.name}x${item.quantity}`).join(', ');

    showLoading(true);

    let orderId = null;

    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: "addOrder",
                date: timeStr,
                customer: customer,
                items: cart.map(item => ({
                    code: item.code,
                    name: item.name,
                    price: item.price,
                    quantity: item.quantity,
                    note: item.note,
                    category: item.category
                })),
                total: totalAmount
            })
        });

        const result = await res.json();
        orderId = result.orderId; // ⭐重點在這

    } catch (e) {
        console.error("雲端記帳失敗", e);
    }

    // 儲存至本機快取歷史紀錄
    historyOrders.unshift({
        orderId: orderId,   // ⭐一定要存
        customer: customer,
        date: timeStr,
        items: [...cart]
    }); localStorage.setItem('mom_orders', JSON.stringify(historyOrders));

    // 帶入列印版面資料
    document.getElementById('print-cust-name').innerText = customer;
    document.getElementById('print-order-date').innerText = dateStr;

    const tbody = document.getElementById('print-table-body');
    tbody.innerHTML = '';

    // 雙排雙欄雙軌列印排版結構（優化格線邊界，保持備註長度彈性）
    for (let i = 0; i < cart.length; i += 2) {
        const item1 = cart[i];
        const item2 = cart[i + 1] || { code: '', name: '', quantity: '', note: '' };

        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #000';
        tr.innerHTML = `
            <td style="padding: 6px; border-right: 1px solid #000; font-family: monospace; font-size: 12px;">${item1.code || '-'}</td>
            <td style="padding: 6px; border-right: 1px solid #000; word-break: break-all; font-weight: 500;">${item1.name}</td>
            <td style="padding: 6px; border-right: 1px solid #000; text-align: center; font-weight: bold; font-size: 14px;">${item1.quantity}</td>
            <td style="padding: 6px; border-right: 3px solid #000; word-break: break-all; color: #334155; font-size: 12px; font-weight: bold;">${item1.note || ''}</td>
            
            <td style="padding: 6px; padding-left: 10px; border-right: 1px solid #000; font-family: monospace; font-size: 12px;">${item2.code || '-'}</td>
            <td style="padding: 6px; border-right: 1px solid #000; word-break: break-all; font-weight: 500;">${item2.name || ''}</td>
            <td style="padding: 6px; border-right: 1px solid #000; text-align: center; font-weight: bold; font-size: 14px;">${item2.quantity || ''}</td>
            <td style="padding: 6px; word-break: break-all; color: #334155; font-size: 12px; font-weight: bold;">${item2.note || ''}</td>
        `;
        tbody.appendChild(tr);
    }

    // 延遲小段時間確保 DOM 渲染完畢後開啟列印視窗
    setTimeout(() => {
        window.print();
        cart = [];
        document.getElementById('order-customer').value = '';
        showLoading(false)
        render();
    }, 300);
}

/**
 * 貨物管理切換篩選分類
 */
function filterManagerCategory(cat) {
    currentManagerFilter = cat;
    document.querySelectorAll('#manager-filter-buttons button').forEach(btn => {
        btn.className = "px-3 py-1 text-sm rounded bg-gray-200 text-gray-700 hover:bg-gray-300 cursor-pointer";
    });
    const activeBtn = document.getElementById(`m-btn-${cat}`);
    if (activeBtn) activeBtn.className = "px-3 py-1 text-sm rounded bg-blue-600 text-white font-bold cursor-pointer";
    render();
}

/**
 * 準備出貨區切換篩選分類
 */
function filterShippingCategory(cat) {
    currentShippingFilter = cat;
    document.querySelectorAll('#shipping-filter-buttons button').forEach(btn => {
        btn.className = "px-3 py-1 text-sm rounded bg-gray-200 text-gray-700 hover:bg-gray-300 cursor-pointer";
    });
    const activeBtn = document.getElementById(`s-btn-${cat}`);
    if (activeBtn) activeBtn.className = "px-3 py-1 text-sm rounded bg-orange-600 text-white font-bold cursor-pointer";
    render();
}

/**
 * 點選商品加入購物出貨單車


/**
 * 修改購物車內指定項目的數量
 */
function updateCartQty(index, qty) {
    const parsedQty = parseInt(qty);
    if (isNaN(parsedQty) || parsedQty <= 0) {
        cart.splice(index, 1);
    } else {
        cart[index].quantity = parsedQty;
    }
    renderCart();
}

/**
 * 將特定項目移出購物車
 */


/**
 * 複製歷史單據的品項快速重新檢貨
 */
function reorderFromHistory(historyIndex) {
    const selectedOrder = historyOrders[historyIndex];
    if (!selectedOrder) return;
    if (cart.length > 0 && !confirm('購物車內目前還有商品，重新撿貨將會清空並取代現有購物車，確定要繼續嗎？')) return;

    document.getElementById('order-customer').value = `${selectedOrder.customer}-複製`;
    cart = selectedOrder.items.map(item => ({ ...item }));
    alert(`🛒 已將「${selectedOrder.customer}」的商品載入購物車！`);
    switchTab('shipping-tab');
}

/**
 * 刪除本機中的歷史紀錄項目
 */
async function deleteHistory(orderId) { // 直接接收 orderId
    if (!confirm('確定要刪除這筆單據嗎？')) return;

    // 1. 樂觀更新：直接從陣列中過濾掉該 ID
    const previousOrders = [...historyOrders];
    historyOrders = historyOrders.filter(o => o.orderId !== orderId);
    render(); // 畫面立即更新，且完全與 index 無關

    showLoading(true);

    try {
        const res = await fetch(API_URL, {
            method: "POST",
            body: JSON.stringify({
                action: "deleteOrder",
                orderId: orderId
            })
        });

        const data = await res.json();

        if (!data.ok) {
            throw new Error("伺服器刪除失敗");
        }

        // 成功後進行後續處理
        console.log("刪除成功:", orderId);
        // 可選：若怕資料不準，可在此靜默重新 fetch
        // await fetchHistoryFromCloud(); 

    } catch (e) {
        console.error(e);
        // 失敗時復原
        historyOrders = previousOrders;
        render();
        alert("刪除失敗，請檢查網路連線。");
    } finally {
        showLoading(false);
    }
}

/**
 * 點選商品加入購物車
 */

/**
 * 將特定項目移出購物車
 */
function removeFromCart(index) {
    cart.splice(index, 1);
    render();
}


/**
 * 根據購物車狀態更新對應商品的按鈕外觀
 */
function updateButtonState(goodIndex, isChecked) {
    // 透過 data-index 找到對應的按鈕
    const btn = document.querySelector(`button[data-index="${goodIndex}"]`);
    if (!btn) return;

    if (isChecked) {
        btn.innerHTML = '✓';
        btn.classList.remove('bg-orange-100', 'text-orange-700');
        btn.classList.add('bg-green-500', 'text-white');
    } else {
        btn.innerHTML = '＋';
        btn.classList.remove('bg-green-500', 'text-white');
        btn.classList.add('bg-orange-100', 'text-orange-700');
    }
}
function render() {
    // 1. 渲染：貨物管理清單
    const goodsTable = document.getElementById('goods-list-table');
    if (goodsTable) {
        let managerHTML = '';
        const isAllFilter = currentManagerFilter === 'all';

        goods.forEach((g, i) => {
            const cat = String(g.category || '10');
            if (currentManagerFilter !== 'all' && currentManagerFilter !== cat) return;



            managerHTML += `
                <tr>
                    <td class="p-3 border-r border-gray-200"><span class="px-2 py-0.5 text-xs rounded font-bold bg-blue-100 text-blue-800">${cat} 類</span></td>
                    <td class="p-3 font-mono text-sm border-r border-gray-200">${g.code || '-'}</td>
                    <td class="p-3 font-medium border-r border-gray-200 break-words">${g.name}</td>
                    <td class="p-3 text-green-600 font-bold border-r border-gray-200">$${g.price}</td>
                    <!-- 備註欄動態撐長並加上邊界 -->
                    <td class="p-3 text-gray-600 text-sm font-semibold border-r border-gray-200 bg-blue-50/10 break-all">${g.note || '-'}</td>
                    <td class="p-3 text-center space-x-1">
                        <button onclick="editGood('${g.id}')" class="text-blue-600 hover:text-blue-900 text-sm px-2 py-1 border border-blue-300 rounded cursor-pointer bg-white shadow-xs">修改</button>
                        <button onclick="deleteGood('${g.id}')" class="text-red-600 hover:text-red-900 text-sm px-2 py-1 border border-red-300 rounded cursor-pointer bg-white shadow-xs">刪除</button>
                    </td>
                </tr>`;
        });

        if (!isAllFilter && goods.length > 0) {
            managerHTML += `
                <tr>
                    <td colspan="7" class="text-center p-3 bg-yellow-50 text-xs text-yellow-700 font-medium">
                        💡 溫馨提示：如需拖曳手動調整排序，請先切換回上方「全部」商品分類按鈕喔！
                    </td>
                </tr>`;
        }
        goodsTable.innerHTML = managerHTML || `<tr><td colspan="7" class="text-center p-4 text-gray-400">沒有商品，請手動新增或從上方匯入</td></tr>`;

        if (isAllFilter) {
            initDragAndDropEvents();
        }
    }

    // 2. 渲染：準備出貨選擇區
    const shippingTable = document.getElementById('shipping-select-table');
    if (shippingTable) {
        let shippingHTML = '';
        goods.forEach((g, i) => {
            const cat = String(g.category || '10');
            if (currentShippingFilter !== 'all' && currentShippingFilter !== cat) return;
            const checked = isInCart(g.code);
            shippingHTML += `
        <tr class="border-b border-gray-200 hover:bg-gray-50">
            <td class="p-3 border-r border-gray-200 break-words">
                <span class="text-xs bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded mr-1 font-mono">${g.code || '無'}</span>
                <strong class="text-gray-900">${g.name}</strong>
            </td>

            <td class="p-3 border-r border-gray-200">
                <span class="px-2 py-0.5 text-xs rounded font-bold bg-orange-100 text-orange-800">${cat} 類</span>
            </td>

            <td class="p-3 text-green-600 font-medium border-r border-gray-200">
                $${g.price}
            </td>

            <td class="p-3 text-gray-600 text-sm font-semibold border-r border-gray-200 bg-orange-50/10 break-all">
                ${g.note || '-'}
            </td>

            <td class="p-3 text-center">
                <button
                    data-index="${i}"
                    onclick="toggleCart(${i})"
                    class="${checked
                    ? 'bg-red-100 text-red-700 hover:bg-red-200'
                    : 'bg-orange-100 text-orange-700 hover:bg-orange-600 hover:text-white'} 
                        font-bold px-3 py-1 rounded-full text-sm transition cursor-pointer"
                >
                    ${checked ? '🗑️' : '＋'}
                </button>
            </td>
        </tr>`;
        });
        shippingTable.innerHTML = shippingHTML || `<tr><td colspan="5" class="text-center p-4 text-gray-400">此分區目前沒有商品</td></tr>`;
    }

    // 3. 渲染：歷史紀錄列表區
    // 3. 渲染：歷史紀錄列表區
    const historyList = document.getElementById('history-list');
    if (historyList) {
        if (historyOrders.length === 0) {
            historyList.innerHTML = `<p class="text-gray-400 text-center py-6">目前還沒有任何出貨紀錄。</p>`;
        } else {
            historyList.innerHTML = historyOrders.map((order, i) => `
                <div class="border border-gray-200 rounded-lg p-4 bg-gray-50 relative shadow-xs">
                    <div class="absolute top-4 right-4 flex space-x-2 items-center">
                        <button onclick="reorderFromHistory(${i})" class="bg-purple-100 text-purple-700 hover:bg-purple-600 hover:text-white text-xs font-bold px-2 py-1 border border-purple-300 rounded transition cursor-pointer">🛒 複製重新撿貨</button>
                        <button onclick="deleteHistory('${order.orderId}')" class="text-gray-400 hover:text-red-500 text-xs cursor-pointer">🛑 刪除</button>
                    </div>
                    <h3 class="font-bold text-gray-800 mb-1">👤 客戶：${order.customer}</h3>
                    <p class="text-xs text-gray-400 mb-2">📅 時間：${order.date}</p>
                    <div class="text-sm text-gray-600 bg-white p-3 rounded border border-gray-200">
                        ${Array.isArray(order.items)
                    ? order.items.map(item => `• <span class="text-xs bg-gray-100 px-1 rounded text-gray-500 mr-1">${item.category || '10'}類</span> [${item.code || '無編號'}] ${item.name} x ${item.quantity} <span class="text-xs text-blue-600 font-medium">(${item.note || '無備註'})</span>`).join('<br>')
                    : `<p>${order.items}</p>`}
                    </div>
                </div>`).join('');
        }
    }
    renderCart();
}

/**
 * 單獨渲染右側出貨清單小購物車
 */
function renderCart() {
    const cartList = document.getElementById('cart-list');
    if (!cartList) return;
    if (cart.length === 0) {
        cartList.innerHTML = `<p class="text-gray-400 text-center py-8">請從左側挑選商品...</p>`;
        return;
    }

    cartList.innerHTML = cart.map((item, i) => `
        <div class="flex flex-col p-2 bg-white rounded border border-gray-200 mb-2 shadow-xs">
            <div class="flex justify-between items-start">
                <span class="font-medium text-gray-900 break-all pr-2">[${item.code || '-'}] ${item.name}</span>
                <button onclick="removeFromCart(${i})" class="text-red-500 hover:text-red-700 text-xs font-bold cursor-pointer">❌</button>
            </div>
            <div class="text-xs text-gray-400 mt-0.5 break-all">備註：<span class="text-blue-600 font-medium">${item.note || '無'}</span></div>
            <div class="flex justify-between items-center mt-2 pt-2 border-t border-gray-100">
                <span class="text-green-600 font-bold text-sm">$${item.price} / 個</span>
                <div class="flex items-center space-x-1">
                    <span class="text-xs text-gray-500">數量:</span>
                    <input type="number" value="${item.quantity}" onchange="updateCartQty(${i}, this.value)" class="w-14 border border-gray-300 rounded text-center text-sm p-0.5 font-bold">
                </div>
            </div>
        </div>
    `).join('');
}

/**
 * 初始化 HTML5 原生拖曳排序事件 (僅在「全部」分頁生效)
 */
function initDragAndDropEvents() {
    const rows = document.querySelectorAll('.drag-row');
    let dragSrcEl = null;

    rows.forEach(row => {
        row.addEventListener('dragstart', function (e) {
            dragSrcEl = this;
            this.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', this.getAttribute('data-index'));
        });

        row.addEventListener('dragover', function (e) {
            if (e.preventDefault) e.preventDefault();
            return false;
        });

        row.addEventListener('dragenter', function () {
            if (this !== dragSrcEl) this.classList.add('bg-blue-50');
        });

        row.addEventListener('dragleave', function () {
            this.classList.remove('bg-blue-50');
        });

        row.addEventListener('drop', function (e) {
            e.stopPropagation();
            this.classList.remove('bg-blue-50');

            const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
            const toIndex = parseInt(this.getAttribute('data-index'));

            if (fromIndex !== toIndex) {
                const movedItem = goods.splice(fromIndex, 1)[0];
                goods.splice(toIndex, 0, movedItem);
                syncGoodsToCloud();
            }
            return false;
        });

        row.addEventListener('dragend', function () {
            this.classList.remove('dragging');
            rows.forEach(r => r.classList.remove('bg-blue-50'));
        });

        // --- 📱 行動裝置觸控拖曳支援 (簡單防抖相容) ---
        row.addEventListener('touchstart', function (e) {
            touchStartEl = this;
        }, { passive: true });

        row.addEventListener('touchend', function (e) {
            touchStartEl = null;
        }, { passive: true });
    });
}

// 綁定視窗載入完成事件，啟動初始化抓取資料
window.addEventListener('DOMContentLoaded', () => {
    fetchGoodsFromCloud();
    // 延遲 500ms 讓 Goods 先載入，避免兩者同時搶佔網路資源
    setTimeout(fetchHistoryFromCloud, 500);
});