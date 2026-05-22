// ======= 🚨請在此處替換成第二步生成的 Google 部署網址 🚨 =======
const API_URL = "https://script.google.com/macros/s/AKfycbx9Xrx_7HQpBHdgMHs_toywbCDC8wwo6dokzt5nIDDQYrzpo-sNzSJ44BGjXYDvmi9qeA/exec";
// ==========================================================

let goods = [];
let historyOrders = JSON.parse(localStorage.getItem('mom_orders')) || [];
let cart = [];
let currentManagerFilter = 'all';
let currentShippingFilter = 'all';

function showLoading(show) {
    document.getElementById('loading-spinner').classList.toggle('hidden', !show);
}

// 頁面加載時自動從雲端 Excel 抓取資料
async function fetchGoodsFromCloud() {
    if(!API_URL || API_URL.includes("請把你的")) {
        document.getElementById('sync-status').innerText = "⚠️ 未設定雲端網址";
        document.getElementById('sync-status').className = "text-xs bg-red-600 px-2 py-1 rounded text-white";
        return;
    }
    
    showLoading(true);

    try {
        document.getElementById('sync-status').innerText = "🔄 正在同步雲端...";
        const response = await fetch(API_URL);
        goods = await response.json();
        document.getElementById('sync-status').innerText = "🟢 雲端連線正常";
        document.getElementById('sync-status').className = "text-xs bg-green-700 px-2 py-1 rounded text-white";
        render();
    } catch (error) {
        console.error(error);
        document.getElementById('sync-status').innerText = "❌ 雲端同步失敗";
        document.getElementById('sync-status').className = "text-xs bg-red-600 px-2 py-1 rounded text-white";
    } finally {
        showLoading(false);
    }
}

// 將貨物清單整份同步到雲端 Excel
async function syncGoodsToCloud() {
    showLoading(true);
    try {
        await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: "saveGoods", data: goods })
        });
        await fetchGoodsFromCloud();
    } catch(e) {
        alert("上傳雲端失敗，請檢查網路！");
        showLoading(false);
    }
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(tabId).classList.remove('hidden');
    render();
}

// 批次匯入 Excel 並上傳至雲端
function importExcel() {
    const fileInput = document.getElementById('excel-file');
    if (!fileInput.files || fileInput.files.length === 0) {
        alert('請先選擇一個 Excel 或 CSV 檔案！');
        return;
    }
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            
            if (jsonData.length === 0) { alert('Excel 內好像沒有資料喔！'); return; }

            goods = [];
            jsonData.forEach(row => {
                const category = String(row['分類'] || row['category'] || '10').trim();
                const code = String(row['編號'] || row['code'] || '').trim();
                const name = String(row['名稱'] || row['品名'] || row['name'] || '').trim();
                const price = parseFloat(row['價格'] || row['金額'] || row['price'] || 0);
                const note = String(row['備註'] || row['note'] || '').trim();
                if (name) goods.push({ category, code, name, price, note });
            });

            syncGoodsToCloud();
            fileInput.value = '';
        } catch (error) {
            alert('讀取 Excel 失敗，請確認格式。');
        }
    };
    reader.readAsArrayBuffer(file);
}

function saveGood() {
    const category = document.getElementById('good-category').value;
    const code = document.getElementById('good-code').value.trim();
    const name = document.getElementById('good-name').value.trim();
    const price = document.getElementById('good-price').value.trim();
    const note = document.getElementById('good-note').value.trim();
    const editIndex = document.getElementById('edit-index').value;

    if(!name) { alert('請填寫貨物名稱！'); return; }
    const goodData = { category, code, name, price: price || 0, note };

    if (editIndex === '') {
        goods.push(goodData);
    } else {
        goods[editIndex] = goodData;
    }

    clearGoodForm();
    syncGoodsToCloud();
}

