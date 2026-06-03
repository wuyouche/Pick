// ======= 🚨請在此處替換成你的 Google 部署網址 🚨 =======
const API_URL = "https://script.google.com/macros/s/AKfycbwmACi2dKt2tsTSPKOOVUz9o_R6jdnMboz9E3JKt0SeGlOLqGabeVywftKo4RUxQR_EjQ/exec";
// ==========================================================

// 全域狀態管理
// 修改這行，讓 historyOrders 預設為空，等待雲端載入
let historyOrders = [];
let goods = [];
let cart = [];
let currentManagerFilter = 'all';
let currentShippingFilter = 'all';

let currentGoodsPage = 1;
const GOODS_PER_PAGE = 50;

let currentShippingPage = 1;
const SHIPPING_PER_PAGE = 50;

// 用於追蹤觸控拖曳的變數 (手機版防抖)
let touchStartEl = null;
function isInCart(id) {
    return cart.some(item => item.productId === id);
}

/**
 * 手動修改購物車排序
 */
function changeCartOrder(oldIndex, newPosition) {

    newPosition = parseInt(newPosition);

    // 防呆
    if (isNaN(newPosition)) return;

    // 轉成陣列 index
    let newIndex = newPosition - 1;

    // 超出範圍
    if (newIndex < 0) newIndex = 0;
    if (newIndex >= cart.length) newIndex = cart.length - 1;

    // 不動
    if (oldIndex === newIndex) return;

    // 取出項目
    const movedItem = cart.splice(oldIndex, 1)[0];

    // 插入新位置
    cart.splice(newIndex, 0, movedItem);

    renderCart();
}


function toggleCart(id) {
    const good = goods.find(g => String(g.id) === String(id));
    if (!good) return;

    const goodId = String(good.id);

    const existingIndex = cart.findIndex(item => String(item.productId) === goodId);

    if (existingIndex !== -1) {
        cart.splice(existingIndex, 1);
    } else {
        cart.push({
            id: String(good.id),   // ⭐商品ID
            productId: String(good.id),
            name: good.name,
            price: good.price,
            note: good.note,
            category: good.category,
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
        name: document.getElementById('good-name').value.trim(),
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

    document.getElementById('good-category').value = g.category || '10 元';
    document.getElementById('good-name').value = g.name || '';
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
    document.getElementById('good-category').value = '10 元';
    document.getElementById('good-name').value = '';
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




    // // 帶入列印版面資料
    // document.getElementById('print-cust-name').innerText = customer;
    // document.getElementById('print-order-date').innerText = dateStr;

    // ===== PDF 雙欄交錯排版（1 3 / 2 4）=====
    const tbody = document.getElementById('print-table-body');
    tbody.innerHTML = '';

    // 👉 關鍵：切一半
    const half = Math.ceil(cart.length / 2);

    // 👉 左右交錯輸出
    for (let i = 0; i < half; i++) {

        const left = cart[i];        // 左邊：0,1
        const right = cart[i + half] || null; // 右邊：2,3

        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #000';

        tr.innerHTML = `
        <!-- 左邊 -->
        <td style="padding: 6px; border-right: 1px solid #000; word-break: break-all; font-weight: 00; font-size: 17px;">
            ${left ? left.name : ''}
        </td>
        <td style="padding: 6px; border-right: 1px solid #000; text-align: center; font-weight: bold; font-size: 20px;">
            ${left ? left.quantity : ''}
        </td>
        <td style="padding: 6px; border-right: 3px solid #000; word-break: break-all; color: #334155; font-size: 17px; font-weight: bold;">
            ${left ? (left.note || '') : ''}
        </td>

        <!-- 右邊 -->
        <td style="padding: 6px; border-right: 1px solid #000; word-break: break-all; font-weight: 500;font-size: 17px;">
            ${right ? right.name : ''}
        </td>
        <td style="padding: 6px; border-right: 1px solid #000; text-align: center; font-weight: bold; font-size: 20px;">
            ${right ? right.quantity : ''}
        </td>
        <td style="padding: 6px; word-break: break-all; color: #334155; font-size: 17px; font-weight: bold;">
            ${right ? (right.note || '') : ''}
        </td>
    `;

        tbody.appendChild(tr);
    }
    // 延遲小段時間確保 DOM 渲染完畢後開啟列印視窗
    setTimeout(() => {
        window.print();
        showLoading(false)
        render();
    }, 300);
}


async function syncOrderToExcel() {
    if (cart.length === 0) {
        alert("購物車是空的，無法同步");
        return;
    }

    const customer = document.getElementById('order-customer').value.trim() || '未命名客戶';
    const generatedOrderId = crypto.randomUUID();

    showLoading(true);

    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: "addOrder",
                date: new Date().toLocaleString('zh-TW'),
                customer: customer,
                items: cart.map(item => ({
                    orderId: generatedOrderId,   // 如果你有
                    productId: item.id,          // ⭐關鍵新增
                    name: item.name,
                    quantity: item.quantity,
                    note: item.note,
                    category: item.category
                })),
                total: cart.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0)
            })
        });

        const data = await res.json();

        console.log("同步成功:", data);
        alert("✅ 已同步到 Excel");

    } catch (err) {
        console.error("同步失敗:", err);
        alert("❌ 同步失敗，請檢查網路或後端");
    } finally {
        showLoading(false);
    }
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

    // ⭐⭐⭐ 關鍵補這兩行
    render();
    renderCart();

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