function editGood(index) {
    const g = goods[index];
    document.getElementById('good-category').value = g.category || '10';
    document.getElementById('good-code').value = g.code;
    document.getElementById('good-name').value = g.name;
    document.getElementById('good-price').value = g.price;
    document.getElementById('good-note').value = g.note;
    document.getElementById('edit-index').value = index;
    document.getElementById('btn-save').innerText = '確認修改並同步';
    document.getElementById('btn-cancel').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function deleteGood(index) {
    if(confirm('確定要刪除這項貨物嗎？(將同步從雲端刪除)')) {
        goods.splice(index, 1);
        syncGoodsToCloud();
    }
}

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

// 🌟 修改這裡：出貨並渲染包含品名、編號、數量、備註的 PDF 區塊
async function printOrder() {
    if (cart.length === 0) { alert('出貨清單是空的喔！'); return; }
    const customer = document.getElementById('order-customer').value.trim() || '未命名客戶';
    const today = new Date();
    const dateStr = `${today.getFullYear()}/${String(today.getMonth()+1).padStart(2,'0')}/${String(today.getDate()).padStart(2,'0')}`;
    const timeStr = today.toLocaleString('zh-TW');

    let totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    let itemsSummary = cart.map(item => `${item.name}x${item.quantity}`).join(', ');

    showLoading(true);

    try {
        await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: "addOrder",
                date: timeStr,
                customer: customer,
                items: itemsSummary,
                total: totalAmount
            })
        });
    } catch(e) {
        console.error("雲端記帳失敗", e);
    } finally {
        showLoading(false);
    }

    historyOrders.unshift({ customer: customer, date: timeStr, items: [...cart] });
    localStorage.setItem('mom_orders', JSON.stringify(historyOrders));

    // 開始填充 PDF 列印區塊
    document.getElementById('print-cust-name').innerText = customer;
    document.getElementById('print-order-date').innerText = dateStr;
    const tbody = document.getElementById('print-table-body');
    tbody.innerHTML = '';

    // 採雙排渲染，i 每次遞增 2
    for (let i = 0; i < cart.length; i += 2) {
        const item1 = cart[i];
        // 如果剛好是單數最後一項，右半部就帶空值
        const item2 = cart[i + 1] || { code: '', name: '', quantity: '', note: '' };
        
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #ccc';
        tr.innerHTML = `
            <!-- 左半部商品 -->
            <td style="padding: 6px; border-right: 1px solid #ccc; font-mono text-xs">${item1.code || '-'}</td>
            <td style="padding: 6px; border-right: 1px solid #ccc; word-break: break-all; font-weight: 500;">${item1.name}</td>
            <td style="padding: 6px; border-right: 1px solid #ccc; text-align: center; font-weight: bold; font-size: 14px;">${item1.quantity}</td>
            <td style="padding: 6px; border-right: 2px solid #000; color: #444; font-size: 12px;">${item1.note || ''}</td>
            
            <!-- 右半部商品 -->
            <td style="padding: 6px; padding-left: 15px; border-right: 1px solid #ccc; font-mono text-xs">${item2.code || '-'}</td>
            <td style="padding: 6px; border-right: 1px solid #ccc; word-break: break-all; font-weight: 500;">${item2.name || ''}</td>
            <td style="padding: 6px; border-right: 1px solid #ccc; text-align: center; font-weight: bold; font-size: 14px;">${item2.quantity || ''}</td>
            <td style="padding: 6px; color: #444; font-size: 12px;">${item2.note || ''}</td>
        `;
        tbody.appendChild(tr);
    }

    setTimeout(() => {
        window.print();
        cart = [];
        document.getElementById('order-customer').value = '';
        render();
    }, 300);
}

// 購物車與過濾功能
function filterManagerCategory(cat) {
    currentManagerFilter = cat;
    document.querySelectorAll('#manager-filter-buttons button').forEach(btn => btn.className = "px-3 py-1 text-sm rounded bg-gray-200 text-gray-700 hover:bg-gray-300");
    document.getElementById(`m-btn-${cat}`).className = "px-3 py-1 text-sm rounded bg-blue-600 text-white font-bold";
    render();
}

function filterShippingCategory(cat) {
    currentShippingFilter = cat;
    document.querySelectorAll('#shipping-filter-buttons button').forEach(btn => btn.className = "px-3 py-1 text-sm rounded bg-gray-200 text-gray-700 hover:bg-gray-300");
    document.getElementById(`s-btn-${cat}`).className = "px-3 py-1 text-sm rounded bg-orange-600 text-white font-bold";
    render();
}

function addToCart(actualIndex) {
    const good = goods[actualIndex];
    const existing = cart.find(item => item.name === good.name && item.code === good.code);
    if (existing) { existing.quantity += 1; } else { cart.push({ ...good, quantity: 1 }); }
    renderCart();
}

function updateCartQty(index, qty) {
    if(qty <= 0) { cart.splice(index, 1); } else { cart[index].quantity = parseInt(qty); }
    renderCart();
}

function removeFromCart(index) { cart.splice(index, 1); renderCart(); }

function reorderFromHistory(historyIndex) {
    const selectedOrder = historyOrders[historyIndex];
    if (!selectedOrder) return;
    if (cart.length > 0 && !confirm('購物車內目前還有商品，重新撿貨將會清空並取代現有購物車，確定要繼續嗎？')) return;
    document.getElementById('order-customer').value = `${selectedOrder.customer}-複製`;
    cart = selectedOrder.items.map(item => ({ ...item }));
    alert(`🛒 已將「${selectedOrder.customer}」的商品載入購物車！`);
    switchTab('shipping-tab');
}

function deleteHistory(index) {
    if(confirm('確定要刪除這筆歷史單據嗎？(僅刪除本機紀錄，雲端 Excel 的 orders 仍會保留備查)')) {
        historyOrders.splice(index, 1);
        localStorage.setItem('mom_orders', JSON.stringify(historyOrders));
        render();
    }
}