function changeGoodsPage(step) {

    const filteredGoods = goods.filter(g => {
        const cat = String(g.category || '10 元');
        return currentManagerFilter === 'all' || currentManagerFilter === cat;
    });

    const totalPages = Math.ceil(filteredGoods.length / GOODS_PER_PAGE);

    currentGoodsPage += step;

    if (currentGoodsPage < 1) currentGoodsPage = 1;
    if (currentGoodsPage > totalPages) currentGoodsPage = totalPages;

    render();
}
function render() {
    // 1. 渲染：貨物管理清單
    // 1. 渲染：貨物管理清單
    const goodsTable = document.getElementById('goods-list-table');

    if (goodsTable) {

        let managerHTML = '';

        const isAllFilter = currentManagerFilter === 'all';

        // ⭐ 先篩選分類
        const filteredGoods = goods.filter(g => {
            const cat = String(g.category || '10 元');
            return currentManagerFilter === 'all' || currentManagerFilter === cat;
        });

        // ⭐ 分頁
        const startIndex = (currentGoodsPage - 1) * GOODS_PER_PAGE;
        const endIndex = startIndex + GOODS_PER_PAGE;

        // ⭐ 只取50筆
        const pagedGoods = filteredGoods.slice(startIndex, endIndex);

        // ⭐ 改成 pagedGoods
        pagedGoods.forEach((g, i) => {
            const cat = String(g.category || '10 元');
            if (currentManagerFilter !== 'all' && currentManagerFilter !== cat) return;



            managerHTML += `
                <tr>
                    <td class="p-3 border-r border-gray-200"><span class="px-2 py-0.5 text-xs rounded font-bold bg-blue-100 text-blue-800">${cat} </span></td>
                    <td class="p-3 font-medium border-r border-gray-200 break-words">${g.name}</td>
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
        const totalPages = Math.ceil(filteredGoods.length / GOODS_PER_PAGE);

        goodsTable.innerHTML += `
            <tr>
                <td colspan="4" class="p-4 text-center bg-gray-50">
                    <div class="flex justify-center items-center gap-2">

                        <button
                            onclick="changeGoodsPage(-1)"
                            ${currentGoodsPage <= 1 ? 'disabled' : ''}
                            class="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50"
                        >
                            上一頁
                        </button>

                        <span class="font-bold text-sm">
                            第 ${currentGoodsPage} / ${totalPages || 1} 頁
                        </span>

                        <button
                            onclick="changeGoodsPage(1)"
                            ${currentGoodsPage >= totalPages ? 'disabled' : ''}
                            class="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50"
                        >
                            下一頁
                        </button>

                    </div>
                </td>
            </tr>
            `;
        if (isAllFilter) {
            initDragAndDropEvents();
        }
    }

    // 2. 渲染：準備出貨選擇區
    const shippingTable = document.getElementById('shipping-select-table');
    if (shippingTable) {
        let shippingHTML = '';
        const filteredShippingGoods = goods.filter(g => {
            const cat = String(g.category || '10 元');
            return currentShippingFilter === 'all' || currentShippingFilter === cat;
        });

        const shippingStart = (currentShippingPage - 1) * SHIPPING_PER_PAGE;
        const shippingEnd = shippingStart + SHIPPING_PER_PAGE;

        const pagedShippingGoods = filteredShippingGoods.slice(shippingStart, shippingEnd);

        pagedShippingGoods.forEach((g, i) => {
            const cat = String(g.category || '10 元');
            if (currentShippingFilter !== 'all' && currentShippingFilter !== cat) return;
            const realIndex = goods.findIndex(item => item.id === g.id);
            const checked = isInCart(g.id);
            shippingHTML += `
        <tr class="border-b border-gray-200 hover:bg-gray-50">
            <td class="p-3 border-r border-gray-200 break-words">
                <strong class="text-gray-900">${g.name}</strong>
            </td>

            <td class="p-3 border-r border-gray-200">
                <span class="px-2 py-0.5 text-xs rounded font-bold bg-orange-100 text-orange-800">${cat} </span>
            </td>

          

            <td class="p-3 text-gray-600 text-sm font-semibold border-r border-gray-200 bg-orange-50/10 break-all">
                ${g.note || '-'}
            </td>

            <td class="p-3 text-center">
                <button
                    data-index="${realIndex}"
                    onclick="toggleCart('${g.id}')"
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
        const shippingTotalPages = Math.ceil(filteredShippingGoods.length / SHIPPING_PER_PAGE);

        shippingTable.innerHTML += `
            <tr>
                <td colspan="4" class="p-4 text-center bg-gray-50">
                    <div class="flex justify-center items-center gap-2">

                        <button
                            onclick="changeShippingPage(-1)"
                            ${currentShippingPage <= 1 ? 'disabled' : ''}
                            class="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50"
                        >
                            上一頁
                        </button>

                        <span class="font-bold text-sm">
                            第 ${currentShippingPage} / ${shippingTotalPages || 1} 頁
                        </span>

                        <button
                            onclick="changeShippingPage(1)"
                            ${currentShippingPage >= shippingTotalPages ? 'disabled' : ''}
                            class="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50"
                        >
                            下一頁
                        </button>

                    </div>
                </td>
            </tr>
            `;
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
                    ? order.items.map(item => `• <span class="text-xs bg-gray-100 px-1 rounded text-gray-500 mr-1">${item.category || '10 元'}</span> [ ${item.name} x ${item.quantity} <span class="text-xs text-blue-600 font-medium">(${item.note || '無備註'})</span>`).join('<br>')
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

function changeShippingPage(step) {

    const filteredGoods = goods.filter(g => {
        const cat = String(g.category || '10 元');
        return currentShippingFilter === 'all' || currentShippingFilter === cat;
    });

    const totalPages = Math.ceil(filteredGoods.length / SHIPPING_PER_PAGE);

    currentShippingPage += step;

    if (currentShippingPage < 1) currentShippingPage = 1;
    if (currentShippingPage > totalPages) currentShippingPage = totalPages;

    render();
}
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
                <span class="font-medium text-gray-900 break-all pr-2">${item.name}</span>
                <button onclick="removeFromCart(${i})" class="text-red-500 hover:text-red-700 text-xs font-bold cursor-pointer">❌</button>
            </div>
            <div class="text-xs text-gray-400 mt-0.5 break-all">備註：<span class="text-blue-600 font-medium">${item.note || '無'}</span></div>
            <div class="flex justify-between items-center mt-2 pt-2 border-t border-gray-100">
            <div class="flex items-center gap-2">
                <!-- 排序 -->
                <div class="flex items-center space-x-1">
                    <span class="text-xs text-gray-500">排序:</span>

                    <input
                        type="number"
                        min="1"
                        value="${i + 1}"
                        onchange="changeCartOrder(${i}, this.value)"
                        class="w-12 border border-blue-300 rounded text-center text-sm p-0.5 font-bold bg-blue-50"
                    >
                </div>

                <!-- 數量 -->
                <div class="flex items-center space-x-1">
                    <span class="text-xs text-gray-500">數量:</span>

                    <input
                        type="number"
                        value="${item.quantity}"
                        onchange="updateCartQty(${i}, this.value)"
                        class="w-14 border border-gray-300 rounded text-center text-sm p-0.5 font-bold"
                    >
                </div>

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