function render() {
    const goodsTable = document.getElementById('goods-list-table');
    let managerHTML = '';
    goods.forEach((g, i) => {
        const cat = g.category || '10';
        if (currentManagerFilter !== 'all' && currentManagerFilter !== cat) return;
        managerHTML += `
            <tr class="border-b hover:bg-gray-50">
                <td class="p-3"><span class="px-2 py-0.5 text-xs rounded font-bold bg-blue-100 text-blue-800">${cat} 類</span></td>
                <td class="p-3 font-mono text-sm">${g.code || '-'}</td>
                <td class="p-3 font-medium">${g.name}</td>
                <td class="p-3 text-green-600 font-bold">$${g.price}</td>
                <td class="p-3 text-gray-500 text-sm">${g.note || '-'}</td>
                <td class="p-3 text-center space-x-1">
                    <button onclick="editGood(${i})" class="text-blue-600 hover:text-blue-900 text-sm px-2 py-1 border border-blue-300 rounded">修改</button>
                    <button onclick="deleteGood(${i})" class="text-red-600 hover:text-red-900 text-sm px-2 py-1 border border-red-300 rounded">刪除</button>
                </td>
            </tr>`;
    });
    goodsTable.innerHTML = managerHTML || `<tr><td colspan="6" class="text-center p-4 text-gray-400">沒有商品，請手動新增或從上方匯入</td></tr>`;

    const shippingTable = document.getElementById('shipping-select-table');
    let shippingHTML = '';
    goods.forEach((g, i) => {
        const cat = g.category || '10';
        if (currentShippingFilter !== 'all' && currentShippingFilter !== cat) return;
        shippingHTML += `
            <tr class="border-b hover:bg-gray-50">
                <td class="p-3">
                    <span class="text-xs bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded mr-1 font-mono">${g.code || '無'}</span>
                    <strong class="text-gray-900">${g.name}</strong>
                </td>
                <td class="p-3"><span class="px-2 py-0.5 text-xs rounded font-bold bg-orange-100 text-orange-800">${cat} 類</span></td>
                <td class="p-3 text-green-600 font-medium">$${g.price}</td>
                <td class="p-3 text-gray-400 text-sm">${g.note || '-'}</td>
                <td class="p-3 text-center">
                    <button onclick="addToCart(${i})" class="bg-orange-100 text-orange-700 hover:bg-orange-600 hover:text-white font-bold px-3 py-1 rounded-full text-sm transition">＋ 加入</button>
                </td>
            </tr>`;
    });
    shippingTable.innerHTML = shippingHTML || `<tr><td colspan="5" class="text-center p-4 text-gray-400">此分區目前沒有商品</td></tr>`;

    const historyList = document.getElementById('history-list');
    if(historyOrders.length === 0) {
        historyList.innerHTML = `<p class="text-gray-400 text-center py-6">目前還沒有任何出貨紀錄。</p>`;
    } else {
        historyList.innerHTML = historyOrders.map((order, i) => `
            <div class="border rounded-lg p-4 bg-gray-50 relative">
                <div class="absolute top-4 right-4 flex space-x-2 items-center">
                    <button onclick="reorderFromHistory(${i})" class="bg-purple-100 text-purple-700 hover:bg-purple-600 hover:text-white text-xs font-bold px-2 py-1 border border-purple-300 rounded transition">🛒 複製重新撿貨</button>
                    <button onclick="deleteHistory(${i})" class="text-gray-400 hover:text-red-500 text-xs">🛑 刪除</button>
                </div>
                <h3 class="font-bold text-gray-800 mb-1">👤 客戶：${order.customer}</h3>
                <p class="text-xs text-gray-400 mb-2">📅 時間：${order.date}</p>
                <div class="text-sm text-gray-600 bg-white p-3 rounded border">
                    ${order.items.map(item => `• <span class="text-xs bg-gray-100 px-1 rounded text-gray-500 mr-1">${item.category || '10'}類</span> [${item.code || '無編號'}] ${item.name} x ${item.quantity}`).join('<br>')}
                </div>
            </div>`).join('');
    }
    renderCart();
}

function renderCart() {
    const cartList = document.getElementById('cart-list');
    if (cart.length === 0) { cartList.innerHTML = `<p class="text-gray-400 text-center py-8">請從左側挑選商品...</p>`; return; }
    cartList.innerHTML = cart.map((item, i) => `
        <div class="py-3 flex flex-col justify-between space-y-2">
            <div class="flex justify-between items-start">
                <div>
                    <span class="text-[10px] bg-orange-100 text-orange-700 px-1 rounded font-bold">${item.category || '10'}類</span>
                    <h4 class="font-bold text-gray-900 inline-block ml-1">${item.name} <span class="text-xs text-gray-400 font-mono">(${item.code || '-'})</span></h4>
                    <p class="text-xs text-gray-400 mt-0.5">${item.note || '無備註'}</p>
                </div>
                <button onclick="removeFromCart(${i})" class="text-gray-400 hover:text-red-500 text-xs">移除</button>
            </div>
            <div class="flex items-center justify-between">
                <span class="text-sm text-gray-500">單價: $${item.price}</span>
                <div class="flex items-center border rounded">
                    <button onclick="updateCartQty(${i}, ${item.quantity - 1})" class="px-2 py-1 bg-gray-100 font-bold">-</button>
                    <input type="number" value="${item.quantity}" onchange="updateCartQty(${i}, this.value)" class="w-12 text-center text-sm border-x py-1 font-bold">
                    <button onclick="updateCartQty(${i}, ${item.quantity + 1})" class="px-2 py-1 bg-gray-100 font-bold">+</button>
                </div>
            </div>
        </div>`).join('');
}

// 初始化自動下載雲端資料
fetchGoodsFromCloud();